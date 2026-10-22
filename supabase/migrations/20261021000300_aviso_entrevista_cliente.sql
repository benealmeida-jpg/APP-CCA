-- Entrevista agendada pela CCA: avisa o cliente (data, hora, gerente, agência, endereço) e o corretor/imobiliária
create or replace function public.agendar_entrevista(p_cliente uuid, p_em timestamptz, p_modalidade text, p_local text, p_mensagem text, p_agencia text, p_gerente text, p_endereco text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_status text; v_novo text;
begin
  if not public.sou_equipe() or not public.tenho_permissao('mudar_status') then raise exception 'Sem permissão'; end if;
  select status into v_status from public.clientes where id = p_cliente for update;
  if v_status is null then raise exception 'Cliente não encontrado'; end if;
  if p_em is not null and p_modalidade not in ('presencial', 'video') then raise exception 'Escolha presencial ou videoconferência'; end if;
  -- Agendar leva o processo para a etapa Entrevista; cancelar (sem resultado) volta para Cliente Aprovado
  v_novo := case when p_em is not null and v_status = 'cliente_aprovado' then 'entrevista'
                 when p_em is null and v_status = 'entrevista' then 'cliente_aprovado'
                 else v_status end;
  perform set_config('app.entrevista_autorizada', 'sim', true);
  perform set_config('app.mudanca_status_autorizada', 'sim', true);
  update public.clientes set entrevista_em = p_em, status = v_novo,
         entrevista_modalidade = case when p_em is null then null else p_modalidade end,
         entrevista_local = case when p_em is null then null else nullif(trim(coalesce(p_local, '')), '') end,
         entrevista_agencia = case when p_em is null then null else nullif(trim(coalesce(p_agencia, '')), '') end,
         entrevista_gerente = case when p_em is null then null else nullif(trim(coalesce(p_gerente, '')), '') end,
         entrevista_endereco = case when p_em is null then null else nullif(trim(coalesce(p_endereco, '')), '') end
   where id = p_cliente;
  if v_novo <> v_status then
    insert into public.historico_status (cliente_id, de, para, por) values (p_cliente, v_status, v_novo, auth.uid());
  end if;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
    values (auth.uid(), 'agendar_entrevista', p_cliente, jsonb_build_object('em', p_em, 'modalidade', p_modalidade, 'agencia', p_agencia));
  if p_em is not null then
    insert into public.eventos (tipo, cliente_id, dados) values ('entrevista_agendada', p_cliente, jsonb_build_object('em', p_em));
  end if;
  if nullif(trim(coalesce(p_mensagem, '')), '') is not null then
    insert into public.eventos (tipo, cliente_id, dados)
      values ('status_mudou', p_cliente, jsonb_build_object('de', v_status, 'para', v_novo, 'mensagem', trim(p_mensagem)));
  end if;
end $$;

create or replace function public.pegar_eventos_aviso(p_limite int default 20)
returns setof public.eventos
language sql security definer set search_path = public as $$
  update public.eventos e set processando_em = now(), tentativas = e.tentativas + 1
  where e.id in (
    select id from public.eventos
    where not processado and tentativas < 5
      and tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs', 'ia_alerta', 'verificacao', 'engenharia', 'doc_do_cliente', 'entrevista_agendada')
      and (processando_em is null or processando_em < now() - interval '2 minutes')
    order by id
    limit p_limite
    for update skip locked)
  returning e.*
$$;

create or replace function public.tg_eventos_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs', 'ia_alerta', 'verificacao', 'engenharia', 'doc_do_cliente', 'entrevista_agendada') then
    perform public.chamar_avisos();
  end if;
  return new;
end $$;
