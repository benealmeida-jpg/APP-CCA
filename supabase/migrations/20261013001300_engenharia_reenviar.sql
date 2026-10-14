-- Botão "Enviar para a CCA" também depois do envio: avisa a equipe dos documentos novos (sem repetir em 3 min)
create or replace function public.engenharia_reenviar(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_etapa text;
begin
  if not public.posso_ver_engenharia(p_id) or public.sou_equipe() then raise exception 'Sem permissão'; end if;
  select etapa into v_etapa from public.engenharias where id = p_id;
  if v_etapa is distinct from 'em_analise' then return; end if;
  if exists (select 1 from public.eventos ev where ev.tipo = 'engenharia' and ev.dados->>'fase' = 'doc_adicionado'
             and ev.dados->>'engenharia_id' = p_id::text and ev.criado_em > now() - interval '3 minutes') then return; end if;
  update public.engenharias set atualizado_em = now() where id = p_id;
  insert into public.eventos (tipo, dados) values ('engenharia', jsonb_build_object('fase', 'doc_adicionado', 'engenharia_id', p_id, 'manual', true));
end $$;
revoke execute on function public.engenharia_reenviar(uuid) from public, anon;
grant execute on function public.engenharia_reenviar(uuid) to authenticated;
