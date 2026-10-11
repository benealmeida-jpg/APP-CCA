-- Vendedor PF: estado civil e cônjuge (cônjuge casado também assina como vendedor);
-- conta com dígito verificador separado (há bancos sem dígito)
alter table public.vendedores
  add column if not exists conta_digito text,
  add column if not exists estado_civil text,
  add column if not exists conjuge_nome text,
  add column if not exists conjuge_cpf text;

update public.tipos_documento set ativo = false where codigo = 'VEND_PF_ESTADO_CIVIL';
insert into public.tipos_documento (codigo, nome, grupo, regra, condicao, ordem, alvo) values
  ('VEND_PF_CERT_NASCIMENTO',   'Certidão de nascimento',                              'Vendedor', '', '[{"estado_civil":"Solteiro(a)"},{"estado_civil":"União estável"}]', 72, 'vendedor_pf'),
  ('VEND_PF_CERT_CASAMENTO',    'Certidão de casamento',                               'Vendedor', '', '[{"estado_civil":"Casado(a)"}]', 73, 'vendedor_pf'),
  ('VEND_PF_CERT_DIVORCIO',     'Certidão de casamento com averbação do divórcio',     'Vendedor', '', '[{"estado_civil":"Divorciado(a)"}]', 74, 'vendedor_pf'),
  ('VEND_PF_CERT_OBITO',        'Certidão de casamento e certidão de óbito do cônjuge', 'Vendedor', '', '[{"estado_civil":"Viúvo(a)"}]', 75, 'vendedor_pf'),
  ('VEND_CONJ_IDENTIDADE',      'Cônjuge do vendedor: identidade (CNH, RG, CTPS ou passaporte)', 'Vendedor', '', '[{"estado_civil":"Casado(a)"}]', 76, 'vendedor_pf'),
  ('VEND_CONJ_RESIDENCIA',      'Cônjuge do vendedor: comprovante de residência',      'Vendedor', '', '[{"estado_civil":"Casado(a)"}]', 77, 'vendedor_pf')
on conflict (codigo) do nothing;

-- Busca um vendedor pelo CPF/CNPJ exato (para preencher o formulário). Não lista ninguém.
create or replace function public.buscar_vendedor(p_cpf_cnpj text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object(
      'id', v.id, 'tipo', v.tipo, 'cpf_cnpj', v.cpf_cnpj, 'nome', v.nome, 'pj_tipo', v.pj_tipo,
      'empreendimento', v.empreendimento, 'construtora_cnpj', v.construtora_cnpj, 'construtora_nome', v.construtora_nome,
      'banco', v.banco, 'agencia', v.agencia, 'operacao', v.operacao, 'conta', v.conta, 'conta_digito', v.conta_digito,
      'estado_civil', v.estado_civil, 'conjuge_nome', v.conjuge_nome, 'conjuge_cpf', v.conjuge_cpf,
      'documentos_na_cca', (select count(distinct d.tipo_codigo) from public.documentos_vendedor d
                            where d.vendedor_id = v.id and d.situacao in ('em_conferencia', 'aceito')))
    from public.vendedores v
    where v.cpf_cnpj = regexp_replace(coalesce(p_cpf_cnpj, ''), '\D', '', 'g')) end
$$;

-- Liga (ou cria) o vendedor ao cliente. Campos vazios não apagam o que já existe.
create or replace function public.vincular_vendedor(p_cliente uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_doc text := regexp_replace(coalesce(p_dados->>'cpf_cnpj', ''), '\D', '', 'g');
  v_id uuid;
  v_txt text;
begin
  if not public.posso_editar_cliente(p_cliente) then raise exception 'Sem permissão'; end if;
  if length(v_doc) not in (11, 14) then raise exception 'CPF ou CNPJ do vendedor inválido'; end if;
  if coalesce(trim(p_dados->>'nome'), '') = '' then raise exception 'Informe o nome do vendedor'; end if;

  insert into public.vendedores as v (tipo, cpf_cnpj, nome, pj_tipo, empreendimento, construtora_cnpj, construtora_nome,
                                      banco, agencia, operacao, conta, conta_digito, estado_civil, conjuge_nome, conjuge_cpf, criado_por)
  values (case when length(v_doc) = 11 then 'PF' else 'PJ' end, v_doc, trim(p_dados->>'nome'),
          nullif(p_dados->>'pj_tipo', ''), nullif(trim(p_dados->>'empreendimento'), ''),
          nullif(regexp_replace(coalesce(p_dados->>'construtora_cnpj', ''), '\D', '', 'g'), ''),
          nullif(trim(p_dados->>'construtora_nome'), ''),
          nullif(trim(p_dados->>'banco'), ''), nullif(trim(p_dados->>'agencia'), ''),
          nullif(trim(p_dados->>'operacao'), ''), nullif(trim(p_dados->>'conta'), ''), nullif(trim(p_dados->>'conta_digito'), ''),
          nullif(p_dados->>'estado_civil', ''), nullif(trim(p_dados->>'conjuge_nome'), ''),
          nullif(regexp_replace(coalesce(p_dados->>'conjuge_cpf', ''), '\D', '', 'g'), ''), auth.uid())
  on conflict (cpf_cnpj) do update set
    nome             = excluded.nome,
    pj_tipo          = coalesce(excluded.pj_tipo, v.pj_tipo),
    empreendimento   = coalesce(excluded.empreendimento, v.empreendimento),
    construtora_cnpj = coalesce(excluded.construtora_cnpj, v.construtora_cnpj),
    construtora_nome = coalesce(excluded.construtora_nome, v.construtora_nome),
    banco            = coalesce(excluded.banco, v.banco),
    agencia          = coalesce(excluded.agencia, v.agencia),
    operacao         = coalesce(excluded.operacao, v.operacao),
    conta            = coalesce(excluded.conta, v.conta),
    conta_digito     = case when excluded.conta is not null then excluded.conta_digito else v.conta_digito end,
    estado_civil     = coalesce(excluded.estado_civil, v.estado_civil),
    conjuge_nome     = case when coalesce(excluded.estado_civil, v.estado_civil) = 'Casado(a)' then coalesce(excluded.conjuge_nome, v.conjuge_nome) end,
    conjuge_cpf      = case when coalesce(excluded.estado_civil, v.estado_civil) = 'Casado(a)' then coalesce(excluded.conjuge_cpf, v.conjuge_cpf) end,
    atualizado_em    = now()
  returning id into v_id;

  update public.clientes set vendedor_id = v_id where id = p_cliente;
  return public.buscar_vendedor(v_doc);
end $$;

