-- Lista de documentos revisada pelo material do curso de operação do CCA (Caixa)

-- Novos dados
alter table public.vendedores
  add column if not exists regime_bens text,
  add column if not exists natureza_juridica text,
  add column if not exists telefone text,
  add column if not exists email text;
update public.vendedores set natureza_juridica = 'LTDA/Cia' where tipo = 'PJ' and natureza_juridica is null;
alter table public.clientes
  add column if not exists escolaridade text,
  add column if not exists docs_imovel_novo text;      -- 'FGTS' | 'SBPE' | null (calculado pelo app)
alter table public.participantes add column if not exists escolaridade text;

-- Comprador (proponentes)
update public.tipos_documento set nome = 'Identificação com CPF: CNH (ou RG, CTPS, passaporte)' where codigo = 'RG_CNH';
update public.tipos_documento set ativo = false where codigo = 'PIS';                        -- não consta na lista; o PIS sai da carteira de trabalho
update public.tipos_documento set nome = 'Último comprovante de residência' where codigo = 'COMPROVANTE_RESIDENCIA';
update public.tipos_documento set condicao = '[]' where codigo = 'CARTEIRA_TRABALHO';         -- pedida para todo proponente
update public.tipos_documento set nome = 'Declaração do Imposto de Renda completa' where codigo = 'DECLARACAO_IR';

-- Imóvel
update public.tipos_documento set nome = 'Certidão de inteiro teor da matrícula, atualizada' where codigo = 'MATRICULA';
update public.tipos_documento set nome = 'Espelho do IPTU do ano vigente (ou certidão compatível)' where codigo = 'ESPELHO_IPTU';
insert into public.tipos_documento (codigo, nome, grupo, regra, condicao, ordem, alvo) values
  ('IMOVEL_HABITESE',        'Habite-se',                                                         'Imóvel', '', '[{"docs_imovel_novo":"FGTS"},{"docs_imovel_novo":"SBPE"}]', 32, 'imovel'),
  ('IMOVEL_ART_PROJ_EXEC',   'ART/RRT de projeto e execução',                                     'Imóvel', '', '[{"docs_imovel_novo":"SBPE"}]', 33, 'imovel'),
  ('IMOVEL_ART_PROJETO',     'ART/RRT de projeto',                                                'Imóvel', '', '[{"docs_imovel_novo":"FGTS"}]', 33, 'imovel'),
  ('IMOVEL_ART_EXECUCAO',    'ART/RRT de execução com empresa contratada',                         'Imóvel', '', '[{"docs_imovel_novo":"FGTS"}]', 34, 'imovel'),
  ('IMOVEL_CNPJ_EMPRESA',    'CNPJ da empresa contratada (CNAE 4120-4/00 – Construção de edifícios)', 'Imóvel', '', '[{"docs_imovel_novo":"FGTS"}]', 35, 'imovel'),
  ('IMOVEL_CREA_CAU',        'CREA/CAU do responsável técnico',                                    'Imóvel', '', '[{"docs_imovel_novo":"FGTS"},{"docs_imovel_novo":"SBPE"}]', 36, 'imovel'),
  ('IMOVEL_DECL_ELEMENTOS',  'Declaração de elementos construtivos (modelo Caixa)',                'Imóvel', '', '[{"docs_imovel_novo":"FGTS"},{"docs_imovel_novo":"SBPE"}]', 37, 'imovel'),
  ('IMOVEL_SCPO',            'SCPO (cadastro da obra na Receita Federal)',                         'Imóvel', '', '[{"docs_imovel_novo":"FGTS"}]', 38, 'imovel'),
  ('IMOVEL_RCPM',            'Apólice de seguro RCPM',                                             'Imóvel', '', '[{"docs_imovel_novo":"FGTS"}]', 39, 'imovel')
on conflict (codigo) do update set nome = excluded.nome, grupo = excluded.grupo, condicao = excluded.condicao, ordem = excluded.ordem, alvo = excluded.alvo, ativo = true;

