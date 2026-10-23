-- Busca específica de bens (desconto de 50% no cartório): fluxo completo das GRERJ
-- 1. A CCA gera as GRERJ no site do TJ-RJ (2 por pessoa: escritura e registro) e anexa no app
-- 2. O corretor paga SOMENTE no Bradesco e anexa o comprovante de cada uma
-- 3. O app preenche o requerimento; o requerente assina no gov.br; o corretor (ou a CCA) anexa o assinado
-- 4. A CCA envia tudo ao Cartório Distribuidor de Itaboraí e marca como enviado
-- Acesso só pelas funções abaixo (RLS ligado, sem políticas).

create table if not exists public.grerj_guias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  pessoa_ordem integer not null default 1,
  pessoa_nome text,
  pessoa_cpf text,
  finalidade text not null default 'escritura' check (finalidade in ('escritura', 'registro')),
  numero text,
  valor numeric(12,2),
  guia_path text,
  guia_nome text,
  comprovante_path text,
  comprovante_nome text,
  pago_em date,
  pago_por uuid,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  excluida_em timestamptz            -- exclusão lógica (fica no histórico)
);
create index if not exists grerj_guias_cliente on public.grerj_guias (cliente_id, pessoa_ordem);
alter table public.grerj_guias enable row level security;

alter table public.clientes add column if not exists grerj_requerente jsonb;         -- nome, rg, orgao, cpf, contato
alter table public.clientes add column if not exists grerj_req_path text;            -- requerimento assinado
alter table public.clientes add column if not exists grerj_req_nome text;
alter table public.clientes add column if not exists grerj_req_em timestamptz;
alter table public.clientes add column if not exists grerj_req_assinantes jsonb;
alter table public.clientes add column if not exists grerj_req_digital boolean;
alter table public.clientes add column if not exists grerj_liberado_em timestamptz;  -- CCA avisou o corretor para pagar

