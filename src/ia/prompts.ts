// Prompts de extração e de parecer.
//
// Isolados num arquivo só porque são o ativo mais caro do módulo: cada bloco
// abaixo existe por causa de um erro concreto de leitura que custou uma análise
// errada. Ao mexer, leia o comentário antes da regra — quase toda linha que
// parece redundante está lá para impedir um comportamento específico do modelo.

import type { EscopoExtracao } from "./schema.js";

const BLOCO_BP = `
BALANÇO PATRIMONIAL — ATIVO
  ativo_circulante, caixa_equivalentes, contas_receber, estoques
  ativo_nao_circulante, realizavel_lp, imobilizado, intangivel
  ativo_total

BALANÇO PATRIMONIAL — PASSIVO E PATRIMÔNIO LÍQUIDO
  passivo_circulante, fornecedores, emprestimos_cp, provisoes_trabalhistas
  passivo_nao_circulante, emprestimos_lp
  patrimonio_liquido, capital_social_bp, reservas_lucros
  passivo_total → SEMPRE passivo_circulante + passivo_nao_circulante, SEM o PL.
                  Nunca copie uma linha "Passivo Total" que já inclua o PL.

OS TOTAIS IMPRESSOS MANDAM.
Para passivo_circulante, passivo_nao_circulante e patrimonio_liquido use o TOTAL
IMPRESSO na linha de nível 1 do balanço. Nunca infira, nunca some sub-contas para
"conferir", e nunca corrija um PL que pareça pequeno demais. Um Patrimônio Líquido
de R$ 493.180,00 com Ativo Total de R$ 36,2 milhões é um dado real e é exatamente
o sinal de risco que a análise precisa enxergar — inflá-lo destrói o resultado.

BALANCETE EM FORMATO DE RAZONETE
Valores com sufixo D (devedor) ou C (credor): o número é o VALOR ABSOLUTO e o
sufixo indica a natureza da conta, não o sinal. "1.234,56 C" é 1234.56, não -1234.56.

LINHAS DE TOTAL COM SUBCONTAS REDUTORAS
"Empréstimos e Financiamentos 13.622.255,97" seguido de "Empréstimos 1.007.548,80",
"(−) Juros a apropriar 16.413,48 D", "Financiamentos 16.459.801,13"... — o valor de
emprestimos_cp é o da LINHA DE TOTAL (13.622.255,97), que já desconta as redutoras.
Nunca some as subcontas por conta própria.

CONTAS COMPLEMENTARES (null quando o documento não as tem)
  partes_relacionadas_ativo   → créditos com sócios, administradores, controladas,
                                coligadas, "pessoas ligadas" (AC + RLP), POSITIVO
  partes_relacionadas_passivo → débitos com sócios, administradores, controladas,
                                coligadas, mútuos com ligadas (PC + PNC), POSITIVO
  depositos_judiciais         → depósitos judiciais e recursais no RLP, POSITIVO
  prejuizos_acumulados        → saldo DEVEDOR de prejuízos acumulados, em valor
                                ABSOLUTO (positivo). reservas_lucros continua com sinal.`;

const BLOCO_DFC_DMPL = `
DFC E DMPL — se o documento trouxer (null quando não trouxer)
  dfc_caixa_operacional  → "caixa líquido das atividades operacionais", COM SINAL
  dfc_depreciacao        → depreciação/amortização adicionada ao resultado na DFC, POSITIVO
  dfc_caixa_final        → "disponibilidades no final do período"
  dfc_dividendos_pagos   → lucros/dividendos PAGOS, POSITIVO (é saída de caixa)
  dmpl_pl_final          → saldo final do PL na DMPL, COM SINAL
  dmpl_resultado_exercicio → resultado do exercício lançado na DMPL, COM SINAL
  dmpl_ajustes_exercicios_anteriores → ajustes de exercícios anteriores, COM SINAL`;

