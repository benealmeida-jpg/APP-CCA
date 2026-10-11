-- =====================================================================
-- 1) Alteração contratual da PJ: só pede o documento se houve alteração
-- 2) Corretor vê e baixa os documentos do vendedor que ELE enviou
-- 3) Registro de acessos com nome do usuário, imobiliária e cliente; registro de login
-- 4) Perfis ADM x Usuário: só ADM altera a equipe, permissões por usuário e parâmetros
-- =====================================================================

alter table public.vendedores add column if not exists teve_alteracao_contratual boolean;
update public.tipos_documento
   set regra = '', condicao = '[{"teve_alteracao_contratual":true}]', nome = 'Alterações contratuais após o contrato consolidado'
 where codigo = 'VEND_PJ_ALTERACOES';

-- Busca um vendedor pelo CPF/CNPJ exato (para preencher o formulário). Não lista ninguém.
create or replace function public.buscar_vendedor(p_cpf_cnpj text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object(
      'id', v.id, 'tipo', v.tipo, 'cpf_cnpj', v.cpf_cnpj, 'nome', v.nome, 'pj_tipo', v.pj_tipo,
      'empreendimento', v.empreendimento, 'construtora_cnpj', v.construtora_cnpj, 'construtora_nome', v.construtora_nome,
      'banco', v.banco, 'agencia', v.agencia, 'operacao', v.operacao, 'conta', v.conta, 'conta_digito', v.conta_digito,
      'estado_civil', v.estado_civil, 'teve_alteracao_contratual', v.teve_alteracao_contratual, 'conjuge_nome', v.conjuge_nome, 'conjuge_cpf', v.conjuge_cpf,
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
                                      banco, agencia, operacao, conta, conta_digito, estado_civil, conjuge_nome, conjuge_cpf, teve_alteracao_contratual, criado_por)
  values (case when length(v_doc) = 11 then 'PF' else 'PJ' end, v_doc, trim(p_dados->>'nome'),
          nullif(p_dados->>'pj_tipo', ''), nullif(trim(p_dados->>'empreendimento'), ''),
          nullif(regexp_replace(coalesce(p_dados->>'construtora_cnpj', ''), '\D', '', 'g'), ''),
          nullif(trim(p_dados->>'construtora_nome'), ''),
          nullif(trim(p_dados->>'banco'), ''), nullif(trim(p_dados->>'agencia'), ''),
          nullif(trim(p_dados->>'operacao'), ''), nullif(trim(p_dados->>'conta'), ''), nullif(trim(p_dados->>'conta_digito'), ''),
          nullif(p_dados->>'estado_civil', ''), nullif(trim(p_dados->>'conjuge_nome'), ''),
          nullif(regexp_replace(coalesce(p_dados->>'conjuge_cpf', ''), '\D', '', 'g'), ''),
          (p_dados->>'teve_alteracao_contratual')::boolean, auth.uid())
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
    conta_digito     = case when excluded.conta is not null then excluded.conta_digito else v.conta_digito end,
    estado_civil     = coalesce(excluded.estado_civil, v.estado_civil),
    conjuge_nome     = case when coalesce(excluded.estado_civil, v.estado_civil) = 'Casado(a)' then coalesce(excluded.conjuge_nome, v.conjuge_nome) end,
    conjuge_cpf      = case when coalesce(excluded.estado_civil, v.estado_civil) = 'Casado(a)' then coalesce(excluded.conjuge_cpf, v.conjuge_cpf) end,
    teve_alteracao_contratual = coalesce(excluded.teve_alteracao_contratual, v.teve_alteracao_contratual),
    atualizado_em    = now()
  returning id into v_id;

  update public.clientes set vendedor_id = v_id where id = p_cliente;
  return public.buscar_vendedor(v_doc);
end $$;


-- Documentos do vendedor: equipe vê tudo; o corretor abre só os que ele mesmo enviou
create or replace function public.documentos_do_vendedor(p_cliente uuid)
returns table (id uuid, tipo_codigo text, versao int, situacao text, enviado_em timestamptz,
               motivo_recusa text, observacao_recusa text, nome_original text, arquivo_path text, vendedor_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct on (d.tipo_codigo)
         d.id, d.tipo_codigo, d.versao, d.situacao, d.enviado_em, d.motivo_recusa, d.observacao_recusa,
         case when public.sou_equipe() or d.enviado_por = auth.uid() then d.nome_original end,
         case when public.sou_equipe() or d.enviado_por = auth.uid() then d.arquivo_path end,
         d.vendedor_id
  from public.clientes c
  join public.documentos_vendedor d on d.vendedor_id = c.vendedor_id and d.situacao <> 'substituido'
  where c.id = p_cliente and public.posso_ver_cliente(p_cliente)
  order by d.tipo_codigo, d.versao desc
$$;

do $$ begin
  create policy vend_ler_proprio on storage.objects for select to authenticated
    using (bucket_id = 'vendedores' and owner_id = auth.uid()::text);
exception when duplicate_object then null; end $$;

-- Registro de acessos legível (só equipe)
create or replace function public.listar_acessos(p_limite int default 300)
returns table (id bigint, em timestamptz, acao text, usuario_nome text, usuario_papel text,
               imobiliaria_nome text, cliente_nome text, detalhes jsonb)
language sql stable security definer set search_path = public as $$
  select a.id, a.em, a.acao, p.nome, p.papel,
         case when p.papel in ('equipe_cca', 'admin') then 'Equipe CCA' else coalesce(i.nome, 'Autônomo') end,
         c.nome, a.detalhes
  from public.acessos_log a
  left join public.perfis p on p.id = a.usuario_id
  left join public.imobiliarias i on i.id = p.imobiliaria_id
  left join public.clientes c on c.id = a.cliente_id
  where public.sou_equipe()
  order by a.em desc
  limit least(coalesce(p_limite, 300), 1000)
$$;

create or replace function public.registrar_login() returns void
language sql security definer set search_path = public as $$
  insert into public.acessos_log (usuario_id, acao, detalhes)
  select auth.uid(), 'login', '{}'::jsonb where auth.uid() is not null
$$;

-- Perfis: ADM (administrador) e Usuário (equipe_cca), com permissões por usuário
alter table public.perfis add column if not exists permissoes jsonb not null default '{}'::jsonb;

create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() = 'admin', false)
$$;

-- ADM pode tudo; usuário da equipe pode, a não ser que o ADM tenha desligado
create or replace function public.tenho_permissao(p_chave text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.meu_papel()
           when 'admin' then true
           when 'equipe_cca' then coalesce((select (permissoes->>p_chave)::boolean from public.perfis where id = auth.uid()), true)
           else false end
$$;

create or replace function public.tg_perfis_protecao() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- painel SQL / servidor
  if (new.papel <> old.papel or new.imobiliaria_id is distinct from old.imobiliaria_id
      or new.ativo <> old.ativo or new.permissoes is distinct from old.permissoes) then
    if not public.sou_equipe() then
      raise exception 'Somente a equipe da CCA altera papel, imobiliária ou acesso';
    end if;
    if (old.papel in ('equipe_cca', 'admin') or new.papel in ('equipe_cca', 'admin') or new.permissoes is distinct from old.permissoes)
       and not public.sou_admin() then
      raise exception 'Somente administradores alteram usuários da equipe e permissões';
    end if;
    if new.id = auth.uid() and old.papel = 'admin' and (new.papel <> 'admin' or not new.ativo) then
      raise exception 'Você não pode tirar o seu próprio acesso de administrador';
    end if;
  end if;
  return new;
end $$;

create or replace function public.admin_atualizar_usuario(p_usuario uuid, p_papel text, p_ativo boolean, p_permissoes jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores'; end if;
  if p_papel not in ('corretor', 'gestor_imobiliaria', 'equipe_cca', 'admin') then raise exception 'Perfil inválido'; end if;
  if p_usuario = auth.uid() and (p_papel <> 'admin' or not p_ativo) then
    raise exception 'Você não pode tirar o seu próprio acesso de administrador';
  end if;
  update public.perfis set papel = p_papel, ativo = p_ativo, permissoes = coalesce(p_permissoes, '{}'::jsonb) where id = p_usuario;
  insert into public.acessos_log (usuario_id, acao, detalhes)
  values (auth.uid(), 'alterar_usuario', jsonb_build_object('usuario', p_usuario, 'papel', p_papel, 'ativo', p_ativo, 'permissoes', p_permissoes));
end $$;

create or replace function public.admin_salvar_parametro(p_chave text, p_valor text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores'; end if;
  update public.parametros set valor = p_valor where chave = p_chave;
  if not found then raise exception 'Parâmetro não encontrado'; end if;
  insert into public.acessos_log (usuario_id, acao, detalhes)
  values (auth.uid(), 'alterar_parametro', jsonb_build_object('chave', p_chave, 'valor', p_valor));
end $$;

-- Mudar status e conferir documentos respeitam a permissão do usuário
create or replace function public.mudar_status(p_cliente uuid, p_status text) returns void
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
    values (auth.uid(), 'mudar_status', p_cliente, jsonb_build_object('de', v_de, 'para', p_status));
  insert into public.eventos (tipo, cliente_id, dados)
    values ('status_mudou', p_cliente, jsonb_build_object('de', v_de, 'para', p_status));
end $$;

create or replace function public.conferir_documento(
  p_documento uuid, p_aceito boolean, p_motivo text default null, p_observacao text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_cliente uuid;
begin
  if not public.sou_equipe() or not public.tenho_permissao('conferir_documentos') then raise exception 'Sem permissão para conferir documentos'; end if;
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

create or replace function public.conferir_documento_vendedor(
  p_documento uuid, p_aceito boolean, p_motivo text default null, p_observacao text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_cliente uuid;
begin
  if not public.sou_equipe() or not public.tenho_permissao('conferir_documentos') then raise exception 'Sem permissão para conferir documentos'; end if;
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

revoke execute on function public.listar_acessos(int), public.registrar_login(), public.sou_admin(), public.tenho_permissao(text),
  public.admin_atualizar_usuario(uuid, text, boolean, jsonb), public.admin_salvar_parametro(text, text) from public, anon;
grant execute on function public.listar_acessos(int), public.registrar_login(), public.sou_admin(), public.tenho_permissao(text),
  public.admin_atualizar_usuario(uuid, text, boolean, jsonb), public.admin_salvar_parametro(text, text) to authenticated;
