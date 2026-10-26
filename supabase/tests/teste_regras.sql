-- Testes das regras de negócio e permissões.
\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Usuários: equipe, corretor A (imobiliária X), corretor B (autônomo)
insert into public.imobiliarias (id, nome) values ('00000000-0000-0000-0000-0000000000aa', 'Imobiliária Exemplo');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'equipe@cca.com', '{"nome":"Equipe"}'),
  ('00000000-0000-0000-0000-000000000002', 'joao@imob.com',  '{"nome":"João","whatsapp":"+5521900000002"}'),
  ('00000000-0000-0000-0000-000000000003', 'pedro@auto.com', '{"nome":"Pedro"}');
update public.perfis set papel = 'equipe_cca' where id = '00000000-0000-0000-0000-000000000001';
update public.perfis set imobiliaria_id = '00000000-0000-0000-0000-0000000000aa' where id = '00000000-0000-0000-0000-000000000002';
-- (usuários convidados: ativos)
update public.perfis set ativo = true;

-- Corretor João cria cliente
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
insert into public.clientes (id, corretor_id, nome, cpf, programa, modalidade, imovel, vendedor, usa_fgts, tipo_renda, renda_bruta)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000002',
        'Mariana Costa', '123.456.789-00', 'MCMV', 'Aquisição de Terreno e Construção', 'Usado', 'Pessoa física', true, 'Formal', 4200);
select 'imobiliaria preenchida' as teste, imobiliaria_id is not null as ok from public.clientes;

select 'documentos exigidos (esperado 9)' as teste, count(*) from public.documentos_necessarios_v2('00000000-0000-0000-0000-0000000000c1');
select 'pode ir para análise sem RG (esperado f)' as teste, public.pode_ir_para_analise('00000000-0000-0000-0000-0000000000c1');

-- Envio sem LGPD deve falhar
do $$ begin
  perform public.enviar_cadastro('00000000-0000-0000-0000-0000000000c1');
  raise exception 'FALHOU: enviou sem LGPD';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: bloqueou envio sem LGPD (%)', sqlerrm;
end $$;

update public.clientes set autorizacao_lgpd_em = now() where id = '00000000-0000-0000-0000-0000000000c1';
-- Modelo 2: a Simulação da Caixa é obrigatória para enviar
do $$ begin
  perform public.enviar_cadastro('00000000-0000-0000-0000-0000000000c1');
  raise exception 'FALHOU: enviou sem simulação';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: bloqueou envio sem simulação (%)', sqlerrm;
end $$;
insert into public.documentos (cliente_id, tipo_codigo, arquivo_path, nome_original)
values ('00000000-0000-0000-0000-0000000000c1', 'SIMULACAO', 'c1/simulacao.pdf', 'simulacao.pdf');
select public.enviar_cadastro('00000000-0000-0000-0000-0000000000c1');
reset role;  -- (para os testes seguintes, a simulação volta a faltar)
delete from public.documentos where tipo_codigo = 'SIMULACAO';
set role authenticated;
select 'status após envio sem ** (esperado documentacao_pendente)' as teste, status from public.clientes;

-- Corretor tenta mudar status: deve falhar
do $$ begin
  update public.clientes set status = 'cliente_aprovado';
  raise exception 'FALHOU: corretor mudou status';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: corretor não muda status (%)', sqlerrm;
end $$;

-- Corretor tenta virar equipe: deve falhar
do $$ begin
  update public.perfis set papel = 'admin' where id = auth.uid();
  raise exception 'FALHOU: virou admin';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: não se promove (%)', sqlerrm;
end $$;

-- Envia RG (v1)
insert into public.documentos (cliente_id, tipo_codigo, arquivo_path, nome_original)
values ('00000000-0000-0000-0000-0000000000c1', 'RG_CNH', '00000000-0000-0000-0000-0000000000c1/RG_CNH/1-rg.jpg', 'rg.jpg');
select 'pode ir com RG em conferência (esperado t)' as teste, public.pode_ir_para_analise('00000000-0000-0000-0000-0000000000c1');

-- Pedro (outro corretor) não vê o cliente
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select 'Pedro vê clientes (esperado 0)' as teste, count(*) from public.clientes;
select 'Pedro vê documentos (esperado 0)' as teste, count(*) from public.documentos;

-- Equipe recusa o RG
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select 'equipe vê clientes (esperado 1)' as teste, count(*) from public.clientes;
select public.conferir_documento((select id from public.documentos limit 1), false, 'Foto com baixa qualidade', 'cortado');
select 'pode ir com RG recusado (esperado f)' as teste, public.pode_ir_para_analise('00000000-0000-0000-0000-0000000000c1');

-- João substitui (v2) → v1 vira substituido
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
insert into public.documentos (cliente_id, tipo_codigo, arquivo_path, nome_original)
values ('00000000-0000-0000-0000-0000000000c1', 'RG_CNH', '00000000-0000-0000-0000-0000000000c1/RG_CNH/2-rg.jpg', 'rg-nova.jpg');
select 'versões' as teste, versao, situacao from public.documentos order by versao;

-- Equipe aceita e muda status
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select public.conferir_documento((select id from public.documentos where versao = 2), true);
select public.mudar_status('00000000-0000-0000-0000-0000000000c1', 'em_analise');
-- (MO / DAMP: a CCA dispensa o kit deste teste para poder pular para a Conformidade)
select public.mo_montar_kit('00000000-0000-0000-0000-0000000000c1');
select public.mo_dispensar((x->>'id')::uuid, true) from jsonb_array_elements(public.mo_kit_do_cliente('00000000-0000-0000-0000-0000000000c1')->'itens') x;
select public.mudar_status_mensagem('00000000-0000-0000-0000-0000000000c1', 'conformidade', 'Bom dia, Ana! Texto editado pela equipe.');
select 'mensagem editada no evento (esperado Texto editado)' as teste, dados->>'mensagem' from public.eventos where tipo = 'status_mudou' and dados->>'para' = 'conformidade';
select public.mudar_status('00000000-0000-0000-0000-0000000000c1', 'em_analise');
select 'status final' as teste, status from public.clientes;
select 'resumo' as teste, nome, status_nome, docs_pendentes, docs_recusados, docs_em_conferencia, pode_ir_para_analise from public.clientes_resumo;
reset role;
select 'eventos gerados' as teste, tipo, count(*) from public.eventos group by tipo order by tipo;
select 'histórico' as teste, de, para from public.historico_status;
