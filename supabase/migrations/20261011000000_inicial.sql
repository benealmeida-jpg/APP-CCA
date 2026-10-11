-- =====================================================================
-- APP CCA – Portal do Corretor (Andrade Almeida CCA)
-- Migração inicial: tabelas, regras de documentos, permissões (RLS),
-- funções de negócio e fila de eventos (WhatsApp / Drive).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Cadastros básicos
-- ---------------------------------------------------------------------

create table public.imobiliarias (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  cnpj            text,
  whatsapp        text,
  pasta_drive_id  text,                       -- pasta da imobiliária no Drive
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- papel: corretor | gestor_imobiliaria | equipe_cca | admin
create table public.perfis (
  id              uuid primary key references auth.users (id) on delete cascade,
  nome            text not null,
  email           text,
  cpf             text,
  whatsapp        text,                       -- formato +55DDDNUMERO
  papel           text not null default 'corretor'
                  check (papel in ('corretor','gestor_imobiliaria','equipe_cca','admin')),
  imobiliaria_id  uuid references public.imobiliarias (id),  -- nulo = autônomo
  pasta_drive_id  text,                       -- pasta do corretor no Drive
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- Etapas de status (editáveis sem mexer no código)
create table public.status_etapas (
  codigo          text primary key,
  nome            text not null,
  ordem           int  not null,
  avisa_corretor  boolean not null default true,
  ativo           boolean not null default true
);

insert into public.status_etapas (codigo, nome, ordem) values
  ('cadastro_recebido',     'Cadastro recebido',      1),
  ('documentacao_pendente', 'Documentação pendente',  2),
  ('cadastro_ok',           'Cadastro OK',            3),
  ('em_analise',            'Em análise',             4),
  ('cliente_aprovado',      'Cliente Aprovado',       5),
  ('conformidade',          'Conformidade',           6),
  ('minuta_em_maos',        'Minuta em mãos',         7),
  ('contrato_assinado',     'Contrato assinado',      8);

-- Opções do cadastro guiado (editáveis: modalidades novas entram aqui)
create table public.opcoes_cadastro (
  campo   text not null,      -- modalidade | programa | imovel | vendedor | tipo_renda | estado_civil
  valor   text not null,
  ordem   int  not null default 0,
  ativo   boolean not null default true,
  primary key (campo, valor)
);

insert into public.opcoes_cadastro (campo, valor, ordem) values
  ('modalidade',   'Aquisição de Terreno e Construção', 1),
  ('programa',     'MCMV', 1), ('programa', 'SBPE', 2), ('programa', 'Pró-Cotista', 3),
  ('imovel',       'Novo', 1), ('imovel', 'Usado', 2), ('imovel', 'Na planta', 3), ('imovel', 'Leilão', 4),
  ('vendedor',     'Pessoa física', 1), ('vendedor', 'Construtora / PJ', 2),
  ('tipo_renda',   'Formal', 1), ('tipo_renda', 'Informal', 2), ('tipo_renda', 'Mista', 3),
  ('estado_civil', 'Solteiro(a)', 1), ('estado_civil', 'Casado(a)', 2), ('estado_civil', 'União estável', 3),
  ('estado_civil', 'Divorciado(a)', 4), ('estado_civil', 'Viúvo(a)', 5);

-- ---------------------------------------------------------------------
-- 2. Clientes
-- ---------------------------------------------------------------------

create table public.clientes (
  id                 uuid primary key default gen_random_uuid(),
  corretor_id        uuid not null references public.perfis (id),
  imobiliaria_id     uuid references public.imobiliarias (id),
  -- Etapa 1 – dados do cliente
  nome               text not null,
  cpf                text not null,
  data_nascimento    date,
  celular            text,
  email              text,
  estado_civil       text,
  pis                text,
  -- Etapa 2 – operação
  modalidade         text,
  programa           text,
  imovel             text,
  vendedor           text,
  usa_fgts           boolean,
  -- Etapa 3 – renda e dependentes
  tipo_renda         text,
  renda_bruta        numeric(12,2),
  compoe_renda       boolean,
  dependentes        int default 0,
  -- Respostas extras (campos futuros sem mudar o banco)
  extras             jsonb not null default '{}'::jsonb,
  -- Controle
  rascunho           boolean not null default true,       -- true até o corretor enviar
  status             text not null default 'cadastro_recebido' references public.status_etapas (codigo),
  autorizacao_lgpd_em timestamptz,
  pasta_drive_id     text,
  enviado_em         timestamptz,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  unique (corretor_id, cpf)
);

create index clientes_corretor_idx    on public.clientes (corretor_id);
create index clientes_imobiliaria_idx on public.clientes (imobiliaria_id);
create index clientes_status_idx      on public.clientes (status);
create index clientes_cpf_idx         on public.clientes (cpf);

-- ---------------------------------------------------------------------
-- 3. Documentos
-- ---------------------------------------------------------------------

-- regra: ''  = comum (pode enviar sem e anexar depois)
--        '*' = pode enviar o cadastro sem ele e anexar depois
--        '**'= pode enviar, mas sem ele o processo NÃO vai para análise
-- condicao: lista de objetos; o documento é exigido se o cliente "contém"
--           qualquer um deles (ex.: [{"usa_fgts": true}]). Lista vazia = sempre.
create table public.tipos_documento (
  codigo       text primary key,
  nome         text not null,
  grupo        text not null,              -- Do cliente | Renda | FGTS | Imóvel e vendedor
  regra        text not null default '' check (regra in ('', '*', '**')),
  condicao     jsonb not null default '[]'::jsonb,
  ordem        int not null default 0,
  ativo        boolean not null default true
);

-- Lista para TESTES INICIAIS (a lista definitiva será informada pela CCA)
insert into public.tipos_documento (codigo, nome, grupo, regra, condicao, ordem) values
  ('RG_CNH',                 'RG ou CNH',                  'Do cliente',        '**', '[]', 1),
  ('PIS',                    'Número do PIS',              'Do cliente',        '*',  '[]', 2),
  ('COMPROVANTE_RESIDENCIA', 'Comprovante de residência',  'Do cliente',        '',   '[]', 3),
  ('CERTIDAO_ESTADO_CIVIL',  'Certidão de estado civil',   'Do cliente',        '',   '[]', 4),
  ('CONTRACHEQUES',          '3 últimos contracheques',    'Renda',             '',   '[{"tipo_renda":"Formal"},{"tipo_renda":"Mista"}]', 10),
  ('CARTEIRA_TRABALHO',      'Carteira de trabalho',       'Renda',             '',   '[{"tipo_renda":"Formal"},{"tipo_renda":"Mista"}]', 11),
  ('COMPROVANTE_RENDA_INF',  'Comprovante de renda informal', 'Renda',          '',   '[{"tipo_renda":"Informal"},{"tipo_renda":"Mista"}]', 12),
  ('EXTRATO_FGTS',           'Extrato do FGTS',            'FGTS',              '',   '[{"usa_fgts":true}]', 20),
  ('MATRICULA',              'Matrícula atualizada',       'Imóvel e vendedor', '',   '[]', 30),
  ('DOCS_VENDEDOR',          'RG e CPF do vendedor',       'Imóvel e vendedor', '',   '[{"vendedor":"Pessoa física"}]', 31);

-- Cada envio é uma versão. Substituir = nova versão; a anterior vira 'substituido'.
create table public.documentos (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references public.clientes (id) on delete cascade,
  tipo_codigo        text not null references public.tipos_documento (codigo),
  versao             int  not null default 1,
  situacao           text not null default 'em_conferencia'
                     check (situacao in ('em_conferencia','aceito','recusado','substituido')),
  arquivo_path       text not null,          -- caminho no Storage do Supabase
  nome_original      text,
  mime               text,
  tamanho_bytes      bigint,
  drive_file_id      text,                   -- preenchido quando sobe ao Drive
  motivo_recusa      text,
  observacao_recusa  text,
  enviado_por        uuid references public.perfis (id),
  enviado_em         timestamptz not null default now(),
  conferido_por      uuid references public.perfis (id),
  conferido_em       timestamptz,
  unique (cliente_id, tipo_codigo, versao)
);

create index documentos_cliente_idx on public.documentos (cliente_id);

-- ---------------------------------------------------------------------
-- 4. Histórico, mensagens, acessos e fila de eventos
-- ---------------------------------------------------------------------

create table public.historico_status (
  id          bigint generated always as identity primary key,
  cliente_id  uuid not null references public.clientes (id) on delete cascade,
  de          text,
  para        text not null,
  por         uuid references public.perfis (id),
  em          timestamptz not null default now()
);

create table public.mensagens (
  id           bigint generated always as identity primary key,
  cliente_id   uuid references public.clientes (id) on delete cascade,
  destino_id   uuid references public.perfis (id),
  telefone     text,
  tipo         text not null,   -- confirmacao | status | pendencia | recusa
  texto        text not null,
  situacao     text not null default 'na_fila' check (situacao in ('na_fila','enviada','erro')),
  erro         text,
  criada_em    timestamptz not null default now(),
  enviada_em   timestamptz
);

create table public.acessos_log (
  id          bigint generated always as identity primary key,
  usuario_id  uuid,
  acao        text not null,     -- ver_cliente | baixar_documento | mudar_status | conferir_documento ...
  cliente_id  uuid,
  detalhes    jsonb not null default '{}'::jsonb,
  em          timestamptz not null default now()
);

-- Fila para as funções de servidor (Drive e JSON do Cowork)
create table public.eventos (
  id           bigint generated always as identity primary key,
  tipo         text not null,    -- cliente_enviado | documento_enviado | documento_conferido | status_mudou
  cliente_id   uuid,
  documento_id uuid,
  dados        jsonb not null default '{}'::jsonb,
  processado   boolean not null default false,
  tentativas   int not null default 0,
  erro         text,
  criado_em    timestamptz not null default now()
);

create index eventos_pendentes_idx on public.eventos (processado, criado_em);

-- ---------------------------------------------------------------------
-- 5. Funções auxiliares de permissão
-- ---------------------------------------------------------------------

create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid() and ativo
$$;

create or replace function public.sou_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() in ('equipe_cca','admin'), false)
$$;

create or replace function public.minha_imobiliaria() returns uuid
language sql stable security definer set search_path = public as $$
  select imobiliaria_id from public.perfis where id = auth.uid()
$$;

create or replace function public.posso_ver_cliente(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clientes c
    where c.id = p_cliente
      and (
        c.corretor_id = auth.uid()
        or public.sou_equipe()
        or (public.meu_papel() = 'gestor_imobiliaria'
            and c.imobiliaria_id is not null
            and c.imobiliaria_id = public.minha_imobiliaria())
      )
  )
$$;

-- ---------------------------------------------------------------------
-- 6. Regras de negócio
-- ---------------------------------------------------------------------

-- Documentos exigidos para um cliente, com a situação da versão atual
create or replace function public.documentos_necessarios(p_cliente uuid)
returns table (
  tipo_codigo text, nome text, grupo text, regra text, ordem int,
  documento_id uuid, versao int, situacao text, motivo_recusa text,
  observacao_recusa text, nome_original text, arquivo_path text
)
language sql stable security definer set search_path = public as $$
  with c as (
    select to_jsonb(cl.*) as j from public.clientes cl
    where cl.id = p_cliente and public.posso_ver_cliente(p_cliente)
  ),
  atual as (
    select distinct on (d.tipo_codigo) d.*
    from public.documentos d
    where d.cliente_id = p_cliente and d.situacao <> 'substituido'
    order by d.tipo_codigo, d.versao desc
  )
  select t.codigo, t.nome, t.grupo, t.regra, t.ordem,
         a.id, a.versao, coalesce(a.situacao, 'pendente'), a.motivo_recusa,
         a.observacao_recusa, a.nome_original, a.arquivo_path
  from public.tipos_documento t
  cross join c
  left join atual a on a.tipo_codigo = t.codigo
  where t.ativo
    and (jsonb_array_length(t.condicao) = 0
         or exists (select 1 from jsonb_array_elements(t.condicao) e where c.j @> e))
  order by t.ordem
$$;

-- Sem nenhum ** pendente ou recusado → pode ir para análise
create or replace function public.pode_ir_para_analise(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.documentos_necessarios(p_cliente) d
    where d.regra = '**' and d.situacao in ('pendente', 'recusado')
  )
$$;

-- Corretor envia o cadastro (sai de rascunho)
create or replace function public.enviar_cadastro(p_cliente uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v public.clientes;
begin
  select * into v from public.clientes where id = p_cliente;
  if v.id is null or v.corretor_id <> auth.uid() then
    raise exception 'Cliente não encontrado';
  end if;
  if v.autorizacao_lgpd_em is null then
    raise exception 'Falta a confirmação de autorização do cliente (LGPD)';
  end if;
  if not v.rascunho then
    return;   -- já enviado antes: só os dados foram atualizados
  end if;
  update public.clientes
     set rascunho = false,
         enviado_em = coalesce(enviado_em, now()),
         status = case when public.pode_ir_para_analise(p_cliente)
                       then 'cadastro_recebido' else 'documentacao_pendente' end
   where id = p_cliente;
  insert into public.eventos (tipo, cliente_id) values ('cliente_enviado', p_cliente);
end $$;

-- Equipe muda o status (único caminho permitido)
create or replace function public.mudar_status(p_cliente uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_de text;
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  select status into v_de from public.clientes where id = p_cliente for update;
  if v_de is null then raise exception 'Cliente não encontrado'; end if;
  perform set_config('app.mudanca_status_autorizada', 'sim', true);
  update public.clientes set status = p_status where id = p_cliente;
  insert into public.historico_status (cliente_id, de, para, por) values (p_cliente, v_de, p_status, auth.uid());
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
    values (auth.uid(), 'mudar_status', p_cliente, jsonb_build_object('de', v_de, 'para', p_status));
  insert into public.eventos (tipo, cliente_id, dados)
    values ('status_mudou', p_cliente, jsonb_build_object('de', v_de, 'para', p_status));
end $$;

-- Equipe aceita ou recusa um documento
create or replace function public.conferir_documento(
  p_documento uuid, p_aceito boolean, p_motivo text default null, p_observacao text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_cliente uuid;
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  if not p_aceito and coalesce(p_motivo, '') = '' then
    raise exception 'Informe o motivo da recusa';
  end if;
  update public.documentos
     set situacao = case when p_aceito then 'aceito' else 'recusado' end,
         motivo_recusa = case when p_aceito then null else p_motivo end,
         observacao_recusa = case when p_aceito then null else p_observacao end,
         conferido_por = auth.uid(), conferido_em = now()
   where id = p_documento and situacao = 'em_conferencia'
  returning cliente_id into v_cliente;
  if v_cliente is null then raise exception 'Documento não está em conferência'; end if;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
    values (auth.uid(), 'conferir_documento', v_cliente,
            jsonb_build_object('documento', p_documento, 'aceito', p_aceito, 'motivo', p_motivo));
  insert into public.eventos (tipo, cliente_id, documento_id, dados)
    values ('documento_conferido', v_cliente, p_documento,
            jsonb_build_object('aceito', p_aceito, 'motivo', p_motivo, 'observacao', p_observacao));
end $$;

-- Registro de acesso (chamado pelo app ao ver cliente / baixar documento)
create or replace function public.registrar_acesso(p_acao text, p_cliente uuid, p_detalhes jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
  select auth.uid(), p_acao, p_cliente, p_detalhes
  where public.posso_ver_cliente(p_cliente)
$$;

-- ---------------------------------------------------------------------
-- 7. Gatilhos
-- ---------------------------------------------------------------------

-- Bloqueia mudança de status fora da função mudar_status / enviar_cadastro
-- e impede o corretor de trocar o dono do cliente.
create or replace function public.tg_clientes_protecao() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  if auth.uid() is null then return new; end if;   -- painel SQL / servidor
  if new.corretor_id <> old.corretor_id and not public.sou_equipe() then
    raise exception 'Não é permitido trocar o corretor do cliente';
  end if;
  if new.status <> old.status
     and current_setting('app.mudanca_status_autorizada', true) is distinct from 'sim'
     and not (old.rascunho and not new.rascunho)          -- envio do cadastro
     and not public.sou_equipe() then
    raise exception 'Somente a equipe da CCA muda o status';
  end if;
  return new;
end $$;

create trigger clientes_protecao before update on public.clientes
for each row execute function public.tg_clientes_protecao();

-- Preenche imobiliária e corretor ao criar cliente
create or replace function public.tg_clientes_novo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() then
    new.corretor_id := auth.uid();
  end if;
  select imobiliaria_id into new.imobiliaria_id from public.perfis where id = new.corretor_id;
  new.status := 'cadastro_recebido';
  return new;
end $$;

create trigger clientes_novo before insert on public.clientes
for each row execute function public.tg_clientes_novo();

-- Novo documento: numera a versão, marca a anterior como substituída
create or replace function public.tg_documentos_novo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int;
begin
  select coalesce(max(versao), 0) into v_max
    from public.documentos where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo;
  new.versao := v_max + 1;
  new.situacao := 'em_conferencia';
  new.enviado_por := auth.uid();
  new.motivo_recusa := null; new.observacao_recusa := null;
  new.conferido_por := null; new.conferido_em := null;
  update public.documentos set situacao = 'substituido'
   where cliente_id = new.cliente_id and tipo_codigo = new.tipo_codigo and situacao <> 'substituido';
  return new;
end $$;

create trigger documentos_novo before insert on public.documentos
for each row execute function public.tg_documentos_novo();

create or replace function public.tg_documentos_evento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.clientes where id = new.cliente_id and not rascunho) then
    insert into public.eventos (tipo, cliente_id, documento_id) values ('documento_enviado', new.cliente_id, new.id);
  end if;
  return new;
end $$;

create trigger documentos_evento after insert on public.documentos
for each row execute function public.tg_documentos_evento();

-- Cria o perfil automaticamente quando alguém se cadastra
create or replace function public.tg_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome, email, whatsapp)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
          new.email,
          new.raw_user_meta_data->>'whatsapp')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger novo_usuario after insert on auth.users
for each row execute function public.tg_novo_usuario();

-- Impede o usuário de se promover a equipe/admin
create or replace function public.tg_perfis_protecao() returns trigger
language plpgsql as $$
begin
  if (new.papel <> old.papel or new.imobiliaria_id is distinct from old.imobiliaria_id
      or new.ativo <> old.ativo)
     and auth.uid() is not null          -- painel SQL / servidor (sem usuário) pode
     and not public.sou_equipe() then
    raise exception 'Somente a equipe da CCA altera papel, imobiliária ou acesso';
  end if;
  return new;
end $$;

create trigger perfis_protecao before update on public.perfis
for each row execute function public.tg_perfis_protecao();

-- ---------------------------------------------------------------------
-- 8. Permissões (Row Level Security)
-- ---------------------------------------------------------------------

alter table public.imobiliarias     enable row level security;
alter table public.perfis           enable row level security;
alter table public.status_etapas    enable row level security;
alter table public.opcoes_cadastro  enable row level security;
alter table public.clientes         enable row level security;
alter table public.tipos_documento  enable row level security;
alter table public.documentos       enable row level security;
alter table public.historico_status enable row level security;
alter table public.mensagens        enable row level security;
alter table public.acessos_log      enable row level security;
alter table public.eventos          enable row level security;

-- Tabelas de configuração: todos logados leem; só equipe altera
create policy leitura_config on public.status_etapas   for select to authenticated using (true);
create policy leitura_config on public.opcoes_cadastro for select to authenticated using (true);
create policy leitura_config on public.tipos_documento for select to authenticated using (true);
create policy equipe_config  on public.status_etapas   for all to authenticated using (public.sou_equipe()) with check (public.sou_equipe());
create policy equipe_config  on public.opcoes_cadastro for all to authenticated using (public.sou_equipe()) with check (public.sou_equipe());
create policy equipe_config  on public.tipos_documento for all to authenticated using (public.sou_equipe()) with check (public.sou_equipe());

-- Imobiliárias
create policy ver_imobiliaria on public.imobiliarias for select to authenticated
  using (public.sou_equipe() or id = public.minha_imobiliaria());
create policy equipe_imobiliaria on public.imobiliarias for all to authenticated
  using (public.sou_equipe()) with check (public.sou_equipe());

-- Perfis
create policy ver_perfil on public.perfis for select to authenticated
  using (id = auth.uid() or public.sou_equipe()
         or (public.meu_papel() = 'gestor_imobiliaria' and imobiliaria_id = public.minha_imobiliaria()));
create policy editar_proprio_perfil on public.perfis for update to authenticated
  using (id = auth.uid() or public.sou_equipe()) with check (id = auth.uid() or public.sou_equipe());

-- Clientes
create policy ver_cliente on public.clientes for select to authenticated
  using (public.posso_ver_cliente(id));
create policy criar_cliente on public.clientes for insert to authenticated
  with check (public.meu_papel() is not null);
create policy editar_cliente on public.clientes for update to authenticated
  using (corretor_id = auth.uid() or public.sou_equipe())
  with check (corretor_id = auth.uid() or public.sou_equipe());

-- Documentos: corretor envia nos próprios clientes; conferência só via função
create policy ver_documento on public.documentos for select to authenticated
  using (public.posso_ver_cliente(cliente_id));
create policy enviar_documento on public.documentos for insert to authenticated
  with check (exists (select 1 from public.clientes c where c.id = cliente_id
                      and (c.corretor_id = auth.uid() or public.sou_equipe())));

-- Histórico e mensagens: quem vê o cliente vê
create policy ver_historico on public.historico_status for select to authenticated
  using (public.posso_ver_cliente(cliente_id));
create policy ver_mensagens on public.mensagens for select to authenticated
  using (destino_id = auth.uid() or public.sou_equipe());

-- Log de acessos e fila: só equipe lê (escrita via funções)
create policy ver_acessos on public.acessos_log for select to authenticated using (public.sou_equipe());
create policy ver_eventos on public.eventos     for select to authenticated using (public.sou_equipe());

-- ---------------------------------------------------------------------
-- 9. Armazenamento dos arquivos (bucket privado)
--    Caminho: <cliente_id>/<TIPO>/<versao>-<nome-do-arquivo>
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 15728640,
        array['application/pdf','image/jpeg','image/png','image/heic','image/webp'])
on conflict (id) do nothing;

create policy docs_ler on storage.objects for select to authenticated
  using (bucket_id = 'documentos'
         and public.posso_ver_cliente(((storage.foldername(name))[1])::uuid));

create policy docs_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos'
              and exists (select 1 from public.clientes c
                          where c.id = ((storage.foldername(name))[1])::uuid
                            and (c.corretor_id = auth.uid() or public.sou_equipe())));

-- ---------------------------------------------------------------------
-- 10. Visão para a lista de clientes e o painel
-- ---------------------------------------------------------------------

create or replace view public.clientes_resumo with (security_invoker = true) as
select c.id, c.nome, c.cpf, c.modalidade, c.programa, c.imovel, c.status, c.rascunho,
       s.nome as status_nome, s.ordem as status_ordem,
       c.corretor_id, p.nome as corretor_nome,
       c.imobiliaria_id, coalesce(i.nome, 'Autônomo') as imobiliaria_nome,
       c.atualizado_em,
       (select count(*) from public.documentos_necessarios(c.id) d where d.situacao = 'pendente')       as docs_pendentes,
       (select count(*) from public.documentos_necessarios(c.id) d where d.situacao = 'recusado')       as docs_recusados,
       (select count(*) from public.documentos_necessarios(c.id) d where d.situacao = 'em_conferencia') as docs_em_conferencia,
       public.pode_ir_para_analise(c.id) as pode_ir_para_analise
from public.clientes c
join public.status_etapas s on s.codigo = c.status
join public.perfis p on p.id = c.corretor_id
left join public.imobiliarias i on i.id = c.imobiliaria_id;