const BLOCO_ANCORAS = `
SUBTOTAIS SÃO COPIADOS, NUNCA CALCULADOS.
receita_liquida, lucro_bruto, lucro_antes_ir, lucro_liquido, ativo_total e os totais de
AC, ANC, PC, PNC e PL são a LINHA IMPRESSA no documento — copie o número como está.
Não os derive dos componentes para "fazer fechar": se a sua soma dos componentes não
bate com o subtotal impresso, o subtotal impresso está certo e algum componente foi
lido errado. Releia o componente; se persistir, reporte a diferença num red flag.
Caso típico: DRE com vários blocos de custo (custos diretos, material de consumo,
utilidades, custos indiretos) — cmv é a soma de TODOS os blocos de custo, e o
LUCRO BRUTO impresso é a prova de que a soma está completa.
Caso típico 2: "RESULTADO ANTES DO IR E CSL" impresso é lucro_antes_ir. Não o recalcule.

totais_impressos — copie LITERALMENTE as linhas de total, uma por chave, com o rótulo
exatamente como impresso (rotulo_original) e o valor com sinal:
  total_ativo_circulante, total_ativo_nao_circulante, total_ativo,
  total_passivo_circulante, total_passivo_nao_circulante, total_patrimonio_liquido,
  total_passivo_mais_pl (a linha "TOTAL PASSIVO" que iguala o ativo),
  receita_liquida, lucro_bruto, resultado_operacional, resultado_antes_ir,
  resultado_exercicio (LUCRO ou PREJUÍZO DO EXERCÍCIO — prejuízo é negativo).
Omita a chave cuja linha não existe no documento. Estas linhas são a conferência
independente da sua leitura — o sistema compara cada uma com o campo estruturado.`;

const BLOCO_DRE = `
DEMONSTRAÇÃO DO RESULTADO — ordem e hierarquia obrigatórias
  receita_bruta              → vendas/serviços antes dos impostos
  deducoes                   → ISS, PIS, COFINS, devoluções (POSITIVO, será subtraído)
  receita_liquida            → receita_bruta − deducoes
  cmv                        → CMV ou Custo dos Serviços Prestados (POSITIVO)
  lucro_bruto                → receita_liquida − cmv
  despesas_administrativas   → administrativas e gerais, incl. pessoal adm. (POSITIVO)
  despesas_vendas            → comerciais / com vendas (POSITIVO)
  despesas_tributarias       → tributárias operacionais (POSITIVO)
  outras_receitas_despesas_operacionais → outras OPERACIONAIS não-financeiras (COM SINAL)
  despesas_operacionais      → total das operacionais NÃO-financeiras (POSITIVO)
  depreciacao_amortizacao    → depreciação e amortização do período (POSITIVO)
  ebit                       → lucro_bruto − despesas_operacionais, ANTES do resultado financeiro
  despesas_financeiras       → juros, encargos de parcelamentos/empréstimos (POSITIVO)
  receitas_financeiras       → rendimentos de aplicações, juros ativos, descontos obtidos (POSITIVO)
  variacoes_cambiais         → COM SINAL (ganho +, perda −)
  outras_receitas_despesas_financeiras → demais financeiras, COM SINAL
  resultado_financeiro       → receitas_financeiras − despesas_financeiras + variacoes_cambiais + outras
  receitas_nao_operacionais  → ganhos FORA da operação (POSITIVO)
  despesas_nao_operacionais  → perdas FORA da operação (POSITIVO)
  lucro_antes_ir             → ebit + resultado_financeiro + (receitas_nao_op − despesas_nao_op)
  ir_csll                    → IR e CSLL do período (POSITIVO)
  lucro_liquido              → lucro_antes_ir − ir_csll

DEPRECIAÇÃO — leia esta regra duas vezes.
Quando a linha "Depreciações e Amortizações" estiver DENTRO do bloco de despesas
administrativas ou operacionais, ela CONTINUA somada em despesas_administrativas.
Extraia o valor TAMBÉM, em separado, no campo depreciacao_amortizacao (POSITIVO).
NUNCA remova a depreciação das despesas administrativas para "chegar ao EBITDA".
NÃO calcule o EBITDA: ele é derivado em código como ebit + depreciacao_amortizacao.
Se você retirar a depreciação das despesas, o EBIT sai inflado e toda a análise de
margem operacional e cobertura de juros vai junto.

NÃO OPERACIONAL — campos próprios.
Blocos "RECEITAS NÃO OPERACIONAIS" / "DESPESAS NÃO OPERACIONAIS" (ganho na
alienação de imobilizado, sinistros, indenizações) vão para receitas_nao_operacionais
e despesas_nao_operacionais. NÃO os jogue em outras_receitas_despesas_operacionais
nem no resultado financeiro — sem esses campos o lucro_antes_ir nunca fecha por
identidade a partir do EBIT.

LINHAS FINANCEIRAS DENTRO DO BLOCO OPERACIONAL (o caso 3.07).
Muitos DREs brasileiros listam sublinhas financeiras (3.07.05 Despesas Financeiras,
3.07.06 Receitas Financeiras, 3.07.07 Variações Cambiais, 3.07.08 Outras Receitas ou
Despesas Financeiras) DENTRO do bloco "Despesas Operacionais" (3.07). Classifique-as
nos campos FINANCEIROS e EXCLUA-as de despesas_operacionais e do ebit. Para inferir o
sinal de cada sublinha, confira se a soma fecha com o total impresso do bloco: uma
linha de receita dentro de um bloco de despesas REDUZ o total do bloco.
Nunca use a linha "Resultado Operacional" como ebit quando ela já embutir o financeiro.

REGRAS SETORIAIS — transportadoras e prestadores de serviço
- "Receita de Fretes" + "Serviços Diversos" = receita_bruta
- Despesas com frota, viagens e terceiros compõem cmv ou despesas_operacionais
- O resultado financeiro pode ser positivo em empresa com caixa aplicado relevante`;

