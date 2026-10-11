set -e
P="psql -h /tmp/pgtest_appcca -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists t" -c "create database t"
$P -d t -f supabase/tests/stubs_supabase.sql
for f in supabase/migrations/*.sql; do $P -d t -f "$f"; done
$P -d t -f supabase/tests/teste_regras.sql > /dev/null
$P -d t -f supabase/tests/teste_compradores.sql
$P -d t -f supabase/tests/teste_vendedores.sql
