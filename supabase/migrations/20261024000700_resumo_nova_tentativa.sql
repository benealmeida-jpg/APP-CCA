-- Lista de clientes: inclui a barreira inicial e a data da nova tentativa (filtro "Para retomar")
create or replace view public.clientes_resumo with (security_invoker = true) as
 SELECT c.id, c.nome, c.cpf, c.modalidade, c.programa, c.imovel, c.status, c.rascunho,
    s.nome AS status_nome, s.ordem AS status_ordem, c.corretor_id, p.nome AS corretor_nome, c.imobiliaria_id,
    COALESCE(i.nome, 'Autônomo'::text) AS imobiliaria_nome, c.atualizado_em,
    ( SELECT count(*) FROM documentos_necessarios_v2(c.id) d(participante_id, pessoa_nome, pessoa_papel, pessoa_ordem, tipo_codigo, nome, grupo, regra, ordem, documento_id, versao, situacao, motivo_recusa, observacao_recusa, nome_original, arquivo_path)
       WHERE d.situacao = 'pendente'::text) AS docs_pendentes,
    ( SELECT count(*) FROM documentos_necessarios_v2(c.id) d(participante_id, pessoa_nome, pessoa_papel, pessoa_ordem, tipo_codigo, nome, grupo, regra, ordem, documento_id, versao, situacao, motivo_recusa, observacao_recusa, nome_original, arquivo_path)
       WHERE d.situacao = 'recusado'::text) AS docs_recusados,
    ( SELECT count(*) FROM documentos_necessarios_v2(c.id) d(participante_id, pessoa_nome, pessoa_papel, pessoa_ordem, tipo_codigo, nome, grupo, regra, ordem, documento_id, versao, situacao, motivo_recusa, observacao_recusa, nome_original, arquivo_path)
       WHERE d.situacao = 'em_conferencia'::text) AS docs_em_conferencia,
    pode_ir_para_analise(c.id) AS pode_ir_para_analise,
    (( SELECT count(*) FROM participantes x WHERE x.cliente_id = c.id)) + 1 AS pessoas,
    c.criado_em, c.enviado_em,
    COALESCE(( SELECT max(h.em) FROM historico_status h WHERE h.cliente_id = c.id AND h.para = c.status), c.enviado_em, c.criado_em) AS status_desde,
    ( SELECT count(*) FROM conversa m
       WHERE m.cliente_id = c.id AND m.autor_id <> auth.uid() AND m.criada_em > COALESCE(( SELECT l.lida_em FROM conversa_lida l
               WHERE l.cliente_id = c.id AND l.usuario_id = auth.uid()), '-infinity'::timestamp with time zone)) AS conversa_nao_lidas,
    ( SELECT max(m.criada_em) FROM conversa m WHERE m.cliente_id = c.id) AS conversa_ultima,
    p.consumidor AS corretor_consumidor, c.valor_imovel, c.imovel_municipio, c.desconto_cartorio,
    c.grerj_numero, c.grerj_valor, c.grerj_pago_em, c.requerimento_enviado_em, c.data_nascimento, c.celular, c.email,
    c.imovel_id, c.assinatura_contrato, c.empreendimento_caixa,
    nome_gestor_da_imob(c.imobiliaria_id) AS gestor_nome,
    COALESCE(( SELECT array_agg(DISTINCT a.tipo) FROM contrato_arquivos a WHERE a.cliente_id = c.id AND NOT a.substituido), '{}'::text[]) AS contrato_tipos,
    situacao_damp(c.id) AS damp_situacao,
    c.barreira, c.nova_tentativa_em
   FROM clientes c
     JOIN status_etapas s ON s.codigo = c.status
     JOIN perfis p ON p.id = c.corretor_id
     LEFT JOIN imobiliarias i ON i.id = c.imobiliaria_id;
