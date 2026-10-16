-- =====================================================================
-- MODELO 2 · parte 2: cadastro do imóvel, engenharia nova, consumidores finais,
-- simulação obrigatória e forma de assinatura do contrato
-- =====================================================================

-- ---------- 1. Imóvel: pertence ao vendedor; guarda documentos e engenharias ----------
create table if not exists public.imoveis (
  id              uuid primary key default gen_random_uuid(),
  vendedor_id     uuid not null references public.vendedores (id),
  endereco        text,
  cidade          text,
  uf              text,
  matricula       text,
  cartorio_rgi    text,
  tipo            text,
  criado_por      uuid references public.perfis (id),
  imobiliaria_id  uuid references public.imobiliarias (id),
  corretor_id     uuid references public.perfis (id),      -- corretor responsável (opcional)
  consumidor_id   uuid references public.perfis (id),      -- consumidor final comprador (opcional)
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists imoveis_vendedor on public.imoveis (vendedor_id);
alter table public.imoveis enable row level security;   -- só pelas funções abaixo

create table if not exists public.imovel_docs (
  id              uuid primary key default gen_random_uuid(),
  imovel_id       uuid not null references public.imoveis (id) on delete cascade,
  tipo            text not null,
  nome_original   text,
  arquivo_path    text not null,
  mime            text,
  tamanho_bytes   bigint,
  enviado_por     uuid references public.perfis (id),
  enviado_em      timestamptz not null default now(),
  situacao        text not null default 'em_conferencia' check (situacao in ('em_conferencia', 'aceito', 'recusado')),
  conferido_por   uuid references public.perfis (id),
  conferido_em    timestamptz,
  emitido_em      date,
  origem          text not null default 'imovel' check (origem in ('imovel', 'engenharia', 'processo'))
);
create index if not exists imovel_docs_imovel on public.imovel_docs (imovel_id, tipo, enviado_em);
alter table public.imovel_docs enable row level security;

alter table public.clientes add column if not exists imovel_id uuid references public.imoveis (id) on delete set null;
alter table public.clientes add column if not exists assinatura_contrato text check (assinatura_contrato in ('nato_digital', 'manual'));

alter table public.engenharias add column if not exists imovel_id uuid references public.imoveis (id);
alter table public.engenharias add column if not exists valor_desejado numeric(14, 2);
alter table public.engenharias add column if not exists acompanhante_tipo text check (acompanhante_tipo in ('vendedor', 'corretor', 'comprador', 'outro'));
alter table public.engenharias add column if not exists acompanhante_cliente_id uuid references public.clientes (id) on delete set null;
alter table public.engenharias add column if not exists acompanhante_nome text;
alter table public.engenharias add column if not exists acompanhante_telefone text;
alter table public.engenharias add column if not exists acompanhante_email text;
alter table public.engenharias add column if not exists pela_cca boolean not null default false;          -- a CCA faz tudo (cliente direto)
alter table public.engenharias add column if not exists pedido_por_cca_id uuid references public.perfis (id); -- a CCA pediu em nome do corretor
alter table public.engenharias drop constraint if exists engenharias_tipo_check;
alter table public.engenharias add constraint engenharias_tipo_check check (tipo in ('novo_fgts', 'novo_sbpe', 'usado', 'atc', 'ctp', 'leilao', 'to', 'terreno'));

-- Documentos que ficam no cadastro do imóvel (os de pagamento e pendência ficam no pedido de engenharia)
create or replace function public.eh_doc_imovel(p_tipo text) returns boolean
language sql immutable as $$
  select p_tipo in ('ART', 'SINTESE', 'MATRICULA', 'IPTU', 'ALVARA', 'HABITESE', 'PROJETO', 'CNO_SCPO', 'CREA_CAU', 'PCI', 'ARREMATACAO')
$$;
-- Documento do imóvel -> documento do processo do cliente (grupo Imóvel)
create or replace function public.doc_imovel_para_cliente(p_tipo text) returns text
language sql immutable as $$
  select case p_tipo when 'MATRICULA' then 'MATRICULA' when 'IPTU' then 'ESPELHO_IPTU' when 'HABITESE' then 'IMOVEL_HABITESE'
                     when 'CREA_CAU' then 'IMOVEL_CREA_CAU' when 'CNO_SCPO' then 'IMOVEL_SCPO' end
$$;
create or replace function public.doc_cliente_para_imovel(p_tipo text) returns text
language sql immutable as $$
  select case p_tipo when 'MATRICULA' then 'MATRICULA' when 'ESPELHO_IPTU' then 'IPTU' when 'IMOVEL_HABITESE' then 'HABITESE'
                     when 'IMOVEL_CREA_CAU' then 'CREA_CAU' when 'IMOVEL_SCPO' then 'CNO_SCPO' end
$$;
create or replace function public.servico_engenharia(p_tipo text) returns text
language sql immutable as $$
  select case p_tipo when 'atc' then 'B438 - F30 - P173 - Análise Aquisição Terr e Const'
                     when 'ctp' then 'B437 - F30 - P172 - Análise Const Terreno Próprio'
                     when 'to' then 'Confirmar o serviço no SIOPI' when 'terreno' then 'Confirmar o serviço no SIOPI'
                     else 'A413 - F30 - P171 - Avaliação Finan. Habitacional' end
$$;

-- Quem vê o imóvel: a CCA; quem cadastrou; corretor e consumidor ligados; a imobiliária dele; quem tem engenharia ou processo dele
create or replace function public.posso_ver_imovel(p_imovel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.imoveis im where im.id = p_imovel and (
    public.sou_equipe()
    or auth.uid() in (im.criado_por, im.corretor_id, im.consumidor_id)
    or (im.imobiliaria_id is not null and im.imobiliaria_id = public.minha_imobiliaria())
    or exists (select 1 from public.engenharias e where e.imovel_id = im.id and e.excluida_em is null and public.posso_ver_engenharia(e.id))
    or exists (select 1 from public.clientes c where c.imovel_id = im.id and public.posso_ver_cliente(c.id))))
$$;

do $$ begin
  insert into storage.buckets (id, name, public) values ('imoveis', 'imoveis', false) on conflict (id) do nothing;
exception when others then null; end $$;
do $$ begin
  create policy imoveis_enviar on storage.objects for insert to authenticated
    with check (bucket_id = 'imoveis' and public.posso_ver_imovel(((storage.foldername(name))[1])::uuid));
  create policy imoveis_ler on storage.objects for select to authenticated
    using (bucket_id = 'imoveis' and public.posso_ver_imovel(((storage.foldername(name))[1])::uuid));
exception when duplicate_object then null; end $$;

-- Resumo do imóvel (a lista e a ficha)
create or replace function public.resumo_imovel(p_imovel uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(im) || jsonb_build_object(
    'vendedor_nome', coalesce(v.nome, '—'), 'vendedor_doc', v.cpf_cnpj, 'vendedor_tipo', v.tipo,
    'corretor_nome', (select p.nome from public.perfis p where p.id = im.corretor_id),
    'consumidor_nome', (select p.nome from public.perfis p where p.id = im.consumidor_id),
    'docs', coalesce((select jsonb_agg(to_jsonb(d) order by d.enviado_em) from public.imovel_docs d where d.imovel_id = im.id), '[]'::jsonb),
    'engenharias', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'etapa', e.etapa, 'laudo_aprovado', e.laudo_aprovado, 'avaliacao_valor', e.avaliacao_valor,
                     'avaliacao_data', e.avaliacao_data, 'criado_em', e.criado_em, 'atualizado_em', e.atualizado_em, 'valor_desejado', e.valor_desejado) order by e.criado_em)
                   from public.engenharias e where e.imovel_id = im.id and e.excluida_em is null), '[]'::jsonb),
    'clientes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'status', c.status, 'corretor_id', c.corretor_id) order by c.criado_em)
                   from public.clientes c where c.imovel_id = im.id and public.posso_ver_cliente(c.id)), '[]'::jsonb))
  from public.imoveis im left join public.vendedores v on v.id = im.vendedor_id
  where im.id = p_imovel
