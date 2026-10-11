-- =====================================================================
-- Vendedores: cadastro único por CPF/CNPJ, com conta para recebimento
-- e documentos próprios. Os documentos ficam ligados ao VENDEDOR (e não
-- ao corretor): o mesmo vendedor em 10 processos = documentos salvos 1 vez.
-- O corretor não lista vendedores nem abre os arquivos deles; só vê a
-- situação de cada documento e pode mandar versão nova.
-- =====================================================================

-- Seções da tela de documentos e tipos que aceitam vários arquivos
alter table public.tipos_documento add column if not exists alvo text not null default 'comprador';
alter table public.tipos_documento add column if not exists multiplo boolean not null default false;
do $$ begin
  alter table public.tipos_documento add constraint tipos_documento_alvo_check
    check (alvo in ('comprador', 'imovel', 'processo', 'vendedor_pf', 'vendedor_pj', 'vendedor_spe'));
exception when duplicate_object then null; end $$;

update public.tipos_documento set alvo = 'imovel', grupo = 'Imóvel',
       nome = 'Certidão de ônus reais atualizada (matrícula)' where codigo = 'MATRICULA';
update public.tipos_documento set ativo = false where codigo = 'DOCS_VENDEDOR';

insert into public.tipos_documento (codigo, nome, grupo, regra, condicao, ordem, alvo, multiplo) values
  ('ESPELHO_IPTU',             'Espelho do IPTU',                                   'Imóvel',   '', '[]', 31, 'imovel', false),
  ('SIMULACAO',                'Simulação',                                         'Simulação e outros', '*', '[]', 60, 'processo', false),
  ('OUTROS',                   'Outros documentos',                                 'Simulação e outros', '', '[]', 61, 'processo', true),
  -- Vendedor pessoa física: mesmos documentos do comprador, sem renda
  ('VEND_PF_IDENTIDADE',       'Identidade: CNH (na falta, RG, CTPS ou passaporte)', 'Vendedor', '', '[]', 70, 'vendedor_pf', false),
  ('VEND_PF_RESIDENCIA',       'Comprovante de residência',                         'Vendedor', '', '[]', 71, 'vendedor_pf', false),
  ('VEND_PF_ESTADO_CIVIL',     'Certidão de estado civil',                          'Vendedor', '', '[]', 72, 'vendedor_pf', false),
  -- Vendedor pessoa jurídica (imóvel avulso)
  ('VEND_PJ_CONTRATO_SOCIAL',  'Contrato social consolidado',                       'Vendedor', '', '[]', 80, 'vendedor_pj', false),
  ('VEND_PJ_ALTERACOES',       'Últimas alterações contratuais (se houver)',        'Vendedor', '*', '[]', 81, 'vendedor_pj', false),
  ('VEND_PJ_CARTAO_CNPJ',      'Cartão CNPJ',                                       'Vendedor', '', '[]', 82, 'vendedor_pj', false),
  ('VEND_PJ_DOCS_SOCIOS',      'Identidade dos sócios (CNH, RG, CTPS ou passaporte)', 'Vendedor', '', '[]', 83, 'vendedor_pj', false),
  ('VEND_PJ_CERTIDAO_JUNTA',   'Certidão simplificada da Junta Comercial (JUCERJA no RJ)', 'Vendedor', '', '[]', 84, 'vendedor_pj', false)
on conflict (codigo) do nothing;

