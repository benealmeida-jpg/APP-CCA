-- =====================================================================
-- MODELO 2 · parte 3: MO / DAMP e financeiro da CCA; lista de clientes com os dados novos
-- =====================================================================

-- ---------- 1. Modelos de MO / DAMP (ADM) e o MO / DAMP de cada cliente ----------
create table if not exists public.damp_modelos (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null,
  nome          text not null default '',
  programa      text not null default '*',
  renda_min     numeric(14, 2) not null default 0,
  renda_max     numeric(14, 2),
  fgts          text not null default 'qualquer' check (fgts in ('qualquer', 'sim', 'nao')),
  ativo         boolean not null default true,
  exemplo       boolean not null default false,
  arquivo_nome  text,
  arquivo_path  text,
  criado_em     timestamptz not null default now()
);
alter table public.damp_modelos enable row level security;

create table if not exists public.damps (
  cliente_id     uuid primary key references public.clientes (id) on delete cascade,
  modelo_id      uuid references public.damp_modelos (id) on delete set null,
  gerada_em      timestamptz not null default now(),
  gerada_por     uuid references public.perfis (id),
  assinada_nome  text,
  assinada_path  text,
  assinada_em    timestamptz,
  assinada_por   uuid references public.perfis (id),
  lancada_em     timestamptz
);
alter table public.damps enable row level security;

