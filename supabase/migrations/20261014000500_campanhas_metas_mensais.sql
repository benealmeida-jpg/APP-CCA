-- Campanhas (concursos com prêmio) e metas por mês.
create table if not exists public.campanhas (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  descricao      text,
  regulamento    text,
  metrica        text not null default 'assinados' check (metrica in ('abertos','aprovados','minutas','assinados')),
  inicio         date not null,
  fim            date not null,
  mostrar_nomes  boolean not null default true,   -- false: o corretor vê só a própria posição
  ativa          boolean not null default true,   -- false: rascunho, só a equipe vê
  apurada_em     timestamptz,
  arquivada      boolean not null default false,
  criado_por     uuid references public.perfis (id),
  criado_em      timestamptz not null default now(),
  check (fim >= inicio)
);
create table if not exists public.campanha_premios (
  id            uuid primary key default gen_random_uuid(),
  campanha_id   uuid not null references public.campanhas (id) on delete cascade,
  categoria     text not null check (categoria in ('imobiliaria','corretor')),
  posicao       int  not null default 1 check (posicao >= 1),
  descricao     text not null,
  ganhador_id   uuid,
  ganhador_nome text,
  entregue_em   date,
  removido      boolean not null default false
);
create index if not exists campanha_premios_camp_idx on public.campanha_premios (campanha_id);
create table if not exists public.metas_mensais (
  mes     date not null,                 -- sempre dia 1
  metrica text not null check (metrica in ('abertos','minutas','assinados')),
  valor   int  not null check (valor >= 0),
  primary key (mes, metrica)
);
alter table public.campanhas enable row level security;
alter table public.campanha_premios enable row level security;
alter table public.metas_mensais enable row level security;
create policy ver_campanhas on public.campanhas for select to authenticated using (ativa or public.sou_equipe());
create policy ver_premios on public.campanha_premios for select to authenticated
  using (exists (select 1 from public.campanhas c where c.id = campanha_id));
create policy ver_metas_mensais on public.metas_mensais for select to authenticated using (public.sou_equipe());

-- Placar: clientes que chegaram na etapa da campanha dentro do período (1ª vez de cada cliente).
create or replace function public.campanha_ranking(p_campanha uuid)
returns table (categoria text, ref_id uuid, nome text, subnome text, valor int, posicao int, meu boolean)
language sql stable security definer set search_path = public as $$
  with camp as (select * from public.campanhas where id = p_campanha and (ativa or public.sou_equipe())),
  jan as (select (inicio::timestamp at time zone 'America/Sao_Paulo') as ini, ((fim + 1)::timestamp at time zone 'America/Sao_Paulo') as fim from camp),
  ev as (
    select c.corretor_id, c.imobiliaria_id,
      case when camp.metrica = 'abertos' then c.enviado_em
           else (select min(hs.em) from public.historico_status hs where hs.cliente_id = c.id
                 and hs.para = case camp.metrica when 'aprovados' then 'cliente_aprovado' when 'minutas' then 'minuta_em_maos' else 'contrato_assinado' end) end as em
    from camp, public.clientes c where c.rascunho = false),
  ok as (select ev.* from ev, jan where ev.em >= jan.ini and ev.em < jan.fim),
  linhas as (
    select 'corretor'::text as categoria, p.id as ref_id, p.nome, coalesce(i.nome, 'Autônomo') as subnome,
           count(o.em)::int as valor, max(o.em) as ultimo, (p.id = auth.uid()) as meu
    from public.perfis p left join public.imobiliarias i on i.id = p.imobiliaria_id left join ok o on o.corretor_id = p.id
    where p.papel = 'corretor' and p.ativo and coalesce(p.consumidor, false) = false and exists (select 1 from camp)
    group by p.id, p.nome, i.nome
    union all
    select 'imobiliaria', i.id, i.nome, null, count(o.em)::int, max(o.em), (i.id = public.minha_imobiliaria())
    from public.imobiliarias i left join ok o on o.imobiliaria_id = i.id
    where i.ativo and exists (select 1 from camp) group by i.id, i.nome),
  rk as (select l.*, case when l.valor > 0 then (row_number() over (partition by l.categoria order by l.valor desc, l.ultimo asc, l.nome))::int end as posicao from linhas l)
  select rk.categoria, rk.ref_id, rk.nome, rk.subnome, rk.valor, rk.posicao, rk.meu
  from rk, camp where public.sou_equipe() or camp.mostrar_nomes or rk.meu
  order by rk.categoria, rk.posicao nulls last, rk.nome
$$;

