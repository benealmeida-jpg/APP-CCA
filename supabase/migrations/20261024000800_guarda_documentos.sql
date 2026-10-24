-- Guarda dos documentos dos clientes (LGPD): ficam arquivados por N anos (padrão 5) depois do fim do processo
-- (crédito liberado, entrevista reprovada ou processo encerrado) e então os ARQUIVOS são apagados, com registro.
-- Fica o registro mínimo: a lista de documentos (tipo, nome do arquivo, quem enviou, quando, quem conferiu).
-- Documentos de vendedores, imóveis e corretores não entram. Alerta à equipe 7 dias antes e quando o
-- armazenamento passar de 80% do plano (para aumentar o espaço, nunca apagar antes do prazo).
insert into public.parametros (chave, valor) values ('anos_guarda_documentos', '5'), ('limite_armazenamento_gb', '1')
on conflict (chave) do nothing;
alter table public.clientes add column if not exists documentos_apagados_em timestamptz;

-- Quando cada processo terminou e quando os arquivos serão apagados
create or replace function public.guarda_documentos_lista(p_dias integer default 0)
returns table (cliente_id uuid, nome text, status text, fim timestamptz, apagar_em timestamptz)
language sql stable security definer set search_path = public as $$
  with par as (select greatest(coalesce(nullif(valor, '')::int, 5), 1) as anos from public.parametros where chave = 'anos_guarda_documentos'),
  fim as (
    select c.id, c.nome, c.status,
      coalesce((select max(h.em) from public.historico_status h where h.cliente_id = c.id and h.para = c.status), c.atualizado_em) as fim
    from public.clientes c
    where c.status in ('credito_liberado', 'entrevista_reprovada', 'processo_encerrado') and c.documentos_apagados_em is null)
  select f.id, f.nome, f.status, f.fim, f.fim + make_interval(years => (select anos from par))
  from fim f
  where f.fim + make_interval(years => (select anos from par)) <= now() + make_interval(days => greatest(p_dias, 0))
    and (public.sou_equipe() or coalesce(auth.role(), '') = 'service_role')
  order by 5
$$;
revoke execute on function public.guarda_documentos_lista(integer) from public, anon;
grant execute on function public.guarda_documentos_lista(integer) to authenticated, service_role;

-- Arquivos de um cliente no armazenamento (para a função de limpeza apagar pela API)
create or replace function public.guarda_arquivos_do_cliente(p_cliente uuid) returns setof text
language sql stable security definer set search_path = public, storage as $$
  select o.name from storage.objects o where o.bucket_id = 'documentos' and o.name like p_cliente::text || '/%'
    and coalesce(auth.role(), '') = 'service_role'
$$;
revoke execute on function public.guarda_arquivos_do_cliente(uuid) from public, anon, authenticated;
grant execute on function public.guarda_arquivos_do_cliente(uuid) to service_role;

create or replace function public.guarda_marcar_apagados(p_cliente uuid, p_qtd integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Sem permissão'; end if;
  update public.clientes set documentos_apagados_em = now() where id = p_cliente;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
  values (null, 'documentos_apagados', p_cliente, jsonb_build_object('arquivos', p_qtd, 'motivo', 'prazo de guarda (LGPD)'));
end $$;
revoke execute on function public.guarda_marcar_apagados(uuid, integer) from public, anon, authenticated;
grant execute on function public.guarda_marcar_apagados(uuid, integer) to service_role;

-- Resumo para o Início da equipe: o que será apagado nos próximos 7 dias e o uso do armazenamento
create or replace function public.guarda_documentos_resumo() returns jsonb
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  return jsonb_build_object(
    'anos', (select valor from public.parametros where chave = 'anos_guarda_documentos'),
    'limite_gb', (select valor from public.parametros where chave = 'limite_armazenamento_gb'),
    'bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects)
             + pg_database_size(current_database()),
    'proximos', coalesce((select jsonb_agg(jsonb_build_object('id', l.cliente_id, 'nome', l.nome, 'apagar_em', l.apagar_em) order by l.apagar_em)
                          from public.guarda_documentos_lista(7) l), '[]'::jsonb));
end $$;
revoke execute on function public.guarda_documentos_resumo() from public, anon;
grant execute on function public.guarda_documentos_resumo() to authenticated;

-- Todo dia chama a função de limpeza (mesmo segredo interno dos avisos)
create or replace function public.chamar_guarda_documentos() returns void
language plpgsql security definer set search_path = public as $$
declare v_seg text;
begin
  select valor into v_seg from public.integracoes where chave = 'segredo_interno';
  perform net.http_post(
    url := 'https://gfyvbqbllvjynqssrozu.supabase.co/functions/v1/guarda-documentos',
    body := '{"acao":"limpar"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', v_seg));
exception when others then null;
end $$;
revoke execute on function public.chamar_guarda_documentos() from public, anon, authenticated;
select cron.schedule('guarda_documentos', '30 6 * * *', 'select public.chamar_guarda_documentos()');
