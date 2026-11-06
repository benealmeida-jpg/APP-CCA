-- Quem é quem: responsável da imobiliária e do vendedor, apelido e CRECI do corretor, CRECI jurídico da imobiliária.
alter table public.imobiliarias add column if not exists proprietario_nome text,
                                add column if not exists responsavel_nome text,
                                add column if not exists creci_juridico text;
alter table public.perfis       add column if not exists apelido text,
                                add column if not exists creci text;
alter table public.vendedores   add column if not exists responsavel_nome text;

create or replace function public.buscar_vendedor(p_cpf_cnpj text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object(
      'id', v.id, 'tipo', v.tipo, 'cpf_cnpj', v.cpf_cnpj, 'nome', v.nome, 'pj_tipo', v.pj_tipo,
      'responsavel_nome', v.responsavel_nome,
      'empreendimento', v.empreendimento, 'construtora_cnpj', v.construtora_cnpj, 'construtora_nome', v.construtora_nome,
      'banco', v.banco, 'agencia', v.agencia, 'operacao', v.operacao, 'conta', v.conta, 'conta_digito', v.conta_digito,
      'estado_civil', v.estado_civil, 'teve_alteracao_contratual', v.teve_alteracao_contratual, 'conjuge_nome', v.conjuge_nome, 'conjuge_cpf', v.conjuge_cpf,
      'regime_bens', v.regime_bens, 'natureza_juridica', v.natureza_juridica, 'telefone', v.telefone, 'email', v.email,
      'documentos_na_cca', (select count(distinct d.tipo_codigo) from public.documentos_vendedor d
                            where d.vendedor_id = v.id and d.situacao in ('em_conferencia', 'aceito')))
    from public.vendedores v
    where v.cpf_cnpj = regexp_replace(coalesce(p_cpf_cnpj, ''), '\D', '', 'g')) end
$$;

create or replace function public.vincular_vendedor(p_cliente uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_doc text := regexp_replace(coalesce(p_dados->>'cpf_cnpj', ''), '\D', '', 'g');
  v_id uuid;
begin
  if not public.posso_editar_cliente(p_cliente) then raise exception 'Sem permissão'; end if;
  if length(v_doc) not in (11, 14) then raise exception 'CPF ou CNPJ do vendedor inválido'; end if;
  if coalesce(trim(p_dados->>'nome'), '') = '' then raise exception 'Informe o nome do vendedor'; end if;

  insert into public.vendedores as v (tipo, cpf_cnpj, nome, pj_tipo, empreendimento, construtora_cnpj, construtora_nome,
                                      banco, agencia, operacao, conta, conta_digito, estado_civil, conjuge_nome, conjuge_cpf,
                                      teve_alteracao_contratual, regime_bens, natureza_juridica, telefone, email, responsavel_nome, criado_por)
  values (case when length(v_doc) = 11 then 'PF' else 'PJ' end, v_doc, trim(p_dados->>'nome'),
          nullif(p_dados->>'pj_tipo', ''), nullif(trim(p_dados->>'empreendimento'), ''),
          nullif(regexp_replace(coalesce(p_dados->>'construtora_cnpj', ''), '\D', '', 'g'), ''),
          nullif(trim(p_dados->>'construtora_nome'), ''),
          nullif(trim(p_dados->>'banco'), ''), nullif(trim(p_dados->>'agencia'), ''),
          nullif(trim(p_dados->>'operacao'), ''), nullif(trim(p_dados->>'conta'), ''), nullif(trim(p_dados->>'conta_digito'), ''),
          nullif(p_dados->>'estado_civil', ''), nullif(trim(p_dados->>'conjuge_nome'), ''),
          nullif(regexp_replace(coalesce(p_dados->>'conjuge_cpf', ''), '\D', '', 'g'), ''),
          (p_dados->>'teve_alteracao_contratual')::boolean,
          nullif(p_dados->>'regime_bens', ''), nullif(p_dados->>'natureza_juridica', ''),
          nullif(trim(p_dados->>'telefone'), ''), nullif(trim(p_dados->>'email'), ''), nullif(trim(p_dados->>'responsavel_nome'), ''), auth.uid())
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
    regime_bens      = case when coalesce(excluded.estado_civil, v.estado_civil) = 'Casado(a)' then coalesce(excluded.regime_bens, v.regime_bens) end,
    teve_alteracao_contratual = coalesce(excluded.teve_alteracao_contratual, v.teve_alteracao_contratual),
    natureza_juridica = coalesce(excluded.natureza_juridica, v.natureza_juridica),
    telefone         = coalesce(excluded.telefone, v.telefone),
    email            = coalesce(excluded.email, v.email),
    responsavel_nome = coalesce(excluded.responsavel_nome, v.responsavel_nome),
    atualizado_em    = now()
  returning id into v_id;

  update public.clientes set vendedor_id = v_id where id = p_cliente;
  return public.buscar_vendedor(v_doc);
end $$;

-- função nova (v2): a antiga continua existindo, sem precisar apagar nada
create or replace function public.listar_vendedores_v2()
returns table (id uuid, tipo text, cpf_cnpj text, nome text, pj_tipo text, empreendimento text, construtora_nome text, banco text,
               processos bigint, docs_aceitos bigint, docs_conferencia bigint, docs_recusados bigint, atualizado_em timestamptz,
               responsavel_nome text)
language sql stable security definer set search_path = public as $$
  select v.id, v.tipo, v.cpf_cnpj, v.nome, v.pj_tipo, v.empreendimento, v.construtora_nome, v.banco,
         (select count(*) from public.clientes c where c.vendedor_id = v.id),
         (select count(*) from public.documentos_vendedor d where d.vendedor_id = v.id and d.situacao = 'aceito'),
         (select count(*) from public.documentos_vendedor d where d.vendedor_id = v.id and d.situacao = 'em_conferencia'),
         (select count(*) from public.documentos_vendedor d where d.vendedor_id = v.id and d.situacao = 'recusado'),
         v.atualizado_em, v.responsavel_nome
  from public.vendedores v
  where public.sou_equipe() and public.tenho_permissao('ver_vendedores')
  order by v.atualizado_em desc
$$;
revoke execute on function public.listar_vendedores_v2() from public, anon;
grant execute on function public.listar_vendedores_v2() to authenticated;
