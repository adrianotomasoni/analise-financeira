# Prompts e schema

Os prompts vivem em `src/ia/prompts.ts` e o schema em `src/ia/schema.ts`. São o ativo
mais caro do módulo: quase toda linha que parece redundante está lá para impedir um
comportamento específico e observado do modelo.

Este documento explica **por que** cada bloco existe. Ao mexer, leia o motivo antes.

---

## O schema, e o que não está nele

Duas ausências são deliberadas.

**Não existe campo de nota, score ou rating.** Um campo aqui seria um convite a
preenchê-lo, e foi exatamente assim que uma versão anterior produziu notas que
ninguém conseguia explicar. Ver [`04-score-e-rating.md`](04-score-e-rating.md).

**Não existe pedido de EBITDA.** O campo `ebitda` é aceito como fallback, mas o valor
usado é sempre `ebit + depreciacao_amortizacao`, calculado em `derive.ts`. Pedir o
EBITDA ao modelo *sem lhe dar um campo para a depreciação* o leva a retirá-la das
despesas administrativas para "chegar lá", e o EBIT sai inflado.

O que **está** no schema além dos campos contábeis:

| Campo | Para quê |
|---|---|
| `totais_impressos` | As 12 linhas de total copiadas literalmente. A conferência independente |
| `indicios_periodo` | Trechos literais do cabeçalho. O modelo reporta, o código classifica |
| `meses_competencia_declarado` | Só se o documento **declarar**. `null` quando não estiver escrito |
| `qualidade_extracao` | A autoavaliação do modelo. Guardada para comparação, **não** para decisão |
| `red_flags` | Só o que não se calcula dos números |
| `observacoes_ia` | Observação preliminar. O parecer definitivo vem depois |

---

## Os blocos do prompt de extração

### `OS TOTAIS IMPRESSOS MANDAM`

```
Nunca infira, nunca some sub-contas para "conferir", e nunca corrija um PL que
pareça pequeno demais. Um Patrimônio Líquido de R$ 493.180,00 com Ativo Total de
R$ 36,2 milhões é um dado real e é exatamente o sinal de risco que a análise
precisa enxergar — inflá-lo destrói o resultado.
```

Modelos "consertam" números que parecem implausíveis. Um PL de R$ 493 mil sustentando
R$ 36 milhões de ativo **parece** erro de leitura, e não é: é a informação mais
importante daquele balanço. A instrução existe porque o comportamento foi observado.

### `SUBTOTAIS SÃO COPIADOS, NUNCA CALCULADOS`

O bloco que produz as âncoras. Sem ele o modelo deriva o Lucro Bruto do CMV que leu,
e a conferência passa a conferir a leitura contra ela mesma. Ver
[`03-conferencia.md`](03-conferencia.md).

A frase que faz o trabalho: *"se a sua soma dos componentes não bate com o subtotal
impresso, o subtotal impresso está certo e algum componente foi lido errado"*.

### `DEPRECIAÇÃO — leia esta regra duas vezes`

```
Quando a linha "Depreciações e Amortizações" estiver DENTRO do bloco de despesas
administrativas, ela CONTINUA somada em despesas_administrativas. Extraia o valor
TAMBÉM, em separado, no campo depreciacao_amortizacao.
NUNCA remova a depreciação das despesas para "chegar ao EBITDA".
```

Contraintuitivo — o mesmo valor em dois campos —, e é a única forma de ter o EBITDA
correto sem inflar o EBIT.

### `LINHAS FINANCEIRAS DENTRO DO BLOCO OPERACIONAL (o caso 3.07)`

Sublinhas financeiras dentro do bloco "Despesas Operacionais". Vão para os campos
financeiros e saem do EBIT. Sem isso, o EBIT vem com os juros dentro e a cobertura de
juros mede o resultado contra ele mesmo.

A dica de sinal embutida no bloco é a que resolve o caso na prática: *"uma linha de
receita dentro de um bloco de despesas REDUZ o total do bloco"*.

