-- Etapa Assinaturas (formulários MO/DAMP assinados no gov.br)
-- 1. Vendedor também assina (por modelo)  2. Quem já assinou cada formulário (lido da assinatura digital do PDF)
-- 3. Lembrete automático de assinatura atrasada  4. CCA avisada quando tudo estiver assinado  5. Nível da conta gov.br

-- ---------- 1. Modelos: vendedor também assina ----------
alter table public.damp_modelos add column if not exists vendedor_assina boolean not null default false;

-- ---------- 2. Assinaturas lidas do PDF ----------
alter table public.mo_itens add column if not exists assinantes jsonb not null default '[]'::jsonb;  -- nomes encontrados nos certificados do PDF
alter table public.mo_itens add column if not exists digital boolean;                               -- o PDF tem assinatura digital?
alter table public.mo_itens add column if not exists parcial_em timestamptz;                        -- anexado, mas ainda faltam assinaturas

-- ---------- 5. Nível da conta gov.br (assinar exige prata ou ouro) ----------
alter table public.clientes add column if not exists govbr_nivel text;
alter table public.participantes add column if not exists govbr_nivel text;
alter table public.vendedores add column if not exists govbr_nivel text;
alter table public.vendedores add column if not exists conjuge_govbr_nivel text;

-- Anexar o formulário assinado. p_completo = false: ainda faltam assinaturas (fica pendente, mas o arquivo já fica guardado).
create or replace function public.mo_anexar_assinado_v2(p_item uuid, p_nome text, p_path text, p_assinantes jsonb default '[]'::jsonb,
  p_digital boolean default null, p_completo boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare v_cli uuid := public.mo_cliente_do_item(p_item); v_cod text; v_status text; v_antes text;
begin
  if v_cli is null or not public.posso_editar_cliente(v_cli) then raise exception 'Sem permissão'; end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> v_cli::text then raise exception 'Arquivo inválido'; end if;
  if exists (select 1 from public.mo_itens where id = p_item and lancado_em is not null) and not public.sou_equipe() then
    raise exception 'Este formulário já foi lançado na Caixa. Só a CCA pode trocar.';
  end if;
  v_antes := public.mo_pendentes(v_cli);
  update public.mo_itens set assinado_nome = coalesce(nullif(p_nome, ''), 'assinado.pdf'), assinado_path = p_path, assinado_por = auth.uid(),
         assinantes = coalesce(p_assinantes, '[]'::jsonb), digital = p_digital, lancado_em = null,
         assinado_em = case when p_completo then now() end, parcial_em = case when p_completo then null else now() end
   where id = p_item;
  select m.codigo || coalesce(' (' || i.pessoa_nome || ')', '') into v_cod from public.mo_itens i join public.damp_modelos m on m.id = i.modelo_id where i.id = p_item;
  if not public.sou_equipe() then
    insert into public.conversa (cliente_id, autor_id, texto) values (v_cli, auth.uid(),
      case when p_completo then 'Anexei o ' || v_cod || ' assinado' || case when p_digital is false then ' (sem assinatura digital)' else '' end || '. Já pode lançar na Caixa.'
           else 'Anexei o ' || v_cod || ' com parte das assinaturas. Ainda faltam assinar.' end);
  end if;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
  values (auth.uid(), case when p_completo then 'mo_assinado' else 'mo_parcial' end, v_cli, jsonb_build_object('item', p_item, 'digital', p_digital, 'assinantes', p_assinantes));
  -- Último formulário obrigatório assinado: avisa a CCA que já pode montar o dossiê
  select status into v_status from public.clientes where id = v_cli;
  if p_completo and v_antes is not null and public.mo_pendentes(v_cli) is null and v_status = 'assinaturas' then
    insert into public.eventos (tipo, cliente_id, dados) values ('mo_completo', v_cli, '{}'::jsonb);
  end if;
end $$;
revoke execute on function public.mo_anexar_assinado_v2(uuid, text, text, jsonb, boolean, boolean) from public, anon;
grant execute on function public.mo_anexar_assinado_v2(uuid, text, text, jsonb, boolean, boolean) to authenticated;

-- Kit do cliente: inclui quem assina (compradores e vendedores) e o que já foi lido de cada PDF
create or replace function public.mo_kit_do_cliente(p_cliente uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_ver_cliente(p_cliente) or public.meu_papel() = 'cliente' then raise exception 'Cliente não encontrado'; end if;
  return jsonb_build_object(
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'pessoa_ordem', i.pessoa_ordem, 'pessoa_nome', i.pessoa_nome, 'valores', i.valores,
        'gerado_em', i.gerado_em, 'lancado_em', i.lancado_em, 'dispensado_em', i.dispensado_em,
        'assinado', case when i.assinado_em is null then null else jsonb_build_object('nome', i.assinado_nome, 'path', i.assinado_path, 'em', i.assinado_em) end,
        'parcial', case when i.assinado_em is null and i.parcial_em is not null then jsonb_build_object('nome', i.assinado_nome, 'path', i.assinado_path, 'em', i.parcial_em) end,
        'assinantes', i.assinantes, 'digital', i.digital,
        'modelo', jsonb_build_object('id', m.id, 'codigo', m.codigo, 'nome', m.nome, 'tipo', m.tipo, 'assina', m.assina, 'vendedor_assina', m.vendedor_assina, 'obrigatorio', m.obrigatorio,
                                     'oficial', m.oficial, 'arquivo_nome', m.arquivo_nome, 'arquivo_path', m.arquivo_path, 'removido', m.removido_em is not null))
        order by m.ordem, m.codigo, i.pessoa_ordem)
      from public.mo_itens i join public.damp_modelos m on m.id = i.modelo_id where i.cliente_id = p_cliente), '[]'::jsonb),
    'vendedores', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('nome', case when v.tipo = 'PJ' then coalesce(v.responsavel_nome, v.nome) else v.nome end, 'govbr_nivel', v.govbr_nivel) as x
          from public.clientes c join public.vendedores v on v.id = c.vendedor_id where c.id = p_cliente
        union all
        select jsonb_build_object('nome', v.conjuge_nome, 'govbr_nivel', v.conjuge_govbr_nivel)
          from public.clientes c join public.vendedores v on v.id = c.vendedor_id where c.id = p_cliente and v.tipo = 'PF' and v.conjuge_nome is not null) s), '[]'::jsonb),
    'situacao', coalesce(public.situacao_damp(p_cliente), 'sem_modelo'),
    'pendentes', public.mo_pendentes(p_cliente),
    'modelos', case when public.sou_equipe() then coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'codigo', x.codigo, 'nome', x.nome, 'assina', x.assina) order by x.ordem, x.codigo)
                 from public.damp_modelos x where x.ativo and x.removido_em is null), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- Salvar modelo: guarda também "vendedor assina"
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
      vendedor_assina = coalesce((p->>'vendedor_assina')::boolean, vendedor_assina),
      ativo = coalesce((p->>'ativo')::boolean, true),
      arquivo_nome = coalesce(nullif(p->>'arquivo_nome', ''), arquivo_nome), arquivo_path = coalesce(nullif(p->>'arquivo_path', ''), arquivo_path)
    where id = v_id;
    if not found then raise exception 'Modelo não encontrado'; end if;
  else
    insert into public.damp_modelos (codigo, nome, tipo, regra, manual, assina, obrigatorio, vendedor_assina, ativo, arquivo_nome, arquivo_path)
    values (btrim(p->>'codigo'), btrim(coalesce(p->>'nome', '')), v_tipo, v_regra, coalesce((p->>'manual')::boolean, false), v_assina,
            coalesce((p->>'obrigatorio')::boolean, true), coalesce((p->>'vendedor_assina')::boolean, false), coalesce((p->>'ativo')::boolean, true),
            nullif(p->>'arquivo_nome', ''), nullif(p->>'arquivo_path', ''))
    returning id into v_id;
  end if;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'modelo_damp', jsonb_build_object('codigo', p->>'codigo'));
  return v_id;
