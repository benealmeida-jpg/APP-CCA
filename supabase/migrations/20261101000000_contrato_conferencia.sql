-- Assinatura do contrato: conferência pela CCA antes de liberar o contrato e a procuração do gerente.
-- 1. Cadastro de gerentes da Caixa, cada um com o seu jogo de procurações (validade informada pela CCA ou lida pela IA).
-- 2. No cliente, a CCA escolhe o tipo de contrato (NATO Digital ou Misto) e o gerente; a procuração vigente é vinculada.
-- 3. Conferência guiada (dados do comprador, vendedor, imóvel, gerente, campos de assinatura, validação no ITI).
-- 4. O contrato assinado, o validador e a procuração só ficam visíveis para corretor/imobiliária/cliente depois que
--    a CCA libera (antes, anexar esses arquivos não avança mais a etapa sozinho).
-- 5. Vendedor: quem assina por ele (pessoa jurídica) e regras de dispensa (ex.: construtora em que o diretor não assina todos os campos).

-- ---------- Gerentes da Caixa ----------
create table if not exists public.gerentes_caixa (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text,
  agencia text,
  email text,
  telefone text,
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por uuid
);
alter table public.gerentes_caixa enable row level security;
create policy gerentes_ver on public.gerentes_caixa for select to authenticated using (public.sou_equipe());

create table if not exists public.procuracoes_gerente (
  id uuid primary key default gen_random_uuid(),
  gerente_id uuid not null references public.gerentes_caixa(id),
  arquivo_path text not null,
  nome_original text,
  mime text,
  tamanho_bytes bigint,
  validade date,                 -- até quando vale (CCA informa ou a IA lê)
  outorgada_em date,
  validade_por text check (validade_por in ('cca', 'ia')),
  ia jsonb,                      -- leitura da IA (resumo, outorgado, poderes, alertas)
  enviado_por uuid default auth.uid(),
  enviado_em timestamptz not null default now(),
  excluida_em timestamptz,
  excluida_por uuid
);
create index if not exists procuracoes_gerente_gerente_idx on public.procuracoes_gerente (gerente_id);
alter table public.procuracoes_gerente enable row level security;
create policy procuracoes_ver on public.procuracoes_gerente for select to authenticated using (public.sou_equipe());

insert into storage.buckets (id, name, public) values ('procuracoes', 'procuracoes', false) on conflict (id) do nothing;
create policy procuracoes_ler on storage.objects for select to authenticated using (bucket_id = 'procuracoes' and public.sou_equipe());
create policy procuracoes_enviar on storage.objects for insert to authenticated with check (bucket_id = 'procuracoes' and public.sou_equipe());

-- ---------- Cliente e vendedor ----------
alter table public.clientes add column if not exists contrato_tipo text check (contrato_tipo in ('digital', 'misto'));
alter table public.clientes add column if not exists contrato_gerente_id uuid references public.gerentes_caixa(id);
alter table public.clientes add column if not exists contrato_conferencia jsonb;
alter table public.clientes add column if not exists contrato_liberado_em timestamptz;
alter table public.clientes add column if not exists contrato_liberado_por uuid;
create index if not exists clientes_contrato_gerente_idx on public.clientes (contrato_gerente_id);

alter table public.vendedores add column if not exists assinantes jsonb;        -- ["Nome de quem assina pelo vendedor", ...]
alter table public.vendedores add column if not exists regra_assinatura text;   -- dispensas e observações (procuração / contrato social)

