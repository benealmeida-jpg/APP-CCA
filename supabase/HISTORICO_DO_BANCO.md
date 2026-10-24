# Histórico do banco (Supabase)

Situação em 24/10/2026.

- `migrations/` guarda, em ordem, todas as mudanças do banco. Cada objeto que existe hoje no banco (tabelas, funções, gatilhos, visões, rotinas agendadas) aparece em algum arquivo daqui — conferido em 24/10/2026.
- O registro interno do Supabase (`supabase_migrations.schema_migrations`) foi gravado com outros números e agrupamentos até 21/10/2026 (104 entradas). As mudanças aplicadas direto depois disso foram registradas lá com o mesmo número do arquivo daqui (13 entradas, de `20261021000000` a `20261024000500`).
- **Próximo passo (pendência k13):** quando a publicação automática pelo GitHub estiver ligada (com a chave do Supabase nos segredos do GitHub), gerar um retrato completo do banco (`supabase db dump`) como base única e passar a aplicar toda mudança só pelo fluxo automático. Aí os dois históricos ficam idênticos.

## Regras para novas mudanças
1. Toda mudança vira um arquivo `migrations/AAAAMMDDhhmmss_nome.sql` antes de ir ao banco.
2. Sem `drop` de tabela ou coluna com dados.
3. Funções `security definer` sempre com `set search_path = public` e `revoke ... from public, anon` quando não forem para quem está sem login.
4. Toda chave estrangeira nova ganha índice; regra de acesso usa `(select auth.uid())`.
