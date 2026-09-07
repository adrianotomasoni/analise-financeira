# Os 33 indicadores

Fórmula, faixas de referência e o que cada um mede. **Esta tabela foi gerada a partir
de `src/indicadores.ts`** — o código é a fonte, não a cópia.

Legenda das faixas: `verde · amarelo · vermelho`. As faixas valem para empresa
brasileira de médio porte; ver "Ajustando para o seu setor" no fim.

---

## Três regras que atravessam todos

**1. `null` tem dois significados, e o motor os separa.**

```ts
analise.indicadores.roe   // null
analise.motivos.roe       // "patrimônio líquido negativo"  ← não se aplica
analise.motivos.pme       // undefined                       ← sem dado
```

Cinco índices dividem pelo patrimônio líquido e **não são calculados com PL ≤ 0**:
ROE, Debt/Equity, Imobilização do PL, Dívida Financeira/PL e Kanitz. Prejuízo ÷ PL
negativo dá "ROE de +30%", e uma versão anterior deste motor pintava de verde, com
isso, uma empresa com passivo a descoberto.

Ver [`04-score-e-rating.md`](04-score-e-rating.md) para como o "não se aplica" entra
na nota como vermelho, enquanto "sem dado" fica neutro.

**2. Três famílias, e balancete não trata todas igual.**

| Família | O que é | Em balancete |
|---|---|---|
| `patrimonial` | Saldo ÷ saldo — foto na data de corte | Comparável sem ajuste |
| `fluxo` | Fluxo ÷ fluxo do mesmo período — a duração se cancela | Comparável sem ajuste |
| `misto` | Fluxo ÷ saldo — numerador cobre N meses, denominador é a data | **Distorcido** — ganha projeção anualizada ao lado, só para exibição |

Tratar as três como uma só é o que produz "ROE de 0,3%" para uma empresa que
simplesmente teve o trimestre medido em vez do ano.

**3. Prazos médios usam ano comercial de 360 dias.** PMR sobre a receita **bruta**
(é a base do faturamento a receber); PME e PMP sobre o CMV/CSP, que é o proxy das
compras quando o documento não as informa.

---

### Liquidez — peso 20

| Indicador | Fórmula | Faixas (verde · amarelo · vermelho) | Família |
|---|---|---|---|
| **Liquidez Corrente** | `AC / PC` | > 1,5 · 1,0–1,5 · < 1,0 | patrimonial |
| **Liquidez Seca** | `(AC − Estoques) / PC` | > 1,0 · 0,7–1,0 · < 0,7 | patrimonial |
| **Liquidez Geral** | `(AC + RLP) / PT` | > 1,0 · 0,8–1,0 · < 0,8 | patrimonial |
| **Liquidez Imediata** | `Caixa / PC` | > 0,3 · 0,1–0,3 · < 0,1 | patrimonial |

**Liquidez Corrente.** Mede a capacidade da empresa de pagar dívidas de curto prazo com seus ativos circulantes. Acima de 1,5 indica boa folga financeira; abaixo de 1,0 é sinal de alerta.

**Liquidez Seca.** Igual à liquidez corrente, mas exclui estoques (ativos menos líquidos). Avalia a capacidade de pagamento sem depender da venda de mercadorias.

**Liquidez Geral.** Considera o realizável de longo prazo além do circulante. Avalia a solidez financeira no médio e longo prazo frente a todo o passivo exigível.

**Liquidez Imediata.** Mede quanto do passivo circulante pode ser pago imediatamente com o caixa e equivalentes disponíveis (bancos, aplicações). Indicador de liquidez de curtíssimo prazo.


### Endividamento e alavancagem — peso 25

| Indicador | Fórmula | Faixas (verde · amarelo · vermelho) | Família |
|---|---|---|---|
| **Endividamento Geral** | `PT / AT` | < 50% · 50–70% · > 70% | patrimonial |
| **Comp. Endividamento** | `PC / PT` | < 50% · 50–70% · > 70% | patrimonial |
| **Endividamento Financeiro** | `Dív. Fin. Bruta / AT` | < 30% · 30–50% · > 50% | patrimonial |
| **Debt / Equity** | `PT / PL` | < 1,0x · 1,0–2,0x · > 2,0x | patrimonial |
| **Imobilização do PL** | `Imobilizado / PL` | < 50% · 50–100% · > 100% | patrimonial |

