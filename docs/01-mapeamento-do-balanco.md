# Mapeamento do Balanço e da DRE

Os 53 campos, o que entra em cada um, as convenções de sinal e os casos que
derrubam a leitura na prática.

---

## Convenções que valem para tudo

**1. Reais, ponto decimal, sem separador de milhar.** `56.184.292,25` → `56184292.25`.
Documento "em milhares" multiplica por 1000.

**2. Despesa é positiva; "outras" carrega o sinal.**

| Grupo | Convenção |
|---|---|
| `cmv`, `deducoes`, `despesas_administrativas`, `despesas_vendas`, `despesas_tributarias`, `despesas_financeiras`, `receitas_financeiras`, `ir_csll`, `receitas_nao_operacionais`, `despesas_nao_operacionais` | **positivos** — o motor sabe o que somar e o que subtrair |
| `outras_receitas_despesas_operacionais`, `outras_receitas_despesas_financeiras`, `variacoes_cambiais` | **com sinal** — receita `+`, despesa `−` |
| `patrimonio_liquido`, `lucro_liquido`, `lucro_bruto`, `ebit`, `resultado_financeiro` | **com sinal** — negativo é negativo |

**3. `null` nunca é zero.** Campo ausente é `null`. Isso percorre o motor inteiro:
`estoques: null` não é "sem estoques", é "o documento não informou", e a liquidez
seca sabe a diferença.

**4. Subtotais são copiados, nunca calculados.** `receita_liquida`, `lucro_bruto`,
`lucro_antes_ir`, `lucro_liquido`, `ativo_total` e os totais de AC, ANC, PC, PNC e PL
são a **linha impressa**. Se a soma dos componentes não bate com o subtotal impresso,
o subtotal está certo e um componente foi lido errado.

---

## Balanço Patrimonial — Ativo

| Campo | O que é |
|---|---|
| `ativo_circulante` | Total impresso do AC |
| `caixa_equivalentes` | Caixa, bancos, aplicações de liquidez imediata |
| `contas_receber` | Clientes / duplicatas a receber (circulante) |
| `estoques` | Mercadorias, produtos, insumos. `null` em serviços |
| `ativo_nao_circulante` | Total impresso do ANC |
| `realizavel_lp` | Realizável a longo prazo |
| `imobilizado` | Imobilizado líquido de depreciação |
| `intangivel` | Intangível e ágio |
| `ativo_total` | Total impresso do ativo |

## Balanço Patrimonial — Passivo e Patrimônio Líquido

| Campo | O que é |
|---|---|
| `passivo_circulante` | Total impresso do PC |
| `fornecedores` | Fornecedores e contas a pagar comerciais |
| `emprestimos_cp` | Empréstimos e financiamentos de curto prazo |
| `provisoes_trabalhistas` | Férias, 13º, encargos, provisões trabalhistas |
| `passivo_nao_circulante` | Total impresso do PNC |
| `emprestimos_lp` | Empréstimos e financiamentos de longo prazo |
| `patrimonio_liquido` | Total impresso do PL, **com sinal** |
| `capital_social_bp` | Capital social integralizado |
| `reservas_lucros` | Reservas e lucros/prejuízos acumulados, com sinal |
| `passivo_total` | **PC + PNC, SEM o PL** |

> **`passivo_total` é a armadilha mais comum.** Muitos balanços imprimem uma linha
> "TOTAL DO PASSIVO" que já inclui o patrimônio líquido — é a linha que iguala o
> ativo. Copiá-la para `passivo_total` infla o endividamento e o D/E. O campo aqui é
> **passivo exigível**: PC + PNC. A linha que iguala o ativo vai para
> `totais_impressos` com a chave `total_passivo_mais_pl`.

### Contas complementares

| Campo | O que é | Por que existe |
|---|---|---|
| `partes_relacionadas_ativo` | Créditos com sócios, controladas, coligadas (AC + RLP), positivo | Saldo alto contra o ativo significa que o balanço se sustenta em dinheiro que entra e sai da mesma mesa |
| `partes_relacionadas_passivo` | Débitos com sócios, controladas, coligadas (PC + PNC), positivo | Idem, do outro lado |
| `depositos_judiciais` | Depósitos judiciais e recursais no RLP, positivo | Ativo real, mas indisponível — e indicador de litígio em curso |
| `prejuizos_acumulados` | Saldo devedor de prejuízos, em **valor absoluto** | Comparado ao capital social, mostra quanto do capital já foi consumido |

## DFC e DMPL

Preenchidos quando o documento traz. São a base dos cruzamentos (`03-conferencia.md`).

| Campo | O que é |
|---|---|
| `dfc_caixa_operacional` | Caixa líquido das atividades operacionais, **com sinal** |
| `dfc_depreciacao` | Depreciação/amortização adicionada ao resultado na DFC, positivo |
| `dfc_caixa_final` | Disponibilidades no final do período |
| `dfc_dividendos_pagos` | Lucros/dividendos **pagos**, positivo (é saída de caixa) |
| `dmpl_pl_final` | Saldo final do PL na DMPL, com sinal |
| `dmpl_resultado_exercicio` | Resultado do exercício lançado na DMPL, com sinal |
| `dmpl_ajustes_exercicios_anteriores` | Ajustes de exercícios anteriores, com sinal |

Valem muito mais do que o número de campos sugere. Três leituras que só a DFC permite:

