-- Nova tentativa (gancho de venda): cliente encerrado que pode tentar de novo
--   entrevista reprovada → 180 dias depois
--   sem QV               → quando uma QV vencer (a CCA informa a data; padrão 6 meses)
--   restrição            → sem data: fica na lista "Para retomar" para o corretor decidir quando tentar
-- No dia, o corretor avulso (ou a imobiliária, porque o corretor pode ter saído) recebe o aviso.
alter table public.clientes add column if not exists nova_tentativa_em date;
alter table public.clientes add column if not exists nova_tentativa_avisado_em timestamptz;

-- Gatilho: entrevista reprovada marca a data; processo que volta a andar limpa
create or replace function public.tg_clientes_nova_tentativa() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'entrevista_reprovada' then
      new.nova_tentativa_em := coalesce(new.nova_tentativa_em, current_date + 180);
      new.nova_tentativa_avisado_em := null;
    elsif new.status <> 'processo_encerrado' then
      new.nova_tentativa_em := null;
      new.nova_tentativa_avisado_em := null;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.tg_clientes_nova_tentativa() from public, anon, authenticated;
create or replace trigger clientes_nova_tentativa before update of status on public.clientes
  for each row execute function public.tg_clientes_nova_tentativa();

-- Barreira inicial: sem QV guarda a data em que a QV volta (a informada antes por definir_nova_tentativa ou, sem ela, 6 meses)
create or replace function public.registrar_barreira(p_cliente uuid, p_barreira text, p_ordens integer[] default null, p_obs text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_nome text; v_msg text; v_qv date;
begin
  if not public.sou_equipe() or not public.tenho_permissao('mudar_status') then raise exception 'Sem permissão'; end if;
  if p_barreira not in ('liberado', 'restricao', 'outro_cca', 'sem_qv', 'outro_cca_cancelado') then raise exception 'Opção inválida'; end if;
  select nome into v_nome from public.clientes where id = p_cliente;
  if v_nome is null then raise exception 'Cliente não encontrado'; end if;
  p_obs := nullif(trim(coalesce(p_obs, '')), '');
  if p_barreira = 'outro_cca_cancelado' then
    update public.clientes set outro_cca_cancelado_em = now() where id = p_cliente;
    insert into public.conversa (cliente_id, autor_id, texto) values (p_cliente, auth.uid(),
      'Boa notícia: com a carta de cancelamento, o gerente cancelou a aprovação do outro correspondente. Seguimos com a aprovação de ' || v_nome || '.');
  elsif p_barreira = 'outro_cca' then
    update public.clientes set barreira = 'outro_cca', barreira_em = now(), barreira_obs = p_obs, outro_cca_cancelado_em = null where id = p_cliente;
    perform public.marcar_credito_outro_cca(p_cliente, coalesce(p_ordens, array[1]));
  elsif p_barreira = 'liberado' then
    update public.clientes set barreira = 'liberado', barreira_em = now(), barreira_obs = p_obs where id = p_cliente;
  else
    select case when p_barreira = 'sem_qv' then coalesce(case when nova_tentativa_em > current_date then nova_tentativa_em end, (current_date + interval '6 months')::date) end
      into v_qv from public.clientes where id = p_cliente;
    update public.clientes set barreira = p_barreira, barreira_em = now(), barreira_obs = p_obs,
      nova_tentativa_em = v_qv, nova_tentativa_avisado_em = null where id = p_cliente;
    v_msg := case p_barreira
      when 'restricao' then 'Na consulta inicial do CPF no sistema da Caixa, ' || v_nome || ' está com restrição. Com restrição a Caixa não aprova o financiamento, então o processo foi encerrado. Depois de regularizar a restrição, o cliente pode fazer um novo cadastro.'
      else 'Na consulta inicial do CPF no sistema da Caixa, ' || v_nome || ' está sem QV disponível (cada cliente tem 2 QV, e cada uma vence em 6 meses). Sem QV a Caixa não aceita nova avaliação, então o processo foi encerrado. Uma nova tentativa é possível a partir de ' || to_char(v_qv, 'DD/MM/YYYY') || ', e o app avisa quando chegar a data.' end
      || coalesce(' Observação da CCA: ' || p_obs, '');
    perform public.mudar_status_mensagem(p_cliente, 'processo_encerrado', v_msg);
  end if;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'barreira_inicial', p_cliente, jsonb_build_object('barreira', p_barreira, 'ordens', p_ordens, 'obs', p_obs, 'qv_em', v_qv));
end $$;
revoke execute on function public.registrar_barreira(uuid, text, integer[], text) from public, anon;
grant execute on function public.registrar_barreira(uuid, text, integer[], text) to authenticated;

-- CCA informa ou ajusta a data da nova tentativa (ex.: a data exata em que a QV vence), antes ou depois de encerrar
create or replace function public.definir_nova_tentativa(p_cliente uuid, p_em date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  update public.clientes set nova_tentativa_em = p_em, nova_tentativa_avisado_em = null where id = p_cliente;
end $$;
revoke execute on function public.definir_nova_tentativa(uuid, date) from public, anon;
grant execute on function public.definir_nova_tentativa(uuid, date) to authenticated;

-- Todo dia: quem chegou na data ganha o aviso (uma vez)
create or replace function public.gerar_avisos_nova_tentativa() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; v_qtd int := 0;
begin
  for r in select id, status from public.clientes
           where status in ('entrevista_reprovada', 'processo_encerrado') and nova_tentativa_em is not null
             and nova_tentativa_em <= current_date and nova_tentativa_avisado_em is null loop
    insert into public.eventos (tipo, cliente_id, dados) values ('nova_tentativa', r.id, jsonb_build_object('motivo', r.status));
    update public.clientes set nova_tentativa_avisado_em = now() where id = r.id;
    v_qtd := v_qtd + 1;
  end loop;
  return v_qtd;
end $$;
revoke execute on function public.gerar_avisos_nova_tentativa() from public, anon, authenticated;
select cron.schedule('avisos_nova_tentativa', '15 12 * * *', 'select public.gerar_avisos_nova_tentativa()');

-- Fila de avisos: tipo novo
create or replace function public.tg_eventos_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs', 'ia_alerta',
                  'verificacao', 'engenharia', 'doc_do_cliente', 'entrevista_agendada', 'mo_completo', 'lembrete_assinaturas', 'nova_tentativa') then
    perform public.chamar_avisos();
  end if;
  return new;
end $$;
revoke execute on function public.tg_eventos_aviso() from public, anon, authenticated;
create or replace function public.pegar_eventos_aviso(p_limite integer default 20) returns setof public.eventos
language sql security definer set search_path = public as $$
  update public.eventos e set processando_em = now(), tentativas = e.tentativas + 1
  where e.id in (
    select id from public.eventos
    where not processado and tentativas < 5
      and tipo in ('cliente_enviado', 'status_mudou', 'documento_conferido', 'documento_vendedor_conferido', 'convite', 'conversa', 'lembrete_docs', 'ia_alerta',
                   'verificacao', 'engenharia', 'doc_do_cliente', 'entrevista_agendada', 'mo_completo', 'lembrete_assinaturas', 'nova_tentativa')
      and (processando_em is null or processando_em < now() - interval '2 minutes')
    order by id
    limit p_limite
    for update skip locked)
  returning e.*
$$;