**Endividamento Geral.** Proporção do ativo total financiada por capital de terceiros (dívidas). Acima de 70% indica alta dependência de recursos externos e maior risco financeiro.

**Comp. Endividamento.** Percentual do passivo total que vence no curto prazo (até 12 meses). Quanto maior, maior o risco de necessidade imediata de refinanciamento ou pagamento.

**Endividamento Financeiro.** Parcela do ativo financiada por empréstimos e financiamentos (dívida bancária), excluindo fornecedores, fisco e pessoal. Isola a dívida onerosa.

**Debt / Equity.** Razão entre capital de terceiros (passivo total) e capital próprio (patrimônio líquido). Acima de 2x indica alta alavancagem; acima de 3x é sinal crítico em análise de crédito. Não se aplica com PL negativo.

**Imobilização do PL.** Percentual do patrimônio líquido comprometido com ativos imobilizados (máquinas, equipamentos, imóveis). Acima de 100% significa que o imobilizado supera o PL, exigindo recursos de terceiros. Não se aplica com PL negativo.


### Rentabilidade — peso 20

| Indicador | Fórmula | Faixas (verde · amarelo · vermelho) | Família |
|---|---|---|---|
| **Margem Bruta** | `Lucro Bruto / RL` | > 30% · 15–30% · < 15% | fluxo |
| **Margem Operacional** | `EBIT / RL` | > 10% · 5–10% · < 5% | fluxo |
| **Margem EBITDA** | `EBITDA / RL` | > 12% · 6–12% · < 6% | fluxo |
| **Margem Líquida** | `LL / RL` | > 8% · 3–8% · < 3% | fluxo |
| **ROE** | `LL / PL` | > 15% · 5–15% · < 5% | misto |
| **ROA** | `LL / AT` | > 5% · 2–5% · < 2% | misto |

**Margem Bruta.** Percentual da receita líquida que sobra após descontar os custos diretos de produção ou prestação de serviço (CMV/CSP). Reflete eficiência produtiva e poder de precificação.

**Margem Operacional.** Percentual da receita líquida que sobra após custos e todas as despesas operacionais (EBIT). Indica a rentabilidade da operação principal, antes do resultado financeiro e impostos.

**Margem EBITDA.** EBITDA sobre a receita líquida. Aproxima o fluxo de caixa operacional ao excluir depreciação e amortização. Muito utilizado para comparação entre empresas do mesmo setor.

**Margem Líquida.** Percentual final que sobra para os sócios após todos os custos, despesas, resultado financeiro e impostos. É a principal métrica de rentabilidade final da empresa.

**ROE.** Return on Equity — retorno sobre o patrimônio líquido. Mede quanto a empresa gera de lucro para cada R$ investido pelos sócios. Acima de 15% é considerado excelente. Não se aplica com PL negativo.

**ROA.** Return on Assets — retorno sobre o ativo total. Mede a eficiência da empresa em transformar seus ativos em lucro. Acima de 5% indica boa utilização dos recursos.


### Cobertura e geração de caixa — peso 20

| Indicador | Fórmula | Faixas (verde · amarelo · vermelho) | Família |
|---|---|---|---|
| **Dívida Financeira Bruta** | `Empréstimos CP + LP` | informativo — sem faixa | patrimonial |
| **Dívida Líquida** | `Dív. Fin. Bruta − Caixa` | informativo — sem faixa | patrimonial |
| **Dív. Líq. / EBITDA** | `(Dív. Fin. − Caixa) / EBITDA` | < 2x · 2–3x · > 3x | misto |
| **Cobertura de Juros (EBIT)** | `EBIT / |Desp. Fin.|` | > 4x · 2–4x · < 2x | fluxo |
| **Cobertura de Juros (EBITDA)** | `EBITDA / |Desp. Fin.|` | > 3x · 1,5–3x · < 1,5x | fluxo |
| **Caixa Operacional (DFC)** | `DFC — atividades operacionais` | informativo — sem faixa | fluxo |
| **Capital de Giro** | `AC − PC` | > 0 · > −100 mil · ≤ −100 mil | patrimonial |
| **Giro do Ativo** | `RL / AT` | > 1,5x · 0,8–1,5x · < 0,8x | misto |