create or replace function public.situacao_damp(p_cliente uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when d.cliente_id is null then null when d.lancada_em is not null then 'lancada' when d.assinada_em is not null then 'assinada' else 'para_assinar' end
  from (select 1) x left join public.damps d on d.cliente_id = p_cliente
$$;

-- O modelo que vale: linha exata vence "qualquer linha"; FGTS exato vence "qualquer"
create or replace function public.escolher_damp(p_cliente uuid) returns uuid
language sql stable security definer set search_path = public as $$
  with c as (select cl.programa, coalesce(cl.usa_fgts, false) as fgts,
                    coalesce(cl.renda_bruta, 0) + coalesce((select sum(coalesce(p.renda_bruta, 0)) from public.participantes p where p.cliente_id = cl.id), 0) as renda
             from public.clientes cl where cl.id = p_cliente)
  select m.id from public.damp_modelos m, c
  where m.ativo and (m.programa = '*' or m.programa = c.programa)
    and (m.fgts = 'qualquer' or m.fgts = case when c.fgts then 'sim' else 'nao' end)
    and c.renda >= m.renda_min and (m.renda_max is null or c.renda <= m.renda_max)
  order by (case when m.programa = '*' then 0 else 2 end) + (case when m.fgts = 'qualquer' then 0 else 1 end) desc, m.criado_em
  limit 1
$$;

create or replace function public.listar_modelos_damp() returns setof public.damp_modelos
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Somente a CCA'; end if;
  return query select * from public.damp_modelos order by exemplo desc, codigo;
end $$;
create or replace function public.salvar_modelo_damp(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if not public.sou_admin() then raise exception 'Somente o ADM'; end if;
  if btrim(coalesce(p->>'codigo', '')) = '' then raise exception 'Informe o código do MO / DAMP'; end if;
  if v_id is not null then
    update public.damp_modelos set codigo = btrim(p->>'codigo'), nome = btrim(coalesce(p->>'nome', '')), programa = coalesce(nullif(p->>'programa', ''), '*'),
      renda_min = coalesce(nullif(p->>'renda_min', '')::numeric, 0), renda_max = nullif(p->>'renda_max', '')::numeric, fgts = coalesce(nullif(p->>'fgts', ''), 'qualquer'),
      ativo = coalesce((p->>'ativo')::boolean, true),
      arquivo_nome = coalesce(nullif(p->>'arquivo_nome', ''), arquivo_nome), arquivo_path = coalesce(nullif(p->>'arquivo_path', ''), arquivo_path),
      exemplo = case when nullif(p->>'arquivo_path', '') is not null then false else exemplo end
    where id = v_id;
    if not found then raise exception 'Modelo não encontrado'; end if;
  else
    insert into public.damp_modelos (codigo, nome, programa, renda_min, renda_max, fgts, ativo, arquivo_nome, arquivo_path)
    values (btrim(p->>'codigo'), btrim(coalesce(p->>'nome', '')), coalesce(nullif(p->>'programa', ''), '*'), coalesce(nullif(p->>'renda_min', '')::numeric, 0),
            nullif(p->>'renda_max', '')::numeric, coalesce(nullif(p->>'fgts', ''), 'qualquer'), coalesce((p->>'ativo')::boolean, true), nullif(p->>'arquivo_nome', ''), nullif(p->>'arquivo_path', ''))
    returning id into v_id;
  end if;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'modelo_damp', jsonb_build_object('codigo', p->>'codigo'));
  return v_id;
end $$;
create or replace function public.remover_modelo_damp(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente o ADM'; end if;
  delete from public.damp_modelos where id = p_id;
end $$;

-- Arquivo do modelo (Word ou PDF) fica no bucket "modelos"; a CCA lê
do $$ begin
  insert into storage.buckets (id, name, public) values ('modelos', 'modelos', false) on conflict (id) do nothing;
exception when others then null; end $$;
do $$ begin
  create policy modelos_enviar on storage.objects for insert to authenticated with check (bucket_id = 'modelos' and public.sou_admin());
  create policy modelos_ler on storage.objects for select to authenticated using (bucket_id = 'modelos' and public.sou_equipe());
exception when duplicate_object then null; end $$;

-- MO / DAMP de um cliente: o registro, a situação, o modelo e (para a CCA) os modelos ativos com a regra
create or replace function public.damp_do_cliente(p_cliente uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r public.damps; m public.damp_modelos;
begin
  if not public.posso_ver_cliente(p_cliente) or public.meu_papel() = 'cliente' then raise exception 'Cliente não encontrado'; end if;
  select * into r from public.damps where cliente_id = p_cliente;
  if r.modelo_id is not null then select * into m from public.damp_modelos where id = r.modelo_id; end if;
  return jsonb_build_object(
    'registro', case when r.cliente_id is null then null else jsonb_build_object('modelo_id', r.modelo_id, 'gerada_em', r.gerada_em, 'lancada_em', r.lancada_em,
                  'assinada', case when r.assinada_em is null then null else jsonb_build_object('nome', r.assinada_nome, 'em', r.assinada_em, 'por', r.assinada_por, 'path', r.assinada_path) end) end,
    'situacao', coalesce(public.situacao_damp(p_cliente), 'sem_modelo'),
    'modelo', case when m.id is null then null else to_jsonb(m) end,
    'modelos', case when public.sou_equipe() then coalesce((select jsonb_agg(to_jsonb(x) order by x.codigo) from public.damp_modelos x where x.ativo), '[]'::jsonb) else '[]'::jsonb end);
end $$;

create or replace function public.gerar_damp(p_cliente uuid, p_modelo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_mod uuid := coalesce(p_modelo, public.escolher_damp(p_cliente));
begin
  if not public.sou_equipe() or not public.tenho_permissao('mudar_status') then raise exception 'Somente a CCA gera o MO / DAMP'; end if;
  if v_mod is null or not exists (select 1 from public.damp_modelos where id = v_mod) then raise exception 'Nenhum modelo de MO / DAMP atende este caso. Escolha o modelo.'; end if;
  insert into public.damps (cliente_id, modelo_id, gerada_por) values (p_cliente, v_mod, auth.uid())
  on conflict (cliente_id) do update set modelo_id = v_mod, gerada_em = now(), gerada_por = auth.uid(), assinada_nome = null, assinada_path = null, assinada_em = null, assinada_por = null, lancada_em = null;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'damp_gerada', p_cliente, jsonb_build_object('modelo', (select codigo from public.damp_modelos where id = v_mod)));
end $$;

create or replace function public.anexar_damp_assinada(p_cliente uuid, p_nome text, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_editar_cliente(p_cliente) then raise exception 'Sem permissão'; end if;
  if not exists (select 1 from public.damps where cliente_id = p_cliente) then raise exception 'O MO / DAMP ainda não foi gerado'; end if;
  update public.damps set assinada_nome = coalesce(nullif(p_nome, ''), 'damp-assinada.pdf'), assinada_path = p_path, assinada_em = now(), assinada_por = auth.uid(), lancada_em = null
   where cliente_id = p_cliente;
  if not public.sou_equipe() then
    insert into public.conversa (cliente_id, autor_id, texto) values (p_cliente, auth.uid(), 'Anexei o MO / DAMP assinado pelo cliente no gov.br. Já pode lançar na Caixa.');
  end if;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'damp_assinada', p_cliente, '{}'::jsonb);
end $$;

create or replace function public.marcar_damp_lancada(p_cliente uuid, p_lancada boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Somente a CCA'; end if;
  update public.damps set lancada_em = case when p_lancada then now() end where cliente_id = p_cliente and assinada_em is not null;
  if not found then raise exception 'Falta o MO / DAMP assinado'; end if;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), case when p_lancada then 'damp_lancada' else 'damp_reaberta' end, p_cliente, '{}'::jsonb);
end $$;

-- Ao aprovar o cliente, o app já prepara o MO / DAMP do caso (se algum modelo atender)
create or replace function public.tg_clientes_damp() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mod uuid;
begin
  if new.status = 'cliente_aprovado' and old.status is distinct from 'cliente_aprovado' and not exists (select 1 from public.damps where cliente_id = new.id) then
    v_mod := public.escolher_damp(new.id);
    if v_mod is not null then
      insert into public.damps (cliente_id, modelo_id, gerada_por) values (new.id, v_mod, auth.uid()) on conflict do nothing;
      insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'damp_gerada', new.id, jsonb_build_object('automatico', true));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists clientes_damp on public.clientes;
create trigger clientes_damp after update of status on public.clientes for each row execute function public.tg_clientes_damp();

-- ---------- 2. Financeiro da CCA ----------
alter table public.clientes add column if not exists contrato_numero text;
alter table public.clientes add column if not exists valor_financiado numeric(14, 2);
alter table public.clientes add column if not exists contrato_assinado_em date;

create table if not exists public.fin_parametros (
  id                    boolean primary key default true check (id),
  taxa_bruta            numeric(6, 3) not null default 0.8,
  imposto               numeric(6, 3) not null default 18,
  valor_empreendimento  numeric(12, 2) not null default 600
);
insert into public.fin_parametros (id) values (true) on conflict do nothing;
create table if not exists public.fin_permissoes (
  nivel        smallint primary key check (nivel in (2, 3)),
  permissoes   jsonb not null default '{}'::jsonb
);
create table if not exists public.fin_fechamentos (
  mes         text primary key check (mes ~ '^\d{4}-\d{2}$'),
  dados       jsonb not null,           -- retrato do mês fechado (ids, valores, fixos, taxas, totais, nfe, recebido_em)
  fechado_em  timestamptz not null default now(),
  fechado_por uuid references public.perfis (id)
);
create table if not exists public.fin_lancamentos (
  id          uuid primary key default gen_random_uuid(),
  mes         text not null check (mes ~ '^\d{4}-\d{2}$'),
  tipo        text not null check (tipo in ('fixa', 'variavel', 'credito')),
  categoria   text not null,
  descricao   text not null default '',
  valor       numeric(14, 2) not null check (valor > 0),
  data        date not null,
  autor_id    uuid not null references public.perfis (id),
  criado_em   timestamptz not null default now()
);
alter table public.fin_parametros enable row level security;
alter table public.fin_permissoes enable row level security;
alter table public.fin_fechamentos enable row level security;
alter table public.fin_lancamentos enable row level security;

-- Acesso ao financeiro: o nível 1 pode tudo; níveis 2 e 3 seguem o que o nível 1 marcou (com os padrões)
create or replace function public.fin_acesso() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.meu_nivel() = 1 then
           jsonb_build_object('faturamento', true, 'fechamento', true, 'lancar_despesas', true, 'lancar_creditos', true, 'ver_todos', true, 'permissoes', true)
         when public.meu_nivel() in (2, 3) then (
           select jsonb_build_object('faturamento', false, 'fechamento', false, 'permissoes', false,
             'lancar_despesas', coalesce((x->>'lancar_despesas')::boolean, false), 'lancar_creditos', coalesce((x->>'lancar_creditos')::boolean, false), 'ver_todos', coalesce((x->>'ver_todos')::boolean, false))
           from (select (case public.meu_nivel() when 2 then '{"lancar_despesas":true,"lancar_creditos":true,"ver_todos":true}'::jsonb
                                                  else '{"lancar_despesas":true,"lancar_creditos":false,"ver_todos":false}'::jsonb end)
                        || coalesce((select permissoes from public.fin_permissoes where nivel = public.meu_nivel()), '{}'::jsonb) as x) s)
         end
$$;

create or replace function public.fin_config() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Somente a CCA'; end if;
  return jsonb_build_object(
    'parametros', (select jsonb_build_object('taxa_bruta', taxa_bruta, 'imposto', imposto, 'valor_empreendimento', valor_empreendimento) from public.fin_parametros),
    'permissoes', jsonb_build_object(
      '2', '{"lancar_despesas":true,"lancar_creditos":true,"ver_todos":true}'::jsonb || coalesce((select permissoes from public.fin_permissoes where nivel = 2), '{}'::jsonb),
      '3', '{"lancar_despesas":true,"lancar_creditos":false,"ver_todos":false}'::jsonb || coalesce((select permissoes from public.fin_permissoes where nivel = 3), '{}'::jsonb)),
    'acesso', public.fin_acesso());
end $$;

create or replace function public.fin_salvar_config(p_parametros jsonb, p_permissoes jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_nivel1() then raise exception 'Somente o nível 1 (CEO da CCA)'; end if;
  if p_parametros is not null then
    if not ((p_parametros->>'taxa_bruta')::numeric > 0 and (p_parametros->>'taxa_bruta')::numeric < 100
            and (p_parametros->>'imposto')::numeric >= 0 and (p_parametros->>'imposto')::numeric < 100) then raise exception 'Confira os percentuais'; end if;
    if coalesce((p_parametros->>'valor_empreendimento')::numeric, 0) < 0 then raise exception 'Confira o valor fixo do empreendimento Caixa'; end if;
    update public.fin_parametros set taxa_bruta = (p_parametros->>'taxa_bruta')::numeric, imposto = (p_parametros->>'imposto')::numeric,
      valor_empreendimento = coalesce((p_parametros->>'valor_empreendimento')::numeric, valor_empreendimento);
  end if;
  if p_permissoes is not null then
    insert into public.fin_permissoes (nivel, permissoes) values (2, coalesce(p_permissoes->'2', '{}')), (3, coalesce(p_permissoes->'3', '{}'))
    on conflict (nivel) do update set permissoes = excluded.permissoes;
  end if;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'financeiro_config', '{}'::jsonb);
end $$;

-- Contratos assinados (base do faturamento): data da assinatura informada ou a do histórico
create or replace function public.fin_lista_contratos() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'contrato_numero', c.contrato_numero, 'valor_financiado', c.valor_financiado,
    'assinado_em', coalesce(c.contrato_assinado_em,
                            (select (max(h.em) at time zone 'America/Sao_Paulo')::date from public.historico_status h where h.cliente_id = c.id and h.para = 'contrato_assinado'),
                            (c.atualizado_em at time zone 'America/Sao_Paulo')::date),
    'corretor_nome', p.nome, 'imobiliaria_nome', i.nome, 'status', c.status, 'assinatura_contrato', c.assinatura_contrato,
    'empreendimento_caixa', coalesce(c.empreendimento_caixa, false))), '[]'::jsonb)
  from public.clientes c left join public.perfis p on p.id = c.corretor_id left join public.imobiliarias i on i.id = c.imobiliaria_id
  where not c.rascunho and c.status in ('contrato_assinado', 'registro_cartorio', 'conformidade_final', 'credito_liberado')
