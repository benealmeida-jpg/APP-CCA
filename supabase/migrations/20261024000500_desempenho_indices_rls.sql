-- Desempenho (verificador do Supabase), pensando em centenas de clientes:
-- 1) Índice em toda chave estrangeira que ainda não tem (a coluna da ligação vira a primeira de um índice).
-- 2) Regras de acesso chamando auth.uid() uma vez por consulta, e não uma vez por linha: (select auth.uid()).
do $$ declare r record; nome text; begin
  for r in
    select c.conrelid::regclass as tabela, rel.relname, a.attname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and n.nspname = 'public' and array_length(c.conkey, 1) = 1
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    nome := left('idx_' || r.relname || '_' || r.attname, 63);
    execute format('create index if not exists %I on %s (%I)', nome, r.tabela, r.attname);
  end loop;
end $$;

do $$ declare p record; q text; w text; begin
  for p in select * from pg_policies where schemaname = 'public'
           and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%') loop
    q := replace(replace(p.qual, '( SELECT auth.uid() AS uid)', 'auth.uid()'), 'auth.uid()', '(select auth.uid())');
    w := replace(replace(p.with_check, '( SELECT auth.uid() AS uid)', 'auth.uid()'), 'auth.uid()', '(select auth.uid())');
    if q is not null and w is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', p.policyname, p.tablename, q, w);
    elsif q is not null then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, q);
    elsif w is not null then
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, w);
    end if;
  end loop;
end $$;
