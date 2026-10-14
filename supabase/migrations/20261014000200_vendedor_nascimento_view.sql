-- Vendedor: data de nascimento e município de residência (para saber se precisa de ITC)
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
      'data_nascimento', v.data_nascimento, 'residencia_municipio', v.residencia_municipio, 'residencia_uf', v.residencia_uf,
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
                                      teve_alteracao_contratual, regime_bens, natureza_juridica, telefone, email, responsavel_nome,
                                      data_nascimento, residencia_municipio, residencia_uf, criado_por)
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
          nullif(trim(p_dados->>'telefone'), ''), nullif(trim(p_dados->>'email'), ''), nullif(trim(p_dados->>'responsavel_nome'), ''),
          nullif(p_dados->>'data_nascimento', '')::date, nullif(trim(p_dados->>'residencia_municipio'), ''), nullif(trim(p_dados->>'residencia_uf'), ''),
          auth.uid())
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
    data_nascimento  = coalesce(excluded.data_nascimento, v.data_nascimento),
    residencia_municipio = coalesce(excluded.residencia_municipio, v.residencia_municipio),
    residencia_uf    = coalesce(excluded.residencia_uf, v.residencia_uf),
    atualizado_em    = now()
  returning id into v_id;

  update public.clientes set vendedor_id = v_id where id = p_cliente;
  return public.buscar_vendedor(v_doc);
end $$;

-- Quadro de clientes (equipe e corretor) passa a trazer os dados do desconto no cartório
create or replace view public.clientes_resumo as
 SELECT c.id, c.nome, c.cpf, c.modalidade, c.programa, c.imovel, c.status, c.rascunho,
    s.nome AS status_nome, s.ordem AS status_ordem, c.corretor_id, p.nome AS corretor_nome, c.imobiliaria_id,
    COALESCE(i.nome, 'Autônomo'::text) AS imobiliaria_nome, c.atualizado_em,
    ( SELECT count(*) FROM documentos_necessarios_v2(c.id) d WHERE d.situacao = 'pendente'::text) AS docs_pendentes,
    ( SELECT count(*) FROM documentos_necessarios_v2(c.id) d WHERE d.situacao = 'recusado'::text) AS docs_recusados,
    ( SELECT count(*) FROM documentos_necessarios_v2(c.id) d WHERE d.situacao = 'em_conferencia'::text) AS docs_em_conferencia,
    pode_ir_para_analise(c.id) AS pode_ir_para_analise,
    (( SELECT count(*) FROM participantes x WHERE x.cliente_id = c.id) + 1) AS pessoas,
    c.criado_em, c.enviado_em,
    COALESCE(( SELECT max(h.em) FROM historico_status h WHERE h.cliente_id = c.id AND h.para = c.status), c.enviado_em, c.criado_em) AS status_desde,
    ( SELECT count(*) FROM conversa m WHERE m.cliente_id = c.id AND m.autor_id <> auth.uid() AND m.criada_em > COALESCE(( SELECT l.lida_em FROM conversa_lida l WHERE l.cliente_id = c.id AND l.usuario_id = auth.uid()), '-infinity'::timestamptz)) AS conversa_nao_lidas,
    ( SELECT max(m.criada_em) FROM conversa m WHERE m.cliente_id = c.id) AS conversa_ultima,
    p.consumidor AS corretor_consumidor,
    c.valor_imovel, c.imovel_municipio, c.desconto_cartorio, c.grerj_numero, c.grerj_valor, c.grerj_pago_em, c.requerimento_enviado_em
   FROM clientes c
     JOIN status_etapas s ON s.codigo = c.status
     JOIN perfis p ON p.id = c.corretor_id
     LEFT JOIN imobiliarias i ON i.id = c.imobiliaria_id;