$$;
create or replace function public.fin_fechamentos_obj() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(f.mes, f.dados), '{}'::jsonb) from public.fin_fechamentos f
$$;

create or replace function public.fin_contratos() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_nivel1() then raise exception 'Somente o nível 1 (CEO da CCA)'; end if;
  return jsonb_build_object('contratos', public.fin_lista_contratos(), 'fechamentos', public.fin_fechamentos_obj(),
    'parametros', (select jsonb_build_object('taxa_bruta', taxa_bruta, 'imposto', imposto, 'valor_empreendimento', valor_empreendimento) from public.fin_parametros));
end $$;

create or replace function public.dados_contrato(p_cliente uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Somente a CCA'; end if;
  return coalesce((select x from jsonb_array_elements(public.fin_lista_contratos()) x where x->>'id' = p_cliente::text),
    (select jsonb_build_object('id', c.id, 'nome', c.nome, 'contrato_numero', c.contrato_numero, 'valor_financiado', c.valor_financiado, 'assinado_em', c.contrato_assinado_em,
                               'empreendimento_caixa', coalesce(c.empreendimento_caixa, false), 'assinatura_contrato', c.assinatura_contrato) from public.clientes c where c.id = p_cliente));
end $$;

create or replace function public.contrato_em_mes_fechado(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fin_fechamentos f where f.dados->'ids' ? p_cliente::text)
$$;

create or replace function public.salvar_dados_contrato(p_cliente uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_fechado boolean := public.contrato_em_mes_fechado(p_cliente);
begin
  if not public.sou_equipe() then raise exception 'Somente a CCA'; end if;
  if not exists (select 1 from public.clientes where id = p_cliente) then raise exception 'Cliente não encontrado'; end if;
  if v_fechado and not public.sou_nivel1() and (p ? 'valor_financiado' or p ? 'contrato_assinado_em' or p ? 'empreendimento_caixa') then
    raise exception 'Este contrato já entrou num faturamento fechado. Só o nível 1 pode mudar.';
  end if;
  if p ? 'valor_financiado' and nullif(p->>'valor_financiado', '') is not null and (p->>'valor_financiado')::numeric <= 0 then raise exception 'Valor financiado inválido'; end if;
  perform set_config('app.dados_contrato', 'sim', true);
  update public.clientes set
    contrato_numero = case when p ? 'contrato_numero' then nullif(btrim(coalesce(p->>'contrato_numero', '')), '') else contrato_numero end,
    valor_financiado = case when p ? 'valor_financiado' then nullif(p->>'valor_financiado', '')::numeric else valor_financiado end,
    contrato_assinado_em = case when p ? 'contrato_assinado_em' then nullif(p->>'contrato_assinado_em', '')::date else contrato_assinado_em end,
    empreendimento_caixa = case when p ? 'empreendimento_caixa' then coalesce((p->>'empreendimento_caixa')::boolean, false) else empreendimento_caixa end
  where id = p_cliente;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'dados_contrato', p_cliente, jsonb_build_object('numero', p->>'contrato_numero'));
end $$;

-- Os dados do contrato só mudam pela CCA; empreendimento Caixa de contrato já faturado, só o nível 1
create or replace function public.tg_clientes_contrato() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('app.dados_contrato', true), '') = 'sim' then return new; end if;
  if not public.sou_equipe() then
    new.contrato_numero := old.contrato_numero; new.valor_financiado := old.valor_financiado; new.contrato_assinado_em := old.contrato_assinado_em;
  end if;
  if new.empreendimento_caixa is distinct from old.empreendimento_caixa and not public.sou_nivel1() and public.contrato_em_mes_fechado(new.id) then
    new.empreendimento_caixa := old.empreendimento_caixa;
  end if;
  return new;
