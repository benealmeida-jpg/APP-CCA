-- Testes do Modelo 2: níveis da CCA, CEO/gestor da imobiliária, cliente final, conversa interna, mural, comissões,
-- imóveis, engenharia nova, consumidores, MO / DAMP e financeiro. Cada verificação para o teste se falhar.
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

-- Pessoas: CCA nível 1 (ADM) e nível 3; Imobiliária M2 com CEO, gestor e corretor; corretor independente; consumidor final
insert into public.imobiliarias (id, nome) values ('20000000-0000-0000-0000-0000000000a1', 'Imob M2'), ('20000000-0000-0000-0000-0000000000a2', 'Outra Imob');
insert into auth.users (id, email, raw_user_meta_data) values
  ('20000000-0000-0000-0000-000000000001', 'ceo.cca@m2', '{"nome":"CEO CCA"}'),
  ('20000000-0000-0000-0000-000000000002', 'gabriel@m2', '{"nome":"Gabriel"}'),
  ('20000000-0000-0000-0000-000000000003', 'ceo.imob@m2', '{"nome":"Carla CEO"}'),
  ('20000000-0000-0000-0000-000000000004', 'gestor.imob@m2', '{"nome":"Gil Gestor"}'),
  ('20000000-0000-0000-0000-000000000005', 'corretor@m2', '{"nome":"Cris Corretor"}'),
  ('20000000-0000-0000-0000-000000000006', 'indep@m2', '{"nome":"Ivo Independente"}'),
  ('20000000-0000-0000-0000-000000000007', 'consumidor@m2', '{"nome":"Fernanda Final"}'),
  ('20000000-0000-0000-0000-000000000008', 'cliente@m2', '{"nome":"Cliente Final"}'),
  ('20000000-0000-0000-0000-000000000009', 'outro@m2', '{"nome":"Otto Outra"}');
update public.perfis set ativo = true, papel = 'admin', nivel = 1 where id = '20000000-0000-0000-0000-000000000001';
update public.perfis set ativo = true, papel = 'equipe_cca' where id = '20000000-0000-0000-0000-000000000002';
update public.perfis set ativo = true, papel = 'gestor_imobiliaria', imobiliaria_id = '20000000-0000-0000-0000-0000000000a1' where id = '20000000-0000-0000-0000-000000000003';
update public.perfis set ativo = true, papel = 'gestor_imobiliaria', funcao = 'gestor', imobiliaria_id = '20000000-0000-0000-0000-0000000000a1' where id = '20000000-0000-0000-0000-000000000004';
update public.perfis set ativo = true, papel = 'corretor', imobiliaria_id = '20000000-0000-0000-0000-0000000000a1' where id = '20000000-0000-0000-0000-000000000005';
update public.perfis set ativo = true, papel = 'corretor' where id = '20000000-0000-0000-0000-000000000006';
update public.perfis set ativo = true, papel = 'corretor', consumidor = true, cpf = '39053344705', identidade_verificada_em = now() where id = '20000000-0000-0000-0000-000000000007';
update public.perfis set ativo = true, papel = 'corretor', imobiliaria_id = '20000000-0000-0000-0000-0000000000a2' where id = '20000000-0000-0000-0000-000000000009';
insert into public.vendedores (id, tipo, cpf_cnpj, nome) values ('20000000-0000-0000-0000-0000000000b1', 'PF', '11144477735', 'Vera Vendedora');

set role authenticated;

