-- 1) Conversa por cliente (corretor/imobiliária <-> equipe CCA)
-- 2) Alerta de processo parado e lembrete automático de documento obrigatório
-- 3) Dados para o quadro e os relatórios (desde quando está no status, conversa não lida)

-- ---------- 1) Conversa ----------
create table if not exists public.conversa (
  id          bigint generated always as identity primary key,
  cliente_id  uuid not null references public.clientes (id) on delete cascade,
  autor_id    uuid not null default auth.uid() references public.perfis (id),
  texto       text not null check (length(btrim(texto)) between 1 and 2000),
  criada_em   timestamptz not null default now()
);
create index if not exists conversa_cliente_idx on public.conversa (cliente_id, criada_em);
alter table public.conversa enable row level security;

-- Até onde cada pessoa já leu a conversa de cada cliente
create table if not exists public.conversa_lida (
  usuario_id  uuid not null references public.perfis (id) on delete cascade,
  cliente_id  uuid not null references public.clientes (id) on delete cascade,
  lida_em     timestamptz not null default now(),
  primary key (usuario_id, cliente_id)
);
alter table public.conversa_lida enable row level security;

do $$ begin
  if not exists (select 1 from pg_policy where polname = 'ver_conversa' and polrelid = 'public.conversa'::regclass) then
    create policy ver_conversa on public.conversa for select using (public.posso_ver_cliente(cliente_id));
  end if;
  if not exists (select 1 from pg_policy where polname = 'escrever_conversa' and polrelid = 'public.conversa'::regclass) then
    create policy escrever_conversa on public.conversa for insert with check (autor_id = auth.uid() and public.posso_ver_cliente(cliente_id));
  end if;
  if not exists (select 1 from pg_policy where polname = 'minha_leitura' and polrelid = 'public.conversa_lida'::regclass) then
    create policy minha_leitura on public.conversa_lida for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid() and public.posso_ver_cliente(cliente_id));
  end if;
end $$;

create or replace function public.marcar_conversa_lida(p_cliente uuid) returns void
language sql security invoker set search_path = public as $$
  insert into public.conversa_lida (usuario_id, cliente_id, lida_em) values (auth.uid(), p_cliente, now())
  on conflict (usuario_id, cliente_id) do update set lida_em = excluded.lida_em;
$$;
grant execute on function public.marcar_conversa_lida(uuid) to authenticated;

-- Nova mensagem vira evento para o aviso (push + e-mail)
create or replace function public.tg_conversa_evento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.eventos (tipo, cliente_id, dados)
  values ('conversa', new.cliente_id, jsonb_build_object('mensagem_id', new.id, 'autor_id', new.autor_id,
    'da_equipe', exists (select 1 from public.perfis p where p.id = new.autor_id and p.papel in ('equipe_cca', 'admin'))));
  return new;
end $$;
create or replace trigger conversa_evento after insert on public.conversa for each row execute function public.tg_conversa_evento();

-- ---------- 2) Alerta de parado e lembrete de documentos ----------
insert into public.parametros (chave, valor, descricao) values
  ('dias_alerta_parado', '5', 'Dias no mesmo status para o painel marcar o cliente como parado'),
  ('lembrete_docs', 'sim', 'Lembrar o corretor, automaticamente, de documento obrigatório (**) que falta (sim/nao)'),
  ('dias_lembrete_docs', '3', 'De quantos em quantos dias o corretor recebe o lembrete de documento obrigatório que falta')
on conflict (chave) do nothing;

-- Último lembrete enviado por cliente (tabela à parte para não mexer na data de atualização do cliente)
create table if not exists public.lembretes_docs (
  cliente_id  uuid primary key references public.clientes (id) on delete cascade,
  enviado_em  timestamptz not null default now()
);
alter table public.lembretes_docs enable row level security;   -- só o servidor usa