end $$;

-- ---------- 3. Lembrete de assinatura atrasada ----------
create table if not exists public.lembretes_assinaturas (cliente_id uuid primary key references public.clientes(id) on delete cascade, enviado_em timestamptz not null);
alter table public.lembretes_assinaturas enable row level security;
insert into public.parametros (chave, valor, descricao) values
  ('dias_lembrete_assinaturas', '2', 'Dias sem assinar os formulários (gov.br) para mandar lembrete')
on conflict (chave) do nothing;

create or replace function public.gerar_lembretes_assinaturas() returns int
language plpgsql security definer set search_path = public as $$
declare v_dias int; v_qtd int := 0; r record;
begin
  select coalesce(nullif(valor, '')::int, 2) into v_dias from public.parametros where chave = 'dias_lembrete_assinaturas';
  v_dias := greatest(coalesce(v_dias, 2), 1);
  for r in
    select c.id from public.clientes c
    left join public.lembretes_assinaturas l on l.cliente_id = c.id
    where not c.rascunho and c.status = 'assinaturas'
      and coalesce((select max(h.em) from public.historico_status h where h.cliente_id = c.id and h.para = 'assinaturas'), c.atualizado_em) < now() - make_interval(days => v_dias)
      and (l.enviado_em is null or l.enviado_em < now() - make_interval(days => v_dias))
      and public.mo_pendentes(c.id) is not null
  loop
    insert into public.eventos (tipo, cliente_id, dados) values ('lembrete_assinaturas', r.id, jsonb_build_object('pendentes', public.mo_pendentes(r.id)));
    insert into public.lembretes_assinaturas (cliente_id, enviado_em) values (r.id, now())
    on conflict (cliente_id) do update set enviado_em = excluded.enviado_em;
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end $$;
revoke execute on function public.gerar_lembretes_assinaturas() from public, anon, authenticated;
select cron.schedule('lembretes_assinaturas', '5 12 * * *', 'select public.gerar_lembretes_assinaturas()');

