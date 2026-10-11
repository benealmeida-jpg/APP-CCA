-- =====================================================================
-- 1) Nível "documentação da imobiliária" (papel gestor_imobiliaria):
--    vê, cadastra, edita, anexa e envia pelos clientes de TODOS os corretores
--    da sua imobiliária, escolhendo o corretor responsável.
-- 2) Avisos automáticos: canal escolhido pelo ADM (WhatsApp API Meta ou push),
--    destino escolhido por imobiliária (corretor, imobiliária ou os dois).
-- =====================================================================

-- ---------- 1. Gestor / documentação da imobiliária ----------
create or replace function public.sou_gestor_do_cliente(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.meu_papel() = 'gestor_imobiliaria' and exists (
    select 1 from public.clientes c
    where c.id = p_cliente and c.imobiliaria_id is not null and c.imobiliaria_id = public.minha_imobiliaria())
$$;

-- O servidor (funções de aviso) também enxerga os clientes
create or replace function public.posso_ver_cliente(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role' or exists (
    select 1 from public.clientes c
    where c.id = p_cliente
      and (
        c.corretor_id = auth.uid()
        or public.sou_equipe()
        or (public.meu_papel() = 'gestor_imobiliaria'
            and c.imobiliaria_id is not null
            and c.imobiliaria_id = public.minha_imobiliaria())
      )
  )
$$;

create or replace function public.posso_editar_cliente(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clientes c
                 where c.id = p_cliente and (c.corretor_id = auth.uid() or public.sou_equipe()))
         or public.sou_gestor_do_cliente(p_cliente)
$$;

do $$ begin
  create policy gestor_edita_cliente on public.clientes for update to authenticated
    using (public.meu_papel() = 'gestor_imobiliaria' and imobiliaria_id = public.minha_imobiliaria())
    with check (public.meu_papel() = 'gestor_imobiliaria' and imobiliaria_id = public.minha_imobiliaria());
  create policy gestor_envia_documento on public.documentos for insert to authenticated
    with check (public.sou_gestor_do_cliente(cliente_id));
  create policy gestor_grava_participante on public.participantes for all to authenticated
    using (public.sou_gestor_do_cliente(cliente_id)) with check (public.sou_gestor_do_cliente(cliente_id));
  create policy docs_enviar_gestor on storage.objects for insert to authenticated
    with check (bucket_id = 'documentos' and public.sou_gestor_do_cliente(((storage.foldername(name))[1])::uuid));
  create policy vend_enviar_gestor on storage.objects for insert to authenticated
    with check (bucket_id = 'vendedores'
                and exists (select 1 from public.clientes c
                            where c.vendedor_id::text = (storage.foldername(name))[1]
                              and public.sou_gestor_do_cliente(c.id)));
exception when duplicate_object then null; end $$;

-- Novo cliente: corretor = quem cadastra; o gestor escolhe um corretor da própria imobiliária
create or replace function public.tg_clientes_novo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.meu_papel() = 'gestor_imobiliaria' then
    if new.corretor_id is null or not exists (
         select 1 from public.perfis p where p.id = new.corretor_id and p.imobiliaria_id = public.minha_imobiliaria()) then
      new.corretor_id := auth.uid();
    end if;
  elsif not public.sou_equipe() then
    new.corretor_id := auth.uid();
  end if;
  select imobiliaria_id into new.imobiliaria_id from public.perfis where id = new.corretor_id;
  new.status := 'cadastro_recebido';
  return new;
end $$;

-- Troca de corretor: equipe, ou gestor dentro da própria imobiliária
create or replace function public.tg_clientes_protecao() returns trigger
language plpgsql set search_path = public as $$
begin
  new.atualizado_em := now();
  if auth.uid() is null then return new; end if;
  if new.corretor_id <> old.corretor_id and not public.sou_equipe() then
    if not (public.meu_papel() = 'gestor_imobiliaria'
            and old.imobiliaria_id = public.minha_imobiliaria()
            and exists (select 1 from public.perfis p where p.id = new.corretor_id and p.imobiliaria_id = public.minha_imobiliaria())) then
      raise exception 'Não é permitido trocar o corretor do cliente';
    end if;
  end if;
  if new.imobiliaria_id is distinct from old.imobiliaria_id and not public.sou_equipe() then
    new.imobiliaria_id := old.imobiliaria_id;
  end if;
  if new.status <> old.status
     and current_setting('app.mudanca_status_autorizada', true) is distinct from 'sim'
     and not (old.rascunho and not new.rascunho)
     and not public.sou_equipe() then
    raise exception 'Somente a equipe da CCA muda o status';
  end if;
  return new;
end $$;

create or replace function public.enviar_cadastro(p_cliente uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.clientes;
begin
  select * into v from public.clientes where id = p_cliente;
  if v.id is null or not public.posso_editar_cliente(p_cliente) then
    raise exception 'Cliente não encontrado';
  end if;
  if v.autorizacao_lgpd_em is null then
    raise exception 'Falta a confirmação de autorização do cliente (LGPD)';
  end if;
  if not v.rascunho then
    return;
  end if;
  update public.clientes
     set rascunho = false,
         enviado_em = coalesce(enviado_em, now()),
         status = case when public.pode_ir_para_analise(p_cliente)
                       then 'cadastro_recebido' else 'documentacao_pendente' end
   where id = p_cliente;
  insert into public.eventos (tipo, cliente_id) values ('cliente_enviado', p_cliente);
end $$;

-- ---------- 2. Avisos automáticos ----------
-- Para quem vão os avisos de cada imobiliária
alter table public.imobiliarias add column if not exists avisos_para text not null default 'corretor';
do $$ begin
  alter table public.imobiliarias add constraint imobiliarias_avisos_para_check check (avisos_para in ('corretor', 'imobiliaria', 'ambos'));
exception when duplicate_object then null; end $$;

alter table public.perfis add column if not exists aceita_whatsapp boolean not null default true;

alter table public.mensagens
  add column if not exists canal text,
  add column if not exists evento_id bigint,
  add column if not exists referencia text;

insert into public.parametros (chave, valor, descricao) values
  ('canal_avisos', 'push', 'Canal dos avisos aos corretores: whatsapp (API Meta, com custo) ou push (notificação do app, sem custo)'),
  ('url_app', 'https://benealmeida-jpg.github.io/APP-CCA/', 'Endereço do app usado nos links dos avisos')
on conflict (chave) do nothing;

-- Credenciais (token da Meta, chaves do push etc.): ninguém lê pelo app; só o servidor
create table if not exists public.integracoes (
  chave          text primary key,
  valor          text not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfis (id)
);
alter table public.integracoes enable row level security;   -- sem regras = ninguém lê/grava pelo app

insert into public.integracoes (chave, valor) values ('segredo_interno', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (chave) do nothing;

create or replace function public.admin_salvar_integracao(p_chave text, p_valor text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores'; end if;
  if p_chave not in ('meta_token', 'meta_phone_id', 'meta_waba_id') then raise exception 'Configuração inválida'; end if;
  if coalesce(trim(p_valor), '') = '' then
    delete from public.integracoes where chave = p_chave;
  else
    insert into public.integracoes (chave, valor, atualizado_por) values (p_chave, trim(p_valor), auth.uid())
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = auth.uid();
  end if;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'alterar_integracao', jsonb_build_object('chave', p_chave));
end $$;

-- Mostra só SE está configurado (nunca o valor)
create or replace function public.integracoes_configuradas()
returns table (chave text, configurado boolean, final text, atualizado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select k.chave, i.chave is not null,
         case when i.chave is not null and k.chave <> 'meta_token' then i.valor
              when i.chave is not null then '…' || right(i.valor, 4) end,
         i.atualizado_em
  from (values ('meta_phone_id'), ('meta_waba_id'), ('meta_token')) k(chave)
  left join public.integracoes i on i.chave = k.chave
  where public.sou_admin()
$$;

-- Inscrições de notificação push (um aparelho por linha)
create table if not exists public.push_inscricoes (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.perfis (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  aparelho    text,
  criado_em   timestamptz not null default now()
);
alter table public.push_inscricoes enable row level security;
do $$ begin
  create policy minhas_inscricoes on public.push_inscricoes for all to authenticated
    using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Cada evento novo chama a função de avisos (sem esperar resposta)
create or replace function public.chamar_avisos() returns void
language plpgsql security definer set search_path = public as $$
declare v_seg text;
begin
  select valor into v_seg from public.integracoes where chave = 'segredo_interno';
  perform net.http_post(
    url := 'https://gfyvbqbllvjynqssrozu.supabase.co/functions/v1/avisos',
    body := '{"acao":"processar"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_seg));
exception when others then
  null;   -- aviso nunca pode travar o cadastro
end $$;
revoke execute on function public.chamar_avisos() from public, anon, authenticated;

create or replace function public.tg_eventos_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite') then
    perform public.chamar_avisos();
  end if;
  return new;
end $$;

create or replace trigger eventos_aviso after insert on public.eventos
for each row execute function public.tg_eventos_aviso();

revoke execute on function public.admin_salvar_integracao(text, text), public.integracoes_configuradas(),
  public.sou_gestor_do_cliente(uuid) from public, anon;
grant execute on function public.admin_salvar_integracao(text, text), public.integracoes_configuradas(),
  public.sou_gestor_do_cliente(uuid) to authenticated;
