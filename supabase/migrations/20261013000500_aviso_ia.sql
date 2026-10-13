-- Aviso ao corretor quando a pré-conferência por IA vê um problema claro no documento
create or replace function public.pegar_eventos_aviso(p_limite int default 20)
returns setof public.eventos
language sql security definer set search_path = public as $$
  update public.eventos e set processando_em = now(), tentativas = e.tentativas + 1
  where e.id in (
    select id from public.eventos
    where not processado and tentativas < 5
      and tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs', 'ia_alerta')
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
  if new.tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs', 'ia_alerta') then
    perform public.chamar_avisos();
  end if;
  return new;
end $$;
