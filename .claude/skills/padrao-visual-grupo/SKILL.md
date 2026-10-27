---
name: padrao-visual-grupo
description: Use ao criar ou mudar qualquer tela, componente, e-mail, PDF ou imagem do APP CCA ou do SIGAA. Traz o Sistema Cromático Rev03 de cada empresa do Grupo Andrade Almeida e as regras de interface comuns a todos os sistemas.
---

# Padrão visual do Grupo Andrade Almeida

Todos os sistemas do Grupo usam o **mesmo padrão** de telas, botões, listas, ícones, menus e fluxos; muda só a cor da empresa. Nada de estilo próprio por tela.

## Cores oficiais (Sistema Cromático Refinado Rev03) — primária / acento
| Empresa | Primária | Acento | Observação |
|---|---|---|---|
| Holding (Grupo) | `#1C2B36` | `#C89B3C` | |
| Construtora | `#295979` | `#C4C5BF` | |
| CCA | `#D88934` | `#3D657C` | no APP CCA: laranja + azul (ver `web/css/app.css`) |
| Veículos | `#30363A` | `#B87333` | |
| Imóveis | `#5E786B` | `#EFE8DA` | "Patrimônio inteligente começa aqui" |
| Seguros e Benefícios | `#4A7478` | `#A8C3C2` | profundidade `#334347`; evitar ciano vivo e verde dominante |

Neutros comuns: `#F5F5F5`, `#EFE8DA`, `#D6D2CA`, `#C4C5BF`.

## Regras da marca
- Proporção: 60% primária, 25% acento, 10% neutro, 5% respiro.
- Fosco e mineral: sem degradê, sem metálico.
- Nunca misturar acentos de empresas diferentes na mesma tela/peça.
- Texto branco sobre primária escura; primária sobre fundo claro; acento só para destaque e orientação.
- Grafite em vez de preto puro.
- Logo do Grupo: "Grupo" em cima de "andrade almeida". Logos das empresas: atividade embaixo. Símbolo: duas setas (na CCA, laranja sobre azul).

## Regras de interface
- Use as variáveis de `web/css/app.css` (`--laranja`, `--azul`, `--grafite`, `--borda`, `--raio`, `--sombra`, `--fonte` Figtree...). Cor nova vira variável, nunca valor solto.
- Toque mínimo de 44px; funciona primeiro no celular (390×844) e também no computador.
- Lista continua visível ao lado do formulário de edição (não substituir a lista pela edição).
- UF antes do município (listas do IBGE em `web/data`).
- Menus sem telas repetidas; "Sair" só no menu da foto de perfil.
- Etapas: cinza = a fazer, cor da empresa = cumprida, laranja/destaque = atual, vermelho = reprovada.
- Textos em português simples; gênero entre parênteses ("corretor(a)"); dinheiro `R$ 1.234,56`.
- Ajustes de design vão para a lista própria e são feitos em lote, para não criar padrões diferentes.

## Conferência
Depois de mudar tela: captura no celular e no computador, compare antes/depois e confira contraste e alinhamento antes de mostrar.
