# Conferência: como saber se dá para confiar na leitura

O núcleo do método. Se você for ler um documento só, leia este.

---

## O problema

Um modelo de IA lê um balanço com boa precisão. O problema não é a taxa de acerto —
é que **o erro não se anuncia**, e o modo mais comum de conferir uma extração
confere a leitura contra ela mesma.

Caso real (anonimizado) — uma transportadora de médio porte, exercício 2025, extraída
por um modelo de primeira linha:

| Campo | Impresso no PDF assinado | Extraído | Erro |
|---|---:|---:|---:|
| CMV | 71.591.475,22 | 71.251.475,22 | **340.000,00** |
| Empréstimos CP | 13.622.255,97 | 12.615.671,25 | **1.006.584,72** |
| LAIR | −19.616.030,52 | −20.122.170,72 | **506.140,20** |

A extração saiu com `qualidade_extracao: "alta"` e **7 das 9 identidades contábeis
fechando**. Inclusive esta:

```
Lucro Bruto = Receita Líquida − CMV
-8.337.507,43 = 62.913.967,79 − 71.251.475,22   ✓ fecha
```

Fecha perfeitamente. E está errado, porque o modelo derivou o Lucro Bruto do CMV que
ele mesmo leu errado. Os dois lados da conta vieram da mesma leitura. **Uma identidade
contábil não é uma conferência quando o extrator produz os dois lados.**

---

## A solução: três blocos, um deles independente

### 1. Identidades (9)

As contas que a contabilidade obriga a fechar.

| Bloco | Identidade | Tolerância |
|---|---|---|
| Balanço | Ativo Total = Circulante + Não Circulante | 0,5% |
| Balanço | Ativo Total = Passivo + Patrimônio Líquido | 0,5% |
| Balanço | Passivo Total = Circulante + Não Circulante | 0,5% |
| DRE | Receita Líquida = Receita Bruta − Deduções | 1% |
| DRE | Lucro Bruto = Receita Líquida − CMV | 1% |
| DRE | EBIT = Lucro Bruto − Despesas Operacionais | 1% |
| DRE | EBITDA = EBIT + Depreciação | 1% |
| DRE | LAIR = EBIT + Resultado Financeiro + Não Operacional | 1% |
| DRE | Lucro Líquido = LAIR − IR/CSLL | 1% |

O balanço não admite folga: meio ponto percentual já é erro de leitura. O DRE tolera
1% por arredondamento de centavos em cadeias longas de subtração.

**Exceção do balancete.** Num balancete o resultado do período em geral ainda não foi
transferido ao PL, e a identidade do equilíbrio não fecha *por natureza* — erra
exatamente pelo valor do resultado. O motor testa isso: se a conta fecha somando o
lucro do período, passa, com a observação registrada. Reprovar aqui seria trocar um
falso positivo por um falso negativo.

Úteis e baratas. Mas com o limite de cima: os dois lados vêm da mesma leitura.

### 2. Âncoras impressas — a conferência independente

Além dos campos estruturados, a extração copia **literalmente** as linhas de TOTAL
do documento, com o rótulo como impresso:

```json
{ "chave": "lucro_bruto", "valor": -8677507.43, "rotulo_original": "LUCRO BRUTO" }
```

O sistema então compara **campo extraído × total impresso**.

São 12 chaves: os 6 totais do balanço, a linha "TOTAL PASSIVO" que iguala o ativo, e
5 do DRE (receita líquida, lucro bruto, resultado operacional, resultado antes do IR,
resultado do exercício).

Sobre o payload que realmente foi persistido nesse caso:

```
Identidade  Lucro Bruto = RL − CMV        ✓ fecha    (sobre o CMV errado)
Âncora      Lucro Bruto × total impresso  ✗ 340.000,00 de diferença
```

**É a única checagem que não depende da leitura do modelo.** O campo estruturado é o
que ele entendeu; o total impresso é o que o contador escreveu. Ele copia sem
recalcular, então um erro de leitura em uma subconta não contamina o total copiado.

Uma âncora quebrada **bloqueia o score**: `score.liberado = false`, com o motivo em
`score.motivoBloqueio`. O número continua sendo exibido — esconder informação não
ajuda ninguém —, mas não sai liberado para decisão até alguém olhar.

Duas convenções brasileiras convivem para "RESULTADO OPERACIONAL": com o financeiro
embutido (mais comum em DRE de escritório) e sem. A âncora aceita a que bater.

### 3. Cruzamentos com DFC e DMPL

Quando o documento traz fluxo de caixa e mutação do patrimônio, quatro conferências
contra demonstrações que o modelo leu em **outra parte do PDF**:

| Cruzamento | Tolerância |
|---|---|
| Lucro Líquido = resultado do exercício na DMPL | 1% |
| Patrimônio Líquido = saldo final na DMPL | 0,5% |
| Caixa e equivalentes = caixa final na DFC | 0,5% |
| Depreciação da DRE ≈ depreciação da DFC | 5% |

A tolerância de 5% na depreciação é folgada de propósito: a DFC costuma somar
amortizações e baixas de imobilizado que a linha da DRE não traz.

---

## Nem toda quebra é erro de extração

No mesmo documento — **o PDF assinado, com os números corretos** — uma
verificação não fecha:

```
Depreciação: resultado R$ 14.187.828,80 × fluxo de caixa R$ 15.626.445,52
diferença R$ 1.438.616,72 (10,1%)
```

Isso não é erro de leitura. Está no documento do contador, e é comum: a DFC agrega
amortizações e baixas que a DRE apresenta em outra linha.

O motor **não esconde e não trata como fatal**. A quebra aparece na conferência, entra
no parecer como ressalva, e quem analisa decide. Por isso a classificação de qualidade
distingue os casos:

```ts
qualidadeSugerida(quebradas)
  nenhuma quebra                                      → "alta"
  só quebras internas do DRE ou a depreciação da DFC  → "media"
  qualquer outra (balanço, âncora, cruzamento)        → "baixa"
```

Um motor que "arredondasse" essa quebra para `alta` estaria afirmando uma precisão
que o documento não tem.

---

## A conferência manda na qualidade declarada

```ts
extracao.qualidadeDeclarada  // "alta"  ← o modelo avaliando o próprio trabalho
extracao.qualidade           // "baixa" ← a conferência medindo
```

Quando discordam, vale a conferência — e o motivo é estrutural, não desconfiança: um
modelo que leu o CMV errado e derivou o Lucro Bruto desse CMV **não tem informação
para saber que errou**. Para ele, tudo fecha. A conferência mede contra os totais
impressos, que ele copiou mas não recalculou.

---

## Na prática

```ts
import { resumirConferencia } from "analise-financeira-br";

const c = resumirConferencia(contas);

c.avaliadas          // quantas puderam ser avaliadas (faltar insumo não reprova)
c.quebradas          // as que não fecham, com label, esperado, obtido e diff
c.balancoQuebrado    // o equilíbrio do balanço não fecha
c.ancoraQuebrada     // algum total impresso diverge — bloqueia o score
c.qualidadeSugerida  // "alta" | "media" | "baixa"
```

Uma identidade sem insumo (`aplicavel: false`) **não reprova**. Ausência de dado não
é erro; é ausência de dado, e é tratada como tal em todo o motor.

Tudo é recalculado sobre o estado **atual** das contas, nunca lido de um registro
gravado numa execução anterior. Corrigir uma conta à mão move o semáforo na mesma
hora — foi a ausência disso que deixou passar, num sistema anterior, um balanço que
errava em R$ 27 milhões durante meses.
