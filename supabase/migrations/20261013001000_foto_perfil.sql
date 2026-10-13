-- Foto do perfil (miniatura 256px em JPEG, guardada como texto)
alter table public.perfis add column if not exists foto text;

create or replace function public.salvar_minha_foto(p_foto text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Faça login novamente'; end if;
  if p_foto is not null and (p_foto !~ '^data:image/(jpeg|png|webp);base64,' or length(p_foto) > 200000) then
    raise exception 'Foto inválida ou grande demais';
  end if;
  update public.perfis set foto = p_foto where id = auth.uid();
end $$;
revoke execute on function public.salvar_minha_foto(text) from public, anon;
grant execute on function public.salvar_minha_foto(text) to authenticated;
