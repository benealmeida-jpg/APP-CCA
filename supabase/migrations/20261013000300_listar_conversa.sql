-- Conversa por cliente com o nome de quem escreveu (o corretor não lê o perfil da equipe direto)
create or replace function public.listar_conversa(p_cliente uuid)
returns table (id bigint, texto text, criada_em timestamptz, autor_id uuid, autor_nome text, da_equipe boolean, minha boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.texto, m.criada_em, m.autor_id, p.nome, p.papel in ('equipe_cca', 'admin'), m.autor_id = auth.uid()
  from public.conversa m
  join public.perfis p on p.id = m.autor_id
  where m.cliente_id = p_cliente and public.posso_ver_cliente(p_cliente)
  order by m.criada_em, m.id
$$;
revoke execute on function public.listar_conversa(uuid) from public, anon;
grant execute on function public.listar_conversa(uuid) to authenticated;