- **Caixa operacional muito acima do EBITDA**, em empresa com prazo de pagamento
  alto, significa caixa vindo de alongar fornecedores — não de resultado.
- **Dividendos pagos em ano de prejuízo** é descapitalização, e vira alerta crítico.
- **Ajustes de exercícios anteriores relevantes** na DMPL são sinal de contabilidade
  frágil.

---

## DRE — ordem e hierarquia

```
  receita_bruta
− deducoes                                (ISS, PIS, COFINS, devoluções)
= receita_liquida
− cmv                                     (CMV ou Custo dos Serviços Prestados)
= lucro_bruto
− despesas_operacionais                   (não-financeiras)
= ebit
+ resultado_financeiro
+ (receitas_nao_operacionais − despesas_nao_operacionais)
= lucro_antes_ir
− ir_csll
= lucro_liquido
```

**Derivados em código, nunca pedidos ao modelo:**

```
despesas_operacionais = administrativas + vendas + tributárias − outras (com sinal)
ebit                  = lucro_bruto − despesas_operacionais
ebitda                = ebit + depreciacao_amortizacao
resultado_financeiro  = receitas_fin − despesas_fin + variações cambiais + outras
```

---

## Os quatro casos que derrubam a leitura

### 1. Depreciação e o EBITDA inflado

A linha "Depreciações e Amortizações" quase sempre está **dentro** do bloco de
despesas administrativas. Ela **continua somada** em `despesas_administrativas`, e é
extraída **também** em `depreciacao_amortizacao`.

Retirá-la das despesas para "chegar ao EBITDA" infla o EBIT — e com ele a margem
operacional e as duas coberturas de juros. É o que acontece quando se pede o EBITDA
ao modelo sem lhe dar um campo para a depreciação. Aqui o EBITDA é
`ebit + depreciacao_amortizacao`, calculado em código.

### 2. Linhas financeiras dentro do bloco operacional (o caso 3.07)

Muitos DREs brasileiros listam sublinhas financeiras **dentro** do bloco "Despesas
Operacionais":

```
3.07    Despesas Operacionais
3.07.05     Despesas Financeiras
3.07.06     Receitas Financeiras
3.07.07     Variações Cambiais
```

Elas vão para os campos **financeiros** e saem de `despesas_operacionais` e do EBIT.
Sem isso, o EBIT já vem com os juros dentro, a cobertura de juros mede o resultado
contra ele mesmo, e a margem operacional deixa de comparar com qualquer outra empresa.

Corolário: **nunca use a linha "Resultado Operacional" impressa como EBIT** quando
ela já embutir o financeiro. É por isso que a âncora `resultado_operacional` aceita
as duas convenções e testa qual bate.

### 3. Linhas de total com subcontas redutoras

```
Empréstimos e Financiamentos          13.622.255,97   ← este é o valor
    Empréstimos                        1.007.548,80
    (−) Juros a apropriar                 16.413,48 D
    Financiamentos                    16.459.801,13
    (−) Custo de transação             3.828.680,48
```

O valor de `emprestimos_cp` é o da **linha de total**, que já desconta as redutoras.
Somar as subcontas dá outro número. Foi um dos três erros do caso de referência:
R$ 1,0 milhão a menos em empréstimos de curto prazo.

### 4. Balancete em formato de razonete

Valores com sufixo **D** (devedor) ou **C** (credor): o número é o **valor absoluto**
e o sufixo indica a natureza da conta, não o sinal. `1.234,56 C` é `1234.56`, não
`-1234.56`.

---

## Período: exercício encerrado × balancete

`tipo_periodo` e `meses_competencia` são decididos **em código** (`periodo.ts`), a
partir de trechos literais do cabeçalho que o modelo reporta. Ele não classifica.

A assimetria justifica: um balancete tratado como exercício encerrado vira decisão
sobre demonstração não fechada — faltam provisão de IR, depreciação do ano inteiro,
férias e 13º. O erro inverso custa um rótulo a mais na tela.

Sinais que indicam balancete: rótulo do documento, data de corte fora de 31/12,
exercício ainda em curso, cabeçalho com "BALANCETE DE VERIFICAÇÃO" ou "acumulado até".

**Exceção deliberada:** balancete com corte em 31/12 e 12 meses de competência é
balancete **de encerramento** — cobre o exercício inteiro e é comparável a um BP/DRE
assinado. A regra que decidiu fica registrada em `periodo.regra`.

Num balancete, dois ajustes:

- `resultado_periodo_nao_transferido` soma ao PL nos índices que dividem por ele. Sem
  isso, o lucro do período está numa conta de resultado e o D/E sai inflado sem que
  nada tenha piorado.
- Indicadores **mistos** (fluxo ÷ saldo: ROE, ROA, giro, prazos médios) ganham uma
  projeção anualizada — **só para exibição**, nunca gravada, nunca no score.

---

## Totais impressos

Não são campos: são a conferência independente. Doze chaves, copiadas literalmente:

```
total_ativo_circulante      total_passivo_circulante       receita_liquida
total_ativo_nao_circulante  total_passivo_nao_circulante   lucro_bruto
total_ativo                 total_patrimonio_liquido       resultado_operacional
                            total_passivo_mais_pl          resultado_antes_ir
                                                           resultado_exercicio
```

Cada uma com `valor` e `rotulo_original` — o rótulo exatamente como impresso. Ver
[`03-conferencia.md`](03-conferencia.md).
