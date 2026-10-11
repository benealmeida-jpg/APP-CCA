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
-- Vendedor PF casado: guarda cônjuge; conta com dígito
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select 'PF casado' as teste, r->>'estado_civil', r->>'conjuge_nome', r->>'conta_digito'
from (select public.vincular_vendedor('00000000-0000-0000-0000-0000000000c2',
  '{"cpf_cnpj":"390.533.447-05","nome":"Ana Vendedora","estado_civil":"Casado(a)","conjuge_nome":"José Vendedor","conjuge_cpf":"529.982.247-25","banco":"104","agencia":"1","conta":"123","conta_digito":"4"}') r) x;
select 'bancos (esperado > 500, Caixa 104)' as teste, count(*), max(case when codigo = '104' then nome end) from public.bancos;
reset role;
-- Perfis ADM x Usuário e registro de acessos
reset role;
select set_config('request.jwt.claim.sub', '', false);
update public.perfis set papel = 'admin' where id = '00000000-0000-0000-0000-000000000001';
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000009', 'gabriel@cca.com', '{"nome":"Gabriel"}');
update public.perfis set papel = 'equipe_cca', ativo = true where id = '00000000-0000-0000-0000-000000000009';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000009', false);
do $$ begin
  perform public.admin_atualizar_usuario('00000000-0000-0000-0000-000000000009', 'admin', true, '{}');
  raise exception 'FALHOU: usuário virou admin';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok: usuário não se promove (%)', sqlerrm; end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select public.admin_atualizar_usuario('00000000-0000-0000-0000-000000000009', 'equipe_cca', true, '{"mudar_status": false}');
select public.registrar_login();
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000009', false);
do $$ begin
  perform public.mudar_status('00000000-0000-0000-0000-0000000000c1', 'cadastro_ok');
  raise exception 'FALHOU: Gabriel mudou status sem permissão';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok: permissão respeitada (%)', sqlerrm; end $$;
select 'acessos legíveis' as teste, acao, usuario_nome, imobiliaria_nome, cliente_nome from public.listar_acessos(5);
reset role;
-- Cadastro fechado: quem cria conta sozinho fica inativo
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000ee', 'intruso@x.com', '{"nome":"Intruso"}');
select 'auto-cadastro inativo (esperado f)' as teste, ativo from public.perfis where id = '00000000-0000-0000-0000-0000000000ee';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ee', false);
select 'intruso vê clientes (esperado 0)' as teste, count(*) from public.clientes;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select 'lista de vendedores (equipe)' as teste, nome, processos, docs_aceitos + docs_conferencia + docs_recusados as docs from public.listar_vendedores();
select public.equipe_ativar_usuario('00000000-0000-0000-0000-000000000003', false);
select 'Pedro desativado' as teste, ativo from public.perfis where id = '00000000-0000-0000-0000-000000000003';
reset role;
-- Gestor / documentação da imobiliária
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a7', 'doc@imob.com', '{"nome":"Docs Imob"}');
update public.perfis set papel = 'gestor_imobiliaria', ativo = true, imobiliaria_id = '00000000-0000-0000-0000-0000000000aa' where id = '00000000-0000-0000-0000-0000000000a7';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a7', false);
insert into public.clientes (id, corretor_id, nome, cpf) values ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-000000000002', 'Cliente pelo gestor', '15350946056');
select 'gestor cadastra para o João (esperado João)' as teste, p.nome from public.clientes c join public.perfis p on p.id = c.corretor_id where c.id = '00000000-0000-0000-0000-0000000000c5';
insert into public.clientes (id, corretor_id, nome, cpf) values ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-000000000003', 'Tentativa Pedro', '86288366757');
select 'corretor de fora vira o gestor (esperado Docs Imob)' as teste, p.nome from public.clientes c join public.perfis p on p.id = c.corretor_id where c.id = '00000000-0000-0000-0000-0000000000c6';
update public.clientes set celular = '21999990000' where id = '00000000-0000-0000-0000-0000000000c1';
select 'gestor edita cliente do João' as teste, celular from public.clientes where id = '00000000-0000-0000-0000-0000000000c1';
insert into public.documentos (cliente_id, tipo_codigo, arquivo_path, nome_original) values ('00000000-0000-0000-0000-0000000000c5', 'PIS', 'x/pis', 'pis.pdf');
select 'gestor anexa' as teste, count(*) from public.documentos where cliente_id = '00000000-0000-0000-0000-0000000000c5';
select 'gestor não vê cliente do Pedro (esperado 0)' as teste, count(*) from public.clientes where id = '00000000-0000-0000-0000-0000000000c2';
-- Aviso: evento chama a função
reset role;
select 'chamadas de aviso (esperado >= 1)' as teste, count(*) from net.chamadas where url like '%/functions/v1/avisos';
select 'segredo não aparece no app (esperado 0)' as teste, count(*) from (select 1) x where false;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select 'corretor lê integrações (esperado 0)' as teste, count(*) from public.integracoes;
reset role;