-- ---------- níveis e funções ----------
select pg_temp.como('20000000-0000-0000-0000-000000000001');
select pg_temp.ok(public.meu_nivel() = 1 and public.sou_nivel1(), 'ADM marcado é nível 1');
select pg_temp.como('20000000-0000-0000-0000-000000000002');
select pg_temp.ok(public.meu_nivel() = 3 and not public.sou_nivel1(), 'equipe sem marca é nível 3');
select pg_temp.falha($$update public.perfis set nivel = 1 where id = auth.uid()$$, 'nível 1', 'nível 3 não se promove');
select pg_temp.como('20000000-0000-0000-0000-000000000003');
select pg_temp.ok(public.minha_funcao() = 'ceo' and public.sou_ceo_imob(), 'gestor_imobiliaria sem marca é CEO');
select pg_temp.como('20000000-0000-0000-0000-000000000004');
select pg_temp.ok(public.minha_funcao() = 'gestor' and not public.sou_ceo_imob(), 'gestor marcado não é CEO');
select pg_temp.falha($$update public.perfis set funcao = 'ceo' where id = auth.uid()$$, 'Somente a equipe', 'gestor não vira CEO');
select pg_temp.falha($$select public.gestor_ativar_corretor('20000000-0000-0000-0000-000000000005', false)$$, 'CEO', 'gestor não desliga corretor');
select pg_temp.como('20000000-0000-0000-0000-000000000005');
select pg_temp.falha($$update public.perfis set acesso_cliente = true where id = auth.uid()$$, 'chave', 'acesso_cliente só pela chave');
select pg_temp.como('20000000-0000-0000-0000-000000000003');
select public.gestor_ativar_corretor('20000000-0000-0000-0000-000000000004', false);
select public.gestor_ativar_corretor('20000000-0000-0000-0000-000000000004', true);
select pg_temp.ok(true, 'CEO desliga e religa o gestor');

-- ---------- cliente da imobiliária ----------
select pg_temp.como('20000000-0000-0000-0000-000000000005');
insert into public.clientes (id, corretor_id, nome, cpf, programa, modalidade, imovel, vendedor, usa_fgts, tipo_renda, renda_bruta, celular, autorizacao_lgpd_em)
values ('20000000-0000-0000-0000-0000000000c1', '20000000-0000-0000-0000-000000000005', 'Paula Compradora', '52998224725', 'MCMV', 'Aquisição de imóvel', 'Usado', 'Pessoa física', true, 'Formal', 4000, '21999990000', now());
select pg_temp.ok((select imobiliaria_id from public.clientes where id = '20000000-0000-0000-0000-0000000000c1') = '20000000-0000-0000-0000-0000000000a1', 'cliente na imobiliária do corretor');
select pg_temp.falha($$select public.enviar_cadastro('20000000-0000-0000-0000-0000000000c1')$$, 'Simulação', 'sem simulação não envia');
insert into public.documentos (cliente_id, tipo_codigo, arquivo_path, nome_original) values ('20000000-0000-0000-0000-0000000000c1', 'SIMULACAO', '20000000-0000-0000-0000-0000000000c1/SIMULACAO/s.pdf', 's.pdf');
select public.enviar_cadastro('20000000-0000-0000-0000-0000000000c1');
select pg_temp.ok(not (select rascunho from public.clientes where id = '20000000-0000-0000-0000-0000000000c1'), 'com simulação envia');
update public.clientes set assinatura_contrato = 'nato_digital' where id = '20000000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select assinatura_contrato from public.clientes where id = '20000000-0000-0000-0000-0000000000c1') = 'nato_digital', 'corretor grava a forma de assinatura');

-- conversa: com gestor na imobiliária, o corretor só lê
select pg_temp.falha($$insert into public.conversa (cliente_id, autor_id, texto) values ('20000000-0000-0000-0000-0000000000c1', auth.uid(), 'oi')$$, 'quem fala com a CCA é o gestor', 'corretor não escreve à CCA quando há gestor');
select pg_temp.como('20000000-0000-0000-0000-000000000004');
insert into public.conversa (cliente_id, autor_id, texto) values ('20000000-0000-0000-0000-0000000000c1', auth.uid(), 'Bom dia, CCA');
select pg_temp.ok((select count(*) from public.listar_conversa_m2('20000000-0000-0000-0000-0000000000c1') where autor_papel = 'Gestor') = 1, 'gestor escreve à CCA (rótulo Gestor)');
select pg_temp.ok((select gestor_nome from public.clientes_resumo where id = '20000000-0000-0000-0000-0000000000c1') = 'Gil Gestor', 'lista mostra o gestor');
select pg_temp.como('20000000-0000-0000-0000-000000000005');
select pg_temp.ok((select gestor_nome from public.clientes_resumo where id = '20000000-0000-0000-0000-0000000000c1') = 'Gil Gestor', 'corretor também vê o nome do gestor');

