-- =====================================================================
-- MO / DAMP em kit: cada cliente recebe TODOS os modelos que a regra pede (não só um).
-- O app preenche, o corretor/gestor colhe a assinatura do cliente e anexa;
-- sem os obrigatórios assinados o processo não vai para a Conformidade.
-- =====================================================================

-- ---------- 1. Modelos: regra, quem assina e o modelo oficial (preenchimento automático) ----------
alter table public.damp_modelos
  add column if not exists tipo        text not null default 'MO',
  add column if not exists regra       jsonb not null default '[]'::jsonb,
  add column if not exists manual      boolean not null default false,
  add column if not exists assina      text not null default 'compradores',
  add column if not exists obrigatorio boolean not null default true,
  add column if not exists oficial     text,
  add column if not exists ordem       int not null default 50;
do $$ begin
  alter table public.damp_modelos add constraint damp_modelos_tipo_ck check (tipo in ('MO', 'DAMP'));
  alter table public.damp_modelos add constraint damp_modelos_assina_ck check (assina in ('compradores', 'cada_comprador', 'cca'));
exception when duplicate_object then null; end $$;

-- ---------- 2. O kit de cada cliente ----------
create table if not exists public.mo_itens (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes (id) on delete cascade,
  modelo_id     uuid not null references public.damp_modelos (id),
  pessoa_ordem  int  not null default 0,          -- 0 = todos os compradores no mesmo documento; 1..4 = um por comprador
  pessoa_nome   text,
  valores       jsonb not null default '{}'::jsonb, -- campos conferidos/editados antes de baixar
  gerado_em     timestamptz not null default now(),
  gerado_por    uuid references public.perfis (id),
  assinado_nome text,
  assinado_path text,
  assinado_em   timestamptz,
  assinado_por  uuid references public.perfis (id),
  lancado_em    timestamptz,
  dispensado_em timestamptz,
  dispensado_por uuid references public.perfis (id),
  unique (cliente_id, modelo_id, pessoa_ordem)
);
alter table public.mo_itens enable row level security;
create index if not exists mo_itens_cliente on public.mo_itens (cliente_id);

-- A regra: lista de alternativas (vale se QUALQUER uma bater); cada alternativa compara campos do cliente.
-- Lista vazia = sempre. Ex.: [{"usa_fgts":true},{"programa":"MCMV"}]
create or replace function public.mo_regra_ok(p_cliente uuid, p_regra jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_array_length(p_regra), 0) = 0 or exists (
    select 1 from public.clientes c, jsonb_array_elements(p_regra) alt
    where c.id = p_cliente and jsonb_typeof(alt) = 'object'
      and not exists (select 1 from jsonb_each(alt) kv where (to_jsonb(c) -> kv.key) is distinct from kv.value))
$$;

-- Monta (ou completa) o kit: todos os modelos ativos, automáticos, cuja regra bate.
-- "cada_comprador" gera um por pessoa (titular + compradores do cadastro). Não duplica; o que a CCA dispensou continua dispensado.
create or replace function public.mo_gerar_kit(p_cliente uuid) returns int
language plpgsql security definer set search_path = public as $$
declare m public.damp_modelos; c public.clientes; n int := 0; k int;
begin
  select * into c from public.clientes where id = p_cliente;
  if c.id is null then return 0; end if;
  for m in select * from public.damp_modelos where ativo and removido_em is null and not manual order by ordem, codigo loop
    if not public.mo_regra_ok(p_cliente, m.regra) then continue; end if;
    if m.assina = 'cada_comprador' then
      insert into public.mo_itens (cliente_id, modelo_id, pessoa_ordem, pessoa_nome, gerado_por)
      select p_cliente, m.id, x.ordem, x.nome, auth.uid()
      from (select 1 as ordem, c.nome as nome union all select p.ordem, p.nome from public.participantes p where p.cliente_id = p_cliente) x
      on conflict do nothing;
    else
      insert into public.mo_itens (cliente_id, modelo_id, pessoa_ordem, gerado_por) values (p_cliente, m.id, 0, auth.uid()) on conflict do nothing;
    end if;
    get diagnostics k = row_count; n := n + k;
  end loop;
  if n > 0 then
    insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'mo_kit_gerado', p_cliente, jsonb_build_object('itens', n));
  end if;
  return n;
end $$;

-- O que ainda falta assinar (obrigatórios, não dispensados)
create or replace function public.mo_pendentes(p_cliente uuid) returns text
language sql stable security definer set search_path = public as $$
  select string_agg(m.codigo || coalesce(' (' || i.pessoa_nome || ')', ''), ', ' order by m.ordem, m.codigo, i.pessoa_ordem)
  from public.mo_itens i join public.damp_modelos m on m.id = i.modelo_id
  where i.cliente_id = p_cliente and m.obrigatorio and m.removido_em is null and i.assinado_em is null and i.dispensado_em is null
$$;

-- Situação do kit (lista de clientes e "Sua vez"): para_assinar | assinada | lancada
create or replace function public.situacao_damp(p_cliente uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when count(*) = 0 then null
              when bool_or(i.assinado_em is null) then 'para_assinar'
              when bool_or(i.lancado_em is null) then 'assinada'
              else 'lancada' end
  from public.mo_itens i join public.damp_modelos m on m.id = i.modelo_id
  where i.cliente_id = p_cliente and i.dispensado_em is null and m.obrigatorio and m.removido_em is null
$$;

-- Etapas a partir da aprovação (monta o kit) e a partir da Conformidade (barreira)
create or replace function public.etapa_desde(p_status text, p_etapa text) returns boolean
language sql immutable as $$
  select coalesce(array_position(array['cliente_aprovado', 'entrevista', 'conformidade', 'minuta_em_maos', 'contrato_assinado', 'registro_cartorio',
                                       'conformidade_final', 'credito_liberado'], p_status), 0)
      >= coalesce(array_position(array['cliente_aprovado', 'entrevista', 'conformidade', 'minuta_em_maos', 'contrato_assinado', 'registro_cartorio',
                                       'conformidade_final', 'credito_liberado'], p_etapa), 99)
$$;

-- Ao aprovar (e em toda etapa depois), o app completa o kit
create or replace function public.tg_clientes_damp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.etapa_desde(new.status, 'cliente_aprovado') and new.status is distinct from old.status then
    perform public.mo_gerar_kit(new.id);
  end if;
  return new;
end $$;
create or replace trigger clientes_damp after update of status on public.clientes for each row execute function public.tg_clientes_damp();

-- Barreira: sem os MO / DAMP obrigatórios assinados, o processo não entra na Conformidade
create or replace function public.tg_clientes_mo_barreira() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_falta text;
begin
  if public.etapa_desde(new.status, 'conformidade') and not public.etapa_desde(old.status, 'conformidade') then
    perform public.mo_gerar_kit(new.id);
    v_falta := public.mo_pendentes(new.id);
    if v_falta is not null then
      raise exception 'Ainda faltam MO / DAMP assinados: %. Sem eles o processo não vai para a Conformidade.', v_falta;
    end if;
  end if;
  return new;
end $$;
create or replace trigger clientes_mo_barreira before update of status on public.clientes for each row execute function public.tg_clientes_mo_barreira();