-- ---------- Visibilidade: arquivos da Caixa só depois da liberação ----------
create or replace function public.contrato_arquivo_liberado(p_cliente uuid, p_tipo text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_equipe()
      or coalesce(p_tipo, '') not in ('contrato_assinado', 'validador_assinatura', 'procuracao_gerente')
      or exists (select 1 from public.clientes c where c.id = p_cliente
                  and c.status in ('contrato_assinado', 'registro_cartorio', 'conformidade_final', 'credito_liberado'))
$$;
revoke execute on function public.contrato_arquivo_liberado(uuid, text) from public, anon;
grant execute on function public.contrato_arquivo_liberado(uuid, text) to authenticated;

alter policy contrato_ver on public.contrato_arquivos
  using (public.posso_ver_cliente(cliente_id) and public.contrato_arquivo_liberado(cliente_id, tipo));

alter policy docs_ler on storage.objects
  using ((bucket_id = 'documentos') and public.posso_ver_cliente(((storage.foldername(name))[1])::uuid)
    and ((public.meu_papel() is distinct from 'cliente') or public.doc_do_comprador((storage.foldername(name))[2]))
    and (((storage.foldername(name))[2]) is distinct from 'contrato'
         or public.contrato_arquivo_liberado(((storage.foldername(name))[1])::uuid, (storage.foldername(name))[3])));

-- ---------- Funções: gerentes e procurações (equipe) ----------
create or replace function public.gerente_salvar(p_id uuid, p_nome text, p_cpf text, p_agencia text, p_email text, p_telefone text, p_ativo boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  if not public.sou_equipe() then raise exception 'Somente a equipe da CCA cadastra gerentes'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do gerente'; end if;
  if v_id is null then
    insert into public.gerentes_caixa (nome, cpf, agencia, email, telefone, ativo)
    values (trim(p_nome), nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), ''), nullif(trim(p_agencia), ''), nullif(trim(p_email), ''), nullif(trim(p_telefone), ''), coalesce(p_ativo, true))
    returning id into v_id;
  else
    update public.gerentes_caixa set nome = trim(p_nome), cpf = nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), ''),
      agencia = nullif(trim(p_agencia), ''), email = nullif(trim(p_email), ''), telefone = nullif(trim(p_telefone), ''), ativo = coalesce(p_ativo, ativo)
    where id = v_id and excluido_em is null;
  end if;
  return v_id;
end $$;

create or replace function public.gerente_excluir(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  update public.gerentes_caixa set excluido_em = now(), excluido_por = auth.uid() where id = p_id;
end $$;

create or replace function public.procuracao_registrar(p_gerente uuid, p_path text, p_nome text, p_mime text, p_tamanho bigint, p_validade date, p_outorgada date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.sou_equipe() then raise exception 'Somente a equipe da CCA anexa procurações'; end if;
  if split_part(coalesce(p_path, ''), '/', 1) <> p_gerente::text then raise exception 'Arquivo inválido'; end if;
  if not exists (select 1 from public.gerentes_caixa where id = p_gerente and excluido_em is null) then raise exception 'Gerente não encontrado'; end if;
  insert into public.procuracoes_gerente (gerente_id, arquivo_path, nome_original, mime, tamanho_bytes, validade, outorgada_em, validade_por)
  values (p_gerente, p_path, p_nome, p_mime, p_tamanho, p_validade, p_outorgada, case when p_validade is null then null else 'cca' end)
  returning id into v_id;
  return v_id;
end $$;

-- p_ia preenchido = leitura da IA (validade_por 'ia'); sem p_ia = a CCA informou
create or replace function public.procuracao_atualizar(p_id uuid, p_validade date, p_outorgada date, p_ia jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  update public.procuracoes_gerente set validade = p_validade, outorgada_em = coalesce(p_outorgada, outorgada_em),
    validade_por = case when p_validade is null then null when p_ia is not null then 'ia' else 'cca' end,
    ia = coalesce(p_ia, ia)
  where id = p_id and excluida_em is null;
end $$;

create or replace function public.procuracao_excluir(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Sem permissão'; end if;
  update public.procuracoes_gerente set excluida_em = now(), excluida_por = auth.uid() where id = p_id;
end $$;

-- Gerentes com a procuração mais nova de cada um (para a tela e para o vínculo automático)
create or replace function public.gerentes_lista() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Somente a equipe da CCA'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', g.id, 'nome', g.nome, 'cpf', g.cpf, 'agencia', g.agencia, 'email', g.email, 'telefone', g.telefone, 'ativo', g.ativo,
      'procuracoes', coalesce((select jsonb_agg(to_jsonb(p) - 'enviado_por' - 'excluida_por' - 'excluida_em' order by p.enviado_em desc)
                               from public.procuracoes_gerente p where p.gerente_id = g.id and p.excluida_em is null), '[]'::jsonb))
    order by g.ativo desc, g.nome) from public.gerentes_caixa g where g.excluido_em is null), '[]'::jsonb);
