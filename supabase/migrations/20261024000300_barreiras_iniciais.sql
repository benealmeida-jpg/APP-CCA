-- Barreiras iniciais (consulta do CPF no sistema Caixa Aqui, antes da avaliação de risco):
--   liberado    → sem barreira, segue
--   restricao   → cliente com restrição: processo encerrado
--   outro_cca   → avaliação de risco válida em outro CCA: carta de cancelamento assinada no gov.br; o gerente cancela a anterior e a CCA segue
--   sem_qv      → cliente sem QV (cada cliente tem 2 QV; cada uma vence em 6 meses): processo encerrado
insert into public.status_etapas (codigo, nome, ordem) values ('processo_encerrado', 'Processo encerrado', 15) on conflict (codigo) do nothing;

alter table public.clientes add column if not exists barreira text check (barreira in ('liberado', 'restricao', 'outro_cca', 'sem_qv'));
alter table public.clientes add column if not exists barreira_em timestamptz;
alter table public.clientes add column if not exists barreira_obs text;
alter table public.clientes add column if not exists outro_cca_cancelado_em timestamptz;  -- gerente cancelou a aprovação do outro CCA

create or replace function public.registrar_barreira(p_cliente uuid, p_barreira text, p_ordens integer[] default null, p_obs text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_nome text; v_msg text;
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
    update public.clientes set barreira = p_barreira, barreira_em = now(), barreira_obs = p_obs where id = p_cliente;
    v_msg := case p_barreira
      when 'restricao' then 'Na consulta inicial do CPF no sistema da Caixa, ' || v_nome || ' está com restrição. Com restrição a Caixa não aprova o financiamento, então o processo foi encerrado. Depois de regularizar a restrição, o cliente pode fazer um novo cadastro.'
      else 'Na consulta inicial do CPF no sistema da Caixa, ' || v_nome || ' está sem QV disponível (cada cliente tem 2 QV, e cada uma vence em 6 meses). Sem QV a Caixa não aceita nova avaliação, então o processo foi encerrado. Uma nova tentativa só é possível quando uma QV vencer.' end
      || coalesce(' Observação da CCA: ' || p_obs, '');
    perform public.mudar_status_mensagem(p_cliente, 'processo_encerrado', v_msg);  -- o aviso (push, e-mail e WhatsApp) leva o motivo
  end if;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'barreira_inicial', p_cliente, jsonb_build_object('barreira', p_barreira, 'ordens', p_ordens, 'obs', p_obs));
end $$;
revoke execute on function public.registrar_barreira(uuid, text, integer[], text) from public, anon;
grant execute on function public.registrar_barreira(uuid, text, integer[], text) to authenticated;
