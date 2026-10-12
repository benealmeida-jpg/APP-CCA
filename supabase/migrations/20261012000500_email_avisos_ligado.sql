-- Avisos por e-mail ligados desde o início (o ADM desliga em Configurações se precisar).
-- Respostas dos corretores vão para a própria caixa de avisos, que a equipe toda acessa.
update public.parametros set valor = 'sim' where chave = 'email_avisos';
update public.parametros set valor = 'avisos@andradealmeidacca.com.br',
  descricao = 'Para onde vão as respostas dos e-mails de aviso (caixa da equipe)'
where chave = 'email_responder_para';