end $$;

-- ---------- Funções: conferência e liberação do contrato ----------
create or replace function public.contrato_definir(p_cliente uuid, p_tipo text, p_gerente uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.sou_equipe() and public.tenho_permissao('mudar_status')) then raise exception 'Somente a equipe da CCA'; end if;
  if p_tipo is not null and p_tipo not in ('digital', 'misto') then raise exception 'Tipo de contrato inválido'; end if;
  if p_gerente is not null and not exists (select 1 from public.gerentes_caixa where id = p_gerente and excluido_em is null) then raise exception 'Gerente não encontrado'; end if;
  update public.clientes set contrato_tipo = p_tipo, contrato_gerente_id = p_gerente where id = p_cliente;
end $$;

-- Marca os itens conferidos. p_itens = {"comprador": true, ...}; p_extra = assinaturas lidas, leitura da IA etc.
create or replace function public.contrato_salvar_conferencia(p_cliente uuid, p_itens jsonb, p_extra jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.sou_equipe() and public.tenho_permissao('mudar_status')) then raise exception 'Somente a equipe da CCA'; end if;
  update public.clientes set contrato_conferencia = coalesce(contrato_conferencia, '{}'::jsonb)
      || jsonb_build_object('itens', coalesce(contrato_conferencia->'itens', '{}'::jsonb) || coalesce(p_itens, '{}'::jsonb),
                            'por', auth.uid(), 'em', now())
      || coalesce(p_extra - 'itens' - 'por' - 'em', '{}'::jsonb)
  where id = p_cliente;
end $$;

create or replace function public.contrato_pendencias_liberacao(p_cliente uuid) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare c record; v text[] := '{}'; v_val date; it text;
  v_itens text[] := array['comprador', 'vendedor', 'imovel', 'gerente', 'campos_assinatura', 'assinaturas'];
  v_nomes text[] := array['dados do comprador', 'dados do vendedor', 'dados do imóvel', 'dados do gerente', 'campos de assinatura de todos', 'assinaturas validadas'];
  i int;
begin
  if not public.sou_equipe() then raise exception 'Somente a equipe da CCA'; end if;
  select * into c from public.clientes where id = p_cliente;
  if c.id is null then raise exception 'Cliente não encontrado'; end if;
  if c.status <> 'minuta_em_maos' then v := v || 'o processo não está na etapa Contrato'; end if;
  if c.contrato_tipo is null then v := v || 'tipo de contrato (NATO Digital ou Misto)'; end if;
  if c.contrato_gerente_id is null then v := v || 'gerente responsável'; end if;
  if not exists (select 1 from public.contrato_arquivos where cliente_id = p_cliente and tipo = 'contrato_assinado' and not substituido) then v := v || 'contrato assinado por todos'; end if;
  if not exists (select 1 from public.contrato_arquivos where cliente_id = p_cliente and tipo = 'validador_assinatura' and not substituido) then v := v || 'relatório de validação do ITI'; end if;
  if not exists (select 1 from public.contrato_arquivos where cliente_id = p_cliente and tipo = 'procuracao_gerente' and not substituido) then v := v || 'procuração do gerente vinculada'; end if;
  if c.contrato_gerente_id is not null then
    select validade into v_val from public.procuracoes_gerente where gerente_id = c.contrato_gerente_id and excluida_em is null order by enviado_em desc limit 1;
    if v_val is null then v := v || 'validade da procuração';
    elsif v_val < (now() at time zone 'America/Sao_Paulo')::date then v := v || 'procuração vencida: anexe a nova no cadastro do gerente'; end if;
  end if;
  for i in 1 .. array_length(v_itens, 1) loop
    it := v_itens[i];
    if coalesce((c.contrato_conferencia->'itens'->>it)::boolean, false) is not true then v := v || ('conferir ' || v_nomes[i]); end if;
  end loop;
  return v;
