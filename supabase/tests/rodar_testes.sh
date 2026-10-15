set -e
PGD=/tmp/pgtest_appcca/data
/usr/lib/postgresql/16/bin/pg_ctl -D $PGD status >/dev/null 2>&1 || { pkill -u claude postgres 2>/dev/null || true; sleep 1; rm -f /tmp/pgtest_appcca/.s.PGSQL.54329* $PGD/postmaster.pid; /usr/lib/postgresql/16/bin/pg_ctl -D $PGD -l /tmp/pgtest_appcca/log -o '-p 54329 -k /tmp/pgtest_appcca' -w start >/dev/null; }
P="psql -h /tmp/pgtest_appcca -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists t" -c "create database t"
$P -d t -f supabase/tests/stubs_supabase.sql
for f in supabase/migrations/*.sql; do $P -d t -f "$f"; done
$P -d t -f supabase/tests/teste_regras.sql > /dev/null
$P -d t -f supabase/tests/teste_compradores.sql
$P -d t -f supabase/tests/teste_vendedores.sql
$P -d t -f supabase/tests/teste_modelo2.sql
