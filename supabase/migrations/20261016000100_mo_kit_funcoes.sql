-- MO / DAMP em kit: funções do app e os modelos oficiais da Caixa já cadastrados

-- Kit de um cliente (o corretor/gestor vê e anexa; a CCA vê tudo e lança)
create or replace function public.mo_kit_do_cliente(p_cliente uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.posso_ver_cliente(p_cliente) or public.meu_papel() = 'cliente' then raise exception 'Cliente não encontrado'; end if;
  return jsonb_build_object(
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'pessoa_ordem', i.pessoa_ordem, 'pessoa_nome', i.pessoa_nome, 'valores', i.valores,
        'gerado_em', i.gerado_em, 'lancado_em', i.lancado_em, 'dispensado_em', i.dispensado_em,
        'assinado', case when i.assinado_em is null then null else jsonb_build_object('nome', i.assinado_nome, 'path', i.assinado_path, 'em', i.assinado_em) end,
        'modelo', jsonb_build_object('id', m.id, 'codigo', m.codigo, 'nome', m.nome, 'tipo', m.tipo, 'assina', m.assina, 'obrigatorio', m.obrigatorio,
                                     'oficial', m.oficial, 'arquivo_nome', m.arquivo_nome, 'arquivo_path', m.arquivo_path, 'removido', m.removido_em is not null))
        order by m.ordem, m.codigo, i.pessoa_ordem)
      from public.mo_itens i join public.damp_modelos m on m.id = i.modelo_id where i.cliente_id = p_cliente), '[]'::jsonb),
    'situacao', coalesce(public.situacao_damp(p_cliente), 'sem_modelo'),
    'pendentes', public.mo_pendentes(p_cliente),
    'modelos', case when public.sou_equipe() then coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'codigo', x.codigo, 'nome', x.nome, 'assina', x.assina) order by x.ordem, x.codigo)
                 from public.damp_modelos x where x.ativo and x.removido_em is null), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- A CCA monta/atualiza o kit na hora (ex.: cliente aprovado antes de existir o modelo)
create or replace function public.mo_montar_kit(p_cliente uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Somente a CCA'; end if;
  return public.mo_gerar_kit(p_cliente);
end $$;

-- A CCA inclui um modelo que a regra não pediu (ex.: o MO30679 da consulta)
create or replace function public.mo_adicionar(p_cliente uuid, p_modelo uuid, p_pessoa int) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text; v_ordem int := greatest(coalesce(p_pessoa, 0), 0);
begin
  if not public.sou_equipe() then raise exception 'Somente a CCA'; end if;
  if not exists (select 1 from public.damp_modelos where id = p_modelo and ativo and removido_em is null) then raise exception 'Modelo não encontrado'; end if;
  if v_ordem = 1 then select nome into v_nome from public.clientes where id = p_cliente;
  elsif v_ordem > 1 then select nome into v_nome from public.participantes where cliente_id = p_cliente and ordem = v_ordem; end if;
  insert into public.mo_itens (cliente_id, modelo_id, pessoa_ordem, pessoa_nome, gerado_por) values (p_cliente, p_modelo, v_ordem, v_nome, auth.uid())
  on conflict (cliente_id, modelo_id, pessoa_ordem) do update set dispensado_em = null, dispensado_por = null
  returning id into v_id;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'mo_incluido', p_cliente, jsonb_build_object('modelo', p_modelo, 'pessoa', v_ordem));
  return v_id;
end $$;

create or replace function public.mo_cliente_do_item(p_item uuid) returns uuid
language sql stable security definer set search_path = public as $$ select cliente_id from public.mo_itens where id = p_item $$;

