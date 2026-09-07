# Contribuindo

Este repositório é **publicado para leitura e uso**, não para desenvolvimento
colaborativo. É o código que roda em produção num sistema interno; a manutenção
acontece lá, e o que aparece aqui são as versões publicadas.

## O que é bem-vindo

- **Issues** apontando defeito, fórmula errada, faixa de referência inadequada
  para um setor, ou trecho de documentação que induz ao erro. São lidas.
- **Forks.** A licença é MIT. Use, adapte, publique a sua versão — não precisa
  pedir e não precisa avisar.

## O que não é aceito

**Pull requests não são revisados nem mesclados.** Não é falta de consideração
com quem os abre: o motor é mantido em outro lugar, e mesclar aqui criaria duas
fontes da verdade num código que embasa decisão financeira. PRs abertos serão
fechados com um apontamento para este arquivo.

Se você corrigiu algo real, **abra uma issue descrevendo o defeito** — com o
número que sai errado e o que deveria sair. Isso chega ao lugar certo. O código
da correção é útil na issue, como referência, mas a mudança é aplicada na origem.

## Se for adaptar

Três avisos que economizam tempo:

1. **`npm run teste` é o que impede uma fórmula de sair errada em silêncio.**
   São 93 verificações sobre um caso real. Ao mexer em faixa, peso ou fórmula,
   rode. Se quebrar, leia o que quebrou antes de ajustar a asserção — a asserção
   costuma estar certa.
2. **As faixas de referência são de empresa brasileira de médio porte.** Setor
   com estrutura própria (construção, concessionária, varejo de giro rápido)
   precisa das suas. Ver `docs/02-indicadores.md`.
3. **Não peça ao modelo o que se calcula dos números.** É a decisão de arquitetura
   que sustenta o resto: `docs/05-conectar-ia.md`, seção 1.
