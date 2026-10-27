---
name: nova-funcionalidade
description: Use ao construir uma funcionalidade nova ou uma mudança grande no APP CCA (ou num módulo do SIGAA). Roteiro de entender, planejar, construir nas duas camadas (real e demonstração), testar e entregar.
---

# Nova funcionalidade

## 1. Entender a regra de negócio
- Releia `CLAUDE.md` e a regra que o Bené descreveu. Se faltar uma decisão de negócio (quem pode fazer, o que acontece quando dá errado, quem é avisado), **pergunte antes de programar**.
- Procure se já existe algo parecido (`grep` em `web/js` e `supabase/migrations`): reaproveite em vez de duplicar.

## 2. Explicar o plano em português simples
Antes de começar algo grande, diga em poucas linhas: o que muda para cada perfil (CCA, CEO/gestor/documentação da imobiliária, corretor, consumidor final), quais telas mudam e se o banco muda.

## 3. Construir
- Banco: siga a skill `banco-mudanca-segura`.
- Regra pura em `web/js/<assunto>-dados.js` (testável em `web/tests/<assunto>.test.mjs`); tela em `web/js/<assunto>.js`.
- Chamada ao servidor em `web/js/api-supabase.js` **e** comportamento igual em `web/js/api-demo.js` (Modelo 2 / `?demo2`).
- Avisos: push e e-mail em todos os passos; WhatsApp só nas etapas-chave e em atraso do cliente.
- Visual: skill `padrao-visual-grupo`.
- Segurança: quem não pode fazer a ação recebe erro claro do banco, não só botão escondido.

## 4. Testar
- Teste de regra (`node --test`), teste do banco (incluindo o caso proibido) e um `e2e_*.py` da tela no modo demonstração.
- Rode também os testes já existentes da área mexida.

## 5. Entregar
- Capturas antes/depois (celular e computador).
- Atualize a página "Pendências do APP CCA".
- Para colocar no ar, use a skill `publicar-app`.
