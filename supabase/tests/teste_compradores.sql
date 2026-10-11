\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
-- Cônjuge sem renda e um comprador com renda informal e IR
insert into public.participantes (id, cliente_id, ordem, papel, conjuge_do_titular, nome, cpf, estado_civil)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 2, 'conjuge', true, 'Paulo Costa', '11144477735', 'Casado(a)');
insert into public.participantes (id, cliente_id, ordem, papel, nome, cpf, tipo_renda, renda_bruta, declara_ir, ir_retificado)
values ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 3, 'comprador', 'Rita Costa', '52998224725', 'Informal', 2000, true, false);
select 'docs por pessoa' as teste, pessoa_nome, pessoa_papel, count(*) from public.documentos_necessarios_v2('00000000-0000-0000-0000-0000000000c1') group by 1,2,3, pessoa_ordem order by pessoa_ordem;
select 'docs da Rita' as teste, string_agg(tipo_codigo, ', ' order by ordem) from public.documentos_necessarios_v2('00000000-0000-0000-0000-0000000000c1') where pessoa_nome = 'Rita Costa';
select 'pode ir sem RG do cônjuge (esperado f)' as teste, public.pode_ir_para_analise('00000000-0000-0000-0000-0000000000c1');
insert into public.documentos (cliente_id, participante_id, tipo_codigo, arquivo_path, nome_original)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 'RG_CNH', 'x/RG_CNH/1', 'rg-paulo.jpg'),
       ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d2', 'RG_CNH', 'x/RG_CNH/2', 'rg-rita.jpg');
select 'pode ir com RG de todos (esperado t)' as teste, public.pode_ir_para_analise('00000000-0000-0000-0000-0000000000c1');
select 'versões por pessoa' as teste, coalesce(p.nome, 'titular') pessoa, d.versao, d.versao_pessoa, d.situacao
  from public.documentos d left join public.participantes p on p.id = d.participante_id where d.tipo_codigo = 'RG_CNH' order by d.versao;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select 'Pedro vê participantes (esperado 0)' as teste, count(*) from public.participantes;
do $$ begin
  insert into public.documentos (cliente_id, participante_id, tipo_codigo, arquivo_path) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 'PIS', 'x');
  raise exception 'FALHOU: Pedro enviou documento';
exception when others then if sqlerrm like 'FALHOU%' then raise; end if; raise notice 'ok: Pedro bloqueado'; end $$;
reset role;