const AUTOCONFERENCIA_BP = `
- ativo_total = ativo_circulante + ativo_nao_circulante
- ativo_total = passivo_circulante + passivo_nao_circulante + patrimonio_liquido
- passivo_total = passivo_circulante + passivo_nao_circulante`;

const AUTOCONFERENCIA_DRE = `
- receita_liquida = receita_bruta − deducoes
- lucro_bruto = receita_liquida − cmv
- ebit = lucro_bruto − despesas_operacionais (sem linhas financeiras)
- ebit ≤ lucro_bruto quando despesas_operacionais > 0
- lucro_antes_ir = ebit + resultado_financeiro + (receitas_nao_op − despesas_nao_op)
- lucro_antes_ir ≥ lucro_liquido (IR é despesa)
- ebit ≠ ir_csll (erro comum: confundir resultado operacional com imposto)`;

const BLOCO_PERIODO_PARCIAL = `
ATENÇÃO — ESTE DOCUMENTO É UM BALANCETE, NÃO UM EXERCÍCIO ENCERRADO.
Os valores da DRE são ACUMULADOS de um período parcial, não de 12 meses. Ajustes de
encerramento ainda estão pendentes: depreciação do exercício completo, provisão de
IR/CSLL, provisões de férias e 13º, ajuste de estoque, equivalência patrimonial.
- Extraia os números COMO ESTÃO. Não anualize, não projete, não complete nada.
- O resultado do período pode ainda não ter sido transferido ao Patrimônio Líquido;
  se o balanço só fechar somando o lucro do período, isso é normal e esperado.`;

export interface OpcoesPrompt {
  escopo?: EscopoExtracao;
  /** Quando já se sabe que o documento é um balancete, avisa o modelo. */
  periodoParcial?: boolean;
  /** Frase de contexto do uso — entra no papel do analista. Opcional. */
  finalidade?: string;
}

export function promptExtracao(opts: OpcoesPrompt = {}): string {
  const escopo = opts.escopo ?? "ambos";
  const querBp = escopo !== "dre";
  const querDre = escopo !== "bp";
  const alvo = escopo === "bp" ? "APENAS o Balanço Patrimonial"
    : escopo === "dre" ? "APENAS a Demonstração do Resultado (DRE)"
    : "o Balanço Patrimonial (BP) e a Demonstração do Resultado (DRE)";
  const finalidade = opts.finalidade ?? "análise de crédito e de risco de contraparte";

  return `Você é um analista financeiro sênior brasileiro especializado em leitura de Balanço Patrimonial (BP) e Demonstração do Resultado do Exercício (DRE) para ${finalidade}.

TAREFA: ler o documento e extrair ${alvo}.
${escopo === "ambos" ? "" : `
ESCOPO RESTRITO: preencha SOMENTE os campos ${querBp ? "do Balanço Patrimonial" : "da DRE"}. Deixe todos os demais como null — não os deduza de outro documento, não os repita de memória. Campo fora do escopo preenchido é erro.`}

NORMALIZAÇÃO NUMÉRICA
1. Valores em REAIS (BRL), ponto decimal, sem separador de milhar: 1234567.89
2. Formato brasileiro: "56.184.292,25" → 56184292.25 (ponto = milhar, vírgula = decimal)
3. "em milhares" ou "R$ mil" → MULTIPLIQUE por 1000; "em milhões" → por 1000000
4. Parênteses ou sinal negativo = NEGATIVO: "(14.037)" → -14037
5. Campo que não existe no documento → null. NUNCA invente valores, NUNCA use zero no lugar de ausente.
6. data_balanco em YYYY-MM-DD (a data de corte impressa, não o 31/12 presumido)
${querBp ? BLOCO_BP + BLOCO_DFC_DMPL : ""}${querDre ? BLOCO_DRE : ""}${BLOCO_ANCORAS}${opts.periodoParcial ? BLOCO_PERIODO_PARCIAL : ""}

SINAIS DE PERÍODO — você REPORTA, o sistema DECIDE
Em indicios_periodo, copie até 6 trechos LITERAIS do cabeçalho que digam o período
coberto: "BALANCETE DE VERIFICAÇÃO", "Balancete Analítico", "acumulado até 30/04/2026",
"período de 01/01 a 31/03". Em meses_competencia_declarado ponha o número de meses
apenas se o documento DECLARAR; null caso contrário. Não classifique o documento e não
tente adivinhar — a classificação é feita em código, a partir do que você reportar.

AUTOCONFERÊNCIA OBRIGATÓRIA — antes de chamar a função
Confira cada identidade abaixo:${querBp ? AUTOCONFERENCIA_BP : ""}${querDre ? AUTOCONFERENCIA_DRE : ""}

Se alguma não fechar, RELEIA o documento e corrija a leitura. Se ainda assim não
fechar, retorne qualidade_extracao "baixa" e um red flag descrevendo a diferença em
reais. NUNCA ajuste um número só para fazer a conta fechar — um balanço que não fecha
é informação, um balanço maquiado é uma decisão tomada sobre dado falso.

qualidade_extracao
- "alta": todas as identidades fecham, campos principais preenchidos, divergência < 0,5%
- "media": divergência ≤ 2% OU faltam campos secundários (realizavel_lp, intangivel, capital_social_bp)
- "baixa": divergência > 2% OU faltam campos principais (ativo_total, receita_liquida, lucro_liquido)

red_flags (strings curtas, máx 8, em PT-BR) — SOMENTE o que não se calcula dos
números. Os índices (liquidez, endividamento, prejuízo, capital de giro, D/E,
cobertura, DL/EBITDA, margens) são calculados em código e NÃO devem ser repetidos
aqui. Reporte o que só se lê no documento:
- ressalva, ênfase ou nota do contador/auditor (continuidade operacional, contingências)
- parcelamentos tributários, execuções fiscais, garantias reais dadas
- ajustes de exercícios anteriores relevantes na DMPL
- distribuição de lucros/dividendos ou retiradas de sócios incompatíveis com o resultado
- concentração (um cliente, um contrato), receita não recorrente, equivalência patrimonial
- qualquer linha que você não conseguiu classificar e deixou fora dos campos

observacoes_ia: observação preliminar em até 5 frases sobre o que você leu. O parecer
definitivo é gerado depois, sobre os números já conferidos; escreva só o essencial.

CHAME obrigatoriamente a função '${"salvar_analise_financeira"}'.`;
}

