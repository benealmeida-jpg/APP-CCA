-- Engenharia: contato do vendedor (telefone e e-mail) e cartório de registro (RGI) da matrícula
alter table public.vendedores add column if not exists telefone text;
alter table public.vendedores add column if not exists email text;
alter table public.engenharias add column if not exists cartorio_rgi text;

-- Contato do vendedor (para pré-preencher quando ele já existe)
create or replace function public.vendedor_contato(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object('telefone', v.telefone, 'email', v.email, 'responsavel_nome', v.responsavel_nome)
    from public.vendedores v where v.id = p_id) end
$$;

-- Vendedor rápido, agora com telefone e e-mail (se já existe, completa o que estiver vazio)
create or replace function public.cadastrar_vendedor_contato(p_cpf_cnpj text, p_nome text, p_responsavel text, p_telefone text, p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_doc text := regexp_replace(coalesce(p_cpf_cnpj, ''), '\D', '', 'g'); v_id uuid;
        v_tel text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
        v_mail text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if public.meu_papel() is null then raise exception 'Sem permissão'; end if;
  if length(v_doc) not in (11, 14) then raise exception 'CPF ou CNPJ do vendedor inválido'; end if;
  if v_tel is null or length(v_tel) < 10 then raise exception 'Informe o telefone do vendedor com DDD'; end if;
  if v_mail is null or v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Informe um e-mail válido do vendedor'; end if;
  select id into v_id from public.vendedores where cpf_cnpj = v_doc;
  if v_id is null then
    if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do vendedor'; end if;
    insert into public.vendedores (tipo, cpf_cnpj, nome, responsavel_nome, telefone, email, criado_por)
    values (case when length(v_doc) = 11 then 'PF' else 'PJ' end, v_doc, trim(p_nome), nullif(trim(coalesce(p_responsavel, '')), ''), v_tel, v_mail, auth.uid())
    returning id into v_id;
  else
    update public.vendedores set telefone = coalesce(telefone, v_tel), email = coalesce(email, v_mail), atualizado_em = now() where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.criar_engenharia_v2(p_vendedor uuid, p_tipo text, p_endereco text, p_cidade text, p_uf text, p_matricula text, p_cartorio text, p_quem_paga text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := public.criar_engenharia(p_vendedor, p_tipo, p_endereco, p_cidade, p_uf, p_matricula, p_quem_paga);
  update public.engenharias set cartorio_rgi = nullif(trim(coalesce(p_cartorio, '')), '') where id = v_id;
  return v_id;
end $$;

-- Lista: o vendedor agora leva telefone e e-mail
create or replace function public.listar_engenharias() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'atualizado_em') desc), '[]'::jsonb) from (
    select to_jsonb(e) || jsonb_build_object(
      'vendedor', (select jsonb_build_object('id', v.id, 'nome', v.nome, 'tipo', v.tipo, 'cpf_cnpj', v.cpf_cnpj, 'responsavel_nome', v.responsavel_nome, 'telefone', v.telefone, 'email', v.email) from public.vendedores v where v.id = e.vendedor_id),
      'criado_por_nome', (select p.nome from public.perfis p where p.id = e.criado_por),
      'criado_por_apelido', (select p.apelido from public.perfis p where p.id = e.criado_por),
      'imobiliaria_nome', (select i.nome from public.imobiliarias i where i.id = e.imobiliaria_id),
      'pepts', coalesce((select jsonb_agg(to_jsonb(t) order by t.registrada_em) from public.engenharia_pepts t where t.engenharia_id = e.id), '[]'::jsonb),
      'docs', coalesce((select jsonb_agg(to_jsonb(d) order by d.enviado_em) from public.engenharia_docs d where d.engenharia_id = e.id), '[]'::jsonb)
    ) as x
    from public.engenharias e where public.posso_ver_engenharia(e.id)
  ) s
$$;

revoke execute on function public.vendedor_contato(uuid), public.cadastrar_vendedor_contato(text, text, text, text, text),
  public.criar_engenharia_v2(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.vendedor_contato(uuid), public.cadastrar_vendedor_contato(text, text, text, text, text),
  public.criar_engenharia_v2(uuid, text, text, text, text, text, text, text) to authenticated;