end $$;
drop trigger if exists clientes_contrato on public.clientes;
create trigger clientes_contrato before update on public.clientes for each row execute function public.tg_clientes_contrato();

-- Fechamento do mês: o app calcula o retrato (contratos, valores, taxas e totais) e o nível 1 fecha
create or replace function public.fin_fechar_mes(p_mes text, p_retrato jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_nivel1() then raise exception 'Somente o nível 1 (CEO da CCA)'; end if;
  if exists (select 1 from public.fin_fechamentos where mes = p_mes) then raise exception 'Este mês já está fechado'; end if;
  if jsonb_array_length(coalesce(p_retrato->'ids', '[]'::jsonb)) = 0 then raise exception 'Nenhum contrato neste mês'; end if;
  insert into public.fin_fechamentos (mes, dados, fechado_por)
  values (p_mes, p_retrato || jsonb_build_object('por', auth.uid(), 'em', now(), 'nfe', null, 'recebido_em', null), auth.uid());
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'faturamento_fechado', jsonb_build_object('mes', p_mes, 'bruto', p_retrato->'bruto'));
end $$;
create or replace function public.fin_reabrir_mes(p_mes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_nivel1() then raise exception 'Somente o nível 1 (CEO da CCA)'; end if;
  if exists (select 1 from public.fin_fechamentos where mes = p_mes and jsonb_typeof(dados->'nfe') = 'object') then
    raise exception 'A NF-e deste mês já foi registrada. Desfaça a NF-e antes de reabrir.';
  end if;
  delete from public.fin_fechamentos where mes = p_mes;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'faturamento_reaberto', jsonb_build_object('mes', p_mes));
