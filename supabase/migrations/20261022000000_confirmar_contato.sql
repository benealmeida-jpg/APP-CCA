-- Confirmação de e-mail e celular com código (todos os usuários). Fica desligada até o ADM ligar
-- (precisa do WhatsApp da Meta e da caixa de e-mail funcionando, senão ninguém conseguiria entrar).
alter table public.perfis add column if not exists email_verificado_em timestamptz;
alter table public.perfis add column if not exists whatsapp_verificado_em timestamptz;

create table if not exists public.contato_codigos (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  canal text not null check (canal in ('email', 'whatsapp')),
  destino text not null,
  codigo_hash text not null,
  expira_em timestamptz not null,
  tentativas int not null default 0,
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists contato_codigos_perfil on public.contato_codigos (perfil_id, canal, criado_em desc);
alter table public.contato_codigos enable row level security;  -- só a função do servidor mexe aqui

insert into public.parametros (chave, valor, descricao) values
  ('exigir_verificacao', 'nao', 'Exigir que todos confirmem e-mail e celular com código ao entrar (sim/nao)')
on conflict (chave) do nothing;

-- Corrigir o próprio celular antes de confirmar (troca o número = precisa confirmar de novo)
create or replace function public.alterar_meu_whatsapp(p_whatsapp text) returns void
language plpgsql security definer set search_path = public as $$
declare v text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
begin
  if auth.uid() is null then raise exception 'Faça login novamente'; end if;
  if length(v) in (10, 11) then v := '55' || v; end if;
  if length(v) not in (12, 13) or left(v, 2) <> '55' then raise exception 'Celular inválido: use DDD + número'; end if;
  update public.perfis set whatsapp = '+' || v where id = auth.uid();
end $$;
revoke execute on function public.alterar_meu_whatsapp(text) from public, anon;
grant execute on function public.alterar_meu_whatsapp(text) to authenticated;

-- Só o servidor marca como confirmado; trocar o celular ou o e-mail exige confirmar de novo
create or replace function public.tg_perfis_contato() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and (new.email_verificado_em is distinct from old.email_verificado_em
     or new.whatsapp_verificado_em is distinct from old.whatsapp_verificado_em) then
    new.email_verificado_em := old.email_verificado_em; new.whatsapp_verificado_em := old.whatsapp_verificado_em;
  end if;
  if new.whatsapp is distinct from old.whatsapp then new.whatsapp_verificado_em := null; end if;
  if lower(coalesce(new.email, '')) is distinct from lower(coalesce(old.email, '')) then new.email_verificado_em := null; end if;
  return new;
end $$;
create or replace trigger perfis_contato before update on public.perfis for each row execute function public.tg_perfis_contato();