end $$;

create or replace function public.contrato_liberar(p_cliente uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_falta text[]; v_nome text;
begin
  if not (public.sou_equipe() and public.tenho_permissao('mudar_status')) then raise exception 'Somente a equipe da CCA libera o contrato'; end if;
  perform 1 from public.clientes where id = p_cliente for update;
  v_falta := public.contrato_pendencias_liberacao(p_cliente);
  if array_length(v_falta, 1) > 0 then raise exception 'Antes de liberar, falta: %', array_to_string(v_falta, '; '); end if;
  select nome into v_nome from public.clientes where id = p_cliente;
  perform set_config('app.mudanca_status_autorizada', 'sim', true);
  insert into public.historico_status (cliente_id, de, para, por) values (p_cliente, 'minuta_em_maos', 'contrato_assinado', auth.uid());
  insert into public.historico_status (cliente_id, de, para, por) values (p_cliente, 'contrato_assinado', 'registro_cartorio', auth.uid());
  update public.clientes set status = 'registro_cartorio', contrato_liberado_em = now(), contrato_liberado_por = auth.uid() where id = p_cliente;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'contrato_liberado', p_cliente, '{}'::jsonb);
  insert into public.eventos (tipo, cliente_id, dados)
  values ('status_mudou', p_cliente, jsonb_build_object('de', 'minuta_em_maos', 'para', 'contrato_assinado', 'mensagem',
    'O contrato de ' || v_nome || ' está assinado e conferido! O contrato, a procuração do gerente e o validador das assinaturas já estão no Portal, disponíveis para baixar e imprimir. Próximo passo: levar o contrato ao cartório de registro de imóveis. Depois de registrado, envie aqui o contrato registrado, o talão do RGI e a certidão de ônus reais com o registro.'));
end $$;

