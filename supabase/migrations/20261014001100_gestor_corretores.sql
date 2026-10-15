-- Etapa 2 da Gestão: o gestor da imobiliária convida, desliga e reativa os corretores da própria imobiliária,
-- e passa os clientes de um corretor para outro. Nada fora da própria imobiliária; nunca equipe/ADM nem outro gestor.

-- 1) A proteção de perfis aceita a mudança de "ativo" feita pelas funções abaixo (marca só dentro da transação)
create or replace function public.tg_perfis_protecao() returns trigger
language plpgsql as $$
begin
  if (new.papel <> old.papel or new.imobiliaria_id is distinct from old.imobiliaria_id
      or new.ativo <> old.ativo)
     and auth.uid() is not null
     and not public.sou_equipe()
     and coalesce(current_setting('app.gestor_corretores', true), '') <> 'sim' then
    raise exception 'Somente a equipe da CCA altera papel, imobiliária ou acesso';
  end if;
  return new;
end $$;

-- 2) Desligar / reativar um corretor da própria imobiliária
create or replace function public.gestor_ativar_corretor(p_usuario uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.meu_papel() is distinct from 'gestor_imobiliaria' or public.minha_imobiliaria() is null then raise exception 'Somente o gestor da imobiliária'; end if;
  if p_usuario = auth.uid() then raise exception 'Você não pode desligar o seu próprio acesso'; end if;
  if not exists (select 1 from public.perfis where id = p_usuario and papel = 'corretor' and imobiliaria_id = public.minha_imobiliaria()) then
    raise exception 'Corretor não encontrado na sua imobiliária';
  end if;
  perform set_config('app.gestor_corretores', 'sim', true);
  update public.perfis set ativo = p_ativo where id = p_usuario;
  insert into public.acessos_log (usuario_id, acao, detalhes)
  values (auth.uid(), case when p_ativo then 'ativar_usuario' else 'desativar_usuario' end, jsonb_build_object('usuario', p_usuario, 'por', 'gestor'));
end $$;
revoke execute on function public.gestor_ativar_corretor(uuid, boolean) from public, anon;
grant execute on function public.gestor_ativar_corretor(uuid, boolean) to authenticated;

-- 3) Passar os clientes de um corretor para outro da mesma imobiliária
create or replace function public.gestor_passar_clientes(p_de uuid, p_para uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if public.meu_papel() is distinct from 'gestor_imobiliaria' or public.minha_imobiliaria() is null then raise exception 'Somente o gestor da imobiliária'; end if;
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
revoke execute on function public.gestor_passar_clientes(uuid, uuid) from public, anon;
grant execute on function public.gestor_passar_clientes(uuid, uuid) to authenticated;

-- 4) Convites: o gestor vê e cancela os da própria imobiliária
do $$ begin
  create policy gestor_ver_convites_link on public.convites_link for select to authenticated
    using (public.meu_papel() = 'gestor_imobiliaria' and imobiliaria_id is not null and imobiliaria_id = public.minha_imobiliaria());
exception when duplicate_object then null; end $$;

create or replace function public.cancelar_convite_link(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_equipe() and not (public.meu_papel() = 'gestor_imobiliaria' and exists (
       select 1 from public.convites_link c where c.id = p_id and c.imobiliaria_id = public.minha_imobiliaria())) then
    raise exception 'Sem permissão';
  end if;
  update public.convites_link set cancelado_em = now() where id = p_id and usado_em is null;
end $$;
