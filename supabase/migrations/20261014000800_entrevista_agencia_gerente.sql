-- Entrevista: agência da Caixa, nome do gerente e endereço (além de data, modalidade e link).
-- Aplicada em partes pelo MCP (colunas, gatilho, função de agendar, função de regra do documento).
alter table public.clientes add column if not exists entrevista_agencia text,
                            add column if not exists entrevista_gerente text,
                            add column if not exists entrevista_endereco text;

create or replace function public.bloquear_entrevista_fora_da_funcao() returns trigger
language plpgsql as $$
begin
  if (new.entrevista_em, new.entrevista_modalidade, new.entrevista_local, new.entrevista_agencia, new.entrevista_gerente, new.entrevista_endereco)
     is distinct from (old.entrevista_em, old.entrevista_modalidade, old.entrevista_local, old.entrevista_agencia, old.entrevista_gerente, old.entrevista_endereco)
     and coalesce(current_setting('app.entrevista_autorizada', true), '') <> 'sim' then
    raise exception 'A entrevista só pode ser agendada pela equipe da CCA';
  end if;
  return new;
end $$;

create or replace function public.agendar_entrevista(p_cliente uuid, p_em timestamptz, p_modalidade text, p_local text, p_mensagem text,
                                                      p_agencia text, p_gerente text, p_endereco text)
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
         entrevista_local = case when p_em is null then null else nullif(trim(coalesce(p_local, '')), '') end,
         entrevista_agencia = case when p_em is null then null else nullif(trim(coalesce(p_agencia, '')), '') end,
         entrevista_gerente = case when p_em is null then null else nullif(trim(coalesce(p_gerente, '')), '') end,
         entrevista_endereco = case when p_em is null then null else nullif(trim(coalesce(p_endereco, '')), '') end
   where id = p_cliente;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
    values (auth.uid(), 'agendar_entrevista', p_cliente, jsonb_build_object('em', p_em, 'modalidade', p_modalidade, 'agencia', p_agencia));
  if nullif(trim(coalesce(p_mensagem, '')), '') is not null then
    insert into public.eventos (tipo, cliente_id, dados)
      values ('status_mudou', p_cliente, jsonb_build_object('de', v_status, 'para', v_status, 'mensagem', trim(p_mensagem)));
  end if;
end $$;
revoke execute on function public.agendar_entrevista(uuid, timestamptz, text, text, text, text, text, text) from public, anon;
grant execute on function public.agendar_entrevista(uuid, timestamptz, text, text, text, text, text, text) to authenticated;

-- ADM escolhe quantos asteriscos o documento tem: '' (nenhum), '*' (pode vir depois) ou '**' (bloqueia a análise)
create or replace function public.admin_definir_regra_documento(p_codigo text, p_regra text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores'; end if;
  if p_regra not in ('', '*', '**') then raise exception 'Regra inválida'; end if;
  update public.tipos_documento set regra = p_regra where codigo = p_codigo;
  if not found then raise exception 'Documento não encontrado'; end if;
  insert into public.acessos_log (usuario_id, acao, detalhes)
    values (auth.uid(), 'alterar_regra_documento', jsonb_build_object('codigo', p_codigo, 'regra', p_regra));
end $$;
revoke execute on function public.admin_definir_regra_documento(text, text) from public, anon;
grant execute on function public.admin_definir_regra_documento(text, text) to authenticated;