-- Vendedor: quem assina por ele e regras de dispensa
create or replace function public.vendedor_regra_assinatura(p_vendedor uuid, p_assinantes jsonb, p_regra text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() then raise exception 'Somente a equipe da CCA'; end if;
  if p_assinantes is not null and jsonb_typeof(p_assinantes) <> 'array' then raise exception 'Lista de assinantes inválida'; end if;
  update public.vendedores set assinantes = p_assinantes, regra_assinatura = nullif(trim(coalesce(p_regra, '')), '') where id = p_vendedor;
end $$;

-- ---------- Anexar arquivo do contrato: os arquivos da Caixa não avançam mais a etapa sozinhos ----------
create or replace function public.contrato_registrar_arquivo(p_cliente uuid, p_tipo text, p_nome text, p_path text, p_mime text, p_tamanho bigint)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_status text; v_nome text; v_id uuid; v_equipe boolean; v_msg text; v_conversa text; v_ir text; v_para text;
  v_cca text[] := array['minuta','planilha_progressao','carta_credito','contrato_assinado','validador_assinatura','procuracao_gerente'];
begin
  select status, nome into v_status, v_nome from public.clientes where id = p_cliente for update;
  if v_status is null then raise exception 'Cliente não encontrado'; end if;
  v_equipe := public.sou_equipe();
  if p_tipo = any(v_cca) then
    if not (v_equipe and public.tenho_permissao('mudar_status')) then raise exception 'Somente a equipe da CCA anexa este arquivo'; end if;
  else
    if not public.posso_ver_cliente(p_cliente) then raise exception 'Sem permissão'; end if;
    if not v_equipe then
      if p_tipo = 'minuta_assinada' and v_status <> 'minuta_em_maos' then raise exception 'A minuta assinada só pode ser enviada na etapa Contrato'; end if;
      if p_tipo in ('contrato_registrado', 'talao_rgi', 'onus_reais') and v_status <> 'registro_cartorio' then raise exception 'Estes documentos só podem ser enviados na etapa Registro'; end if;
    end if;
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> p_cliente::text then raise exception 'Arquivo inválido'; end if;

  update public.contrato_arquivos set substituido = true where cliente_id = p_cliente and tipo = p_tipo and not substituido;
  insert into public.contrato_arquivos (cliente_id, tipo, nome_original, arquivo_path, mime, tamanho_bytes, enviado_por)
    values (p_cliente, p_tipo, p_nome, p_path, p_mime, p_tamanho, auth.uid()) returning id into v_id;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes)
    values (auth.uid(), 'contrato_arquivo', p_cliente, jsonb_build_object('tipo', p_tipo));

  if p_tipo in ('minuta', 'planilha_progressao', 'carta_credito') then
    if v_status = 'conformidade'
       and (select count(distinct tipo) from public.contrato_arquivos where cliente_id = p_cliente and not substituido and tipo in ('minuta', 'planilha_progressao', 'carta_credito')) = 3 then
      v_ir := 'minuta_em_maos'; v_para := 'minuta_em_maos';
      v_msg := 'A minuta de ' || v_nome || ' está disponível para assinatura. Abra o cliente no Portal, baixe a minuta, colha as assinaturas do comprador e do vendedor e envie a minuta assinada.';
    elsif v_status = 'minuta_em_maos' and p_tipo = 'minuta' then
      v_msg := 'A minuta de ' || v_nome || ' foi atualizada. Baixe a versão nova no Portal antes de colher as assinaturas.'; v_para := v_status;
    end if;
  elsif p_tipo = 'minuta_assinada' then
    if not v_equipe then v_conversa := 'Enviei a minuta assinada pelas partes (comprador e vendedor). Ela já está no sistema.'; end if;
  elsif p_tipo in ('contrato_registrado', 'talao_rgi', 'onus_reais') then
    if v_status = 'registro_cartorio'
       and (select count(distinct tipo) from public.contrato_arquivos where cliente_id = p_cliente and not substituido and tipo in ('contrato_registrado', 'talao_rgi', 'onus_reais')) = 3 then
      v_ir := 'conformidade_final';
      if not v_equipe then v_conversa := 'Enviei o contrato registrado, o talão do RGI e a certidão de ônus reais com o registro. Pode seguir para a conformidade.'; end if;
    end if;
  end if;
  -- contrato_assinado, validador_assinatura e procuracao_gerente: a etapa só avança em contrato_liberar (conferência da CCA)

  if v_ir is not null then
    perform set_config('app.mudanca_status_autorizada', 'sim', true);
    insert into public.historico_status (cliente_id, de, para, por) values (p_cliente, v_status, v_ir, auth.uid());
    update public.clientes set status = v_ir where id = p_cliente;
  end if;
  if v_msg is not null then
    insert into public.eventos (tipo, cliente_id, dados)
      values ('status_mudou', p_cliente, jsonb_build_object('de', v_status, 'para', v_para, 'mensagem', v_msg));
  end if;
  if v_conversa is not null then
    insert into public.conversa (cliente_id, autor_id, texto) values (p_cliente, auth.uid(), v_conversa);
  end if;
  return v_id;
end $function$;

do $$ declare f text; begin
  foreach f in array array['gerente_salvar(uuid, text, text, text, text, text, boolean)', 'gerente_excluir(uuid)',
    'procuracao_registrar(uuid, text, text, text, bigint, date, date)', 'procuracao_atualizar(uuid, date, date, jsonb)', 'procuracao_excluir(uuid)',
    'gerentes_lista()', 'contrato_definir(uuid, text, uuid)', 'contrato_salvar_conferencia(uuid, jsonb, jsonb)',
    'contrato_pendencias_liberacao(uuid)', 'contrato_liberar(uuid)', 'vendedor_regra_assinatura(uuid, jsonb, text)',
    'contrato_registrar_arquivo(uuid, text, text, text, text, bigint)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