### `SINAIS DE PERÍODO — você REPORTA, o sistema DECIDE`

```
Não classifique o documento e não tente adivinhar — a classificação é feita em
código, a partir do que você reportar.
```

Assimetria de custo: um balancete tratado como exercício encerrado vira decisão sobre
demonstração não fechada.

### `AUTOCONFERÊNCIA OBRIGATÓRIA`

As identidades listadas antes da chamada de função. Melhora a leitura de verdade — o
modelo relê e corrige —, mas **não substitui a conferência do código**, pelo motivo
já dito: ele confere os dois lados que ele mesmo produziu.

A frase final é a que mais importa:

```
NUNCA ajuste um número só para fazer a conta fechar — um balanço que não fecha é
informação, um balanço maquiado é uma decisão tomada sobre dado falso.
```

### `red_flags` — só o que não se calcula

```
Os índices (liquidez, endividamento, prejuízo, capital de giro, D/E, cobertura,
DL/EBITDA, margens) são calculados em código e NÃO devem ser repetidos aqui.
```

Sem isso, o modelo devolve alertas numéricos que o motor já emite, com redação
diferente — e a deduplicação por texto não pega variantes. Um caso saiu com 14
alertas, 4 deles a mesma coisa.

A lista do que **deve** vir do modelo: ressalva do auditor, continuidade operacional,
parcelamento tributário, execução fiscal, garantia real dada, ajuste de exercícios
anteriores, distribuição de lucros incompatível, concentração de cliente ou contrato,
receita não recorrente, e qualquer linha que ele não conseguiu classificar.

---

## O prompt do parecer

O modelo **não vê o documento**. Recebe o pacote conferido e só redige.

As regras que carregam peso:

**Regra 1 — não recalcule.** *"Se um indicador vier como null com motivo (ex.:
'patrimônio líquido negativo'), diga isso em vez de inventar um valor."* Sem ela, o
modelo preenche a lacuna com um número plausível.

**Regra 2 — cite os valores.** *"Parecer sem número é opinião."* É a regra que
separa este parecer do que saía antes: "situação crítica, endividamento altíssimo",
sem um valor sequer.

**Regra 4 — a conferência vira ressalva explícita.** Quebras vão para
`qualidade_da_informacao`, e a conclusão tem de considerar que os números podem estar
errados.

**Regra 5 — leia a DFC e a DMPL.** As três leituras que só elas permitem: caixa
operacional acima do EBITDA com PMP alto (caixa de fornecedores, não de resultado),
dividendos em ano de prejuízo, ajustes de exercícios anteriores.

**Regra 6 — o rating é piso.** *"Você pode ser mais restritivo que o rating, nunca
mais permissivo."* E o piso é **aplicado em código depois da resposta**, porque a
instrução sozinha não basta: um modelo tende a pedir licença para ser otimista.

```ts
if (rating === "E" && conclusao.recomendacao !== "desfavoravel") {
  conclusao.recomendacao = "desfavoravel";
  parecer.recomendacaoRebaixada = true;
}
```

**Regra 8 — não copie o resumo.** O resumo determinístico está no pacote *"para você
não errar número, não para ser copiado"*.

---

## Adaptando para outro uso

Os prompts são de análise de crédito e risco de contraparte. Para outro contexto —
avaliação de fornecedor, due diligence, concessão de limite comercial — passe
`finalidade`:

```ts
extrairDoDocumento(provedor, docs, { finalidade: "habilitação de fornecedor em licitação" });
gerarParecer(provedor, analise, { finalidade: "concessão de limite comercial" });
```

Isso muda o papel do analista no prompt. **Não mexa nos blocos contábeis** — eles
descrevem como se lê um balanço brasileiro, e isso não depende do uso.

Se precisar de campos novos, o caminho é: campo em `AnaliseFinanceira`
(`indicadores.ts`) → lista em `schema.ts` → bloco explicativo em `prompts.ts` →
conferência em `conferencia.ts`, se houver como conferi-lo. **Um campo sem
conferência é um campo em que se confia sem verificar.**