$$;

-- Lista: os imóveis que a pessoa vê; com vendedor, todos os imóveis daquele vendedor (para escolher na engenharia)
create or replace function public.listar_imoveis(p_vendedor uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.resumo_imovel(im.id) order by im.atualizado_em desc), '[]'::jsonb)
  from public.imoveis im
  where public.meu_papel() is not null and public.meu_papel() <> 'cliente'
    and ((p_vendedor is not null and im.vendedor_id = p_vendedor) or (p_vendedor is null and public.posso_ver_imovel(im.id)))
$$;

create or replace function public.obter_imovel(p_imovel uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.posso_ver_imovel(p_imovel) then raise exception 'Imóvel não encontrado'; end if;
  return public.resumo_imovel(p_imovel) || jsonb_build_object('vendedor',
    (select jsonb_build_object('id', v.id, 'nome', v.nome, 'tipo', v.tipo, 'cpf_cnpj', v.cpf_cnpj, 'telefone', v.telefone, 'email', v.email, 'responsavel_nome', v.responsavel_nome)
     from public.imoveis im join public.vendedores v on v.id = im.vendedor_id where im.id = p_imovel));
end $$;

-- Liga o corretor responsável e o consumidor final ao imóvel (só a CCA)
create or replace function public.ligar_pessoas_imovel(p_imovel uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_cor record;
begin
  if p ? 'corretor_id' then
    if nullif(p->>'corretor_id', '') is not null then
      select * into v_cor from public.perfis where id = (p->>'corretor_id')::uuid and papel in ('corretor', 'gestor_imobiliaria') and not consumidor;
      if v_cor.id is null then raise exception 'Corretor não encontrado'; end if;
      update public.imoveis set corretor_id = v_cor.id, imobiliaria_id = v_cor.imobiliaria_id where id = p_imovel;
    else
      update public.imoveis set corretor_id = null where id = p_imovel;
    end if;
  end if;
  if p ? 'consumidor_id' then
    if nullif(p->>'consumidor_id', '') is not null and not exists (select 1 from public.perfis where id = (p->>'consumidor_id')::uuid and consumidor) then
      raise exception 'Consumidor final não encontrado';
    end if;
    update public.imoveis set consumidor_id = nullif(p->>'consumidor_id', '')::uuid where id = p_imovel;
  end if;
end $$;

-- Cria ou edita o imóvel
create or replace function public.salvar_imovel(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_end text := nullif(btrim(coalesce(p->>'endereco', '')), '');
begin
  if public.meu_papel() is null or public.meu_papel() = 'cliente' then raise exception 'Sem permissão'; end if;
  if v_end is null then raise exception 'Informe o endereço do imóvel'; end if;
  if coalesce(p->>'uf', '') = '' or coalesce(p->>'cidade', '') = '' then raise exception 'Escolha a UF e o município do imóvel'; end if;
  if v_id is not null then
    if not public.posso_ver_imovel(v_id) then raise exception 'Imóvel não encontrado'; end if;
    update public.imoveis set endereco = v_end, cidade = p->>'cidade', uf = upper(p->>'uf'), matricula = nullif(btrim(coalesce(p->>'matricula', '')), ''),
      cartorio_rgi = nullif(btrim(coalesce(p->>'cartorio_rgi', '')), ''), atualizado_em = now() where id = v_id;
    if public.sou_equipe() then perform public.ligar_pessoas_imovel(v_id, p); end if;
    update public.engenharias e set imovel_endereco = im.endereco, imovel_cidade = im.cidade, imovel_uf = im.uf, matricula = im.matricula, cartorio_rgi = im.cartorio_rgi
      from public.imoveis im where im.id = v_id and e.imovel_id = v_id;
    insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'imovel_editado', jsonb_build_object('imovel', v_id));
    return v_id;
  end if;
  if nullif(p->>'vendedor_id', '') is null then raise exception 'Escolha o vendedor do imóvel'; end if;
  if not exists (select 1 from public.vendedores where id = (p->>'vendedor_id')::uuid) then raise exception 'Vendedor não encontrado'; end if;
  insert into public.imoveis (vendedor_id, endereco, cidade, uf, matricula, cartorio_rgi, tipo, criado_por, imobiliaria_id)
  values ((p->>'vendedor_id')::uuid, v_end, p->>'cidade', upper(p->>'uf'), nullif(btrim(coalesce(p->>'matricula', '')), ''), nullif(btrim(coalesce(p->>'cartorio_rgi', '')), ''),
          nullif(p->>'tipo', ''), auth.uid(), public.minha_imobiliaria())
  returning id into v_id;
  if public.sou_equipe() then perform public.ligar_pessoas_imovel(v_id, p); end if;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'imovel_criado', jsonb_build_object('imovel', v_id));
  return v_id;
end $$;

-- Documento enviado ao imóvel (pela ficha, pela engenharia ou pelo processo do cliente)
create or replace function public.registrar_doc_imovel(p_imovel uuid, p_tipo text, p_path text, p_nome text, p_mime text, p_tamanho bigint,
  p_origem text default 'imovel', p_engenharia uuid default null, p_emitido date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.imovel_docs; v_etapa text;
begin
  if not public.posso_ver_imovel(p_imovel) then raise exception 'Imóvel não encontrado'; end if;
  if not public.eh_doc_imovel(p_tipo) then raise exception 'Documento inválido'; end if;
  insert into public.imovel_docs (imovel_id, tipo, nome_original, arquivo_path, mime, tamanho_bytes, enviado_por, emitido_em, origem)
  values (p_imovel, p_tipo, p_nome, p_path, p_mime, p_tamanho, auth.uid(), p_emitido, coalesce(p_origem, 'imovel')) returning * into d;
  update public.imoveis set atualizado_em = now() where id = p_imovel;
  if p_engenharia is not null and public.posso_ver_engenharia(p_engenharia) then
    select etapa into v_etapa from public.engenharias where id = p_engenharia and imovel_id = p_imovel;
    if v_etapa is not null and v_etapa <> 'documentacao' and not public.sou_equipe() then
      update public.engenharias set docs_novos = true, atualizado_em = now() where id = p_engenharia;
      insert into public.eventos (tipo, dados) values ('engenharia', jsonb_build_object('fase', 'doc_adicionado', 'engenharia_id', p_engenharia));
    else
      update public.engenharias set atualizado_em = now() where id = p_engenharia;
    end if;
  end if;
  return to_jsonb(d);
end $$;

create or replace function public.conferir_doc_imovel(p_doc uuid, p_aceito boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() or not public.tenho_permissao('conferir_documentos') then raise exception 'Somente a CCA'; end if;
  update public.imovel_docs set situacao = case when p_aceito then 'aceito' else 'recusado' end, conferido_em = now(), conferido_por = auth.uid() where id = p_doc;
  if not found then raise exception 'Documento não encontrado'; end if;
end $$;

-- Liga o processo do cliente a um imóvel (os documentos do imóvel passam a valer no processo)
create or replace function public.vincular_imovel_cliente(p_cliente uuid, p_imovel uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c record; im record;
begin
  select * into c from public.clientes where id = p_cliente;
  if c.id is null or not public.posso_editar_cliente(p_cliente) then raise exception 'Sem permissão'; end if;
  if p_imovel is not null then
    select * into im from public.imoveis where id = p_imovel;
    if im.id is null then raise exception 'Imóvel não encontrado'; end if;
    if c.vendedor_id is not null and im.vendedor_id <> c.vendedor_id then raise exception 'Este imóvel é de outro vendedor'; end if;
  end if;
  perform set_config('app.imovel_cliente', 'sim', true);
  update public.clientes set imovel_id = p_imovel where id = p_cliente;
end $$;

-- O imóvel do processo só muda pela função acima
create or replace function public.tg_clientes_imovel() returns trigger
language plpgsql as $$
begin
  if new.imovel_id is distinct from old.imovel_id and auth.uid() is not null
     and coalesce(current_setting('app.imovel_cliente', true), '') <> 'sim' then
    new.imovel_id := old.imovel_id;
  end if;
  return new;
end $$;
create or replace trigger clientes_imovel before update on public.clientes for each row execute function public.tg_clientes_imovel();

-- ---------- 2. Documentos do imóvel entram nos documentos do processo (versão 0: um envio do processo vence) ----------
create or replace function public.documentos_necessarios_v2(p_cliente uuid)
returns table (
  participante_id uuid, pessoa_nome text, pessoa_papel text, pessoa_ordem int,
  tipo_codigo text, nome text, grupo text, regra text, ordem int,
  documento_id uuid, versao int, situacao text, motivo_recusa text,
  observacao_recusa text, nome_original text, arquivo_path text
)
language sql stable security definer set search_path = public as $$
  with cli as (
    select to_jsonb(cl.*) as j, cl.nome, cl.imovel_id from public.clientes cl
    where cl.id = p_cliente and public.posso_ver_cliente(p_cliente)
  ),
  pessoas as (
    select null::uuid as pid, 1 as ordem, 'titular'::text as papel, cli.nome, cli.j from cli
    union all
    select p.id, p.ordem, p.papel, p.nome,
           cli.j || (to_jsonb(p.*) - 'id' - 'cliente_id' - 'ordem' - 'criado_em' - 'atualizado_em')
    from public.participantes p cross join cli
    where p.cliente_id = p_cliente
  ),
  todos as (
    select d.id, d.tipo_codigo, d.participante_id, d.versao, coalesce(d.versao_pessoa, d.versao) as vp, d.situacao, d.motivo_recusa, d.observacao_recusa, d.nome_original, d.arquivo_path
    from public.documentos d
    where d.cliente_id = p_cliente and d.situacao <> 'substituido' and d.dependente_ordem is null
    union all
    select x.id, public.doc_imovel_para_cliente(x.tipo), null::uuid, 0, 0,
           case x.situacao when 'recusado' then 'recusado' when 'aceito' then 'aceito' else 'em_conferencia' end, null, null, x.nome_original, x.arquivo_path
    from (select distinct on (i.tipo) i.* from public.imovel_docs i join cli on i.imovel_id = cli.imovel_id
          where public.doc_imovel_para_cliente(i.tipo) is not null order by i.tipo, i.enviado_em desc) x
  ),
  atual as (
    select distinct on (t.tipo_codigo, t.participante_id) t.*
    from todos t order by t.tipo_codigo, t.participante_id, t.versao desc
  )
  select pe.pid, pe.nome, pe.papel, pe.ordem,
         t.codigo, t.nome, t.grupo, t.regra, t.ordem,
         a.id, a.vp, coalesce(a.situacao, 'pendente'), a.motivo_recusa,
         a.observacao_recusa, a.nome_original, a.arquivo_path
  from public.tipos_documento t
  join pessoas pe on (t.por_pessoa or pe.pid is null)
  left join atual a on a.tipo_codigo = t.codigo and a.participante_id is not distinct from pe.pid
  where t.ativo and not t.por_dependente and not t.multiplo
    and t.alvo in ('comprador', 'imovel', 'processo')
    and (jsonb_array_length(t.condicao) = 0
         or exists (select 1 from jsonb_array_elements(t.condicao) e where pe.j @> e))
  order by pe.ordem, t.ordem
$$;

-- Documentos do imóvel ligado ao processo (para o app montar a lista do cliente)
create or replace function public.docs_imovel_do_cliente(p_cliente uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(i) order by i.enviado_em), '[]'::jsonb)
  from public.clientes c join public.imovel_docs i on i.imovel_id = c.imovel_id
  where c.id = p_cliente and public.posso_ver_cliente(p_cliente)
$$;
-- O cliente final / corretor do processo abre o arquivo do imóvel ligado
do $$ begin
  create policy imoveis_ler_pelo_processo on storage.objects for select to authenticated
    using (bucket_id = 'imoveis' and exists (select 1 from public.clientes c where c.imovel_id = ((storage.foldername(name))[1])::uuid and public.posso_ver_cliente(c.id)));
exception when duplicate_object then null; end $$;

-- ---------- 3. Simulação obrigatória para enviar o cadastro ----------
create or replace function public.enviar_cadastro(p_cliente uuid)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare v public.clientes;
begin
  select * into v from public.clientes where id = p_cliente;
  if v.id is null or not public.posso_editar_cliente(p_cliente) then
    raise exception 'Cliente não encontrado';
  end if;
  if not public.consumidor_liberado() then raise exception 'Sua identidade ainda não foi verificada pela CCA'; end if;
  if v.autorizacao_lgpd_em is null then
    raise exception 'Falta a confirmação de autorização do cliente (LGPD)';
  end if;
  if not v.rascunho then
    return;
  end if;
  if not exists (select 1 from public.documentos d where d.cliente_id = p_cliente and d.tipo_codigo = 'SIMULACAO' and d.situacao in ('em_conferencia', 'aceito')) then
    raise exception 'Anexe a Simulação da Caixa para enviar o cadastro.';
  end if;
  update public.clientes
     set rascunho = false,
         enviado_em = coalesce(enviado_em, now()),
         status = case when public.pode_ir_para_analise(p_cliente)
                       then 'cadastro_recebido' else 'documentacao_pendente' end
   where id = p_cliente;
  insert into public.eventos (tipo, cliente_id) values ('cliente_enviado', p_cliente);
end $function$;

-- ---------- 4. Engenharia nova: a CCA também pede; valor desejado; quem acompanha; imóvel ----------
create or replace function public.criar_engenharia_m2(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cca boolean := public.sou_equipe();
  v_para uuid; v_dono uuid := auth.uid(); v_imob uuid; v_im record; v_id uuid; v_tipo text := p->>'tipo';
  v_vend uuid := nullif(p->>'vendedor_id', '')::uuid;
begin
  if not v_cca and (public.meu_papel() not in ('corretor', 'gestor_imobiliaria') or coalesce((select consumidor from public.perfis where id = auth.uid()), false)) then
    raise exception 'Só corretor ou imobiliária pedem engenharia';
  end if;
  if v_tipo not in ('novo_fgts', 'novo_sbpe', 'usado', 'atc', 'ctp', 'leilao', 'to', 'terreno') then raise exception 'Tipo de engenharia inválido'; end if;
  if v_vend is null or not exists (select 1 from public.vendedores where id = v_vend) then raise exception 'Vendedor não encontrado'; end if;
  if v_cca and nullif(p->>'para_corretor_id', '') is not null then
    select id into v_para from public.perfis where id = (p->>'para_corretor_id')::uuid and papel in ('corretor', 'gestor_imobiliaria') and not consumidor;
    if v_para is null then raise exception 'Corretor não encontrado'; end if;
    v_dono := v_para;
  end if;
  v_imob := case when v_cca and v_para is null then null else (select imobiliaria_id from public.perfis where id = v_dono) end;
  -- imóvel: um já cadastrado do vendedor ou um novo
  if nullif(p->>'imovel_id', '') is not null then
    select * into v_im from public.imoveis where id = (p->>'imovel_id')::uuid;
    if v_im.id is null or v_im.vendedor_id <> v_vend then raise exception 'Imóvel não encontrado para este vendedor'; end if;
  else
    insert into public.imoveis (vendedor_id, endereco, cidade, uf, matricula, cartorio_rgi, tipo, criado_por, imobiliaria_id)
    values (v_vend, nullif(btrim(coalesce(p->>'imovel_endereco', '')), ''), nullif(btrim(coalesce(p->>'imovel_cidade', '')), ''), upper(nullif(btrim(coalesce(p->>'imovel_uf', '')), '')),
            nullif(btrim(coalesce(p->>'matricula', '')), ''), nullif(btrim(coalesce(p->>'cartorio_rgi', '')), ''), v_tipo, v_dono, v_imob)
    returning * into v_im;
  end if;
  insert into public.engenharias (vendedor_id, criado_por, imobiliaria_id, tipo, codigo_servico, imovel_endereco, imovel_cidade, imovel_uf, matricula, cartorio_rgi, quem_paga,
    imovel_id, pela_cca, pedido_por_cca_id, valor_desejado, acompanhante_tipo, acompanhante_cliente_id, acompanhante_nome, acompanhante_telefone, acompanhante_email)
  values (v_vend, v_dono, v_imob, v_tipo, public.servico_engenharia(v_tipo), v_im.endereco, v_im.cidade, v_im.uf,
          coalesce(v_im.matricula, nullif(btrim(coalesce(p->>'matricula', '')), '')), coalesce(v_im.cartorio_rgi, nullif(btrim(coalesce(p->>'cartorio_rgi', '')), '')),
          nullif(p->>'quem_paga', ''), v_im.id, v_cca and v_para is null, case when v_cca and v_para is not null then auth.uid() end,
          nullif(p->>'valor_desejado', '')::numeric, nullif(p->>'acompanhante_tipo', ''), nullif(p->>'acompanhante_cliente_id', '')::uuid,
          nullif(btrim(coalesce(p->>'acompanhante_nome', '')), ''), nullif(regexp_replace(coalesce(p->>'acompanhante_telefone', ''), '\D', '', 'g'), ''),
          nullif(lower(btrim(coalesce(p->>'acompanhante_email', ''))), ''))
  returning id into v_id;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'criar_engenharia', jsonb_build_object('engenharia', v_id, 'para', v_dono));
  return v_id;
end $$;

create or replace function public.editar_engenharia_m2(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e record; v_tipo text := p->>'tipo';
  v_tel text := nullif(regexp_replace(coalesce(p->>'telefone', ''), '\D', '', 'g'), ''); v_mail text := nullif(lower(btrim(coalesce(p->>'email', ''))), '');
begin
  if not public.posso_ver_engenharia(p_id) then raise exception 'Sem permissão'; end if;
  select * into e from public.engenharias where id = p_id;
  if not public.sou_equipe() and e.etapa not in ('documentacao', 'em_analise', 'boleto') then raise exception 'Depois que o boleto é pago, só a CCA altera os dados'; end if;
  if v_tipo not in ('novo_fgts', 'novo_sbpe', 'usado', 'atc', 'ctp', 'leilao', 'to', 'terreno') then raise exception 'Tipo de engenharia inválido'; end if;
  if v_tel is not null and length(v_tel) < 10 then raise exception 'Telefone do vendedor inválido'; end if;
  if v_mail is not null and v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail do vendedor inválido'; end if;
  update public.engenharias set tipo = v_tipo, codigo_servico = public.servico_engenharia(v_tipo),
    imovel_endereco = nullif(btrim(coalesce(p->>'imovel_endereco', '')), ''), imovel_cidade = nullif(btrim(coalesce(p->>'imovel_cidade', '')), ''),
    imovel_uf = upper(nullif(btrim(coalesce(p->>'imovel_uf', '')), '')), matricula = nullif(btrim(coalesce(p->>'matricula', '')), ''),
    cartorio_rgi = nullif(btrim(coalesce(p->>'cartorio_rgi', '')), ''), quem_paga = nullif(p->>'quem_paga', ''), atualizado_em = now(),
    valor_desejado = case when p ? 'valor_desejado' then nullif(p->>'valor_desejado', '')::numeric else valor_desejado end,
    acompanhante_tipo = case when p ? 'acompanhante_tipo' then nullif(p->>'acompanhante_tipo', '') else acompanhante_tipo end,
    acompanhante_cliente_id = case when p ? 'acompanhante_cliente_id' then nullif(p->>'acompanhante_cliente_id', '')::uuid else acompanhante_cliente_id end,
    acompanhante_nome = case when p ? 'acompanhante_nome' then nullif(btrim(coalesce(p->>'acompanhante_nome', '')), '') else acompanhante_nome end,
    acompanhante_telefone = case when p ? 'acompanhante_telefone' then nullif(regexp_replace(coalesce(p->>'acompanhante_telefone', ''), '\D', '', 'g'), '') else acompanhante_telefone end,
    acompanhante_email = case when p ? 'acompanhante_email' then nullif(lower(btrim(coalesce(p->>'acompanhante_email', ''))), '') else acompanhante_email end,
    docs_novos = case when v_tipo <> e.tipo and e.etapa <> 'documentacao' and not public.sou_equipe() then true else docs_novos end
  where id = p_id;
  if e.imovel_id is not null then
    update public.imoveis im set endereco = x.imovel_endereco, cidade = x.imovel_cidade, uf = x.imovel_uf, matricula = x.matricula, cartorio_rgi = x.cartorio_rgi, atualizado_em = now()
      from public.engenharias x where x.id = p_id and im.id = e.imovel_id;
  end if;
  update public.vendedores set telefone = coalesce(v_tel, telefone), email = coalesce(v_mail, email), atualizado_em = now() where id = e.vendedor_id;
end $$;

-- Lista de engenharias: documentos do imóvel juntos, quem pediu (contato) e a CCA que pediu em nome do corretor
create or replace function public.listar_engenharias() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'atualizado_em') desc), '[]'::jsonb) from (
    select to_jsonb(e) || jsonb_build_object(
      'vendedor', (select jsonb_build_object('id', v.id, 'nome', v.nome, 'tipo', v.tipo, 'cpf_cnpj', v.cpf_cnpj, 'responsavel_nome', v.responsavel_nome, 'telefone', v.telefone, 'email', v.email) from public.vendedores v where v.id = e.vendedor_id),
      'criado_por_nome', (select p.nome from public.perfis p where p.id = e.criado_por),
      'criado_por_apelido', (select p.apelido from public.perfis p where p.id = e.criado_por),
      'criado_por_telefone', (select p.whatsapp from public.perfis p where p.id = e.criado_por),
      'criado_por_email', (select p.email from public.perfis p where p.id = e.criado_por),
      'pedido_por_cca', (select p.nome from public.perfis p where p.id = e.pedido_por_cca_id),
      'imobiliaria_nome', (select i.nome from public.imobiliarias i where i.id = e.imobiliaria_id),
      'pepts', coalesce((select jsonb_agg(to_jsonb(t) order by t.registrada_em) from public.engenharia_pepts t where t.engenharia_id = e.id), '[]'::jsonb),
      'docs', coalesce((select jsonb_agg(z order by z->>'enviado_em') from (
          select to_jsonb(d) as z from public.engenharia_docs d where d.engenharia_id = e.id
          union all
          select to_jsonb(i) || jsonb_build_object('engenharia_id', e.id, 'do_imovel', true) from public.imovel_docs i where e.imovel_id is not null and i.imovel_id = e.imovel_id) q), '[]'::jsonb)
    ) as x
    from public.engenharias e where e.excluida_em is null and public.posso_ver_engenharia(e.id)
  ) s
$$;

-- Quando a CCA pede para ela mesma (cliente direto), ela também faz a parte do corretor
create or replace function public.enviar_engenharia(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.posso_ver_engenharia(p_id) or (public.sou_equipe() and not (select pela_cca from public.engenharias where id = p_id)) then raise exception 'Sem permissão'; end if;
  update public.engenharias set etapa = 'em_analise', atualizado_em = now() where id = p_id and etapa = 'documentacao';
  if found then insert into public.eventos (tipo, dados) values ('engenharia', jsonb_build_object('fase', 'enviada', 'engenharia_id', p_id)); end if;
end $function$;

create or replace function public.engenharia_reenviar(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_etapa text;
begin
  if not public.posso_ver_engenharia(p_id) or (public.sou_equipe() and not (select pela_cca from public.engenharias where id = p_id)) then raise exception 'Sem permissão'; end if;
  select etapa into v_etapa from public.engenharias where id = p_id;
  if v_etapa is distinct from 'em_analise' then return; end if;
  if exists (select 1 from public.eventos ev where ev.tipo = 'engenharia' and ev.dados->>'fase' = 'doc_adicionado'
             and ev.dados->>'engenharia_id' = p_id::text and ev.criado_em > now() - interval '3 minutes') then return; end if;
  update public.engenharias set atualizado_em = now() where id = p_id;
  insert into public.eventos (tipo, dados) values ('engenharia', jsonb_build_object('fase', 'doc_adicionado', 'engenharia_id', p_id, 'manual', true));
end $function$;

create or replace function public.engenharia_contestar(p_id uuid, p_tipo text, p_links text)
 returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.posso_ver_engenharia(p_id) or (public.sou_equipe() and not (select pela_cca from public.engenharias where id = p_id)) then raise exception 'Sem permissão'; end if;
  if p_tipo not in ('reavaliacao', 'segunda_instancia') then raise exception 'Escolha reavaliação ou segunda instância'; end if;
  update public.engenharias set contestacao = p_tipo, links_anuncios = case when p_tipo = 'reavaliacao' then p_links end, atualizado_em = now()
   where id = p_id and laudo_aprovado is true;
  if found then insert into public.eventos (tipo, dados) values ('engenharia', jsonb_build_object('fase', 'contestou', 'engenharia_id', p_id, 'tipo', p_tipo)); end if;
end $function$;

-- ---------- 5. Consumidores finais (clientes diretos da CCA) ----------
create or replace function public.listar_consumidores() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Somente a CCA'; end if;
  return coalesce((select jsonb_agg(x order by x->>'nome') from (
    select jsonb_build_object('id', u.id, 'nome', u.nome, 'cpf', u.cpf, 'email', u.email, 'whatsapp', u.whatsapp, 'criado_em', u.criado_em, 'ativo', u.ativo,
      'link_pendente', not exists (select 1 from auth.users a where a.id = u.id and a.last_sign_in_at is not null),
      'verificada_em', u.identidade_verificada_em,
      'identidade', case when u.identidade_verificada_em is not null then 'confirmada'
                         else coalesce((select case v.status when 'em_analise' then 'conferir' when 'recusada' then 'recusada' else 'aguardando' end
                                        from public.verificacoes_identidade v where v.perfil_id = u.id order by v.enviada_em desc limit 1), 'aguardando') end,
      'processos', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'status', c.status, 'rascunho', c.rascunho) order by c.criado_em)
                             from public.clientes c where c.corretor_id = u.id), '[]'::jsonb),
      'imoveis', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'endereco', i.endereco, 'cidade', i.cidade, 'uf', i.uf) order by i.criado_em)
                           from public.imoveis i where i.consumidor_id = u.id), '[]'::jsonb)) as x
    from public.perfis u where u.consumidor) s), '[]'::jsonb);
end $$;

-- ---------- 6. Permissões ----------
do $$ declare f text; begin
  foreach f in array array[
    'public.posso_ver_imovel(uuid)', 'public.resumo_imovel(uuid)', 'public.listar_imoveis(uuid)', 'public.obter_imovel(uuid)', 'public.ligar_pessoas_imovel(uuid, jsonb)',
    'public.salvar_imovel(jsonb)', 'public.registrar_doc_imovel(uuid, text, text, text, text, bigint, text, uuid, date)', 'public.conferir_doc_imovel(uuid, boolean)',
    'public.vincular_imovel_cliente(uuid, uuid)', 'public.documentos_necessarios_v2(uuid)', 'public.docs_imovel_do_cliente(uuid)', 'public.enviar_cadastro(uuid)',
    'public.criar_engenharia_m2(jsonb)', 'public.editar_engenharia_m2(uuid, jsonb)', 'public.listar_engenharias()', 'public.enviar_engenharia(uuid)',
    'public.engenharia_reenviar(uuid)', 'public.engenharia_contestar(uuid, text, text)', 'public.listar_consumidores()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.ligar_pessoas_imovel(uuid, jsonb), public.resumo_imovel(uuid) from authenticated;