create or replace function public.admin_salvar_campanha(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.sou_admin() then raise exception 'Somente administradores'; end if;
  if coalesce(trim(p->>'nome'), '') = '' then raise exception 'Dê um nome à campanha'; end if;
  if (p->>'fim')::date < (p->>'inicio')::date then raise exception 'O fim não pode ser antes do início'; end if;
  v_id := nullif(p->>'id', '')::uuid;
  if v_id is null then
    insert into public.campanhas (nome, descricao, regulamento, metrica, inicio, fim, mostrar_nomes, ativa, criado_por)
    values (trim(p->>'nome'), nullif(p->>'descricao',''), nullif(p->>'regulamento',''), coalesce(p->>'metrica','assinados'), (p->>'inicio')::date, (p->>'fim')::date,
            coalesce((p->>'mostrar_nomes')::boolean, true), coalesce((p->>'ativa')::boolean, true), auth.uid()) returning id into v_id;
  else
    update public.campanhas set nome = trim(p->>'nome'), descricao = nullif(p->>'descricao',''), regulamento = nullif(p->>'regulamento',''), metrica = coalesce(p->>'metrica','assinados'),
      inicio = (p->>'inicio')::date, fim = (p->>'fim')::date, mostrar_nomes = coalesce((p->>'mostrar_nomes')::boolean, true), ativa = coalesce((p->>'ativa')::boolean, true)
    where id = v_id;
    if not found then raise exception 'Campanha não encontrada'; end if;
  end if;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'salvar_campanha', jsonb_build_object('campanha', v_id, 'nome', p->>'nome'));
  return v_id;
end $$;

-- Um prêmio por chamada (criar ou alterar). Prêmios e campanhas não são apagados: são removidos/arquivados (o banco barra DELETE aqui).
create or replace function public.admin_salvar_premio(p_campanha uuid, p_id uuid, p_categoria text, p_posicao int, p_descricao text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_pid uuid;
begin
  if not public.sou_admin() then raise exception 'Somente administradores'; end if;
  if coalesce(trim(p_descricao), '') = '' then raise exception 'Descreva o prêmio'; end if;
  if p_id is not null and exists (select 1 from public.campanha_premios where id = p_id and campanha_id = p_campanha) then
    update public.campanha_premios set categoria = p_categoria, posicao = coalesce(p_posicao, 1), descricao = trim(p_descricao) where id = p_id;
    return p_id;
  end if;
  insert into public.campanha_premios (campanha_id, categoria, posicao, descricao) values (p_campanha, p_categoria, coalesce(p_posicao, 1), trim(p_descricao)) returning id into v_pid;
  return v_pid;
end $$;

create or replace function public.admin_arquivar_campanha(p_id uuid, p_arquivada boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores'; end if;
  update public.campanhas set arquivada = p_arquivada where id = p_id;
end $$;

create or replace function public.admin_remover_premio(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores'; end if;
  update public.campanha_premios set removido = true where id = p_id;
end $$;

-- Congela os vencedores no momento da apuração (o placar continua calculado ao vivo)
create or replace function public.admin_apurar_campanha(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores'; end if;
  update public.campanha_premios pr set ganhador_id = r.ref_id, ganhador_nome = r.nome
  from (select * from public.campanha_ranking(p_id)) r
  where pr.campanha_id = p_id and r.categoria = pr.categoria and r.posicao = pr.posicao;
  update public.campanha_premios set ganhador_id = null, ganhador_nome = null
  where campanha_id = p_id and not exists (select 1 from public.campanha_ranking(p_id) r where r.categoria = campanha_premios.categoria and r.posicao = campanha_premios.posicao);
  update public.campanhas set apurada_em = now() where id = p_id;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'apurar_campanha', jsonb_build_object('campanha', p_id));
end $$;

create or replace function public.admin_entregar_premio(p_premio uuid, p_data date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores'; end if;
  update public.campanha_premios set entregue_em = p_data where id = p_premio;
end $$;

create or replace function public.admin_salvar_meta_mensal(p_mes date, p_metrica text, p_valor int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores'; end if;
  if p_valor is null then delete from public.metas_mensais where mes = date_trunc('month', p_mes)::date and metrica = p_metrica;
  else insert into public.metas_mensais (mes, metrica, valor) values (date_trunc('month', p_mes)::date, p_metrica, p_valor)
       on conflict (mes, metrica) do update set valor = excluded.valor; end if;
end $$;

revoke execute on function public.campanha_ranking(uuid), public.admin_salvar_campanha(jsonb), public.admin_salvar_premio(uuid, uuid, text, int, text), public.admin_remover_premio(uuid), public.admin_arquivar_campanha(uuid, boolean),
  public.admin_apurar_campanha(uuid), public.admin_entregar_premio(uuid, date), public.admin_salvar_meta_mensal(date, text, int) from public, anon;
grant execute on function public.campanha_ranking(uuid), public.admin_salvar_campanha(jsonb), public.admin_salvar_premio(uuid, uuid, text, int, text), public.admin_remover_premio(uuid), public.admin_arquivar_campanha(uuid, boolean),
  public.admin_apurar_campanha(uuid), public.admin_entregar_premio(uuid, date), public.admin_salvar_meta_mensal(date, text, int) to authenticated;
