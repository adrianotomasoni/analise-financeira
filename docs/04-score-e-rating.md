# Score, rating e memória de cálculo

Uma nota de 0 a 100, um ajuste de −10 a +10 e uma letra de A a E. Tudo calculado em
código, com uma linha de memória para cada ponto.

---

## Por que não pedir a nota ao modelo

Já foi assim. `score` era um campo do schema de extração, preenchido na mesma chamada
que lia o PDF. Dois resultados reais:

| Empresa | Situação | Nota do modelo |
|---|---|---|
| Transportadora | PL de −R$ 63,6 mi, liquidez corrente 0,21, prejuízo de R$ 19,6 mi | **−10** |
| Prestadora de serviços | PL de R$ 493 mil sustentando R$ 35,8 mi de passivo | **+3** |

O primeiro parece certo. O segundo é defensável? **Não havia como saber.** Não existia
regra, não existia memória, e a mesma empresa podia receber outra nota na execução
seguinte. Um número que quem decide não consegue explicar não serve para decidir — e
não sobrevive a uma pergunta de auditoria.

---

## Como a nota é composta

### 1. Semáforos por grupo (100 pontos)

Cada indicador tem faixa de referência e vira verde, amarelo ou vermelho. Dentro do
grupo: verde vale 1 ponto, amarelo 0,5, vermelho 0.

| Grupo | Peso |
|---|---:|
| Endividamento e alavancagem | 25 |
| Liquidez | 20 |
| Rentabilidade | 20 |
| Cobertura e geração de caixa | 20 |
| Ciclo e capital de giro | 10 |
| Solvência | 5 |

Grupo sem nenhum indicador calculável **não pontua zero**: sai da conta, e o peso é
redistribuído entre os demais. Ausência de dado não é nota baixa.

### 2. O "não se aplica" que conta como vermelho

Aqui está a diferença entre este motor e uma planilha.

Um indicador nulo pode significar duas coisas opostas:

- **sem dado** — o documento não trazia estoques. Neutro; não pontua e não penaliza.
- **não se aplica** — ROE com patrimônio líquido negativo. **Não é ausência de dado:
  é a pior versão do dado.**

Prejuízo dividido por PL negativo dá "ROE de +30%". Uma versão anterior calculava
isso e pintava de **verde** uma empresa com passivo a descoberto. Hoje esses índices
ficam nulos com o motivo registrado, e o motivo entra na nota como vermelho:

```ts
MOTIVO_PL_NEGATIVO      // "patrimônio líquido negativo"        → conta como vermelho
MOTIVO_EBITDA_NEGATIVO  // "a operação não gera caixa..."       → conta como vermelho
MOTIVO_SEM_EMPRESTIMOS  // "não informados no documento"        → neutro
MOTIVO_SEM_DFC          // "o documento não traz fluxo de caixa" → neutro
```

A distinção é por identidade de constante, não por expressão regular sobre a frase —
um ajuste de redação já silenciou essa regra uma vez.

### 3. Penalidades

| Severidade | Desconto |
|---|---:|
| Crítica | 15 pontos |
| Alta | 5 pontos |
| Atenção | 0 (aparece, não desconta) |

Teto de **40 pontos** no total. Observações vindas do modelo (`origem: "ia"`) **não
penalizam** — não passaram por regra numérica.

### 4. Dois tetos que nada compensa

```
patrimônio líquido negativo        → nota no máximo 20 → rating E
liquidez corrente abaixo de 0,5    → nota no máximo 45 → rating D
```

A linha de memória entra **mesmo quando as penalidades já levaram a nota abaixo do
teto**: quem lê precisa saber que o rating não subiria por mais que os outros
indicadores melhorassem.

---

## Rating e ajuste de score

```
nota 80–100  → A  Excelente   nota 35–49  → D  Restrito
nota 65–79   → B  Bom         nota 0–34   → E  Crítico
nota 50–64   → C  Regular
```

O ajuste de −10 a +10 é a mesma medida noutra escala:

```ts
score = clamp(Math.round((nota - 50) / 5), -10, 10)
```

**Cuidado com o arredondamento.** Ele move cada fronteira 2 pontos para baixo: nota 83
já dá +7, não 85; nota 63 já dá +3, não 65. Uma tabela de faixas escrita à mão sai
errada — `legenda.ts` **deriva** as faixas de `notaParaScore()`, e o teste de sanidade
confere as duas bordas de cada uma.

**Balancete tem teto de +3.** Os lançamentos que faltam para fechar o exercício
(provisão de IR, depreciação do ano inteiro, férias, 13º) só pioram o resultado,
nunca melhoram. Uma melhora aparente em demonstração não encerrada não é melhora.

---

## Liberação

```ts
score.liberado        // false quando a extração não permite confiar no número
score.motivoBloqueio  // "O balanço não fecha — confira a extração antes de usar."
```

Bloqueia em dois casos: **o equilíbrio do balanço não fecha** ou **um total impresso
diverge do extraído**. O número continua visível — esconder informação não ajuda —,
mas não sai liberado para decisão até alguém olhar a conferência.

---

## A memória

Toda a razão de ser do módulo. Cada linha diz o que pontuou e por quê:

```ts
score.memoria
// [
//   { tipo: "grupo", label: "Liquidez",
//     detalhe: "Liquidez Corrente vermelho · Liquidez Seca vermelho · ... → 0% de 20 pts",
//     pontos: 0 },
//   { tipo: "grupo", label: "Endividamento e alavancagem",
//     detalhe: "Endividamento Geral vermelho · Debt / Equity não se aplica
//               (patrimônio líquido negativo) = vermelho · ... → 0% de 25 pts",
//     pontos: 0 },
//   { tipo: "penalidade", label: "Red flag crítica",
//     detalhe: "Patrimônio Líquido negativo (−R$ 63,6 mi) — passivo a descoberto",
//     pontos: -15 },
//   { tipo: "teto", label: "PL negativo", detalhe: "rating limitado a E", pontos: 0 },
// ]
```

É o que se mostra a quem pergunta "por que E?". E é o que permite discordar do motor
com argumento — se um peso está errado para o seu setor, a memória mostra qual.

---

## Ajustando para o seu caso

Os pesos e as faixas são de empresa brasileira de médio porte. Setores com estrutura
própria merecem os seus:

```ts
// src/score.ts
export const PESO_GRUPO = { liquidez: 20, endividamento: 25, rentabilidade: 20,
                            cobertura: 20, ciclo: 10, solvencia: 5 };  // soma 100
export const PENALIDADE_FLAG = { critica: 15, alta: 5, atencao: 0 };
export const TETO_PENALIDADES = 40;

// src/indicadores.ts — a faixa de cada indicador
getStatus: (v) => v > 1.5 ? "green" : v >= 1.0 ? "yellow" : "red",
```

Ao mexer, rode `npm run sanidade`: o caso conhecido reprova mudança que quebre a
coerência entre faixas, legenda e nota.

Casos que pedem faixas próprias: construção civil (ciclo longo, PMR alto por
natureza), concessionárias de serviço público (imobilização do PL acima de 100% é
normal), varejo de giro rápido (ciclo financeiro negativo é o modelo do negócio, não
atraso com fornecedor), e instituições financeiras, para as quais este motor
simplesmente não serve.