-- ---------- 4. Novos eventos na fila de avisos ----------
create or replace function public.tg_eventos_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs', 'ia_alerta',
                  'verificacao', 'engenharia', 'doc_do_cliente', 'entrevista_agendada', 'mo_completo', 'lembrete_assinaturas') then
    perform public.chamar_avisos();
  end if;
  return new;
end $$;
-- pegar_eventos_aviso: mesma função, com os dois tipos novos (ver no banco)
create or replace function public.pegar_eventos_aviso(p_limite integer default 20) returns setof public.eventos
language sql security definer set search_path = public as $$
  update public.eventos e set processando_em = now(), tentativas = e.tentativas + 1
  where e.id in (
    select id from public.eventos
    where not processado and tentativas < 5
      and tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs', 'ia_alerta',
                   'verificacao', 'engenharia', 'doc_do_cliente', 'entrevista_agendada', 'mo_completo', 'lembrete_assinaturas')
      and (processando_em is null or processando_em < now() - interval '2 minutes')
    order by id
    limit p_limite
    for update skip locked)
  returning e.*
$$;

-- Vendedor: guarda o nível da conta gov.br (dele e do cônjuge) informado no cadastro
do $do$
declare d text;
begin
  select pg_get_functiondef('public.vincular_vendedor(uuid, jsonb)'::regprocedure) into d;
  if position('govbr_nivel' in d) = 0 then
    d := replace(d, '  update public.clientes set vendedor_id = v_id where id = p_cliente;',
      E'  update public.vendedores set govbr_nivel = coalesce(nullif(p_dados->>''govbr_nivel'', ''''), govbr_nivel),\n         conjuge_govbr_nivel = coalesce(nullif(p_dados->>''conjuge_govbr_nivel'', ''''), conjuge_govbr_nivel) where id = v_id;\n  update public.clientes set vendedor_id = v_id where id = p_cliente;');
    execute d;
  end if;
end $do$;