-- conversa interna
select public.enviar_conversa_interna('20000000-0000-0000-0000-0000000000c1', 'Gil, o cliente mandou o IR');
select pg_temp.como('20000000-0000-0000-0000-000000000004');
select pg_temp.ok((select count(*) from public.listar_conversa_interna('20000000-0000-0000-0000-0000000000c1')) = 1, 'gestor lê a conversa interna');
select pg_temp.como('20000000-0000-0000-0000-000000000002');
select pg_temp.falha($$select * from public.listar_conversa_interna('20000000-0000-0000-0000-0000000000c1')$$, 'Sem acesso', 'nível 3 não lê a conversa interna');
select pg_temp.como('20000000-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) from public.listar_conversa_interna('20000000-0000-0000-0000-0000000000c1')) = 1, 'nível 1 lê a conversa interna');
select pg_temp.falha($$select public.enviar_conversa_interna('20000000-0000-0000-0000-0000000000c1', 'x')$$, 'imobiliária', 'nível 1 não escreve na interna');
select pg_temp.como('20000000-0000-0000-0000-000000000009');
select pg_temp.falha($$select * from public.listar_conversa_interna('20000000-0000-0000-0000-0000000000c1')$$, 'Sem acesso', 'corretor de outra imobiliária não lê');

-- mural
select pg_temp.como('20000000-0000-0000-0000-000000000003');
select public.publicar_mural('Reunião sexta às 9h');
select pg_temp.como('20000000-0000-0000-0000-000000000004');
select public.publicar_mural('Atualizem os IRs');
select pg_temp.como('20000000-0000-0000-0000-000000000005');
select pg_temp.ok((select count(*) from public.listar_mural()) = 2, 'corretor lê o mural');
select pg_temp.falha($$select public.publicar_mural('oi')$$, 'CEO ou o gestor', 'corretor não publica');
select pg_temp.falha($$select public.apagar_mural((select min(id) from public.listar_mural()))$$, 'Sem permissão', 'corretor não apaga');
select pg_temp.como('20000000-0000-0000-0000-000000000009');
select pg_temp.ok((select count(*) from public.listar_mural()) = 0, 'outra imobiliária não vê o mural');
select pg_temp.como('20000000-0000-0000-0000-000000000003');
select public.apagar_mural((select id from public.listar_mural() where texto like 'Atualizem%'));
select pg_temp.ok((select count(*) from public.listar_mural()) = 1, 'CEO apaga aviso do gestor');
select pg_temp.como('20000000-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) from public.listar_mural('20000000-0000-0000-0000-0000000000a1')) = 1, 'nível 1 lê o mural');
select pg_temp.ok(jsonb_array_length(public.perfis_das_imobiliarias()) >= 1, 'nível 1 lista as pessoas das imobiliárias');
select pg_temp.como('20000000-0000-0000-0000-000000000002');
select pg_temp.falha($$select public.perfis_das_imobiliarias()$$, 'CEO da CCA', 'nível 3 não usa perfil secundário');

-- ---------- acesso do cliente final ----------
select pg_temp.como('20000000-0000-0000-0000-000000000005');
select pg_temp.ok((public.config_acesso_cliente()->>'pode')::boolean = false, 'corretor da imobiliária não liga o acesso');
select pg_temp.ok(public.acesso_do_cliente('20000000-0000-0000-0000-0000000000c1')->>'situacao' = 'desligado', 'acesso começa desligado');
select pg_temp.falha($$select public.dar_acesso_cliente('20000000-0000-0000-0000-0000000000c1')$$, 'desligado', 'não convida com acesso desligado');
select pg_temp.como('20000000-0000-0000-0000-000000000003');
select public.definir_acesso_cliente(true);
select pg_temp.como('20000000-0000-0000-0000-000000000005');
select pg_temp.ok(length(public.dar_acesso_cliente('20000000-0000-0000-0000-0000000000c1')->>'token') > 20, 'corretor gera o convite do cliente');
select pg_temp.ok(public.acesso_do_cliente('20000000-0000-0000-0000-0000000000c1')->>'situacao' = 'convidado', 'situação: convidado');
reset role;   -- (a função de convite cria o acesso do cliente, como servidor)
select pg_temp.como('');
update public.perfis set ativo = true, papel = 'cliente', cliente_id = '20000000-0000-0000-0000-0000000000c1' where id = '20000000-0000-0000-0000-000000000008';
set role authenticated;
select pg_temp.como('20000000-0000-0000-0000-000000000005');
select pg_temp.ok(public.acesso_do_cliente('20000000-0000-0000-0000-0000000000c1')->>'situacao' = 'ativo', 'situação: ativo');
select pg_temp.como('20000000-0000-0000-0000-000000000008');
select pg_temp.ok((select count(*) from public.clientes) = 1, 'cliente final vê o próprio processo');
select pg_temp.ok((select count(*) from public.perfis where id = '20000000-0000-0000-0000-000000000005') = 1, 'cliente final vê o corretor dele');
insert into public.documentos (cliente_id, tipo_codigo, arquivo_path, nome_original) values ('20000000-0000-0000-0000-0000000000c1', 'COMPROVANTE_RESIDENCIA', '20000000-0000-0000-0000-0000000000c1/x/1.pdf', 'res.pdf');
select pg_temp.ok(true, 'cliente final envia documento');
select pg_temp.falha($$insert into public.clientes (corretor_id, nome, cpf) values (auth.uid(), 'X', '1')$$, 'row-level security', 'cliente final não cadastra processo');
select pg_temp.falha($$select public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')$$, 'não encontrado', 'cliente final não vê o MO / DAMP');
select pg_temp.como('20000000-0000-0000-0000-000000000003');
select public.definir_acesso_cliente(false);
select pg_temp.como('20000000-0000-0000-0000-000000000008');
select pg_temp.ok((select count(*) from public.clientes) = 0, 'acesso desligado: cliente final não vê mais');
select pg_temp.como('20000000-0000-0000-0000-000000000003');
select public.definir_acesso_cliente(true);
select pg_temp.como('20000000-0000-0000-0000-000000000005');
select public.remover_acesso_cliente('20000000-0000-0000-0000-0000000000c1');
select pg_temp.ok(public.acesso_do_cliente('20000000-0000-0000-0000-0000000000c1')->>'situacao' = 'sem_acesso', 'tirar o acesso');

-- ---------- imóveis ----------
select pg_temp.como('20000000-0000-0000-0000-000000000005');
select public.salvar_imovel('{"vendedor_id":"20000000-0000-0000-0000-0000000000b1","endereco":"Rua A, 10","uf":"rj","cidade":"Niterói","matricula":"123","tipo":"usado"}');
select pg_temp.ok((select count(*) from jsonb_array_elements(public.listar_imoveis())) = 1, 'corretor vê o imóvel que cadastrou');
select pg_temp.como('20000000-0000-0000-0000-000000000009');
select pg_temp.ok((select count(*) from jsonb_array_elements(public.listar_imoveis())) = 0, 'outra imobiliária não vê o imóvel');
select pg_temp.ok((select count(*) from jsonb_array_elements(public.listar_imoveis('20000000-0000-0000-0000-0000000000b1'))) = 1, 'pelo vendedor, o imóvel aparece para escolher na engenharia');
select pg_temp.como('20000000-0000-0000-0000-000000000005');
select public.registrar_doc_imovel((select (x->>'id')::uuid from jsonb_array_elements(public.listar_imoveis()) x), 'MATRICULA', 'im/m.pdf', 'matricula.pdf', 'application/pdf', 10);
select public.vincular_imovel_cliente('20000000-0000-0000-0000-0000000000c1', (select (x->>'id')::uuid from jsonb_array_elements(public.listar_imoveis()) x));
select pg_temp.ok((select situacao from public.documentos_necessarios_v2('20000000-0000-0000-0000-0000000000c1') where tipo_codigo = 'MATRICULA') = 'em_conferencia', 'matrícula do imóvel vale no processo');
select pg_temp.ok((select versao from public.documentos_necessarios_v2('20000000-0000-0000-0000-0000000000c1') where tipo_codigo = 'MATRICULA') = 0, 'documento do imóvel com versão 0');
update public.clientes set imovel_id = null where id = '20000000-0000-0000-0000-0000000000c1';
select pg_temp.ok((select imovel_id from public.clientes where id = '20000000-0000-0000-0000-0000000000c1') is not null, 'imóvel do processo só muda pela função');
select pg_temp.como('20000000-0000-0000-0000-000000000001');
select public.salvar_imovel(jsonb_build_object('vendedor_id', '20000000-0000-0000-0000-0000000000b1', 'endereco', 'Rua B, 20', 'uf', 'RJ', 'cidade', 'Itaboraí',
  'corretor_id', '20000000-0000-0000-0000-000000000006', 'consumidor_id', '20000000-0000-0000-0000-000000000007'));
select pg_temp.ok((select x->>'consumidor_nome' from jsonb_array_elements(public.listar_imoveis()) x where x->>'endereco' = 'Rua B, 20') = 'Fernanda Final', 'CCA liga o consumidor final ao imóvel');
select pg_temp.falha($$select public.salvar_imovel(jsonb_build_object('vendedor_id', '20000000-0000-0000-0000-0000000000b1', 'endereco', 'Rua C', 'uf', 'RJ', 'cidade', 'Rio', 'corretor_id', '20000000-0000-0000-0000-000000000007'))$$,
  'Corretor não encontrado', 'consumidor final não vira corretor do imóvel');
select pg_temp.como('20000000-0000-0000-0000-000000000006');
select pg_temp.ok((select count(*) from jsonb_array_elements(public.listar_imoveis()) x where x->>'endereco' = 'Rua B, 20') = 1, 'corretor responsável vê o imóvel');

-- ---------- engenharia nova ----------
select pg_temp.como('20000000-0000-0000-0000-000000000001');
select public.criar_engenharia_m2(jsonb_build_object('vendedor_id', '20000000-0000-0000-0000-0000000000b1', 'tipo', 'leilao',
  'imovel_id', (select x->>'id' from jsonb_array_elements(public.listar_imoveis()) x where x->>'endereco' = 'Rua A, 10'), 'valor_desejado', 300000,
  'acompanhante_tipo', 'outro', 'acompanhante_nome', 'Zé', 'acompanhante_telefone', '(21) 98888-7777', 'acompanhante_email', 'ZE@x.com'));
select pg_temp.ok((select (x->>'pela_cca')::boolean and x->>'acompanhante_telefone' = '21988887777' and x->>'acompanhante_email' = 'ze@x.com'
                   from jsonb_array_elements(public.listar_engenharias()) x where x->>'tipo' = 'leilao'), 'CCA pede engenharia para ela mesma');
select pg_temp.ok((select jsonb_array_length(x->'docs') = 1 and (x->'docs'->0->>'do_imovel')::boolean from jsonb_array_elements(public.listar_engenharias()) x where x->>'tipo' = 'leilao'), 'engenharia mostra o documento do imóvel');
select public.enviar_engenharia((select (x->>'id')::uuid from jsonb_array_elements(public.listar_engenharias()) x where x->>'tipo' = 'leilao'));
select pg_temp.ok((select x->>'etapa' from jsonb_array_elements(public.listar_engenharias()) x where x->>'tipo' = 'leilao') = 'em_analise', 'CCA envia o próprio pedido');
select public.criar_engenharia_m2(jsonb_build_object('vendedor_id', '20000000-0000-0000-0000-0000000000b1', 'tipo', 'terreno', 'para_corretor_id', '20000000-0000-0000-0000-000000000006',
  'imovel_endereco', 'Lote 5', 'imovel_cidade', 'Maricá', 'imovel_uf', 'rj'));
select pg_temp.como('20000000-0000-0000-0000-000000000006');
select pg_temp.ok((select x->>'pedido_por_cca' from jsonb_array_elements(public.listar_engenharias()) x where x->>'tipo' = 'terreno') = 'CEO CCA', 'corretor vê o pedido que a CCA fez em nome dele');
select pg_temp.ok((select count(*) from jsonb_array_elements(public.listar_imoveis()) x where x->>'endereco' = 'Lote 5') = 1, 'pedido sem imóvel cria o imóvel');
select public.editar_engenharia_m2((select (x->>'id')::uuid from jsonb_array_elements(public.listar_engenharias()) x where x->>'tipo' = 'terreno'),
  '{"tipo":"to","imovel_endereco":"Lote 5A","imovel_cidade":"Maricá","imovel_uf":"RJ","valor_desejado":"150000"}');
select pg_temp.ok((select count(*) from jsonb_array_elements(public.listar_imoveis()) x where x->>'endereco' = 'Lote 5A') = 1, 'editar a engenharia atualiza o imóvel');
select pg_temp.como('20000000-0000-0000-0000-000000000007');
select pg_temp.falha($$select public.criar_engenharia_m2('{"vendedor_id":"20000000-0000-0000-0000-0000000000b1","tipo":"usado"}')$$, 'Só corretor', 'consumidor final não pede engenharia');

-- ---------- consumidores ----------
select pg_temp.como('20000000-0000-0000-0000-000000000002');
select pg_temp.ok((select x->>'identidade' from jsonb_array_elements(public.listar_consumidores()) x where x->>'nome' = 'Fernanda Final') = 'confirmada', 'lista de consumidores finais');
select pg_temp.ok((select jsonb_array_length(x->'imoveis') from jsonb_array_elements(public.listar_consumidores()) x where x->>'nome' = 'Fernanda Final') = 1, 'consumidor com o imóvel ligado');
select pg_temp.como('20000000-0000-0000-0000-000000000005');
select pg_temp.falha($$select public.listar_consumidores()$$, 'Somente a CCA', 'corretor não lista consumidores');

-- ---------- MO / DAMP (kit por cliente) ----------
select pg_temp.como('20000000-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) from public.listar_modelos_damp() where oficial is not null) = 5, 'modelos oficiais da Caixa já cadastrados');
select public.mudar_status('20000000-0000-0000-0000-0000000000c1', 'cliente_aprovado');
select pg_temp.ok((select damp_situacao from public.clientes_resumo where id = '20000000-0000-0000-0000-0000000000c1') = 'para_assinar', 'ao aprovar, o kit é montado');
select pg_temp.ok(jsonb_array_length(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->'itens') = 3, 'kit: MO30844, MO30825 e a DAMP (MCMV com FGTS)');
select pg_temp.ok((select x->>'pessoa_nome' from jsonb_array_elements(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->'itens') x where x->'modelo'->>'codigo' = 'DAMP 29300') = 'Paula Compradora', 'DAMP sai em nome de cada comprador');
select pg_temp.ok(public.mo_montar_kit('20000000-0000-0000-0000-0000000000c1') = 0, 'montar de novo não duplica');
select public.mudar_status('20000000-0000-0000-0000-0000000000c1', 'entrevista');
select pg_temp.falha($$select public.mudar_status('20000000-0000-0000-0000-0000000000c1', 'conformidade')$$, 'faltam MO / DAMP', 'sem os assinados não vai para a Conformidade');
select pg_temp.como('20000000-0000-0000-0000-000000000005');
select pg_temp.ok(jsonb_array_length(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->'modelos') = 0, 'corretor não recebe a lista de modelos');
select pg_temp.falha($$select public.mo_anexar_assinado_v2((select (x->>'id')::uuid from jsonb_array_elements(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->'itens') x limit 1), 'a.pdf', 'outra/a.pdf', '[]'::jsonb, true, true)$$, 'inválido', 'arquivo fora da pasta do cliente não vale');
select public.mo_salvar_valores((x->>'id')::uuid, '{"1":"PAULA COMPRADORA"}') from jsonb_array_elements(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->'itens') x where x->'modelo'->>'codigo' = 'MO30844';
select pg_temp.ok((select x->'valores'->>'1' from jsonb_array_elements(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->'itens') x where x->'modelo'->>'codigo' = 'MO30844') = 'PAULA COMPRADORA', 'campos conferidos ficam guardados');
select public.mo_anexar_assinado_v2((x->>'id')::uuid, 'assinado.pdf', '20000000-0000-0000-0000-0000000000c1' || '/mo/' || (x->>'id') || '.pdf', '[]'::jsonb, true, true) from jsonb_array_elements(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->'itens') x where x->'modelo'->>'tipo' = 'MO';
select pg_temp.ok((select count(*) from public.conversa where cliente_id = '20000000-0000-0000-0000-0000000000c1' and texto like 'Anexei o MO%') = 2, 'aviso automático na conversa (mesmo com gestor)');
select pg_temp.falha($$select public.mo_marcar_lancado((select (x->>'id')::uuid from jsonb_array_elements(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->'itens') x limit 1), true)$$, 'Somente a CCA', 'corretor não marca lançado');
select pg_temp.falha($$select public.mo_dispensar((select (x->>'id')::uuid from jsonb_array_elements(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->'itens') x limit 1), true)$$, 'Somente a CCA', 'corretor não dispensa');
select pg_temp.como('20000000-0000-0000-0000-000000000001');
select pg_temp.falha($$select public.mudar_status('20000000-0000-0000-0000-0000000000c1', 'conformidade')$$, 'DAMP 29300 (Paula Compradora)', 'a barreira diz o que falta');
select public.mo_dispensar((x->>'id')::uuid, true) from jsonb_array_elements(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->'itens') x where x->'modelo'->>'tipo' = 'DAMP';
select public.mo_adicionar('20000000-0000-0000-0000-0000000000c1', (select id from public.listar_modelos_damp() where oficial = 'MO30679'), 0);
select pg_temp.ok(jsonb_array_length(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->'itens') = 4, 'CCA inclui um modelo manual');
select public.mudar_status('20000000-0000-0000-0000-0000000000c1', 'conformidade');
select pg_temp.ok((select status from public.clientes where id = '20000000-0000-0000-0000-0000000000c1') = 'conformidade', 'com os assinados (e a DAMP dispensada) vai para a Conformidade');
select public.mo_marcar_lancado((x->>'id')::uuid, true) from jsonb_array_elements(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->'itens') x where x->'assinado' is not null and x->'assinado' <> 'null'::jsonb;
select pg_temp.ok(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->>'situacao' = 'lancada', 'CCA marca lançado na Caixa');
select pg_temp.como('20000000-0000-0000-0000-000000000005');
select pg_temp.falha($$select public.mo_anexar_assinado_v2((select (x->>'id')::uuid from jsonb_array_elements(public.mo_kit_do_cliente('20000000-0000-0000-0000-0000000000c1')->'itens') x where x->'modelo'->>'tipo' = 'MO' limit 1), 'troca.pdf', '20000000-0000-0000-0000-0000000000c1/mo/troca.pdf', '[]'::jsonb, true, true)$$, 'Só a CCA', 'depois de lançado na Caixa, corretor não troca o formulário');
select pg_temp.ok(to_regprocedure('public.mo_anexar_assinado(uuid,text,text)') is null, 'a versão antiga, sem essa trava, não existe mais');
select pg_temp.como('20000000-0000-0000-0000-000000000002');
select pg_temp.falha($$select public.salvar_modelo_damp('{"codigo":"X"}')$$, 'ADM', 'equipe sem ADM não cria modelo');
select pg_temp.como('20000000-0000-0000-0000-000000000001');
select public.salvar_modelo_damp('{"codigo":"MO99999","nome":"Só SBPE","regra":[{"programa":"SBPE"}],"assina":"compradores"}');
select pg_temp.ok(public.mo_montar_kit('20000000-0000-0000-0000-0000000000c1') = 0, 'regra de outra linha não entra no kit');

-- ---------- financeiro ----------
select pg_temp.como('20000000-0000-0000-0000-000000000002');
select pg_temp.ok((public.fin_acesso()->>'lancar_despesas')::boolean and not (public.fin_acesso()->>'lancar_creditos')::boolean, 'nível 3: despesas sim, créditos não');
select pg_temp.falha($$select public.fin_salvar_lancamento('{"tipo":"credito","categoria":"Reembolso","valor":"10","data":"2026-10-01"}')$$, 'créditos', 'nível 3 não lança crédito');
select public.fin_salvar_lancamento('{"tipo":"fixa","categoria":"Aluguel","valor":"2500","data":"2026-10-05","descricao":"Sala"}');
select pg_temp.falha($$select public.fin_contratos()$$, 'nível 1', 'nível 3 não vê o faturamento');
select pg_temp.como('20000000-0000-0000-0000-000000000001');
select public.fin_salvar_lancamento('{"tipo":"credito","categoria":"Reembolso","valor":"85","data":"2026-10-06"}');
select pg_temp.ok(jsonb_array_length(public.fin_listar_lancamentos('2026-10')) = 2, 'nível 1 vê todos os lançamentos');
select pg_temp.como('20000000-0000-0000-0000-000000000002');
select pg_temp.ok(jsonb_array_length(public.fin_listar_lancamentos('2026-10')) = 1, 'nível 3 vê só os dele');
select pg_temp.como('20000000-0000-0000-0000-000000000001');
select public.fin_salvar_config('{"taxa_bruta":0.8,"imposto":18,"valor_empreendimento":600}', '{"2":{"lancar_despesas":true,"lancar_creditos":true,"ver_todos":true},"3":{"lancar_despesas":true,"lancar_creditos":true,"ver_todos":true}}');
select public.mudar_status('20000000-0000-0000-0000-0000000000c1', 'contrato_assinado');
select public.salvar_dados_contrato('20000000-0000-0000-0000-0000000000c1', '{"contrato_numero":"8.4444.0001","valor_financiado":"200000","contrato_assinado_em":"2026-10-08"}');
select pg_temp.ok((select (x->>'valor_financiado')::numeric from jsonb_array_elements(public.fin_contratos()->'contratos') x) = 200000, 'contrato no faturamento');
select public.fin_fechar_mes('2026-10', '{"ids":["20000000-0000-0000-0000-0000000000c1"],"valores":{"20000000-0000-0000-0000-0000000000c1":200000},"fixos":[],"taxa_bruta":0.8,"imposto":18,"valor_empreendimento":600,"bruto":1600,"liquido":1312}');
select pg_temp.falha($$select public.fin_fechar_mes('2026-10', '{"ids":["x"]}')$$, 'já está fechado', 'não fecha duas vezes');
select pg_temp.como('20000000-0000-0000-0000-000000000002');
select pg_temp.ok((public.fin_acesso()->>'lancar_creditos')::boolean, 'nível 1 liberou créditos para o nível 3');
select pg_temp.falha($$select public.salvar_dados_contrato('20000000-0000-0000-0000-0000000000c1', '{"valor_financiado":"1"}')$$, 'faturamento fechado', 'mês fechado: nível 3 não muda o valor');
select public.salvar_dados_contrato('20000000-0000-0000-0000-0000000000c1', '{"contrato_numero":"8.4444.0002"}');
select pg_temp.como('20000000-0000-0000-0000-000000000005');
update public.clientes set empreendimento_caixa = true, valor_financiado = 1 where id = '20000000-0000-0000-0000-0000000000c1';
select pg_temp.como('20000000-0000-0000-0000-000000000001');
select pg_temp.ok((select not coalesce(empreendimento_caixa, false) and valor_financiado = 200000 from public.clientes where id = '20000000-0000-0000-0000-0000000000c1'), 'corretor não mexe nos dados do contrato faturado');
select public.fin_registrar_nfe('2026-10', '{"numero":"000123","data":"2026-10-30"}');
select pg_temp.falha($$select public.fin_reabrir_mes('2026-10')$$, 'NF-e', 'não reabre com NF-e');
select public.fin_marcar_recebido('2026-10', '2026-11-08');
select pg_temp.ok(public.fin_contratos()->'fechamentos'->'2026-10'->>'recebido_em' = '2026-11-08', 'recebimento marcado');
select public.fin_registrar_nfe('2026-10', null);
select public.fin_reabrir_mes('2026-10');
select pg_temp.ok(public.fin_contratos()->'fechamentos' = '{}'::jsonb, 'desfaz NF-e e reabre o mês');

-- ---------- comissões ----------
select pg_temp.como('20000000-0000-0000-0000-000000000003');
select public.definir_comissao('20000000-0000-0000-0000-0000000000c1', 3000);
select public.marcar_comissao('20000000-0000-0000-0000-0000000000c1', true);
select pg_temp.ok((select paga_em is not null and valor = 3000 from public.listar_comissoes()), 'CEO define e paga a comissão');
select pg_temp.como('20000000-0000-0000-0000-000000000004');
select pg_temp.falha($$select * from public.listar_comissoes()$$, 'CEO', 'gestor não vê comissões');
select pg_temp.como('20000000-0000-0000-0000-000000000001');
select pg_temp.ok((select count(*) from public.listar_comissoes('20000000-0000-0000-0000-0000000000a1')) = 1, 'nível 1 vê as comissões da imobiliária');

reset role;
select 'Modelo 2: todos os testes passaram' as resultado;
