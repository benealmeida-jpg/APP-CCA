# APP CCA — Portal do Corretor (Andrade Almeida CCA)

Leia este arquivo inteiro antes de mexer no projeto. Ele vale para toda sessão do Claude neste repositório.

## O que é
App da **Andrade Almeida CCA** (Correspondente Caixa Aqui, CNPJ da Andrade Almeida Consultoria Financeira Ltda) para imobiliárias, corretores e consumidores finais enviarem cadastro e documentos de clientes à CCA, que aprova o crédito imobiliário na Caixa (SIOPI, SICTD, CIWEB).
Faz parte do **Grupo Andrade Almeida** (Construtora, CCA, Veículos e, em breve, Imóveis e Seguros e Benefícios). O APP CCA é o **molde do SIGAA** (Sistema Integrado de Gestão Andrade Almeida): padrões, componentes e regras criados aqui serão reaproveitados nos sistemas das outras empresas. Não crie nada "só para a CCA" que deveria ser genérico.

## Quem decide e como trabalhar com ele
- O dono é **Ebenézer (Bené)**, CEO da CCA (nível 1). É leigo em programação e trabalha muito pelo celular.
- Explique **antes** de mudar algo grande, em português simples, sem jargão. Decisões de negócio são dele: pergunte quando a regra não estiver clara.
- **Revise antes de entregar**: rode os testes e confira as telas (capturas de tela no celular, 390×844, e no computador) antes de dizer que está pronto. Ele sempre pede correção quando algo vai sem conferir.
- Mostre antes/depois quando mudar tela.
- Pendências do app ficam na página "Pendências do APP CCA" (artefato com coleção `pendencias`); atualize quando resolver ou criar uma.

## Modelos do app
- O **Modelo 2** é o oficial (perfis por função: níveis da CCA, CEO / gestor / documentação / corretor da imobiliária, corretor independente, consumidor final). `MODELO2` em `web/js/config.js`.
- `?demo2` = demonstração do Modelo 2 (dados no aparelho, para mostrar e treinar). `?demo` = Modelo 1, só consulta; **não evolua o Modelo 1**.
- Toda função nova do app existe nas duas camadas: `web/js/api-supabase.js` (real) e `web/js/api-demo.js` (demonstração), com o mesmo comportamento.

## Estrutura
- `web/` — o app (HTML, CSS e JavaScript em módulos, **sem etapa de build**). Um arquivo por assunto em `web/js/` (`*-dados.js` = regras puras, testáveis; o par sem sufixo = tela).
- `web/css/app.css` — tokens visuais (cores, raios, sombras, fonte Figtree). Use as variáveis; não escreva cor solta.
- `supabase/migrations/` — **toda** mudança do banco, em ordem. `supabase/functions/` — funções do servidor (Edge Functions).
- `supabase/tests/` — testes do banco em Postgres local. `web/tests/` — testes das regras (`node --test web/tests/*.test.mjs`) e de ponta a ponta com Playwright (`python3 web/tests/e2e_*.py`).
- `supabase/HISTORICO_DO_BANCO.md` — situação do histórico do banco. Atualize quando mudar o banco.
- Branch `gh-pages` = o que está no ar (GitHub Pages). Publicar = copiar `web/` para `gh-pages` com commit "Publica vNNN" e **subir `VERSAO` em `web/sw.js`** (senão o celular fica com a versão velha em cache).
- Branch `imagens-magnific` = referências de design geradas no Magnific (não é código; não apague).