end $$;
create or replace function public.fin_registrar_nfe(p_mes text, p_nfe jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_nivel1() then raise exception 'Somente o nível 1 (CEO da CCA)'; end if;
  if not exists (select 1 from public.fin_fechamentos where mes = p_mes) then raise exception 'Feche o mês antes de registrar a NF-e'; end if;
  if p_nfe is not null and btrim(coalesce(p_nfe->>'numero', '')) = '' then raise exception 'Informe o número da NF-e'; end if;
  update public.fin_fechamentos set dados = dados || jsonb_build_object(
      'nfe', case when p_nfe is null then null else jsonb_build_object('numero', btrim(p_nfe->>'numero'), 'data', coalesce(nullif(p_nfe->>'data', ''), to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'))) end)
    || case when p_nfe is null then jsonb_build_object('recebido_em', null) else '{}'::jsonb end
  where mes = p_mes;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), case when p_nfe is null then 'nfe_desfeita' else 'nfe_registrada' end, jsonb_build_object('mes', p_mes));
end $$;
create or replace function public.fin_marcar_recebido(p_mes text, p_data date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_nivel1() then raise exception 'Somente o nível 1 (CEO da CCA)'; end if;
  if not exists (select 1 from public.fin_fechamentos where mes = p_mes and jsonb_typeof(dados->'nfe') = 'object') then raise exception 'Registre a NF-e antes'; end if;
  update public.fin_fechamentos set dados = dados || jsonb_build_object('recebido_em', p_data) where mes = p_mes;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'faturamento_recebido', jsonb_build_object('mes', p_mes));
end $$;

-- Lançamentos (despesas e créditos)
create or replace function public.fin_listar_lancamentos(p_mes text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a jsonb := public.fin_acesso();
begin
  if not public.sou_equipe() then raise exception 'Somente a CCA'; end if;
  if not coalesce((a->>'lancar_despesas')::boolean or (a->>'lancar_creditos')::boolean or (a->>'ver_todos')::boolean, false) then raise exception 'Seu perfil não acessa o financeiro'; end if;
  return coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('autor_nome', coalesce(p.nome, '—')) order by l.data desc, l.criado_em desc)
    from public.fin_lancamentos l left join public.perfis p on p.id = l.autor_id
    where (p_mes is null or l.mes = p_mes) and ((a->>'ver_todos')::boolean or l.autor_id = auth.uid())), '[]'::jsonb);
