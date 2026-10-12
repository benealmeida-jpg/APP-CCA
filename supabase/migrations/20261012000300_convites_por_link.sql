-- Convite por link: a CCA gera o link (só o tipo e o WhatsApp); a pessoa abre, preenche os próprios dados
-- e cria a senha. Tipos: corretor, imobiliária (cria a imobiliária + o acesso do responsável) e funcionário da CCA.
create table if not exists public.convites_link (
  id              uuid primary key default gen_random_uuid(),
  token_hash      text not null unique,                 -- sha-256 do token; o token em si só vai no link
  tipo            text not null check (tipo in ('corretor', 'imobiliaria', 'equipe_cca', 'admin')),
  imobiliaria_id  uuid references public.imobiliarias (id),   -- corretor já vinculado a uma imobiliária
  nome            text,
  whatsapp        text,
  criado_por      uuid references public.perfis (id),
  criado_em       timestamptz not null default now(),
  expira_em       timestamptz not null default now() + interval '7 days',
  usado_em        timestamptz,
  usado_por       uuid references public.perfis (id) on delete set null,
  cancelado_em    timestamptz
);
alter table public.convites_link enable row level security;
do $$ begin
  create policy ver_convites_link on public.convites_link for select to authenticated using (public.sou_equipe());
exception when duplicate_object then null; end $$;

-- Cancelar um convite ainda não usado (equipe)
create or replace function public.cancelar_convite_link(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Somente a equipe da CCA'; end if;
  update public.convites_link set cancelado_em = now() where id = p_id and usado_em is null;
end $$;
revoke execute on function public.cancelar_convite_link(uuid) from public, anon;
grant execute on function public.cancelar_convite_link(uuid) to authenticated;