**Dívida Financeira Bruta.** Total de empréstimos e financiamentos (curto + longo prazo). É a dívida onerosa — a que cobra juros.

**Dívida Líquida.** Dívida financeira descontada do caixa e equivalentes. Negativa significa caixa líquido (mais caixa do que dívida bancária).

**Dív. Líq. / EBITDA.** Dívida financeira líquida (empréstimos e financiamentos menos caixa) dividida pelo EBITDA. Indica em quantos anos a empresa pagaria a dívida bancária usando apenas a geração operacional de caixa. Abaixo de 2x é saudável; acima de 4x é alavancagem alta. Não se aplica com EBITDA negativo.

**Cobertura de Juros (EBIT).** Quantas vezes o resultado operacional (EBIT) cobre as despesas financeiras (juros). Abaixo de 2x a empresa pode ter dificuldade em honrar sua dívida financeira.

**Cobertura de Juros (EBITDA).** Quantas vezes a geração operacional de caixa (EBITDA) cobre as despesas financeiras. É a medida usada em seguro de crédito: abaixo de 1,5x os juros consomem a maior parte do caixa gerado.

**Caixa Operacional (DFC).** Caixa líquido gerado pelas atividades operacionais, conforme a Demonstração dos Fluxos de Caixa. Confere se o EBITDA virou caixa de verdade — e de onde veio (resultado ou alongamento de fornecedores).

**Capital de Giro.** Diferença entre ativo circulante e passivo circulante (AC − PC). Positivo significa que a empresa tem folga para cobrir suas obrigações de curto prazo; negativo indica pressão de liquidez.

**Giro do Ativo.** Receita líquida dividida pelo ativo total. Indica quantas vezes o ativo total é 'girado' pelas vendas no período. Empresas de serviços costumam ter giro mais alto que as industriais.


### Ciclo e capital de giro — peso 10

| Indicador | Fórmula | Faixas (verde · amarelo · vermelho) | Família |
|---|---|---|---|
| **PMR** | `Clientes / Receita Bruta × 360` | ≤ 60 d · 60–90 d · > 90 d | misto |
| **PME** | `Estoques / CMV × 360` | ≤ 45 d · 45–90 d · > 90 d | misto |
| **PMP** | `Fornecedores / CMV × 360` | 30–90 d · 90–120 d · > 120 d ou < 15 d | misto |
| **Ciclo Financeiro** | `PMR + PME − PMP` | ≤ 30 d · 30–90 d · > 90 d | misto |
| **NCG** | `Clientes + Estoques − Fornecedores` | informativo — sem faixa | patrimonial |
| **Saldo de Tesouraria** | `Capital de Giro − NCG` | informativo — sem faixa | patrimonial |

**PMR.** Prazo médio de recebimento: quantos dias, em média, a empresa leva para receber dos clientes. Acima de 90 dias sugere carteira longa ou inadimplência.

**PME.** Prazo médio de estocagem: dias que a mercadoria fica em estoque antes de virar custo. Serviços e transporte têm estoque irrelevante.

**PMP.** Prazo médio de pagamento a fornecedores. Alto pode ser poder de negociação — ou atraso: acima de 120 dias, tratar como financiamento forçado por fornecedores.

**Ciclo Financeiro.** Dias entre pagar o fornecedor e receber do cliente. Positivo = a empresa financia o giro; negativo = os fornecedores financiam a empresa. Muito negativo combinado com PMP alto é sinal de fornecedores em atraso, não de eficiência.

**NCG.** Necessidade de capital de giro (modelo Fleuriet): recursos presos na operação. Positiva precisa ser financiada; negativa significa que a operação se financia sozinha.

**Saldo de Tesouraria.** Modelo Fleuriet: parcela do capital de giro que sobra (ou falta) depois de financiar a operação. Negativo indica dependência de dívida de curto prazo para girar — o 'efeito tesoura'.


### Solvência — peso 5

| Indicador | Fórmula | Faixas (verde · amarelo · vermelho) | Família |
|---|---|---|---|
| **Termômetro de Kanitz** | `0,05·LL/PL + 1,65·LG + 3,55·LS − 1,06·LC − 0,33·PT/PL` | > 0 · −3 a 0 · < −3 | misto |
| **Dív. Financeira / PL** | `Dív. Fin. Bruta / PL` | < 1x · 1–2x · > 2x | patrimonial |
| **Passivo / Receita** | `PT / RL` | < 0,6x · 0,6–1,0x · > 1,0x | misto |
| **Partes Relacionadas / AT** | `Créditos com sócios e ligadas / AT` | < 10% · 10–30% · > 30% | patrimonial |