end $$;
create or replace function public.fin_salvar_lancamento(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare a jsonb := public.fin_acesso(); v_id uuid := nullif(p->>'id', '')::uuid; v_data date := nullif(p->>'data', '')::date; v_valor numeric := nullif(p->>'valor', '')::numeric;
  v_autor uuid;
begin
  if not public.sou_equipe() then raise exception 'Somente a CCA'; end if;
  if coalesce(p->>'tipo', '') not in ('fixa', 'variavel', 'credito') then raise exception 'Escolha o tipo'; end if;
  if p->>'tipo' = 'credito' and not coalesce((a->>'lancar_creditos')::boolean, false) then raise exception 'Seu perfil não lança créditos'; end if;
  if p->>'tipo' <> 'credito' and not coalesce((a->>'lancar_despesas')::boolean, false) then raise exception 'Seu perfil não lança despesas'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor'; end if;
  if v_data is null then raise exception 'Informe a data'; end if;
  if btrim(coalesce(p->>'categoria', '')) = '' then raise exception 'Escolha a categoria'; end if;
  if v_id is not null then
    select autor_id into v_autor from public.fin_lancamentos where id = v_id;
    if v_autor is null then raise exception 'Lançamento não encontrado'; end if;
    if v_autor <> auth.uid() and not public.sou_nivel1() then raise exception 'Só quem lançou (ou o nível 1) pode alterar'; end if;
    update public.fin_lancamentos set mes = coalesce(nullif(p->>'mes', ''), to_char(v_data, 'YYYY-MM')), tipo = p->>'tipo', categoria = p->>'categoria',
      descricao = btrim(coalesce(p->>'descricao', '')), valor = v_valor, data = v_data where id = v_id;
  else
    insert into public.fin_lancamentos (mes, tipo, categoria, descricao, valor, data, autor_id)
    values (coalesce(nullif(p->>'mes', ''), to_char(v_data, 'YYYY-MM')), p->>'tipo', p->>'categoria', btrim(coalesce(p->>'descricao', '')), v_valor, v_data, auth.uid())
    returning id into v_id;
  end if;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'lancamento', jsonb_build_object('tipo', p->>'tipo', 'valor', v_valor));
  return v_id;