-- Vendedor pessoa física
update public.tipos_documento set nome = 'Identificação com CPF: CNH (ou RG, CTPS, passaporte)' where codigo = 'VEND_PF_IDENTIDADE';
update public.tipos_documento set ativo = false where codigo in ('VEND_PF_RESIDENCIA', 'VEND_CONJ_RESIDENCIA');
update public.tipos_documento set nome = 'Cônjuge do vendedor: identificação com CPF (CNH ou RG)' where codigo = 'VEND_CONJ_IDENTIDADE';
insert into public.tipos_documento (codigo, nome, grupo, regra, condicao, ordem, alvo) values
  ('VEND_PF_PACTO', 'Pacto antenupcial e registro do pacto', 'Vendedor', '',
   '[{"estado_civil":"Casado(a)","regime_bens":"Comunhão universal"},{"estado_civil":"Casado(a)","regime_bens":"Separação total (convencional)"},{"estado_civil":"Casado(a)","regime_bens":"Participação final nos aquestos"}]', 74, 'vendedor_pf')
on conflict (codigo) do update set nome = excluded.nome, condicao = excluded.condicao, ordem = excluded.ordem, alvo = excluded.alvo, ativo = true;

-- Vendedor pessoa jurídica: documentos conforme a natureza jurídica
update public.tipos_documento set nome = 'Contrato social e alterações registradas (ou consolidado)', condicao = '[{"natureza_juridica":"LTDA/Cia"}]' where codigo = 'VEND_PJ_CONTRATO_SOCIAL';
update public.tipos_documento set condicao = '[{"natureza_juridica":"LTDA/Cia","teve_alteracao_contratual":true}]' where codigo = 'VEND_PJ_ALTERACOES';
update public.tipos_documento set ativo = false where codigo = 'VEND_PJ_CARTAO_CNPJ';
update public.tipos_documento set nome = 'Identificação dos representantes legais (CNH ou RG com CPF)' where codigo = 'VEND_PJ_DOCS_SOCIOS';
update public.tipos_documento set nome = 'Certidão simplificada da Junta Comercial ou ficha de breve relato (emitida há até 180 dias)' where codigo = 'VEND_PJ_CERTIDAO_JUNTA';
insert into public.tipos_documento (codigo, nome, grupo, regra, condicao, ordem, alvo) values
  ('VEND_PJ_ESTATUTO',     'Estatuto com a última alteração',                                   'Vendedor', '', '[{"natureza_juridica":"S/A"}]', 80, 'vendedor_pj'),
  ('VEND_PJ_ATA_DIRETORIA','Ata da eleição da última diretoria, registrada (D.O.U.)',            'Vendedor', '', '[{"natureza_juridica":"S/A"}]', 81, 'vendedor_pj'),
  ('VEND_PJ_CONSTITUICAO', 'Documento de constituição e últimas alterações (firma individual)', 'Vendedor', '', '[{"natureza_juridica":"Firma individual"}]', 80, 'vendedor_pj')
on conflict (codigo) do update set nome = excluded.nome, condicao = excluded.condicao, ordem = excluded.ordem, alvo = excluded.alvo, ativo = true;

-- Busca e vínculo do vendedor com os novos campos
create or replace function public.buscar_vendedor(p_cpf_cnpj text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object(
      'id', v.id, 'tipo', v.tipo, 'cpf_cnpj', v.cpf_cnpj, 'nome', v.nome, 'pj_tipo', v.pj_tipo,
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
                                      teve_alteracao_contratual, regime_bens, natureza_juridica, telefone, email, criado_por)
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
          nullif(trim(p_dados->>'telefone'), ''), nullif(trim(p_dados->>'email'), ''), auth.uid())
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
    atualizado_em    = now()
  returning id into v_id;

  update public.clientes set vendedor_id = v_id where id = p_cliente;
  return public.buscar_vendedor(v_doc);
end $$;