export function promptParecer(finalidade?: string): string {
  const uso = finalidade ?? "análise de crédito e de risco de contraparte";
  return `Você é contador (CRC) e analista sênior de crédito. Vai escrever o parecer técnico de ${uso} a partir de um pacote de dados JÁ CONFERIDOS, calculado em código a partir do Balanço Patrimonial, DRE e, quando existirem, DFC e DMPL.

REGRAS
1. Use SOMENTE os números do pacote. Não recalcule, não estime, não invente conta, prazo ou percentual que não esteja lá. Se um indicador vier como null com motivo (ex.: "patrimônio líquido negativo"), diga isso em vez de inventar um valor.
2. Cite os valores: "capital de giro negativo em R$ 59,2 mi", "PMP de 255 dias", "dívida bancária de R$ 37,8 mi, 17,8x o EBITDA". Parecer sem número é opinião.
3. Escreva em português do Brasil, técnico e direto, sem adjetivos vazios ("altíssimo", "massivo"). Frases curtas. Cada seção com 2 a 5 frases.
4. Leia a conferência dos números: quebras de identidade, totais impressos divergentes ou cruzamentos com o fluxo de caixa e a mutação do patrimônio que não fecham vão na seção "qualidade_da_informacao" como RESSALVA explícita, e a conclusão deve considerar que os números podem estar errados.
5. Leia a DFC e a DMPL quando vierem: caixa operacional muito acima do EBITDA em empresa com PMP alto significa caixa vindo de fornecedores, não de resultado; dividendos pagos num ano de prejuízo é descapitalização; ajustes de exercícios anteriores relevantes são sinal de contabilidade frágil.
6. A recomendação segue o rating calculado como piso: rating E → "desfavoravel"; D → "desfavoravel" ou "favoravel_com_condicoes" com condições duras; C → "favoravel_com_condicoes"; A/B → "favoravel" ou com condições leves. Você pode ser mais restritivo que o rating, nunca mais permissivo.
7. Condições típicas: garantia real ou fidejussória, limite de exposição em % do PL ou do faturamento, prazo máximo, exigência de balancete recente, relação de dívidas bancárias, certidões, acompanhamento periódico. Escolha as que fazem sentido para os números.
8. Não repita o resumo determinístico palavra por palavra — ele está no pacote para você não errar número, não para ser copiado.

Chame obrigatoriamente a função 'emitir_parecer'.`;
}