## Banco (Supabase, projeto `gfyvbqbllvjynqssrozu`, hoje ambiente de testes)
1. Toda mudança vira `supabase/migrations/AAAAMMDDhhmmss_nome.sql` **antes** de ir ao banco, e é registrada no Supabase com o **mesmo número**.
2. Nunca `drop` de tabela ou coluna com dados. Exclusão de registro de negócio é **lógica** (`excluida_em` / `excluida_por`).
3. RLS ligado em toda tabela. Regras de acesso usam `(select auth.uid())`. Toda chave estrangeira nova ganha índice.
4. Funções `security definer`: `set search_path = public`, checam permissão por dentro (`sou_equipe()`, `posso_ver_cliente()`, `posso_editar_cliente()`, `tenho_permissao()`...) e `revoke ... from public, anon` quando não forem para quem está sem login. Funções de gatilho não ficam executáveis pela API.
5. Ao substituir uma função por `_v2`, **remova a antiga** na mesma leva (função esquecida é brecha: foi o caso da `mo_anexar_assinado`, sem a trava antifraude).
6. Chaves e segredos só em Edge Functions / tabela `integracoes`; nunca no app. A chave "publishable" em `config.js` pode ficar (quem protege é o RLS).
7. Rode `bash supabase/tests/rodar_testes.sh` (Postgres 16 local, usuário sem root) antes de aplicar qualquer mudança. As simulações do Supabase ficam em `supabase/tests/stubs_supabase.sql`.

## Segurança e LGPD
- O app guarda CPF, RG, renda, IR e documentos de clientes. Nada disso em logs, commits, testes com dados reais ou mensagens.
- Documentos de clientes: guarda de 5 anos após o fim do processo (rotina `guarda_documentos`), sem apagar antes.
- **Regra antifraude:** cliente/corretor/imobiliária só trocam documento pendente, recusado ou em conferência. Depois de aceito (pela CCA ou pela IA) ou lançado na Caixa, só a CCA troca.
- O cliente comprador só vê os próprios documentos; os do vendedor e do imóvel ficam com vendedor/corretor/CCA.
- Edge Functions sem login (`avisos`, `conferir-ia`, `guarda-documentos`) exigem o cabeçalho `x-segredo`; as chamadas por usuário validam o token e o perfil. Mantenha isso em toda função nova.

## Regras de negócio que não podem quebrar
- Documentos com `**` impedem a análise; com `*` não impedem, mas atrasam. A marca de cada documento é configurável (nenhum, `*` ou `**`).
- Barreiras iniciais: cliente com restrição ou sem QV encerra o processo; aprovação em outro CCA exige a carta de cancelamento assinada no gov.br.
- Etapas (fluxograma): Cadastro → Aprovação (sistêmica e entrevista com o gerente, que é a 2ª aprovação) → Assinaturas (MO/DAMP são barreira para a Conformidade) → Contrato → Registro → Conformidade final → Crédito liberado. Entrevista reprovada encerra; nova tentativa só após 180 dias.
- Remuneração: 0,8% do valor financiado (empreendimento Caixa: R$ 600,00 fixo por contrato), menos 18% de imposto; só conta contrato assinado; fechamento mensal no penúltimo dia útil.
- Validade de certidões em **dias corridos**.

## Texto e telas
- Tudo em português do Brasil, linguagem de quem usa (corretor, gestor), não de programador.
- Gênero entre parênteses ao falar de pessoa ou da CCA: "feito pelo(a) CCA", "corretor(a)".
- Dinheiro sempre `R$ 1.234,56`, com pontos e vírgula automáticos. Datas no horário de Brasília.
- Cores da CCA (Sistema Cromático Rev03): laranja `#D88934`, azul `#3D657C`; neutros `#F5F5F5`, `#EFE8DA`, `#D6D2CA`, `#C4C5BF`. Mesmo padrão de telas, botões, listas, ícones e menus no painel da CCA e no portal do corretor.
- Toque mínimo de 44px. Listas continuam visíveis ao lado do formulário de edição. UF antes do município (dados do IBGE em `web/data`).
- Menus sem telas repetidas; "Sair" só na foto de perfil. Melhorias de design vão para a lista própria e são feitas em lote, com padrão único.

## Antes de dizer "pronto"
1. `node --test web/tests/*.test.mjs` e os `e2e_*.py` afetados passam.
2. `bash supabase/tests/rodar_testes.sh` passa (se mexeu no banco).
3. Telas conferidas por captura (celular e computador).
4. Banco e repositório com o mesmo histórico; `HISTORICO_DO_BANCO.md` atualizado.
5. Commit em português explicando o que muda para o usuário.
