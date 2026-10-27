---
name: publicar-app
description: Use quando for publicar (colocar no ar) uma nova versão do APP CCA no GitHub Pages. Cobre testes, subir a versão do cache (sw.js), copiar web/ para a branch gh-pages e conferir no ar.
---

# Publicar o APP CCA

O que está no ar é a branch `gh-pages` (cópia da pasta `web/` da `main`, mais `.nojekyll`).

## 1. Antes
- `node --test web/tests/*.test.mjs` passa.
- Os `web/tests/e2e_*.py` das telas mexidas passam (o navegador do Playwright já vem instalado; para outro, defina `CHROMIUM=/caminho/do/chrome`).
- Se mexeu no banco, a skill `banco-mudanca-segura` foi seguida até o fim.
- Capturas de tela conferidas no celular (390×844) e no computador.

## 2. Subir a versão
- Em `web/sw.js`, aumente `VERSAO` (`appcca-vNNN` → `appcca-v(NNN+1)`). Sem isso o celular continua com a versão antiga em cache.
- Commit na `main`.

## 3. Copiar para gh-pages
```bash
git fetch origin gh-pages
git worktree add /tmp/ghp origin/gh-pages
find /tmp/ghp -mindepth 1 -maxdepth 1 ! -name .git ! -name .nojekyll -exec rm -rf {} +
cp -r web/. /tmp/ghp/ && rm -rf /tmp/ghp/tests
cd /tmp/ghp && git add -A && git commit -m "Publica vNNN" && git push origin HEAD:gh-pages
git worktree remove /tmp/ghp
```
- Confira que `diff -rq web /tmp/ghp` (sem `tests`) não mostra diferença antes de remover.

## 4. Depois
- Abra o endereço do app e confira a tela que mudou.
- Diga ao Bené para fechar e abrir o app uma vez (o PWA pega a versão nova).
- Atualize a página "Pendências do APP CCA" se a publicação resolveu algum item.
