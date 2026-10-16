-- =====================================================================
-- MODELO 2 · parte 1: perfis e acessos
-- CCA em níveis (1 = CEO da CCA, 2 e 3); imobiliária com CEO, gestor e corretores;
-- cliente final com acesso ao portal (opcional); conversa interna e mural da imobiliária;
-- comissões dos corretores (CEO da imobiliária); perfil secundário do nível 1.
-- =====================================================================

-- ---------- 1. Colunas novas ----------
alter table public.perfis add column if not exists nivel smallint check (nivel in (1, 2, 3));
alter table public.perfis add column if not exists funcao text check (funcao in ('ceo', 'gestor'));
alter table public.perfis add column if not exists cliente_id uuid references public.clientes (id) on delete set null;
alter table public.perfis add column if not exists acesso_cliente boolean not null default false;
alter table public.imobiliarias add column if not exists acesso_cliente boolean not null default false;

alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('corretor', 'gestor_imobiliaria', 'equipe_cca', 'admin', 'cliente'));

alter table public.convites_link drop constraint if exists convites_link_tipo_check;
alter table public.convites_link add constraint convites_link_tipo_check check (tipo in ('corretor', 'imobiliaria', 'equipe_cca', 'admin', 'cliente'));
alter table public.convites_link add column if not exists funcao text check (funcao in ('ceo', 'gestor'));
alter table public.convites_link add column if not exists cliente_id uuid references public.clientes (id) on delete cascade;

-- O dono da CCA é o nível 1
update public.perfis set nivel = 1 where email = 'contato@andradealmeidacca.com.br' and papel = 'admin' and nivel is null;

-- ---------- 2. Funções auxiliares ----------
-- Nível na CCA: 1 (CEO), 2 ou 3. Sem nível marcado: ADM = 2, equipe = 3.
create or replace function public.meu_nivel() returns smallint
language sql stable security definer set search_path = public as $$
  select case when p.papel in ('equipe_cca', 'admin') then coalesce(p.nivel, case when p.papel = 'admin' then 2 else 3 end)::smallint end
  from public.perfis p where p.id = auth.uid() and p.ativo
$$;
create or replace function public.sou_nivel1() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_nivel() = 1, false)
$$;
-- Função na imobiliária: ceo (sem marcação) ou gestor
create or replace function public.minha_funcao() returns text
language sql stable security definer set search_path = public as $$
  select case when p.papel = 'gestor_imobiliaria' then coalesce(p.funcao, 'ceo') end
  from public.perfis p where p.id = auth.uid() and p.ativo
$$;
create or replace function public.sou_ceo_imob() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.minha_funcao() = 'ceo', false)
$$;
-- Gestor ativo da imobiliária (quem fala com a CCA quando existe)
create or replace function public.gestor_da_imob(p_imob uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.perfis p
  where p_imob is not null and p.imobiliaria_id = p_imob and p.papel = 'gestor_imobiliaria' and p.funcao = 'gestor' and p.ativo
  order by p.criado_em limit 1
$$;
-- Acesso do cliente final ao portal: ligado pela imobiliária (CEO) ou pelo corretor independente
create or replace function public.acesso_cliente_ligado(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case when c.imobiliaria_id is not null then i.acesso_cliente else p.acesso_cliente end
                   from public.clientes c
                   left join public.imobiliarias i on i.id = c.imobiliaria_id
                   left join public.perfis p on p.id = c.corretor_id
                   where c.id = p_cliente), false)
$$;
-- Processo do cliente final logado (só se o acesso estiver ligado)
create or replace function public.meu_cliente() returns uuid
language sql stable security definer set search_path = public as $$
  select p.cliente_id from public.perfis p
  where p.id = auth.uid() and p.ativo and p.papel = 'cliente' and public.acesso_cliente_ligado(p.cliente_id)
$$;
-- Quem é da imobiliária do cliente (CEO, gestor ou corretor)
create or replace function public.sou_da_imob_do_cliente(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clientes c join public.perfis p on p.id = auth.uid()
                 where c.id = p_cliente and c.imobiliaria_id is not null and p.imobiliaria_id = c.imobiliaria_id
                   and p.ativo and p.papel in ('corretor', 'gestor_imobiliaria'))