-- Roda uma vez por dia: cria um evento de lembrete para cada cliente enviado que ainda não pode ir para análise
create or replace function public.gerar_lembretes_docs() returns int
language plpgsql security definer set search_path = public as $$
declare v_dias int; v_ligado text; v_qtd int := 0; r record;
begin
  select valor into v_ligado from public.parametros where chave = 'lembrete_docs';
  if coalesce(v_ligado, 'sim') <> 'sim' then return 0; end if;
  select coalesce(nullif(valor, '')::int, 3) into v_dias from public.parametros where chave = 'dias_lembrete_docs';
  v_dias := greatest(coalesce(v_dias, 3), 1);
  for r in
    select c.id from public.clientes c
    left join public.lembretes_docs l on l.cliente_id = c.id
    where not c.rascunho
      and c.status in ('cadastro_recebido', 'documentacao_pendente')
      and coalesce(c.enviado_em, c.criado_em) < now() - make_interval(days => v_dias)
      and (l.enviado_em is null or l.enviado_em < now() - make_interval(days => v_dias))
      and not public.pode_ir_para_analise(c.id)
  loop
    insert into public.eventos (tipo, cliente_id, dados) values ('lembrete_docs', r.id, '{}'::jsonb);
    insert into public.lembretes_docs (cliente_id, enviado_em) values (r.id, now())
    on conflict (cliente_id) do update set enviado_em = excluded.enviado_em;
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end $$;
revoke execute on function public.gerar_lembretes_docs() from public, anon, authenticated;

-- Fila e gatilho de avisos passam a tratar também conversa e lembrete
create or replace function public.pegar_eventos_aviso(p_limite int default 20)
returns setof public.eventos
language sql security definer set search_path = public as $$
  update public.eventos e set processando_em = now(), tentativas = e.tentativas + 1
  where e.id in (
    select id from public.eventos
    where not processado and tentativas < 5
      and tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs')
      and (processando_em is null or processando_em < now() - interval '2 minutes')
    order by id
    limit p_limite
    for update skip locked)
  returning e.*
$$;
revoke execute on function public.pegar_eventos_aviso(int) from public, anon, authenticated;

create or replace function public.tg_eventos_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs') then
    perform public.chamar_avisos();
  end if;
  return new;
end $$;

-- ---------- 3) Resumo dos clientes com datas e conversa ----------
create or replace view public.clientes_resumo with (security_invoker = true) as
select c.id, c.nome, c.cpf, c.modalidade, c.programa, c.imovel, c.status, c.rascunho,
       s.nome as status_nome, s.ordem as status_ordem,
       c.corretor_id, p.nome as corretor_nome,
       c.imobiliaria_id, coalesce(i.nome, 'Autônomo') as imobiliaria_nome,
       c.atualizado_em,
       (select count(*) from public.documentos_necessarios_v2(c.id) d where d.situacao = 'pendente')       as docs_pendentes,
       (select count(*) from public.documentos_necessarios_v2(c.id) d where d.situacao = 'recusado')       as docs_recusados,
       (select count(*) from public.documentos_necessarios_v2(c.id) d where d.situacao = 'em_conferencia') as docs_em_conferencia,
       public.pode_ir_para_analise(c.id) as pode_ir_para_analise,
       (select count(*) from public.participantes x where x.cliente_id = c.id) + 1 as pessoas,
       c.criado_em,
       c.enviado_em,
       coalesce((select max(h.em) from public.historico_status h where h.cliente_id = c.id and h.para = c.status),
                c.enviado_em, c.criado_em) as status_desde,
       (select count(*) from public.conversa m
         where m.cliente_id = c.id and m.autor_id <> auth.uid()
           and m.criada_em > coalesce((select l.lida_em from public.conversa_lida l where l.cliente_id = c.id and l.usuario_id = auth.uid()), '-infinity'::timestamptz)) as conversa_nao_lidas,
       (select max(m.criada_em) from public.conversa m where m.cliente_id = c.id) as conversa_ultima
from public.clientes c
join public.status_etapas s on s.codigo = c.status
join public.perfis p on p.id = c.corretor_id
left join public.imobiliarias i on i.id = c.imobiliaria_id;

-- Histórico de status de todos os clientes visíveis (relatórios: tempo em cada etapa)
create or replace function public.historico_status_visivel() returns setof public.historico_status
language sql stable security invoker set search_path = public as $$
  select h.* from public.historico_status h order by h.cliente_id, h.em
$$;
grant execute on function public.historico_status_visivel() to authenticated;