-- Campos conferidos antes de baixar (ficam guardados para a próxima vez)
create or replace function public.mo_salvar_valores(p_item uuid, p_valores jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_editar_cliente(public.mo_cliente_do_item(p_item)) then raise exception 'Sem permissão'; end if;
  update public.mo_itens set valores = coalesce(p_valores, '{}'::jsonb) where id = p_item;
end $$;

create or replace function public.mo_anexar_assinado(p_item uuid, p_nome text, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare v_cli uuid := public.mo_cliente_do_item(p_item); v_cod text;
begin
  if v_cli is null or not public.posso_editar_cliente(v_cli) then raise exception 'Sem permissão'; end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> v_cli::text then raise exception 'Arquivo inválido'; end if;
  update public.mo_itens set assinado_nome = coalesce(nullif(p_nome, ''), 'assinado.pdf'), assinado_path = p_path, assinado_em = now(), assinado_por = auth.uid(), lancado_em = null
   where id = p_item;
  select m.codigo || coalesce(' (' || i.pessoa_nome || ')', '') into v_cod from public.mo_itens i join public.damp_modelos m on m.id = i.modelo_id where i.id = p_item;
  if not public.sou_equipe() then
    insert into public.conversa (cliente_id, autor_id, texto) values (v_cli, auth.uid(), 'Anexei o ' || v_cod || ' assinado pelo cliente. Já pode lançar na Caixa.');
  end if;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'mo_assinado', v_cli, jsonb_build_object('item', p_item));
end $$;

create or replace function public.mo_marcar_lancado(p_item uuid, p_lancado boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Somente a CCA'; end if;
  update public.mo_itens set lancado_em = case when p_lancado then now() end where id = p_item and assinado_em is not null;
  if not found then raise exception 'Falta o documento assinado'; end if;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
  values (auth.uid(), case when p_lancado then 'mo_lancado' else 'mo_reaberto' end, public.mo_cliente_do_item(p_item), jsonb_build_object('item', p_item));
end $$;

-- A CCA dispensa um item que não se aplica (ex.: DAMP de quem não usa FGTS)
create or replace function public.mo_dispensar(p_item uuid, p_dispensar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Somente a CCA'; end if;
  update public.mo_itens set dispensado_em = case when p_dispensar then now() end, dispensado_por = case when p_dispensar then auth.uid() end where id = p_item;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
  values (auth.uid(), case when p_dispensar then 'mo_dispensado' else 'mo_retomado' end, public.mo_cliente_do_item(p_item), jsonb_build_object('item', p_item));
end $$;

-- Modelos (ADM): agora com a regra, quem assina e se é obrigatório
create or replace function public.listar_modelos_damp() returns setof public.damp_modelos
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Somente a CCA'; end if;
  return query select * from public.damp_modelos where removido_em is null order by ordem, codigo;
end $$;

create or replace function public.salvar_modelo_damp(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid;
        v_regra jsonb := case when jsonb_typeof(p->'regra') = 'array' then p->'regra' else '[]'::jsonb end;
        v_assina text := coalesce(nullif(p->>'assina', ''), 'compradores');
        v_tipo text := coalesce(nullif(p->>'tipo', ''), 'MO');
begin
  if not public.sou_admin() then raise exception 'Somente o ADM'; end if;
  if btrim(coalesce(p->>'codigo', '')) = '' then raise exception 'Informe o código do MO / DAMP'; end if;
  if v_id is not null then
    update public.damp_modelos set codigo = btrim(p->>'codigo'), nome = btrim(coalesce(p->>'nome', '')), tipo = v_tipo, regra = v_regra,
      manual = coalesce((p->>'manual')::boolean, false), assina = v_assina, obrigatorio = coalesce((p->>'obrigatorio')::boolean, true),
      ativo = coalesce((p->>'ativo')::boolean, true),
      arquivo_nome = coalesce(nullif(p->>'arquivo_nome', ''), arquivo_nome), arquivo_path = coalesce(nullif(p->>'arquivo_path', ''), arquivo_path)
    where id = v_id;
    if not found then raise exception 'Modelo não encontrado'; end if;
  else
    insert into public.damp_modelos (codigo, nome, tipo, regra, manual, assina, obrigatorio, ativo, arquivo_nome, arquivo_path)
    values (btrim(p->>'codigo'), btrim(coalesce(p->>'nome', '')), v_tipo, v_regra, coalesce((p->>'manual')::boolean, false), v_assina,
            coalesce((p->>'obrigatorio')::boolean, true), coalesce((p->>'ativo')::boolean, true), nullif(p->>'arquivo_nome', ''), nullif(p->>'arquivo_path', ''))
    returning id into v_id;
  end if;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'modelo_damp', jsonb_build_object('codigo', p->>'codigo'));
  return v_id;
end $$;

-- Modelos oficiais da Caixa (o app preenche sozinho). Regras iniciais; o ADM ajusta na tela.
insert into public.damp_modelos (codigo, nome, tipo, regra, manual, assina, obrigatorio, oficial, ordem)
select v.* from (values
  ('MO30844', 'Autorização da forma de pagamento, tarifa de avaliação e declarações (SCR)', 'MO', '[]'::jsonb, false, 'compradores', true, 'MO30844', 10),
  ('MO30825', 'Proposta de Seguro Habitacional (MIP e DFI)', 'MO', '[]'::jsonb, false, 'compradores', true, 'MO30825', 20),
  ('DAMP 29300', 'Declaração de enquadramento e autorização de uso do FGTS (DAMP offline)', 'DAMP',
     '[{"usa_fgts":true},{"programa":"MCMV"},{"programa":"Pró-Cotista"}]'::jsonb, false, 'cada_comprador', true, 'DAMP29300', 30),
  ('MO30693', 'Autorização ou cancelamento do débito dos encargos e da tarifa de avaliação', 'MO', '[]'::jsonb, true, 'compradores', true, 'MO30693', 40),
  ('MO30679', 'Solicitação de consulta pelo CCA e ateste da inviabilidade da renda pelo FGTS', 'MO', '[]'::jsonb, true, 'cca', false, 'MO30679', 50)
) as v(codigo, nome, tipo, regra, manual, assina, obrigatorio, oficial, ordem)
where not exists (select 1 from public.damp_modelos d where d.oficial = v.oficial);

-- Modelos enviados pelo ADM: corretor e gestor também baixam (são formulários públicos da Caixa)
do $$ begin
  create policy modelos_ler_parceiros on storage.objects for select to authenticated using (bucket_id = 'modelos');
exception when duplicate_object then null; end $$;

-- Clientes que já passaram da aprovação recebem o kit agora
select public.mo_gerar_kit(c.id) from public.clientes c where not c.rascunho and public.etapa_desde(c.status, 'cliente_aprovado');

do $$ declare f text; begin
  foreach f in array array[
    'public.mo_kit_do_cliente(uuid)', 'public.mo_montar_kit(uuid)', 'public.mo_adicionar(uuid, uuid, int)', 'public.mo_salvar_valores(uuid, jsonb)',
    'public.mo_anexar_assinado(uuid, text, text)', 'public.mo_marcar_lancado(uuid, boolean)', 'public.mo_dispensar(uuid, boolean)',
    'public.listar_modelos_damp()', 'public.salvar_modelo_damp(jsonb)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.mo_gerar_kit(uuid), public.mo_regra_ok(uuid, jsonb), public.mo_pendentes(uuid), public.mo_cliente_do_item(uuid)
  from public, anon, authenticated;