-- Cadastro dos vendedores
create table if not exists public.vendedores (
  id                 uuid primary key default gen_random_uuid(),
  tipo               text not null check (tipo in ('PF', 'PJ')),
  cpf_cnpj           text not null unique,        -- só números
  nome               text not null,               -- nome completo ou razão social
  pj_tipo            text check (pj_tipo in ('Avulso', 'Empreendimento')),
  empreendimento     text,                        -- nome do empreendimento (SPE)
  construtora_cnpj   text,                        -- CNPJ da construtora (o da SPE é o cpf_cnpj)
  construtora_nome   text,
  banco              text,
  agencia            text,
  operacao           text,
  conta              text,
  criado_por         uuid references public.perfis (id),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index if not exists vendedores_construtora_idx on public.vendedores (construtora_cnpj);

alter table public.clientes add column if not exists vendedor_id uuid references public.vendedores (id);

-- Documentos do vendedor (versionados como os do cliente)
create table if not exists public.documentos_vendedor (
  id                 uuid primary key default gen_random_uuid(),
  vendedor_id        uuid not null references public.vendedores (id) on delete cascade,
  tipo_codigo        text not null references public.tipos_documento (codigo),
  versao             int  not null default 1,
  situacao           text not null default 'em_conferencia'
                     check (situacao in ('em_conferencia','aceito','recusado','substituido')),
  arquivo_path       text not null,
  nome_original      text,
  mime               text,
  tamanho_bytes      bigint,
  cliente_id         uuid references public.clientes (id) on delete set null,  -- processo em que foi enviado
  motivo_recusa      text,
  observacao_recusa  text,
  enviado_por        uuid references public.perfis (id),
  enviado_em         timestamptz not null default now(),
  conferido_por      uuid references public.perfis (id),
  conferido_em       timestamptz,
  unique (vendedor_id, tipo_codigo, versao)
);
create index if not exists documentos_vendedor_idx on public.documentos_vendedor (vendedor_id);

alter table public.vendedores enable row level security;
alter table public.documentos_vendedor enable row level security;

-- Equipe vê e edita tudo. Corretor só enxerga o vendedor ligado a um cliente dele
-- (nunca a lista inteira) e não lê a tabela de documentos do vendedor.
do $$ begin
  create policy equipe_vendedores on public.vendedores for all to authenticated
    using (public.sou_equipe()) with check (public.sou_equipe());
  create policy ver_vendedor_do_cliente on public.vendedores for select to authenticated
    using (exists (select 1 from public.clientes c where c.vendedor_id = vendedores.id and public.posso_ver_cliente(c.id)));
  create policy equipe_documentos_vendedor on public.documentos_vendedor for all to authenticated
    using (public.sou_equipe()) with check (public.sou_equipe());
exception when duplicate_object then null; end $$;

-- Posso mexer neste cliente? (dono ou equipe)
create or replace function public.posso_editar_cliente(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clientes c
                 where c.id = p_cliente and (c.corretor_id = auth.uid() or public.sou_equipe()))
$$;

-- Busca um vendedor pelo CPF/CNPJ exato (para preencher o formulário). Não lista ninguém.
create or replace function public.buscar_vendedor(p_cpf_cnpj text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object(
      'id', v.id, 'tipo', v.tipo, 'cpf_cnpj', v.cpf_cnpj, 'nome', v.nome, 'pj_tipo', v.pj_tipo,
      'empreendimento', v.empreendimento, 'construtora_cnpj', v.construtora_cnpj, 'construtora_nome', v.construtora_nome,
      'banco', v.banco, 'agencia', v.agencia, 'operacao', v.operacao, 'conta', v.conta,
      'documentos_na_cca', (select count(distinct d.tipo_codigo) from public.documentos_vendedor d
                            where d.vendedor_id = v.id and d.situacao in ('em_conferencia', 'aceito')))
    from public.vendedores v
    where v.cpf_cnpj = regexp_replace(coalesce(p_cpf_cnpj, ''), '\D', '', 'g')) end
$$;

-- Liga (ou cria) o vendedor ao cliente. Campos vazios não apagam o que já existe.
create or replace function public.vincular_vendedor(p_cliente uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_doc text := regexp_replace(coalesce(p_dados->>'cpf_cnpj', ''), '\D', '', 'g');
  v_id uuid;
  v_txt text;
begin
  if not public.posso_editar_cliente(p_cliente) then raise exception 'Sem permissão'; end if;
  if length(v_doc) not in (11, 14) then raise exception 'CPF ou CNPJ do vendedor inválido'; end if;
  if coalesce(trim(p_dados->>'nome'), '') = '' then raise exception 'Informe o nome do vendedor'; end if;

  insert into public.vendedores as v (tipo, cpf_cnpj, nome, pj_tipo, empreendimento, construtora_cnpj, construtora_nome,
                                      banco, agencia, operacao, conta, criado_por)
  values (case when length(v_doc) = 11 then 'PF' else 'PJ' end, v_doc, trim(p_dados->>'nome'),
          nullif(p_dados->>'pj_tipo', ''), nullif(trim(p_dados->>'empreendimento'), ''),
          nullif(regexp_replace(coalesce(p_dados->>'construtora_cnpj', ''), '\D', '', 'g'), ''),
          nullif(trim(p_dados->>'construtora_nome'), ''),
          nullif(trim(p_dados->>'banco'), ''), nullif(trim(p_dados->>'agencia'), ''),
          nullif(trim(p_dados->>'operacao'), ''), nullif(trim(p_dados->>'conta'), ''), auth.uid())
  on conflict (cpf_cnpj) do update set
    nome             = excluded.nome,
    pj_tipo          = coalesce(excluded.pj_tipo, v.pj_tipo),
    empreendimento   = coalesce(excluded.empreendimento, v.empreendimento),
    construtora_cnpj = coalesce(excluded.construtora_cnpj, v.construtora_cnpj),
    construtora_nome = coalesce(excluded.construtora_nome, v.construtora_nome),
    banco            = coalesce(excluded.banco, v.banco),
    agencia          = coalesce(excluded.agencia, v.agencia),
    operacao         = coalesce(excluded.operacao, v.operacao),
    conta            = coalesce(excluded.conta, v.conta),
    atualizado_em    = now()
  returning id into v_id;

  update public.clientes set vendedor_id = v_id where id = p_cliente;
  return public.buscar_vendedor(v_doc);
end $$;

-- Situação dos documentos do vendedor de um cliente (sem caminho do arquivo para o corretor)
create or replace function public.documentos_do_vendedor(p_cliente uuid)
returns table (id uuid, tipo_codigo text, versao int, situacao text, enviado_em timestamptz,
               motivo_recusa text, observacao_recusa text, nome_original text, arquivo_path text, vendedor_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct on (d.tipo_codigo)
         d.id, d.tipo_codigo, d.versao, d.situacao, d.enviado_em, d.motivo_recusa, d.observacao_recusa,
         case when public.sou_equipe() or d.enviado_por = auth.uid() then d.nome_original end,
         case when public.sou_equipe() then d.arquivo_path end,
         d.vendedor_id
  from public.clientes c
  join public.documentos_vendedor d on d.vendedor_id = c.vendedor_id and d.situacao <> 'substituido'
  where c.id = p_cliente and public.posso_ver_cliente(p_cliente)
  order by d.tipo_codigo, d.versao desc
$$;

-- Registra um arquivo do vendedor enviado pelo corretor (o arquivo já subiu ao Storage)
create or replace function public.registrar_documento_vendedor(
  p_cliente uuid, p_tipo text, p_path text, p_nome text, p_mime text, p_tamanho bigint
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_vend uuid; v_max int; v_id uuid;
begin
  if not public.posso_editar_cliente(p_cliente) then raise exception 'Sem permissão'; end if;
  select vendedor_id into v_vend from public.clientes where id = p_cliente;
  if v_vend is null then raise exception 'Informe os dados do vendedor antes de anexar os documentos dele'; end if;
  if split_part(p_path, '/', 1) <> v_vend::text then raise exception 'Caminho do arquivo inválido'; end if;
  if not exists (select 1 from public.tipos_documento where codigo = p_tipo and alvo like 'vendedor%') then
    raise exception 'Tipo de documento inválido';
  end if;
  select coalesce(max(versao), 0) into v_max from public.documentos_vendedor where vendedor_id = v_vend and tipo_codigo = p_tipo;
  update public.documentos_vendedor set situacao = 'substituido'
   where vendedor_id = v_vend and tipo_codigo = p_tipo and situacao <> 'substituido';
  insert into public.documentos_vendedor (vendedor_id, tipo_codigo, versao, arquivo_path, nome_original, mime, tamanho_bytes, cliente_id, enviado_por)
  values (v_vend, p_tipo, v_max + 1, p_path, p_nome, p_mime, p_tamanho, p_cliente, auth.uid())
  returning id into v_id;
  insert into public.eventos (tipo, cliente_id, dados)
  values ('documento_vendedor_enviado', p_cliente, jsonb_build_object('documento', v_id, 'tipo', p_tipo));
  return v_id;
end $$;

-- Conferência pela equipe
create or replace function public.conferir_documento_vendedor(
  p_documento uuid, p_aceito boolean, p_motivo text default null, p_observacao text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_cliente uuid;
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  if not p_aceito and coalesce(p_motivo, '') = '' then raise exception 'Informe o motivo da recusa'; end if;
  update public.documentos_vendedor
     set situacao = case when p_aceito then 'aceito' else 'recusado' end,
         motivo_recusa = case when p_aceito then null else p_motivo end,
         observacao_recusa = case when p_aceito then null else p_observacao end,
         conferido_por = auth.uid(), conferido_em = now()
   where id = p_documento and situacao = 'em_conferencia'
  returning cliente_id into v_cliente;
  if not found then raise exception 'Documento não está em conferência'; end if;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
    values (auth.uid(), 'conferir_documento', v_cliente,
            jsonb_build_object('documento_vendedor', p_documento, 'aceito', p_aceito, 'motivo', p_motivo));
  insert into public.eventos (tipo, cliente_id, dados)
    values ('documento_vendedor_conferido', v_cliente,
            jsonb_build_object('documento', p_documento, 'aceito', p_aceito, 'motivo', p_motivo, 'observacao', p_observacao));
end $$;

revoke execute on function public.posso_editar_cliente(uuid), public.buscar_vendedor(text),
  public.vincular_vendedor(uuid, jsonb), public.documentos_do_vendedor(uuid),
  public.registrar_documento_vendedor(uuid, text, text, text, text, bigint),
  public.conferir_documento_vendedor(uuid, boolean, text, text) from public, anon;
grant execute on function public.posso_editar_cliente(uuid), public.buscar_vendedor(text),
  public.vincular_vendedor(uuid, jsonb), public.documentos_do_vendedor(uuid),
  public.registrar_documento_vendedor(uuid, text, text, text, text, bigint),
  public.conferir_documento_vendedor(uuid, boolean, text, text) to authenticated;

-- "Outros documentos" aceita vários arquivos: um envio novo não substitui o anterior
create or replace function public.tg_documentos_novo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int; v_pessoa int; v_multiplo boolean;
begin
  if new.participante_id is not null and not exists (
       select 1 from public.participantes p where p.id = new.participante_id and p.cliente_id = new.cliente_id) then
    raise exception 'Pessoa não pertence a este cliente';
  end if;
  select coalesce(multiplo, false) into v_multiplo from public.tipos_documento where codigo = new.tipo_codigo;
  select coalesce(max(versao), 0) into v_max
    from public.documentos where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo;
  select count(*) into v_pessoa
    from public.documentos where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo
     and participante_id is not distinct from new.participante_id
     and dependente_ordem is not distinct from new.dependente_ordem;
  new.versao := v_max + 1;
  new.versao_pessoa := case when v_multiplo then 1 else v_pessoa + 1 end;
  new.situacao := 'em_conferencia';
  new.enviado_por := auth.uid();
  new.motivo_recusa := null; new.observacao_recusa := null;
  new.conferido_por := null; new.conferido_em := null;
  if not v_multiplo then
    update public.documentos set situacao = 'substituido'
     where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo
       and participante_id is not distinct from new.participante_id
       and dependente_ordem is not distinct from new.dependente_ordem
       and situacao <> 'substituido';
  end if;
  return new;
end $$;

-- Documentos exigidos no servidor: só os do processo (comprador, imóvel, outros);
-- os do vendedor ficam na tabela própria e não entram aqui.
create or replace function public.documentos_necessarios_v2(p_cliente uuid)
returns table (
  participante_id uuid, pessoa_nome text, pessoa_papel text, pessoa_ordem int,
  tipo_codigo text, nome text, grupo text, regra text, ordem int,
  documento_id uuid, versao int, situacao text, motivo_recusa text,
  observacao_recusa text, nome_original text, arquivo_path text
)
language sql stable security definer set search_path = public as $$
  with cli as (
    select to_jsonb(cl.*) as j, cl.nome from public.clientes cl
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
  atual as (
    select distinct on (d.tipo_codigo, d.participante_id) d.*
    from public.documentos d
    where d.cliente_id = p_cliente and d.situacao <> 'substituido' and d.dependente_ordem is null
    order by d.tipo_codigo, d.participante_id, d.versao desc
  )
  select pe.pid, pe.nome, pe.papel, pe.ordem,
         t.codigo, t.nome, t.grupo, t.regra, t.ordem,
         a.id, coalesce(a.versao_pessoa, a.versao), coalesce(a.situacao, 'pendente'), a.motivo_recusa,
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

-- Arquivos dos vendedores: bucket próprio. Corretor envia para o vendedor do cliente dele; só a equipe lê.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vendedores', 'vendedores', false, 15728640,
        array['application/pdf','image/jpeg','image/png','image/heic','image/webp'])
on conflict (id) do nothing;

do $$ begin
  create policy vend_ler on storage.objects for select to authenticated
    using (bucket_id = 'vendedores' and public.sou_equipe());
  create policy vend_enviar on storage.objects for insert to authenticated
    with check (bucket_id = 'vendedores'
                and exists (select 1 from public.clientes c
                            where c.vendedor_id::text = (storage.foldername(name))[1]
                              and (c.corretor_id = auth.uid() or public.sou_equipe())));
exception when duplicate_object then null; end $$;
