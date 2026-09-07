# Operação

Lote, custo, reprocesso e o que fazer quando a conferência acusa.

---

## O fluxo de uma análise

```
PDF → extrairDoDocumento()  ← única etapa com IA
        ↓ derivação do DRE, classificação de período, conferência
      contas + qualidade medida
        ↓
      analisar()            ← determinístico, offline
        ↓ 33 indicadores, alertas, nota com memória, síntese
      ResultadoAnalise
        ↓
      gerarParecer()        ← opcional, 2ª chamada, sobre números conferidos
```

A segunda etapa não depende da primeira. Quem já tem os números usa só `analisar()`.

---

## Ler o resultado, na ordem certa

Uma análise se lê de cima para baixo, e a ordem não é arbitrária:

**1. A conferência, antes de qualquer índice.**

```ts
if (analise.conferencia.ancoraQuebrada || analise.conferencia.balancoQuebrado) {
  // Um total impresso diverge do extraído, ou o balanço não fecha.
  // Nenhum índice abaixo é confiável. Volte ao PDF.
}
```

**2. A liberação do score.**

```ts
analise.score.liberado        // false → não use para decisão ainda
analise.score.motivoBloqueio  // por quê
```

**3. Os motivos dos nulos.**

```ts
analise.motivos.roe  // "patrimônio líquido negativo" — não é falta de dado
```

Um índice ausente por PL negativo é informação de risco, não lacuna.

**4. Aí sim, os números.**

```ts
analise.score.rating           // "E"
analise.score.memoria          // por que deu isso, linha a linha
analise.contagemFlags.critica  // quantos alertas críticos
analise.sintese                // o resumo, com os valores dentro
```

---

## Processar em lote

Sequencial, concorrência 2, com teto de gasto. Não paralelize mais: rate limit vira
retry, retry vira custo, e um lote pela metade é pior que um lote lento.

```ts
import { readFile } from "node:fs/promises";
import { analisar, provedorDoAmbiente, extrairDoDocumento } from "analise-financeira-br";

const provedor = provedorDoAmbiente();
const TETO_USD = 5.00;
let gasto = 0;

const resultados: Array<{ arquivo: string; analise?: unknown; erro?: string }> = [];
const falhas: string[] = [];

for (const arquivo of arquivos) {
  if (gasto > TETO_USD) { falhas.push(`${arquivo}: teto de gasto atingido`); continue; }
  try {
    const e = await extrairDoDocumento(provedor, [{
      bytes: await readFile(arquivo), nome: arquivo, mime: "application/pdf",
    }]);
    gasto += e.custoUsd ?? 0;
    resultados.push({ arquivo, analise: analisar(e.contas, { redFlagsDocumento: e.redFlagsDocumento }) });
  } catch (err) {
    falhas.push(`${arquivo}: ${(err as Error).message}`);   // registre e siga
  }
}
```

Três regras que a experiência impõe:

1. **Uma falha não derruba o lote.** Registre e siga; a lista de falhas é o produto
   secundário mais útil de uma passada.
2. **Teto de gasto, sempre.** Um erro de laço num diretório grande vira fatura.
3. **Nunca repita chamada que falhou por conteúdo.** Repita 429, 5xx e rede — com
   espera exponencial. `ErroProvedor.repetivel` diz qual é qual.

### Ensaio antes do lote

Antes de rodar 100 documentos, rode **um** de que você conhece os números e confira
valor a valor: patrimônio líquido, receita líquida, resultado do exercício,
empréstimos de curto e longo prazo. São os cinco campos que, errados, invertem a
análise.

---

## Quando a conferência acusa

| Sinal | O que costuma ser | O que fazer |
|---|---|---|
| Âncora do **Lucro Bruto** quebrada | Um bloco de custo ficou fora do CMV | Reler o DRE: DREs com vários blocos de custo (diretos, material, utilidades, indiretos) somam todos em `cmv` |
| Âncora de **empréstimos** quebrada | Subcontas somadas em vez da linha de total | Usar a linha de total, que já desconta as redutoras |
| **Balanço não fecha** e é balancete | Resultado ainda não transferido ao PL | Normal. O motor já testa isso; se marcou quebra, o valor não bate nem somando o resultado |
| **LAIR não fecha** | Não operacional em campo errado | Ganho de alienação de imobilizado vai em `receitas_nao_operacionais`, não em "outras operacionais" |
| **Depreciação DRE × DFC** com pouca diferença | Nada. A DFC agrega amortizações e baixas | É a quebra que vale `media`. Vira ressalva no parecer |
| **Qualidade medida < declarada** | O modelo não sabe que errou | Confie na medida. Leia as âncoras quebradas |

O reprocesso é a mesma chamada. Se um campo específico está errado e o resto está
certo, corrija o campo à mão e chame `analisar()` de novo — a conferência recalcula
sobre o valor corrigido na hora.

---

## Custo

| Modelo na extração | Por análise (4–12 páginas) | 100 documentos |
|---|---|---|
| `claude-opus-5` | US$ 0,04 – 0,10 | US$ 4 – 10 |
| `claude-sonnet-5` | US$ 0,02 – 0,04 | US$ 2 – 4 |
| `claude-haiku-4-5` | US$ 0,01 – 0,02 | US$ 1 – 2 |

`extracao.custoUsd` é **estimativa** pela tabela local de `src/ia/anthropic.ts`, que
envelhece. A fatura é a do provedor; confira em <https://anthropic.com/pricing> antes
de projetar volume.

A diferença entre o mais caro e o mais barato, em 100 documentos, é da ordem de US$ 8.
Uma leitura errada de patrimônio líquido custa mais do que isso na primeira decisão
tomada em cima dela. **Economize no parecer; não economize na extração.**

---

## Guardando o resultado

O motor não persiste nada. Se for guardar, guarde o suficiente para reconstruir a
decisão meses depois:

| Guarde | Por quê |
|---|---|
| `contas` | O insumo. Sem ele nada se refaz |
| `score.memoria` | Responde "por que rating E?" numa auditoria |
| `conferencia.quebradas` | O que não fechava **naquele momento** |
| `extracao.modelo`, `qualidade`, `qualidadeDeclarada` | Trilha: qual modelo produziu, e se ele se superestimou |
| `parecer` | O texto emitido |

Os indicadores **não precisam ser gravados** — são função pura das contas, e
recalculá-los é instantâneo. Gravá-los cria a chance de o registro divergir do
código depois de um ajuste de fórmula.

Uma nota sobre proveniência: guarde `extracao.modelo` no registro, mas **não o
imprima no relatório que circula**. Quem recebe o parecer precisa saber o que os
números dizem; qual modelo os leu é trilha de auditoria, e o lugar dela é o banco.
Quem emite responde pelo que emite.

---

## Atualizando o motor

Ao mexer em fórmula, faixa, peso ou prompt:

```bash
npm run teste      # typecheck + as 126 verificações sobre o caso conhecido
```

A sanidade não é decorativa: ela reprova mudança que quebre a coerência entre as
faixas, a legenda e a nota — inclusive a que parece inofensiva. As faixas da legenda
de pontuação, por exemplo, estavam erradas nas seis linhas por causa do
arredondamento do score, e a legenda contradizia a nota impressa ao lado dela no
mesmo relatório.

Ao mudar de modelo em produção, ver a seção 7 de
[`05-conectar-ia.md`](05-conectar-ia.md).