-- Mantém os campos antigos (resumo usado nas listas e no Início) em dia com as guias
create or replace function public.grerj_resumir(p_cliente uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_total int; v_pagas int;
begin
  select count(*), count(pago_em) into v_total, v_pagas from public.grerj_guias where excluida_em is null and cliente_id = p_cliente;
  update public.clientes set
    grerj_numero = (select string_agg(numero, ', ' order by pessoa_ordem, finalidade) from public.grerj_guias where excluida_em is null and cliente_id = p_cliente and numero is not null),
    grerj_valor = (select sum(valor) from public.grerj_guias where excluida_em is null and cliente_id = p_cliente),
    grerj_pago_em = case when v_total > 0 and v_total = v_pagas then (select max(pago_em) from public.grerj_guias where excluida_em is null and cliente_id = p_cliente) end
  where id = p_cliente;
end $$;
revoke execute on function public.grerj_resumir(uuid) from public, anon, authenticated;

create or replace function public.grerj_do_cliente(p_cliente uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if not public.posso_ver_cliente(p_cliente) or public.meu_papel() = 'cliente' then raise exception 'Cliente não encontrado'; end if;
  select * into c from public.clientes where id = p_cliente;
  return jsonb_build_object(
    'guias', coalesce((select jsonb_agg(to_jsonb(g) - 'criado_por' - 'pago_por' - 'excluida_em' order by g.pessoa_ordem, g.finalidade, g.criado_em) from public.grerj_guias g where g.excluida_em is null and g.cliente_id = p_cliente), '[]'::jsonb),
    'requerente', c.grerj_requerente,
    'assinado', case when c.grerj_req_path is null then null else jsonb_build_object('path', c.grerj_req_path, 'nome', c.grerj_req_nome, 'em', c.grerj_req_em, 'assinantes', coalesce(c.grerj_req_assinantes, '[]'::jsonb), 'digital', c.grerj_req_digital) end,
    'liberado_em', c.grerj_liberado_em,
    'enviado_em', c.requerimento_enviado_em);
end $$;

-- CCA: cria ou atualiza uma guia
create or replace function public.grerj_salvar_guia(p_cliente uuid, p_id uuid, p_pessoa_ordem integer, p_pessoa_nome text, p_pessoa_cpf text,
  p_finalidade text, p_numero text, p_valor numeric, p_guia_path text, p_guia_nome text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  if not public.sou_equipe() then raise exception 'Só a CCA anexa as GRERJ'; end if;
  if p_guia_path is not null and split_part(p_guia_path, '/', 1) <> p_cliente::text then raise exception 'Arquivo inválido'; end if;
  if v_id is null then
    insert into public.grerj_guias (cliente_id, pessoa_ordem, pessoa_nome, pessoa_cpf, finalidade, numero, valor, guia_path, guia_nome)
    values (p_cliente, coalesce(p_pessoa_ordem, 1), p_pessoa_nome, p_pessoa_cpf, coalesce(p_finalidade, 'escritura'), nullif(trim(p_numero), ''), p_valor, p_guia_path, p_guia_nome)
    returning id into v_id;
  else
    update public.grerj_guias set pessoa_ordem = coalesce(p_pessoa_ordem, pessoa_ordem), pessoa_nome = p_pessoa_nome, pessoa_cpf = p_pessoa_cpf,
      finalidade = coalesce(p_finalidade, finalidade), numero = nullif(trim(p_numero), ''), valor = p_valor,
      guia_path = coalesce(p_guia_path, guia_path), guia_nome = coalesce(p_guia_nome, guia_nome)
    where id = v_id and cliente_id = p_cliente;
  end if;
  perform public.grerj_resumir(p_cliente);
  return v_id;
end $$;

create or replace function public.grerj_excluir_guia(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_cli uuid;
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  update public.grerj_guias set excluida_em = now() where id = p_id returning cliente_id into v_cli;
  if v_cli is not null then perform public.grerj_resumir(v_cli); end if;
end $$;

-- CCA: avisa o corretor que as guias estão prontas para pagar
create or replace function public.grerj_liberar(p_cliente uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  select count(*) into v_n from public.grerj_guias where excluida_em is null and cliente_id = p_cliente;
  if v_n = 0 then raise exception 'Anexe as GRERJ antes de avisar o corretor'; end if;
  update public.clientes set grerj_liberado_em = now() where id = p_cliente;
  insert into public.conversa (cliente_id, autor_id, texto) values (p_cliente, auth.uid(),
    'As ' || v_n || ' GRERJ da busca de bens (desconto de 50% no cartório) já estão no app, no quadro "Busca de bens". Pague SOMENTE no Bradesco (app, internet banking ou agência) e anexe o comprovante de cada uma.');
end $$;

-- Corretor, gestor ou CCA: anexa o comprovante de pagamento de uma guia
create or replace function public.grerj_comprovante(p_id uuid, p_path text, p_nome text, p_pago_em date) returns void
language plpgsql security definer set search_path = public as $$
declare v_cli uuid; v_falta int;
begin
  select cliente_id into v_cli from public.grerj_guias where id = p_id and excluida_em is null;
  if v_cli is null or not public.posso_editar_cliente(v_cli) then raise exception 'Sem permissão'; end if;
  if p_path is not null and split_part(p_path, '/', 1) <> v_cli::text then raise exception 'Arquivo inválido'; end if;
  update public.grerj_guias set comprovante_path = p_path, comprovante_nome = p_nome, pago_em = case when p_path is null then null else coalesce(p_pago_em, current_date) end, pago_por = auth.uid()
   where id = p_id;
  perform public.grerj_resumir(v_cli);
  select count(*) into v_falta from public.grerj_guias where excluida_em is null and cliente_id = v_cli and pago_em is null;
  if p_path is not null and v_falta = 0 and not public.sou_equipe() then
    insert into public.conversa (cliente_id, autor_id, texto) values (v_cli, auth.uid(), 'Paguei todas as GRERJ no Bradesco e anexei os comprovantes. Agora vou colher a assinatura do requerimento.');
  end if;
end $$;

-- Dados do requerente (quem assina o requerimento): CCA, corretor ou gestor
create or replace function public.grerj_salvar_requerente(p_cliente uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_editar_cliente(p_cliente) then raise exception 'Sem permissão'; end if;
  update public.clientes set grerj_requerente = jsonb_build_object('nome', p_dados->>'nome', 'rg', p_dados->>'rg', 'orgao', p_dados->>'orgao',
    'cpf', regexp_replace(coalesce(p_dados->>'cpf', ''), '\D', '', 'g'), 'contato', p_dados->>'contato') where id = p_cliente;
end $$;

-- Requerimento assinado no gov.br
create or replace function public.grerj_requerimento_assinado(p_cliente uuid, p_path text, p_nome text, p_assinantes jsonb, p_digital boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_editar_cliente(p_cliente) then raise exception 'Sem permissão'; end if;
  if p_path is not null and split_part(p_path, '/', 1) <> p_cliente::text then raise exception 'Arquivo inválido'; end if;
  update public.clientes set grerj_req_path = p_path, grerj_req_nome = p_nome, grerj_req_em = case when p_path is null then null else now() end,
    grerj_req_assinantes = coalesce(p_assinantes, '[]'::jsonb), grerj_req_digital = p_digital where id = p_cliente;
  if p_path is not null and not public.sou_equipe() then
    insert into public.conversa (cliente_id, autor_id, texto) values (p_cliente, auth.uid(),
      'Anexei o requerimento da busca de bens assinado' || case when p_digital is false then ' (sem assinatura digital)' else ' no gov.br' end || '. Já pode enviar ao cartório.');
  end if;
end $$;

-- CCA: enviou ao Cartório Distribuidor (ou desfaz)
create or replace function public.grerj_marcar_enviado(p_cliente uuid, p_em date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  update public.clientes set requerimento_enviado_em = p_em where id = p_cliente;
  if p_em is not null then
    insert into public.conversa (cliente_id, autor_id, texto) values (p_cliente, auth.uid(),
      'Enviamos as GRERJ e o requerimento ao Cartório Distribuidor de Itaboraí. Quando as certidões de busca saírem, anexamos no processo.');
  end if;
end $$;

do $$ declare f text; begin
  foreach f in array array['grerj_do_cliente(uuid)', 'grerj_salvar_guia(uuid, uuid, integer, text, text, text, text, numeric, text, text)', 'grerj_excluir_guia(uuid)',
    'grerj_liberar(uuid)', 'grerj_comprovante(uuid, text, text, date)', 'grerj_salvar_requerente(uuid, jsonb)',
    'grerj_requerimento_assinado(uuid, text, text, jsonb, boolean)', 'grerj_marcar_enviado(uuid, date)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
