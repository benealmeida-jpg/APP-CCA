-- Assinatura do contrato: gerentes, procurações, conferência e liberação (contrato e procuração só depois da CCA liberar).
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
alter table auth.users add column if not exists last_sign_in_at timestamptz;

create or replace function pg_temp.ok(cond boolean, nome text) returns text language plpgsql as $$
begin if cond is distinct from true then raise exception 'FALHOU: %', nome; end if; return 'ok: ' || nome; end $$;
create or replace function pg_temp.falha(comando text, esperado text, nome text) returns text language plpgsql as $$
begin
  execute comando;
  raise exception 'FALHOU (não bloqueou): %', nome;
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  if sqlerrm not ilike '%' || esperado || '%' then raise exception 'FALHOU: % (erro inesperado: %)', nome, sqlerrm; end if;
  return 'ok: ' || nome;
end $$;
create or replace function pg_temp.como(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;

insert into public.imobiliarias (id, nome) values ('30000000-0000-0000-0000-0000000000a1', 'Imob Contrato');
insert into auth.users (id, email, raw_user_meta_data) values
  ('30000000-0000-0000-0000-000000000001', 'adm@ct', '{"nome":"ADM CCA"}'),
  ('30000000-0000-0000-0000-000000000005', 'corretor@ct', '{"nome":"Cris Corretor"}');
update public.perfis set ativo = true, papel = 'admin', nivel = 1 where id = '30000000-0000-0000-0000-000000000001';
update public.perfis set ativo = true, papel = 'corretor', imobiliaria_id = '30000000-0000-0000-0000-0000000000a1' where id = '30000000-0000-0000-0000-000000000005';
insert into public.vendedores (id, tipo, cpf_cnpj, nome) values ('30000000-0000-0000-0000-0000000000b1', 'PJ', '45723174000110', 'Construtora Exemplo');
select pg_temp.como('30000000-0000-0000-0000-000000000005');
insert into public.clientes (id, corretor_id, nome, cpf, programa, modalidade, imovel, vendedor, usa_fgts, tipo_renda, renda_bruta, celular, autorizacao_lgpd_em, status)
values ('30000000-0000-0000-0000-0000000000c1', '30000000-0000-0000-0000-000000000005', 'Paula Compradora', '52998224725', 'MCMV', 'Aquisição de imóvel', 'Novo', 'Pessoa jurídica', false, 'Formal', 4000, '21999990000', now(), 'minuta_em_maos');

set session_replication_role = replica;
update public.clientes set status = 'minuta_em_maos', rascunho = false where id = '30000000-0000-0000-0000-0000000000c1';
set session_replication_role = origin;

set role authenticated;

-- ---------- gerentes e procurações ----------
select pg_temp.como('30000000-0000-0000-0000-000000000005');
select pg_temp.falha($$select public.gerente_salvar(null, 'Fulano', null, null, null, null, true)$$, 'equipe', 'corretor não cadastra gerente');
select pg_temp.ok((select count(*) from public.gerentes_caixa) = 0, 'corretor não vê gerentes');

select pg_temp.como('30000000-0000-0000-0000-000000000001');
select public.gerente_salvar(null, 'Gerson Gerente', '111.444.777-35', '1234', null, null, true) as g \gset
select pg_temp.ok((select cpf = '11144477735' from public.gerentes_caixa where id = :'g'), 'CPF do gerente só com números');
select pg_temp.falha(format($$select public.procuracao_registrar(%L, 'outro/x.pdf', 'x.pdf', 'application/pdf', 10, null, null)$$, :'g'), 'inválido', 'procuração em pasta de outro gerente');
select public.procuracao_registrar(:'g', :'g' || '/p.pdf', 'p.pdf', 'application/pdf', 10, current_date - 1, null) as p \gset
select pg_temp.ok(jsonb_array_length(public.gerentes_lista()->0->'procuracoes') = 1, 'lista traz a procuração do gerente');

-- ---------- arquivos da Caixa não avançam sozinhos e ficam escondidos do corretor ----------
select public.contrato_registrar_arquivo('30000000-0000-0000-0000-0000000000c1', 'contrato_assinado', 'c.pdf', '30000000-0000-0000-0000-0000000000c1/contrato/contrato_assinado/c.pdf', 'application/pdf', 10);
select public.contrato_registrar_arquivo('30000000-0000-0000-0000-0000000000c1', 'validador_assinatura', 'v.pdf', '30000000-0000-0000-0000-0000000000c1/contrato/validador_assinatura/v.pdf', 'application/pdf', 10);
select public.contrato_registrar_arquivo('30000000-0000-0000-0000-0000000000c1', 'procuracao_gerente', 'p.pdf', '30000000-0000-0000-0000-0000000000c1/contrato/procuracao_gerente/p.pdf', 'application/pdf', 10);
select pg_temp.ok((select status from public.clientes where id = '30000000-0000-0000-0000-0000000000c1') = 'minuta_em_maos', 'anexar os 3 arquivos não libera mais sozinho');
select pg_temp.falha($$select public.contrato_registrar_arquivo('30000000-0000-0000-0000-0000000000c1', 'minuta', 'm.pdf', 'outro-cliente/contrato/minuta/m.pdf', null, 1)$$, 'inválido', 'arquivo de contrato em pasta de outro cliente');

select pg_temp.como('30000000-0000-0000-0000-000000000005');
select pg_temp.ok((select count(*) from public.contrato_arquivos where cliente_id = '30000000-0000-0000-0000-0000000000c1') = 0, 'corretor não vê contrato, validador e procuração antes da liberação');
select pg_temp.ok(not public.contrato_arquivo_liberado('30000000-0000-0000-0000-0000000000c1', 'procuracao_gerente'), 'download da procuração bloqueado para o corretor');
select pg_temp.ok(public.contrato_arquivo_liberado('30000000-0000-0000-0000-0000000000c1', 'minuta'), 'minuta continua liberada');
select pg_temp.falha($$select public.contrato_liberar('30000000-0000-0000-0000-0000000000c1')$$, 'equipe', 'corretor não libera o contrato');
select pg_temp.falha($$select public.contrato_salvar_conferencia('30000000-0000-0000-0000-0000000000c1', '{"comprador": true}')$$, 'equipe', 'corretor não marca a conferência');

-- ---------- conferência e liberação ----------
select pg_temp.como('30000000-0000-0000-0000-000000000001');
select pg_temp.falha($$select public.contrato_liberar('30000000-0000-0000-0000-0000000000c1')$$, 'tipo de contrato', 'sem conferência não libera');
select public.contrato_definir('30000000-0000-0000-0000-0000000000c1', 'digital', :'g');
select public.contrato_salvar_conferencia('30000000-0000-0000-0000-0000000000c1',
  '{"comprador": true, "vendedor": true, "imovel": true, "gerente": true, "campos_assinatura": true, "assinaturas": true}', '{"assinaturas_lidas": ["PAULA COMPRADORA"]}');
select pg_temp.ok((select contrato_conferencia->'assinaturas_lidas'->>0 = 'PAULA COMPRADORA' from public.clientes where id = '30000000-0000-0000-0000-0000000000c1'), 'guarda o que foi lido junto da conferência');
select pg_temp.falha($$select public.contrato_liberar('30000000-0000-0000-0000-0000000000c1')$$, 'vencida', 'procuração vencida bloqueia a liberação');
select public.procuracao_atualizar(:'p', current_date + 365, null);
select pg_temp.ok(array_length(public.contrato_pendencias_liberacao('30000000-0000-0000-0000-0000000000c1'), 1) is null, 'nada pendente');
select public.contrato_liberar('30000000-0000-0000-0000-0000000000c1');
select pg_temp.ok((select status = 'registro_cartorio' and contrato_liberado_em is not null from public.clientes where id = '30000000-0000-0000-0000-0000000000c1'), 'liberação leva ao registro');
select pg_temp.ok((select count(*) from public.eventos where cliente_id = '30000000-0000-0000-0000-0000000000c1' and dados->>'para' = 'contrato_assinado') = 1, 'corretor é avisado');

select pg_temp.como('30000000-0000-0000-0000-000000000005');
select pg_temp.ok((select count(*) from public.contrato_arquivos where cliente_id = '30000000-0000-0000-0000-0000000000c1') = 3, 'depois da liberação o corretor vê e baixa');

-- ---------- vendedor ----------
select pg_temp.falha($$select public.vendedor_regra_assinatura('30000000-0000-0000-0000-0000000000b1', '["X"]', 'y')$$, 'equipe', 'corretor não muda quem assina pelo vendedor');
select pg_temp.como('30000000-0000-0000-0000-000000000001');
select public.vendedor_regra_assinatura('30000000-0000-0000-0000-0000000000b1', '["Diretor Um"]', 'Diretor assina só a última página');
select pg_temp.ok((select assinantes->>0 = 'Diretor Um' from public.vendedores where id = '30000000-0000-0000-0000-0000000000b1'), 'regra de assinatura do vendedor salva');

reset role;
select 'Contrato: todos os testes passaram' as resultado;
