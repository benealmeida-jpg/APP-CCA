-- Fila de avisos: a função "avisos" pega os eventos pendentes sem repetir (dois disparos ao mesmo tempo não duplicam)
alter table public.eventos add column if not exists processando_em timestamptz;

create or replace function public.pegar_eventos_aviso(p_limite int default 20)
returns setof public.eventos
language sql security definer set search_path = public as $$
  update public.eventos e set processando_em = now(), tentativas = e.tentativas + 1
  where e.id in (
    select id from public.eventos
    where not processado and tentativas < 5
      and tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite')
      and (processando_em is null or processando_em < now() - interval '2 minutes')
    order by id
    limit p_limite
    for update skip locked)
  returning e.*
$$;
revoke execute on function public.pegar_eventos_aviso(int) from public, anon, authenticated;
