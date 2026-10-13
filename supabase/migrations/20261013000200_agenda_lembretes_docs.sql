-- Agenda diária dos lembretes de documento obrigatório (9h de Brasília = 12h UTC)
create extension if not exists pg_cron;
select cron.schedule('lembretes_docs', '0 12 * * *', 'select public.gerar_lembretes_docs()');
