-- Entrevista com o gerente da Caixa: data, modalidade (presencial ou videoconferência) e local/link.
-- Só a equipe agenda (função agendar_entrevista); o corretor e a imobiliária enxergam a data no cliente.
alter table public.clientes add column if not exists entrevista_em timestamptz,
                            add column if not exists entrevista_modalidade text check (entrevista_modalidade in ('presencial', 'video')),
                            add column if not exists entrevista_local text;

create or replace function public.bloquear_entrevista_fora_da_funcao() returns trigger
language plpgsql as $$
begin
  if (new.entrevista_em, new.entrevista_modalidade, new.entrevista_local) is distinct from (old.entrevista_em, old.entrevista_modalidade, old.entrevista_local)
     and coalesce(current_setting('app.entrevista_autorizada', true), '') <> 'sim' then
    raise exception 'A entrevista só pode ser agendada pela equipe da CCA';
  end if;
  return new;
end $$;
drop trigger if exists bloquear_entrevista on public.clientes;
create trigger bloquear_entrevista before update on public.clientes
  for each row execute function public.bloquear_entrevista_fora_da_funcao();

create or replace function public.agendar_entrevista(p_cliente uuid, p_em timestamptz, p_modalidade text, p_local text, p_mensagem text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.sou_equipe() or not public.tenho_permissao('mudar_status') then raise exception 'Sem permissão'; end if;
  select status into v_status from public.clientes where id = p_cliente for update;
  if v_status is null then raise exception 'Cliente não encontrado'; end if;
  if p_em is not null and p_modalidade not in ('presencial', 'video') then raise exception 'Escolha presencial ou videoconferência'; end if;
  perform set_config('app.entrevista_autorizada', 'sim', true);
  update public.clientes set entrevista_em = p_em,
         entrevista_modalidade = case when p_em is null then null else p_modalidade end,
         entrevista_local = case when p_em is null then null else nullif(trim(coalesce(p_local, '')), '') end
   where id = p_cliente;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
    values (auth.uid(), 'agendar_entrevista', p_cliente, jsonb_build_object('em', p_em, 'modalidade', p_modalidade));
  -- reaproveita o aviso de status: o texto da entrevista vai no lugar da mensagem padrão
  if nullif(trim(coalesce(p_mensagem, '')), '') is not null then
    insert into public.eventos (tipo, cliente_id, dados)
      values ('status_mudou', p_cliente, jsonb_build_object('de', v_status, 'para', v_status, 'mensagem', trim(p_mensagem)));
  end if;
end $$;
revoke execute on function public.agendar_entrevista(uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.agendar_entrevista(uuid, timestamptz, text, text, text) to authenticated;