$$;
-- Rótulo de quem escreveu (CEO, Gestor, Corretor, CCA)
create or replace function public.rotulo_pessoa(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when p.papel = 'gestor_imobiliaria' then case coalesce(p.funcao, 'ceo') when 'ceo' then 'CEO' else 'Gestor' end
              when p.papel = 'corretor' then 'Corretor' when p.papel in ('equipe_cca', 'admin') then 'CCA' when p.papel = 'cliente' then 'Cliente' else '' end
  from public.perfis p where p.id = p_id
$$;

-- O cliente final vê só o próprio processo
create or replace function public.posso_ver_cliente(p_cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'service_role' or exists (
    select 1 from public.clientes c
    where c.id = p_cliente
      and (
        c.corretor_id = auth.uid()
        or public.sou_equipe()
        or (public.meu_papel() = 'gestor_imobiliaria'
            and c.imobiliaria_id is not null
            and c.imobiliaria_id = public.minha_imobiliaria())
        or (public.meu_papel() = 'cliente' and c.id = public.meu_cliente())
      )
  )
$$;

-- ---------- 3. Proteção dos perfis ----------
-- Papel, imobiliária, acesso, nível, função e vínculo do cliente só mudam pela equipe ou pelas funções próprias
create or replace function public.tg_perfis_protecao() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null or coalesce(current_setting('app.gestor_corretores', true), '') = 'sim' then return new; end if;
  if (new.papel <> old.papel or new.imobiliaria_id is distinct from old.imobiliaria_id or new.ativo <> old.ativo
      or new.funcao is distinct from old.funcao or new.cliente_id is distinct from old.cliente_id)
     and not public.sou_equipe() then
    raise exception 'Somente a equipe da CCA altera papel, imobiliária ou acesso';
  end if;
  if new.nivel is distinct from old.nivel and not public.sou_nivel1() then
    raise exception 'Somente o nível 1 (CEO da CCA) muda o nível';
  end if;
  if new.acesso_cliente <> old.acesso_cliente and coalesce(current_setting('app.acesso_cliente', true), '') <> 'sim' then
    raise exception 'Use a chave de acesso dos clientes';
  end if;
  return new;
end $$;

create or replace function public.admin_definir_nivel(p_usuario uuid, p_nivel smallint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_nivel1() then raise exception 'Somente o nível 1 (CEO da CCA)'; end if;
  if p_nivel not in (1, 2, 3) then raise exception 'Nível inválido'; end if;
  if p_usuario = auth.uid() and p_nivel <> 1 then raise exception 'Você não pode tirar o seu próprio nível 1'; end if;
  if not exists (select 1 from public.perfis where id = p_usuario and papel in ('equipe_cca', 'admin')) then raise exception 'Só a equipe da CCA tem nível'; end if;
  update public.perfis set nivel = p_nivel where id = p_usuario;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'definir_nivel', jsonb_build_object('usuario', p_usuario, 'nivel', p_nivel));
end $$;

-- ---------- 4. Imobiliária: o CEO cuida da equipe; o gestor cuida da documentação ----------
create or replace function public.gestor_ativar_corretor(p_usuario uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_ceo_imob() or public.minha_imobiliaria() is null then raise exception 'Somente o CEO da imobiliária'; end if;
  if p_usuario = auth.uid() then raise exception 'Você não pode desligar o seu próprio acesso'; end if;
  if not exists (select 1 from public.perfis where id = p_usuario and imobiliaria_id = public.minha_imobiliaria()
                 and (papel = 'corretor' or (papel = 'gestor_imobiliaria' and funcao = 'gestor'))) then
    raise exception 'Corretor não encontrado na sua imobiliária';
  end if;
  perform set_config('app.gestor_corretores', 'sim', true);
  update public.perfis set ativo = p_ativo where id = p_usuario;
  insert into public.acessos_log (usuario_id, acao, detalhes)
  values (auth.uid(), case when p_ativo then 'ativar_usuario' else 'desativar_usuario' end, jsonb_build_object('usuario', p_usuario, 'por', 'gestor'));
end $$;

create or replace function public.gestor_passar_clientes(p_de uuid, p_para uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.sou_ceo_imob() or public.minha_imobiliaria() is null then raise exception 'Somente o CEO da imobiliária'; end if;
  if p_de = p_para then raise exception 'Escolha outro corretor'; end if;
  if not exists (select 1 from public.perfis where id = p_de and imobiliaria_id = public.minha_imobiliaria())
     or not exists (select 1 from public.perfis where id = p_para and ativo and papel in ('corretor', 'gestor_imobiliaria') and imobiliaria_id = public.minha_imobiliaria()) then
    raise exception 'Os dois precisam ser da sua imobiliária';
  end if;
  update public.clientes set corretor_id = p_para where corretor_id = p_de and imobiliaria_id = public.minha_imobiliaria();
  get diagnostics v_n = row_count;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'passar_clientes', jsonb_build_object('de', p_de, 'para', p_para, 'clientes', v_n));
  return v_n;
end $$;

-- Corretor de imobiliária com gestor: quem fala com a CCA é o gestor (o corretor só lê)
-- (sem security definer: current_user mostra se foi a pessoa que escreveu ou uma função do sistema)
create or replace function public.tg_conversa_quem_escreve() returns trigger
language plpgsql set search_path = public as $$
begin
  -- só o que a pessoa escreve direto (as funções do sistema também gravam mensagens automáticas)
  if auth.uid() is not null and current_user = 'authenticated' and public.meu_papel() = 'corretor'
     and public.gestor_da_imob((select imobiliaria_id from public.clientes where id = new.cliente_id)) is not null then
    raise exception 'Na sua imobiliária, quem fala com a CCA é o gestor. Escreva para ele na conversa interna.';
  end if;
  return new;
end $$;
create or replace trigger conversa_quem_escreve before insert on public.conversa for each row execute function public.tg_conversa_quem_escreve();

-- listar_conversa_m2: a conversa com o rótulo de quem escreveu
create or replace function public.listar_conversa_m2(p_cliente uuid)
returns table (id bigint, texto text, criada_em timestamptz, autor_id uuid, autor_nome text, da_equipe boolean, minha boolean, autor_papel text)
language sql stable security definer set search_path = public as $$
  select m.id, m.texto, m.criada_em, m.autor_id, p.nome, p.papel in ('equipe_cca', 'admin'), m.autor_id = auth.uid(), public.rotulo_pessoa(p.id)
  from public.conversa m
  join public.perfis p on p.id = m.autor_id
  where m.cliente_id = p_cliente and public.posso_ver_cliente(p_cliente)
  order by m.criada_em, m.id
$$;

-- ---------- 5. Cliente final: documentos e o corretor dele ----------
-- O cliente final não cadastra processos
do $$ begin
  create policy cliente_final_nao_cadastra on public.clientes as restrictive for insert to authenticated
    with check (public.meu_papel() is distinct from 'cliente');
  create policy cliente_envia_documento on public.documentos for insert to authenticated
    with check (public.meu_papel() = 'cliente' and cliente_id = public.meu_cliente());
  create policy docs_enviar_cliente on storage.objects for insert to authenticated
    with check (bucket_id = 'documentos' and public.meu_papel() = 'cliente' and ((storage.foldername(name))[1])::uuid = public.meu_cliente());
  create policy ver_corretor_do_meu_processo on public.perfis for select to authenticated
    using (public.meu_papel() = 'cliente' and exists (select 1 from public.clientes c where c.id = public.meu_cliente() and c.corretor_id = perfis.id));
  create policy ver_minha_imobiliaria_cliente on public.imobiliarias for select to authenticated
    using (public.meu_papel() = 'cliente' and exists (select 1 from public.clientes c where c.id = public.meu_cliente() and c.imobiliaria_id = imobiliarias.id));
exception when duplicate_object then null; end $$;

-- Liga/desliga o acesso dos clientes: o CEO da imobiliária (para todos) ou o corretor independente (para os dele)
create or replace function public.config_acesso_cliente() returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when p.papel = 'gestor_imobiliaria' and coalesce(p.funcao, 'ceo') = 'ceo' then jsonb_build_object('pode', true, 'escopo', 'imobiliaria', 'ligado', coalesce(i.acesso_cliente, false))
    when p.papel = 'corretor' and p.imobiliaria_id is null and not p.consumidor then jsonb_build_object('pode', true, 'escopo', 'corretor', 'ligado', p.acesso_cliente)
    else jsonb_build_object('pode', false, 'escopo', case when p.imobiliaria_id is not null then 'imobiliaria' else 'corretor' end, 'ligado', coalesce(i.acesso_cliente, false)) end
  from public.perfis p left join public.imobiliarias i on i.id = p.imobiliaria_id
  where p.id = auth.uid() and p.ativo
$$;
create or replace function public.definir_acesso_cliente(p_ligado boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v jsonb := public.config_acesso_cliente();
begin
  if not coalesce((v->>'pode')::boolean, false) then raise exception 'Só o CEO da imobiliária ou o corretor independente liga ou desliga'; end if;
  perform set_config('app.acesso_cliente', 'sim', true);
  if v->>'escopo' = 'imobiliaria' then update public.imobiliarias set acesso_cliente = p_ligado where id = public.minha_imobiliaria();
  else update public.perfis set acesso_cliente = p_ligado where id = auth.uid(); end if;
  insert into public.acessos_log (usuario_id, acao, detalhes)
  values (auth.uid(), case when p_ligado then 'ligar_acesso_cliente' else 'desligar_acesso_cliente' end, jsonb_build_object('escopo', v->>'escopo'));
end $$;
-- Situação do acesso de um cliente: desligado | sem_acesso | convidado | ativo
create or replace function public.acesso_do_cliente(p_cliente uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c record; v_email text; v_conv record;
begin
  select * into c from public.clientes where id = p_cliente;
  if c.id is null or not public.posso_ver_cliente(p_cliente) then raise exception 'Cliente não encontrado'; end if;
  if not public.acesso_cliente_ligado(p_cliente) then
    return jsonb_build_object('situacao', 'desligado', 'pode_ligar', case when c.imobiliaria_id is not null then 'gestor' else 'corretor' end);
  end if;
  select email into v_email from public.perfis where papel = 'cliente' and cliente_id = p_cliente and ativo limit 1;
  if v_email is not null then return jsonb_build_object('situacao', 'ativo', 'email', v_email); end if;
  select * into v_conv from public.convites_link where tipo = 'cliente' and cliente_id = p_cliente and usado_em is null and cancelado_em is null and expira_em > now()
  order by criado_em desc limit 1;
  if v_conv.id is not null then return jsonb_build_object('situacao', 'convidado', 'expira_em', v_conv.expira_em); end if;
  return jsonb_build_object('situacao', 'sem_acesso');
end $$;
-- Convite do cliente final (o link volta só uma vez; no banco fica o hash)
create or replace function public.dar_acesso_cliente(p_cliente uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c record; v_token text; v_conv record;
begin
  select * into c from public.clientes where id = p_cliente;
  if c.id is null or not public.posso_editar_cliente(p_cliente) or public.sou_equipe() then raise exception 'Só o corretor ou a imobiliária do cliente dá o acesso'; end if;
  if not public.acesso_cliente_ligado(p_cliente) then raise exception 'O acesso do cliente está desligado'; end if;
  update public.convites_link set cancelado_em = now() where tipo = 'cliente' and cliente_id = p_cliente and usado_em is null and cancelado_em is null;
  v_token := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.convites_link (token_hash, tipo, cliente_id, imobiliaria_id, nome, whatsapp, criado_por)
  values (encode(digest(v_token, 'sha256'), 'hex'), 'cliente', p_cliente, c.imobiliaria_id, c.nome,
          case when length(regexp_replace(coalesce(c.celular, ''), '\D', '', 'g')) >= 10 then '+55' || right(regexp_replace(c.celular, '\D', '', 'g'), 11) end, auth.uid())
  returning * into v_conv;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'convite_cliente', p_cliente, '{}'::jsonb);
  return jsonb_build_object('token', v_token, 'expira_em', v_conv.expira_em, 'nome', c.nome, 'whatsapp', v_conv.whatsapp);
end $$;
create or replace function public.remover_acesso_cliente(p_cliente uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.posso_editar_cliente(p_cliente) then raise exception 'Sem permissão'; end if;
  perform set_config('app.gestor_corretores', 'sim', true);
  update public.perfis set ativo = false where papel = 'cliente' and cliente_id = p_cliente;
  update public.convites_link set cancelado_em = now() where tipo = 'cliente' and cliente_id = p_cliente and usado_em is null and cancelado_em is null;
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'remover_acesso_cliente', p_cliente, '{}'::jsonb);
end $$;

-- ---------- 6. Conversa interna da imobiliária (por cliente) ----------
create table if not exists public.conversa_interna (
  id          bigserial primary key,
  cliente_id  uuid not null references public.clientes (id) on delete cascade,
  autor_id    uuid not null references public.perfis (id),
  texto       text not null check (length(texto) between 1 and 2000),
  criada_em   timestamptz not null default now()
);
create index if not exists conversa_interna_cliente on public.conversa_interna (cliente_id, criada_em);
alter table public.conversa_interna enable row level security;   -- só pelas funções abaixo

create or replace function public.listar_conversa_interna(p_cliente uuid)
returns table (id bigint, texto text, criada_em timestamptz, autor_id uuid, autor_nome text, autor_papel text, minha boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.posso_ver_cliente(p_cliente) or not (public.sou_da_imob_do_cliente(p_cliente) or public.sou_nivel1()) then
    raise exception 'Sem acesso à conversa interna';
  end if;
  return query select m.id, m.texto, m.criada_em, m.autor_id, p.nome, public.rotulo_pessoa(p.id), m.autor_id = auth.uid()
    from public.conversa_interna m join public.perfis p on p.id = m.autor_id
    where m.cliente_id = p_cliente order by m.criada_em, m.id;
end $$;
create or replace function public.enviar_conversa_interna(p_cliente uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_texto, ''));
begin
  if not public.posso_ver_cliente(p_cliente) or not public.sou_da_imob_do_cliente(p_cliente) then raise exception 'Só quem é da imobiliária escreve aqui'; end if;
  if t = '' then raise exception 'Escreva a mensagem antes de enviar.'; end if;
  insert into public.conversa_interna (cliente_id, autor_id, texto) values (p_cliente, auth.uid(), left(t, 2000));
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'conversa_interna', p_cliente, '{}'::jsonb);
end $$;

-- ---------- 7. Mural de avisos da imobiliária ----------
create table if not exists public.mural (
  id              bigserial primary key,
  imobiliaria_id  uuid not null references public.imobiliarias (id) on delete cascade,
  autor_id        uuid not null references public.perfis (id),
  texto           text not null check (length(texto) between 1 and 2000),
  criada_em       timestamptz not null default now()
);
create index if not exists mural_imob on public.mural (imobiliaria_id, criada_em desc);
alter table public.mural enable row level security;

create or replace function public.listar_mural(p_imob uuid default null)
returns table (id bigint, imobiliaria_id uuid, texto text, criada_em timestamptz, autor_id uuid, autor_nome text, autor_papel text, meu boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_imob uuid := case when public.sou_nivel1() then p_imob else public.minha_imobiliaria() end;
begin
  if v_imob is null or (not public.sou_nivel1() and public.meu_papel() not in ('corretor', 'gestor_imobiliaria')) then return; end if;
  return query select m.id, m.imobiliaria_id, m.texto, m.criada_em, m.autor_id, p.nome, public.rotulo_pessoa(p.id), m.autor_id = auth.uid()
    from public.mural m join public.perfis p on p.id = m.autor_id
    where m.imobiliaria_id = v_imob order by m.criada_em desc;
end $$;
create or replace function public.publicar_mural(p_texto text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_texto, ''));
begin
  if public.meu_papel() is distinct from 'gestor_imobiliaria' or public.minha_imobiliaria() is null then raise exception 'Quem publica avisos é o CEO ou o gestor da imobiliária'; end if;
  if t = '' then raise exception 'Escreva o aviso antes de publicar.'; end if;
  insert into public.mural (imobiliaria_id, autor_id, texto) values (public.minha_imobiliaria(), auth.uid(), left(t, 2000));
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'mural', '{}'::jsonb);
end $$;
create or replace function public.apagar_mural(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.mural m where m.id = p_id
    and (m.autor_id = auth.uid() or (public.sou_ceo_imob() and m.imobiliaria_id = public.minha_imobiliaria()));
  if not found then raise exception 'Sem permissão'; end if;
end $$;

-- ---------- 8. Comissões dos corretores (CEO da imobiliária; o nível 1 da CCA vê) ----------
create table if not exists public.comissoes (
  cliente_id     uuid primary key references public.clientes (id) on delete cascade,
  valor          numeric(12, 2) check (valor >= 0),
  paga_em        timestamptz,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references public.perfis (id)
);
alter table public.comissoes enable row level security;

create or replace function public.listar_comissoes(p_imob uuid default null)
returns table (cliente_id uuid, cliente_nome text, corretor_id uuid, corretor_nome text, status text, assinado_em timestamptz, valor numeric, paga_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_imob uuid := case when public.sou_nivel1() then coalesce(p_imob, public.minha_imobiliaria()) else public.minha_imobiliaria() end;
begin
  if not (public.sou_ceo_imob() or public.sou_nivel1()) or v_imob is null then raise exception 'Somente o CEO da imobiliária'; end if;
  return query select c.id, c.nome, c.corretor_id, coalesce(p.nome, '—'), c.status,
      coalesce((select min(h.em) from public.historico_status h where h.cliente_id = c.id and h.para = 'contrato_assinado'), c.atualizado_em),
      k.valor, k.paga_em
    from public.clientes c left join public.perfis p on p.id = c.corretor_id left join public.comissoes k on k.cliente_id = c.id
    where c.imobiliaria_id = v_imob and c.status in ('contrato_assinado', 'registro_cartorio', 'conformidade_final', 'credito_liberado')
    order by 6 desc;
end $$;
create or replace function public.definir_comissao(p_cliente uuid, p_valor numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_ceo_imob() or not exists (select 1 from public.clientes where id = p_cliente and imobiliaria_id = public.minha_imobiliaria()) then raise exception 'Somente o CEO da imobiliária'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'Valor inválido'; end if;
  insert into public.comissoes (cliente_id, valor, atualizado_por) values (p_cliente, round(p_valor, 2), auth.uid())
  on conflict (cliente_id) do update set valor = round(p_valor, 2), atualizado_em = now(), atualizado_por = auth.uid();
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), 'comissao_valor', p_cliente, jsonb_build_object('valor', p_valor));
end $$;
create or replace function public.marcar_comissao(p_cliente uuid, p_paga boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_ceo_imob() or not exists (select 1 from public.clientes where id = p_cliente and imobiliaria_id = public.minha_imobiliaria()) then raise exception 'Somente o CEO da imobiliária'; end if;
  if p_paga and coalesce((select valor from public.comissoes where cliente_id = p_cliente), 0) <= 0 then raise exception 'Informe o valor da comissão antes de marcar como paga'; end if;
  insert into public.comissoes (cliente_id, paga_em, atualizado_por) values (p_cliente, case when p_paga then now() end, auth.uid())
  on conflict (cliente_id) do update set paga_em = case when p_paga then now() end, atualizado_em = now(), atualizado_por = auth.uid();
  insert into public.acessos_log (usuario_id, acao, cliente_id, detalhes) values (auth.uid(), case when p_paga then 'comissao_paga' else 'comissao_reaberta' end, p_cliente, '{}'::jsonb);
end $$;

-- ---------- 9. Perfil secundário: o nível 1 escolhe uma pessoa da imobiliária ----------
create or replace function public.perfis_das_imobiliarias() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_nivel1() then raise exception 'Somente o CEO da CCA'; end if;
  return coalesce((select jsonb_agg(x order by x->>'nome') from (
    select jsonb_build_object('id', i.id, 'nome', i.nome,
      'mural', (select count(*) from public.mural m where m.imobiliaria_id = i.id),
      'pessoas', (select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome,
                     'funcao', case when p.papel = 'corretor' then 'corretor' else coalesce(p.funcao, 'ceo') end, 'papel', public.rotulo_pessoa(p.id))
                   order by case when p.papel = 'corretor' then 3 when coalesce(p.funcao, 'ceo') = 'ceo' then 1 else 2 end, p.nome)
                  from public.perfis p where p.imobiliaria_id = i.id and p.ativo and p.papel in ('corretor', 'gestor_imobiliaria'))) x
    from public.imobiliarias i where i.ativo) s(x) where x->'pessoas' is not null and x->'pessoas' <> 'null'::jsonb), '[]'::jsonb);
end $$;

-- ---------- 10. Permissões das funções ----------
do $$ declare f text; begin
  foreach f in array array[
    'public.meu_nivel()', 'public.sou_nivel1()', 'public.minha_funcao()', 'public.sou_ceo_imob()', 'public.gestor_da_imob(uuid)',
    'public.acesso_cliente_ligado(uuid)', 'public.meu_cliente()', 'public.sou_da_imob_do_cliente(uuid)', 'public.rotulo_pessoa(uuid)',
    'public.posso_ver_cliente(uuid)', 'public.admin_definir_nivel(uuid, smallint)', 'public.gestor_ativar_corretor(uuid, boolean)',
    'public.gestor_passar_clientes(uuid, uuid)', 'public.listar_conversa_m2(uuid)', 'public.config_acesso_cliente()', 'public.definir_acesso_cliente(boolean)',
    'public.acesso_do_cliente(uuid)', 'public.dar_acesso_cliente(uuid)', 'public.remover_acesso_cliente(uuid)',
    'public.listar_conversa_interna(uuid)', 'public.enviar_conversa_interna(uuid, text)', 'public.listar_mural(uuid)', 'public.publicar_mural(text)',
    'public.apagar_mural(bigint)', 'public.listar_comissoes(uuid)', 'public.definir_comissao(uuid, numeric)', 'public.marcar_comissao(uuid, boolean)',
    'public.perfis_das_imobiliarias()']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
