\set ON_ERROR_STOP on
set role authenticated;
-- Pedro (outro corretor) cria um cliente e ainda não vê nenhum vendedor
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
insert into public.clientes (id, corretor_id, nome, cpf) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000003', 'Cliente do Pedro', '39053344705');

-- João liga o vendedor PJ ao cliente dele e manda o contrato social
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select 'João vincula' as teste, public.vincular_vendedor('00000000-0000-0000-0000-0000000000c1',
  '{"cpf_cnpj":"11.222.333/0001-81","nome":"Construtora Exemplo Ltda","pj_tipo":"Avulso","banco":"104 - Caixa","agencia":"1234","operacao":"003","conta":"5678-9"}')->>'nome';
select 'João envia doc' as teste, public.registrar_documento_vendedor('00000000-0000-0000-0000-0000000000c1', 'VEND_PJ_CONTRATO_SOCIAL',
  (select vendedor_id::text from public.clientes where id = '00000000-0000-0000-0000-0000000000c1') || '/VEND_PJ_CONTRATO_SOCIAL/1-contrato.pdf',
  'contrato.pdf', 'application/pdf', 1000) is not null as ok;

-- Pedro: antes de vincular não vê vendedor nenhum; busca pelo CNPJ exato acha e aproveita
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select 'Pedro vê vendedores antes (esperado 0)' as teste, count(*) from public.vendedores;
select 'Pedro busca pelo CNPJ (esperado 1 doc na CCA)' as teste, public.buscar_vendedor('11222333000181')->>'documentos_na_cca';
select 'Pedro vincula sem conta (mantém a conta)' as teste, public.vincular_vendedor('00000000-0000-0000-0000-0000000000c2',
  '{"cpf_cnpj":"11222333000181","nome":"Construtora Exemplo Ltda"}')->>'conta';
select 'Pedro vê só o vendedor do cliente dele (esperado 1)' as teste, count(*) from public.vendedores;
select 'Pedro lê tabela de docs do vendedor (esperado 0)' as teste, count(*) from public.documentos_vendedor;
select 'Pedro vê situação sem arquivo (esperado em_conferencia, nulos)' as teste, situacao, nome_original, arquivo_path
  from public.documentos_do_vendedor('00000000-0000-0000-0000-0000000000c2');
do $$ begin
  perform public.documentos_do_vendedor('00000000-0000-0000-0000-0000000000c1');
  if (select count(*) from public.documentos_do_vendedor('00000000-0000-0000-0000-0000000000c1')) > 0 then
    raise exception 'FALHOU: Pedro viu docs do cliente do João'; end if;
  raise notice 'ok: Pedro não vê o cliente do João';
end $$;
-- Pedro manda versão nova: substitui a do João (mesmo vendedor, um documento só)
select 'Pedro envia nova versão' as teste, public.registrar_documento_vendedor('00000000-0000-0000-0000-0000000000c2', 'VEND_PJ_CONTRATO_SOCIAL',
  (select vendedor_id::text from public.clientes where id = '00000000-0000-0000-0000-0000000000c2') || '/VEND_PJ_CONTRATO_SOCIAL/2-contrato.pdf',
  'contrato-novo.pdf', 'application/pdf', 1000) is not null as ok;
do $$ begin
  perform public.registrar_documento_vendedor('00000000-0000-0000-0000-0000000000c1', 'VEND_PJ_CARTAO_CNPJ', 'x/y.pdf', 'y.pdf', 'application/pdf', 1);
  raise exception 'FALHOU: Pedro enviou doc pelo cliente do João';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok: bloqueado (%)', sqlerrm; end $$;

-- Equipe confere
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select 'cadastros de vendedor (esperado 1)' as teste, count(*) from public.vendedores;
select 'versões (esperado 1 substituido, 2 em_conferencia)' as teste, versao, situacao, nome_original from public.documentos_vendedor order by versao;
select public.conferir_documento_vendedor((select id from public.documentos_vendedor where situacao = 'em_conferencia'), false, 'Ilegível', 'Foto cortada');
select 'recusado com motivo' as teste, situacao, motivo_recusa from public.documentos_vendedor where versao = 2;

-- Outros documentos: vários arquivos, um não substitui o outro
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
insert into public.documentos (cliente_id, tipo_codigo, arquivo_path, nome_original) values
  ('00000000-0000-0000-0000-0000000000c1', 'OUTROS', 'x/o/1', 'a.pdf'),
  ('00000000-0000-0000-0000-0000000000c1', 'OUTROS', 'x/o/2', 'b.pdf');
select 'outros (esperado 2 em_conferencia)' as teste, count(*) from public.documentos where tipo_codigo = 'OUTROS' and situacao = 'em_conferencia';
select 'v2 sem docs de vendedor (esperado 0)' as teste, count(*) from public.documentos_necessarios_v2('00000000-0000-0000-0000-0000000000c1') where tipo_codigo like 'VEND%' or tipo_codigo = 'OUTROS';
select 'v2 tem imóvel e simulação' as teste, string_agg(tipo_codigo, ', ' order by ordem) from public.documentos_necessarios_v2('00000000-0000-0000-0000-0000000000c1') where tipo_codigo in ('MATRICULA','ESPELHO_IPTU','SIMULACAO');
reset role;
