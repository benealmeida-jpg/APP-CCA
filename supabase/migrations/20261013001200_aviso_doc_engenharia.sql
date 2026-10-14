-- Avisa a equipe quando o corretor junta documento à engenharia depois de enviar o pedido (uma vez por rajada de 3 min)
create or replace function public.tg_engenharia_doc_novo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_etapa text;
begin
  select etapa into v_etapa from public.engenharias where id = new.engenharia_id;
  if v_etapa is null or v_etapa = 'documentacao' or new.tipo in ('BOLETO', 'COMPROVANTE') then return new; end if;
  if exists (select 1 from public.perfis p where p.id = new.enviado_por and p.papel in ('equipe_cca', 'admin')) then return new; end if;
  if exists (select 1 from public.eventos ev where ev.tipo = 'engenharia' and ev.dados->>'fase' = 'doc_adicionado'
             and ev.dados->>'engenharia_id' = new.engenharia_id::text and ev.criado_em > now() - interval '3 minutes') then return new; end if;
  insert into public.eventos (tipo, dados) values ('engenharia', jsonb_build_object('fase', 'doc_adicionado', 'engenharia_id', new.engenharia_id));
  return new;
end $$;
create trigger engenharia_doc_novo after insert on public.engenharia_docs for each row execute function public.tg_engenharia_doc_novo();
