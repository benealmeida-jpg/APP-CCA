-- Cliente (com acesso ao portal) enviou documento: avisa o corretor e/ou a imobiliária (conforme "avisos para").
-- Rajada: um aviso a cada 10 minutos por cliente (quem envia vários documentos de uma vez recebe um aviso só).
create or replace function public.tg_documento_do_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.perfis p where p.id = auth.uid() and p.papel = 'cliente') then return new; end if;
  if exists (select 1 from public.clientes c where c.id = new.cliente_id and c.rascunho) then return new; end if;
  if exists (select 1 from public.eventos ev where ev.tipo = 'doc_do_cliente' and ev.cliente_id = new.cliente_id
             and ev.criado_em > now() - interval '10 minutes') then return new; end if;
  insert into public.eventos (tipo, cliente_id, documento_id, dados)
    values ('doc_do_cliente', new.cliente_id, new.id, jsonb_build_object('tipo_codigo', new.tipo_codigo));
  return new;
end $$;
create or replace trigger documentos_do_cliente after insert on public.documentos for each row execute function public.tg_documento_do_cliente();

create or replace function public.pegar_eventos_aviso(p_limite int default 20)
returns setof public.eventos
language sql security definer set search_path = public as $$
  update public.eventos e set processando_em = now(), tentativas = e.tentativas + 1
  where e.id in (
    select id from public.eventos
    where not processado and tentativas < 5
      and tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs', 'ia_alerta', 'verificacao', 'engenharia', 'doc_do_cliente')
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
  if new.tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs', 'ia_alerta', 'verificacao', 'engenharia', 'doc_do_cliente') then
    perform public.chamar_avisos();
  end if;
  return new;
end $$;
