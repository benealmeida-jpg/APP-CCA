-- =====================================================================
-- Convites: só entra quem a CCA convida.
-- Quem criar conta sozinho (sem convite) fica INATIVO e não acessa nada.
-- O convite é feito pela função de servidor "convidar" (Edge Function),
-- que gera o link de acesso e ativa o perfil com o papel e a imobiliária.
-- =====================================================================

create or replace function public.tg_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, email, whatsapp, ativo)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
          new.email,
          new.raw_user_meta_data->>'whatsapp',
          false)                                   -- ativado só pelo convite
  on conflict (id) do nothing;
  return new;
end $$;

-- Histórico de convites (quem convidou quem)
create table if not exists public.convites (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid references public.perfis (id) on delete set null,
  email           text not null,
  nome            text,
  whatsapp        text,
  papel           text not null,
  imobiliaria_id  uuid references public.imobiliarias (id),
  tipo            text not null default 'convite' check (tipo in ('convite', 'novo_link')),
  convidado_por   uuid references public.perfis (id),
  criado_em       timestamptz not null default now()
);
alter table public.convites enable row level security;
do $$ begin
  create policy ver_convites on public.convites for select to authenticated using (public.sou_equipe());
exception when duplicate_object then null; end $$;

-- Equipe ativa/desativa corretores; só ADM mexe em gente da equipe (regra já no gatilho de perfis)
create or replace function public.equipe_ativar_usuario(p_usuario uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_papel text;
begin
  if not public.sou_equipe() or not public.tenho_permissao('ver_imobiliarias_corretores') then raise exception 'Sem permissão'; end if;
  select papel into v_papel from public.perfis where id = p_usuario;
  if v_papel in ('equipe_cca', 'admin') and not public.sou_admin() then raise exception 'Somente administradores'; end if;
  if p_usuario = auth.uid() then raise exception 'Você não pode desativar o seu próprio acesso'; end if;
  update public.perfis set ativo = p_ativo where id = p_usuario;
  insert into public.acessos_log (usuario_id, acao, detalhes)
  values (auth.uid(), case when p_ativo then 'ativar_usuario' else 'desativar_usuario' end, jsonb_build_object('usuario', p_usuario));
end $$;
revoke execute on function public.equipe_ativar_usuario(uuid, boolean) from public, anon;
grant execute on function public.equipe_ativar_usuario(uuid, boolean) to authenticated;

-- Base de vendedores: lista para a equipe com contagens
create or replace function public.listar_vendedores()
returns table (id uuid, tipo text, cpf_cnpj text, nome text, pj_tipo text, empreendimento text,
               construtora_nome text, banco text, processos bigint, docs_aceitos bigint, docs_conferencia bigint,
               docs_recusados bigint, atualizado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select v.id, v.tipo, v.cpf_cnpj, v.nome, v.pj_tipo, v.empreendimento, v.construtora_nome, v.banco,
         (select count(*) from public.clientes c where c.vendedor_id = v.id),
         (select count(*) from public.documentos_vendedor d where d.vendedor_id = v.id and d.situacao = 'aceito'),
         (select count(*) from public.documentos_vendedor d where d.vendedor_id = v.id and d.situacao = 'em_conferencia'),
         (select count(*) from public.documentos_vendedor d where d.vendedor_id = v.id and d.situacao = 'recusado'),
         v.atualizado_em
  from public.vendedores v
  where public.sou_equipe() and public.tenho_permissao('ver_vendedores')
  order by v.atualizado_em desc
$$;
revoke execute on function public.listar_vendedores() from public, anon;
grant execute on function public.listar_vendedores() to authenticated;
