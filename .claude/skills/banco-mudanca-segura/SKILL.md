---
name: banco-mudanca-segura
description: Use em QUALQUER mudança no banco Supabase do APP CCA ou do SIGAA (tabela, coluna, função, regra de acesso/RLS, gatilho, rotina agendada, remoção de função). Garante arquivo de migração antes do banco, mesmo número nos dois históricos, testes e checagem de segurança.
---

# Mudança segura no banco

Siga na ordem. Não pule etapa, mesmo em mudança "pequena".

## 1. Entender antes de mudar
- Leia as migrações relacionadas em `supabase/migrations/` (busque o nome da tabela/função).
- Se for alterar uma função, veja quem a chama: o app (`grep -rn "'nome'" web/js`) e outras funções (`pg_proc.prosrc`).
- Mudança que apaga ou altera dado de negócio: explique ao Bené e espere o "sim".

## 2. Escrever o arquivo primeiro
- Nome: `supabase/migrations/AAAAMMDDhhmmss_nome_em_portugues.sql`, número maior que o último.
- Comece com um comentário em português: o que muda e por quê.
- Regras obrigatórias:
  - nunca `drop table` nem `drop column` com dados; exclusão de registro é lógica (`excluida_em`, `excluida_por`);
  - tabela nova: `enable row level security` + regras com `(select auth.uid())` + índice em toda chave estrangeira;
  - função `security definer`: `set search_path = public`, checagem de permissão por dentro (`sou_equipe()`, `posso_ver_cliente()`, `posso_editar_cliente()`, `tenho_permissao('...')`), e `revoke execute ... from public, anon` se não for para quem está sem login;
  - função de gatilho: `revoke execute ... from public, anon, authenticated`;
  - ao criar `_v2`, remova a versão antiga na mesma migração (depois de trocar as chamadas no app e nos testes).
- Rotina agendada: `cron.schedule('nome', '...', 'select public.funcao()')`.

## 3. Testar localmente
- Atualize/crie testes em `supabase/tests/` (use `pg_temp.ok` e `pg_temp.falha` em `teste_modelo2.sql`). Para regra de segurança, teste também o caso proibido.
- Rode `bash supabase/tests/rodar_testes.sh` (Postgres 16 local; se estiver como root, rode como outro usuário, ex.: `su claude -c ...`). Tem que terminar com "Modelo 2: todos os testes passaram".
- Se faltar simulação do Supabase (schema, papel, extensão), acrescente em `supabase/tests/stubs_supabase.sql`.

## 4. Aplicar no banco com o MESMO número
Num único bloco:
```sql
begin;
-- conteúdo da migração
insert into supabase_migrations.schema_migrations (version, name, created_by)
values ('AAAAMMDDhhmmss', 'nome_em_portugues', 'aplicada direto; arquivo no repositório supabase/migrations');
commit;
```
Comandos destrutivos pedem confirmação do usuário na tela; se for cancelado, não insista em sequência: avise e combine.

## 5. Conferir depois
- Verificador de segurança do Supabase (`get_advisors` tipo security): não pode surgir aviso novo.
- Confirme no banco que o objeto existe/sumiu como esperado.
- Atualize `supabase/HISTORICO_DO_BANCO.md` se a mudança for relevante.
- Commit em português, com o arquivo de migração e os testes juntos.
