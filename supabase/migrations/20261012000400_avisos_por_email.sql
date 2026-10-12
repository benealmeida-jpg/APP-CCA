-- Avisos também por e-mail (além do push ou do WhatsApp).
-- Envio pela caixa da CCA na Titan (HostGator), via SMTP. A senha fica em "integracoes" (ninguém lê pelo app).

insert into public.parametros (chave, valor, descricao) values
  ('email_avisos', 'nao', 'Enviar os avisos também por e-mail (sim/nao)'),
  ('smtp_servidor', 'smtp.titan.email', 'Servidor de saída de e-mail (Titan)'),
  ('smtp_porta', '465', 'Porta do servidor de saída (465 = SSL)'),
  ('email_responder_para', 'contato@andradealmeidacca.com.br', 'Para onde vão as respostas dos e-mails de aviso')
on conflict (chave) do nothing;

create or replace function public.admin_salvar_integracao(p_chave text, p_valor text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Somente administradores'; end if;
  if p_chave not in ('meta_token', 'meta_phone_id', 'meta_waba_id', 'smtp_usuario', 'smtp_senha') then raise exception 'Configuração inválida'; end if;
  if coalesce(trim(p_valor), '') = '' then
    delete from public.integracoes where chave = p_chave;
  else
    insert into public.integracoes (chave, valor, atualizado_por) values (p_chave, trim(p_valor), auth.uid())
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = auth.uid();
  end if;
  insert into public.acessos_log (usuario_id, acao, detalhes) values (auth.uid(), 'alterar_integracao', jsonb_build_object('chave', p_chave));
end $$;

-- Mostra só SE está configurado. Token e senha nunca aparecem.
create or replace function public.integracoes_configuradas()
returns table (chave text, configurado boolean, final text, atualizado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select k.chave, i.chave is not null,
         case when i.chave is null then null
              when k.chave = 'meta_token' then '…' || right(i.valor, 4)
              when k.chave = 'smtp_senha' then 'guardada'
              else i.valor end,
         i.atualizado_em
  from (values ('meta_phone_id'), ('meta_waba_id'), ('meta_token'), ('smtp_usuario'), ('smtp_senha')) k(chave)
  left join public.integracoes i on i.chave = k.chave
  where public.sou_admin()
$$;
