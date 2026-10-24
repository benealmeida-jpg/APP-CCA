-- Carta de cancelamento de crédito: na avaliação de risco, a pessoa já tem carta de crédito aprovada em outro CCA.
-- A CCA marca quem precisa (titular e/ou participantes; casado: titular e cônjuge). O documento passa a ser pedido
-- (regra **) só para quem foi marcado; o app preenche a carta no papel timbrado da CCA para assinar no gov.br.
alter table public.clientes add column if not exists credito_outro_cca boolean;
alter table public.participantes add column if not exists credito_outro_cca boolean;  -- nulo/false no participante: não herda do titular

insert into public.tipos_documento (codigo, nome, grupo, regra, condicao, ordem, ativo, por_pessoa, alvo)
values ('CARTA_CANCELAMENTO', 'Carta de cancelamento de crédito (assinada no gov.br)', 'Do cliente', '**', '[{"credito_outro_cca": true}]'::jsonb, 5, true, true, 'comprador')
on conflict (codigo) do nothing;

create or replace function public.marcar_credito_outro_cca(p_cliente uuid, p_ordens integer[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_nomes text;
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  update public.clientes set credito_outro_cca = (1 = any(coalesce(p_ordens, '{}'))) where id = p_cliente;
  update public.participantes set credito_outro_cca = (ordem = any(coalesce(p_ordens, '{}'))) where cliente_id = p_cliente;
  select string_agg(n, ', ') into v_nomes from (
    select nome as n, 1 as o from public.clientes where id = p_cliente and credito_outro_cca
    union all select nome, ordem from public.participantes where cliente_id = p_cliente and credito_outro_cca order by 2) x;
  if v_nomes is not null then
    insert into public.conversa (cliente_id, autor_id, texto) values (p_cliente, auth.uid(),
      'Na avaliação de risco, encontramos carta de crédito aprovada em outro correspondente. Para seguirmos, precisamos da carta de cancelamento assinada no gov.br por: ' || v_nomes ||
      '. O app já preenche a carta: Documentos → Carta de cancelamento de crédito → Como enviar → Preencher a carta.');
  end if;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'credito_outro_cca', p_cliente, jsonb_build_object('ordens', p_ordens));
end $$;
revoke execute on function public.marcar_credito_outro_cca(uuid, integer[]) from public, anon;
grant execute on function public.marcar_credito_outro_cca(uuid, integer[]) to authenticated;
