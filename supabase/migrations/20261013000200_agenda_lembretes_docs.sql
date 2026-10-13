-- Agenda diária dos lembretes de documento obrigatório (9h de Brasília = 12h UTC)
-- (Em banco de teste sem pg_cron, só avisa e segue.)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('lembretes_docs', '0 12 * * *', 'select public.gerar_lembretes_docs()');
exception when others then
  raise notice 'pg_cron indisponível: agenda dos lembretes não criada (%).', sqlerrm;
end $$;