**Termômetro de Kanitz.** Fator de insolvência de Kanitz. Acima de 0: solvente; entre −3 e 0: penumbra; abaixo de −3: insolvência. Não se aplica com PL negativo — a empresa já está tecnicamente insolvente.

**Dív. Financeira / PL.** Alavancagem bancária: quantas vezes a dívida onerosa supera o capital próprio. Não se aplica com PL negativo.

**Passivo / Receita.** Quantos anos de receita líquida seriam necessários para cobrir todo o passivo. Acima de 1x a dívida total supera um ano inteiro de faturamento.

**Partes Relacionadas / AT.** Parcela do ativo aplicada em créditos com sócios, controladas e coligadas. Acima de 30% o balanço depende de dinheiro que circula dentro do grupo, não da operação.


---

## Modelo Fleuriet e o efeito tesoura

Três indicadores do grupo de ciclo formam uma leitura conjunta que vale mais que a
soma das partes:

```
NCG                = Clientes + Estoques − Fornecedores
Capital de Giro    = Ativo Circulante − Passivo Circulante
Saldo de Tesouraria = Capital de Giro − NCG
```

**Saldo de tesouraria negativo com NCG crescente é o "efeito tesoura"**: a operação
prende cada vez mais recursos e o giro passa a ser financiado por dívida de curto
prazo. É um dos padrões mais confiáveis de deterioração antes que ela apareça no
resultado.

Cuidado com a leitura ingênua do ciclo financeiro negativo. Ele pode ser o modelo do
negócio (varejo de giro rápido recebe à vista e paga o fornecedor em 30 dias) ou pode
ser atraso. O que separa os dois é o **PMP**: acima de 120 dias, não é poder de
negociação, é financiamento forçado por fornecedores — e o motor emite alerta.

## Cobertura de juros: por que duas

`Cobertura de Juros (EBIT)` é a medida clássica. `Cobertura de Juros (EBITDA)` é a
usada em seguro de crédito, porque compara os juros com o caixa que a operação gera
de fato, e não com o resultado depois da depreciação.

O denominador de ambas é a soma de **todas** as despesas financeiras da quebra do
DRE — linha de despesas financeiras mais as parcelas de despesa das linhas com sinal
(variação cambial passiva, outras despesas financeiras). Não é o resultado financeiro
líquido: uma empresa com R$ 8 mi de despesa e R$ 7,9 mi de receita financeira tem
resultado quase zero e uma conta de juros de R$ 8 mi.

## Dívida financeira × passivo total

`Dívida Financeira Bruta` = `emprestimos_cp + emprestimos_lp`. É o conceito de
crédito: o que a empresa deve a **banco**, não o que deve a fornecedor, fisco e
empregado.

Quando o documento não separa os empréstimos, os índices que dependem dela caem num
proxy pelo passivo total, e o motivo fica registrado:

```ts
analise.motivos.dividaLiquidaEbitda
// "calculado sobre o passivo total — o documento não separa os empréstimos"
```

Um número com essa etiqueta não é comparável a outro sem ela.

## Ajustando para o seu setor

As faixas são uma tabela em `src/indicadores.ts`:

```ts
liquidezCorrente: {
  referencia: "> 1,5 · 1,0–1,5 · < 1,0",
  getStatus: (v) => v > 1.5 ? "green" : v >= 1.0 ? "yellow" : "red",
}
```

Casos que pedem faixas próprias:

| Setor | O que muda |
|---|---|
| Construção civil | Ciclo longo por natureza; PMR alto não é inadimplência |
| Concessionárias de serviço público | Imobilização do PL acima de 100% é o normal |
| Varejo de giro rápido | Ciclo financeiro negativo é o modelo, não atraso |
| Transporte e logística | Estoque irrelevante; liquidez seca ≈ liquidez corrente |
| Instituições financeiras | Este motor não serve — a estrutura do balanço é outra |

Ao mexer numa faixa, rode `npm run sanidade`.
