-- Edição de imobiliárias (com dados da Receita) e mensagem de status editável pela equipe

-- 1) Imobiliária: dados da Receita Federal
alter table public.imobiliarias
  add column if not exists razao_social text,
  add column if not exists nome_fantasia text,
  add column if not exists situacao_cadastral text,
  add column if not exists cep text,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists municipio text,
  add column if not exists uf text,
  add column if not exists telefone text,
  add column if not exists email text,
  add column if not exists cnpj_consultado_em timestamptz;

-- 2) Mudar status com a mensagem editada pela equipe (vai no evento; o envio usa esse texto)
create or replace function public.mudar_status_mensagem(p_cliente uuid, p_status text, p_mensagem text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_de text;
begin
  if not public.sou_equipe() or not public.tenho_permissao('mudar_status') then raise exception 'Sem permissão para mudar status'; end if;
  select status into v_de from public.clientes where id = p_cliente for update;
  if v_de is null then raise exception 'Cliente não encontrado'; end if;
  perform set_config('app.mudanca_status_autorizada', 'sim', true);
  update public.clientes set status = p_status where id = p_cliente;
  insert into public.historico_status (cliente_id, de, para, por) values (p_cliente, v_de, p_status, auth.uid());
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
    values (auth.uid(), 'mudar_status', p_cliente, jsonb_build_object('de', v_de, 'para', p_status, 'mensagem_editada', nullif(trim(coalesce(p_mensagem, '')), '') is not null));
  insert into public.eventos (tipo, cliente_id, dados)
    values ('status_mudou', p_cliente, jsonb_build_object('de', v_de, 'para', p_status, 'mensagem', nullif(trim(coalesce(p_mensagem, '')), '')));
end $$;

revoke execute on function public.mudar_status_mensagem(uuid, text, text) from public, anon;
grant execute on function public.mudar_status_mensagem(uuid, text, text) to authenticated;
