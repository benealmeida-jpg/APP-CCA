# APP CCA – Portal do Corretor

App da Andrade Almeida CCA para corretores e imobiliárias parceiras cadastrarem clientes e enviarem documentos.

- `web/` – o app (HTML, CSS e JavaScript, sem etapa de build). Abra `web/index.html?demo` para o modo demonstração.
- `supabase/migrations/` – banco de dados (tabelas, regras de documentos `*` e `**`, permissões).
- `supabase/tests/` – testes do banco (Postgres local).
- `web/tests/` – testes das regras (`node --test web/tests/regras.test.mjs`) e de ponta a ponta (`python3 web/tests/e2e_demo.py`).