end $$;
create or replace function public.fin_remover_lancamento(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_autor uuid;
begin
  select autor_id into v_autor from public.fin_lancamentos where id = p_id;
  if v_autor is null then return; end if;
  if v_autor <> auth.uid() and not public.sou_nivel1() then raise exception 'Só quem lançou (ou o nível 1) pode apagar'; end if;
  delete from public.fin_lancamentos where id = p_id;
end $$;

-- ---------- 3. Lista de clientes com os dados do Modelo 2 ----------
create or replace function public.nome_gestor_da_imob(p_imob uuid) returns text
language sql stable security definer set search_path = public as $$
  select nome from public.perfis where id = public.gestor_da_imob(p_imob)
$$;
revoke execute on function public.nome_gestor_da_imob(uuid) from public, anon;
grant execute on function public.nome_gestor_da_imob(uuid) to authenticated;
create or replace view public.clientes_resumo with (security_invoker = true) as
 select c.id, c.nome, c.cpf, c.modalidade, c.programa, c.imovel, c.status, c.rascunho,
    s.nome as status_nome, s.ordem as status_ordem, c.corretor_id, p.nome as corretor_nome, c.imobiliaria_id,
    coalesce(i.nome, 'Autônomo'::text) as imobiliaria_nome, c.atualizado_em,
    (select count(*) from public.documentos_necessarios_v2(c.id) d where d.situacao = 'pendente'::text) as docs_pendentes,
    (select count(*) from public.documentos_necessarios_v2(c.id) d where d.situacao = 'recusado'::text) as docs_recusados,
    (select count(*) from public.documentos_necessarios_v2(c.id) d where d.situacao = 'em_conferencia'::text) as docs_em_conferencia,
    public.pode_ir_para_analise(c.id) as pode_ir_para_analise,
    ((select count(*) from public.participantes x where x.cliente_id = c.id) + 1) as pessoas,
    c.criado_em, c.enviado_em,
    coalesce((select max(h.em) from public.historico_status h where h.cliente_id = c.id and h.para = c.status), c.enviado_em, c.criado_em) as status_desde,
    (select count(*) from public.conversa m where m.cliente_id = c.id and m.autor_id <> auth.uid() and m.criada_em > coalesce((select l.lida_em from public.conversa_lida l where l.cliente_id = c.id and l.usuario_id = auth.uid()), '-infinity'::timestamptz)) as conversa_nao_lidas,
    (select max(m.criada_em) from public.conversa m where m.cliente_id = c.id) as conversa_ultima,
    p.consumidor as corretor_consumidor,
    c.valor_imovel, c.imovel_municipio, c.desconto_cartorio, c.grerj_numero, c.grerj_valor, c.grerj_pago_em, c.requerimento_enviado_em,
    c.data_nascimento, c.celular,
    c.email, c.imovel_id, c.assinatura_contrato, c.empreendimento_caixa,
    public.nome_gestor_da_imob(c.imobiliaria_id) as gestor_nome,
    coalesce((select array_agg(distinct a.tipo) from public.contrato_arquivos a where a.cliente_id = c.id and not a.substituido), '{}'::text[]) as contrato_tipos,
    public.situacao_damp(c.id) as damp_situacao
   from public.clientes c
     join public.status_etapas s on s.codigo = c.status
     join public.perfis p on p.id = c.corretor_id
     left join public.imobiliarias i on i.id = c.imobiliaria_id;

-- ---------- 4. Permissões ----------
do $$ declare f text; begin
  foreach f in array array[
    'public.situacao_damp(uuid)', 'public.escolher_damp(uuid)', 'public.listar_modelos_damp()', 'public.salvar_modelo_damp(jsonb)', 'public.remover_modelo_damp(uuid)',
    'public.damp_do_cliente(uuid)', 'public.gerar_damp(uuid, uuid)', 'public.anexar_damp_assinada(uuid, text, text)', 'public.marcar_damp_lancada(uuid, boolean)',
    'public.fin_acesso()', 'public.fin_config()', 'public.fin_salvar_config(jsonb, jsonb)', 'public.fin_contratos()', 'public.dados_contrato(uuid)',
    'public.salvar_dados_contrato(uuid, jsonb)', 'public.fin_fechar_mes(text, jsonb)', 'public.fin_reabrir_mes(text)', 'public.fin_registrar_nfe(text, jsonb)',
    'public.fin_marcar_recebido(text, date)', 'public.fin_listar_lancamentos(text)', 'public.fin_salvar_lancamento(jsonb)', 'public.fin_remover_lancamento(uuid)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.fin_lista_contratos(), public.fin_fechamentos_obj(), public.contrato_em_mes_fechado(uuid) from public, anon, authenticated;
