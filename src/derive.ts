// Derivação determinística de EBIT, despesas operacionais e resultado financeiro
// a partir da quebra do DRE extraída pela IA.
// TS puro (sem APIs Deno/DOM) — importado pela edge function e pelo script de
// sanidade em scripts/sanity-analise-financeira.ts.
//
// Convenções de sinal dos campos de entrada:
//   despesas_administrativas, despesas_vendas, despesas_tributarias,
//   despesas_financeiras, receitas_financeiras          → POSITIVOS
//   outras_receitas_despesas_operacionais,
//   outras_receitas_despesas_financeiras, variacoes_cambiais
//                                                        → COM SINAL (receita +, despesa −)

export interface DreQuebra {
  lucro_bruto?: number | null;
  depreciacao_amortizacao?: number | null;
  receitas_nao_operacionais?: number | null;
  despesas_nao_operacionais?: number | null;
  lucro_antes_ir?: number | null;
  ebitda?: number | null;
  despesas_operacionais?: number | null;
  ebit?: number | null;
  resultado_financeiro?: number | null;
  despesas_administrativas?: number | null;
  despesas_vendas?: number | null;
  despesas_tributarias?: number | null;
  outras_receitas_despesas_operacionais?: number | null;
  despesas_financeiras?: number | null;
  receitas_financeiras?: number | null;
  variacoes_cambiais?: number | null;
  outras_receitas_despesas_financeiras?: number | null;
}

export interface DreDerivada {
  /** Despesas operacionais NÃO-financeiras líquidas (fallback: valor da IA) */
  despesas_operacionais: number | null;
  /** EBIT = lucro_bruto − despesas operacionais não-financeiras (fallback: valor da IA) */
  ebit: number | null;
  /** Resultado financeiro líquido (fallback: valor da IA) */
  resultado_financeiro: number | null;
  /** Denominador da Cobertura de Juros: soma de TODAS as despesas financeiras */
  despesas_financeiras_totais: number | null;
  /** EBITDA = ebit + depreciação/amortização (fallback: valor da IA) */
  ebitda: number | null;
  /** Ganhos − perdas fora da operação. Entra no LAIR, não no EBIT nem no RF. */
  resultado_nao_operacional: number | null;
  /** Quais campos foram derivados da quebra (true) vs mantidos da IA (false) */
  derivado: {
    despesas_operacionais: boolean;
    ebit: boolean;
    resultado_financeiro: boolean;
    ebitda: boolean;
    resultado_nao_operacional: boolean;
  };
}

export const RED_FLAG_RESULTADO_FINANCEIRO =
  "Resultado financeiro negativo superior a 30% do EBIT";

/** Prefixo canônico da flag de fechamento do DRE — ver `checarIdentidadeLair`. */
export const RED_FLAG_LAIR_PREFIXO = "DRE não fecha:";

const num = (v: number | null | undefined): number | null =>
  typeof v === "number" && !isNaN(v) ? v : null;

const zero = (v: number | null | undefined): number => num(v) ?? 0;

export function derivarCamposDre(d: DreQuebra): DreDerivada {
  const lucroBruto = num(d.lucro_bruto);

  // Quebra operacional: exige ao menos uma linha de despesa não-financeira extraída.
  const temQuebraOperacional =
    num(d.despesas_administrativas) !== null ||
    num(d.despesas_vendas) !== null ||
    num(d.despesas_tributarias) !== null;

  const despOperacionais = temQuebraOperacional
    ? zero(d.despesas_administrativas) +
      zero(d.despesas_vendas) +
      zero(d.despesas_tributarias) -
      zero(d.outras_receitas_despesas_operacionais)
    : null;

  const ebitDerivavel = despOperacionais !== null && lucroBruto !== null;
  const ebit = ebitDerivavel ? lucroBruto - despOperacionais : num(d.ebit);

  // Quebra financeira: ao menos uma linha financeira extraída.
  const temQuebraFinanceira =
    num(d.despesas_financeiras) !== null ||
    num(d.receitas_financeiras) !== null ||
    num(d.variacoes_cambiais) !== null ||
    num(d.outras_receitas_despesas_financeiras) !== null;

  const resultadoFinanceiro = temQuebraFinanceira
    ? zero(d.receitas_financeiras) -
      zero(d.despesas_financeiras) +
      zero(d.variacoes_cambiais) +
      zero(d.outras_receitas_despesas_financeiras)
    : num(d.resultado_financeiro);

  // Denominador da Cobertura de Juros: despesas financeiras + parcelas de despesa
  // das linhas com sinal (variação cambial passiva, outras despesas financeiras).
  const temDespesaFinanceira =
    num(d.despesas_financeiras) !== null ||
    zero(d.variacoes_cambiais) < 0 ||
    zero(d.outras_receitas_despesas_financeiras) < 0;

  const despFinanceirasTotais = temDespesaFinanceira
    ? zero(d.despesas_financeiras) +
      Math.max(0, -zero(d.variacoes_cambiais)) +
      Math.max(0, -zero(d.outras_receitas_despesas_financeiras))
    : null;

  // EBITDA = EBIT + depreciação/amortização. Calculado aqui, nunca pela IA: era
  // pedir esse cálculo ao modelo, sem campo onde pôr a depreciação, que o levava
  // a tirá-la das despesas administrativas e inflar o EBIT.
  const depreciacao = num(d.depreciacao_amortizacao);
  const ebitdaDerivavel = depreciacao !== null && ebit !== null;
  const ebitda = ebitdaDerivavel ? ebit + depreciacao : num(d.ebitda);

  // Resultado não operacional: ganho na alienação de imobilizado, sinistros.
  // Entra no LAIR e em mais lugar nenhum — não é resultado financeiro nem
  // "outras receitas/despesas operacionais".
  const temNaoOperacional =
    num(d.receitas_nao_operacionais) !== null || num(d.despesas_nao_operacionais) !== null;
  const resultadoNaoOperacional = temNaoOperacional
    ? zero(d.receitas_nao_operacionais) - zero(d.despesas_nao_operacionais)
    : null;

  return {
    despesas_operacionais: despOperacionais ?? num(d.despesas_operacionais),
    ebit,
    resultado_financeiro: resultadoFinanceiro,
    despesas_financeiras_totais: despFinanceirasTotais,
    ebitda,
    resultado_nao_operacional: resultadoNaoOperacional,
    derivado: {
      despesas_operacionais: despOperacionais !== null,
      ebit: ebitDerivavel,
      resultado_financeiro: temQuebraFinanceira,
      ebitda: ebitdaDerivavel,
      resultado_nao_operacional: temNaoOperacional,
    },
  };
}

/**
 * Identidade de fechamento do DRE: LAIR = EBIT + resultado financeiro +
 * resultado não operacional.
 *
 * Quando quebra, ou uma conta foi para o campo errado ou uma linha do documento
 * não foi extraída. Vira red flag em vez de ajuste silencioso: o motor nunca
 * mexe num número para fazer a conta fechar.
 *
 * Tolerância de 1% de |LAIR|, com piso de R$ 1 para não reprovar arredondamento
 * em empresas pequenas.
 */
export function checarIdentidadeLair(
  lairInformado: number | null | undefined,
  ebit: number | null | undefined,
  resultadoFinanceiro: number | null | undefined,
  resultadoNaoOperacional: number | null | undefined,
): { ok: boolean; diff: number; esperado: number } | null {
  const lair = num(lairInformado);
  const e = num(ebit);
  if (lair === null || e === null) return null;
  const esperado = e + zero(resultadoFinanceiro) + zero(resultadoNaoOperacional);
  const diff = Math.abs(lair - esperado);
  return { ok: diff <= Math.max(1, Math.abs(lair) * 0.01), diff, esperado };
}

/**
 * Red flag do resultado financeiro: dispara somente quando o resultado financeiro
 * LÍQUIDO é negativo e supera 30% do EBIT (corrigido). Nunca dispara com RF positivo.
 */
export function redFlagResultadoFinanceiro(
  resultadoFinanceiro: number | null | undefined,
  ebit: number | null | undefined,
): boolean {
  const rf = num(resultadoFinanceiro);
  const e = num(ebit);
  return rf !== null && e !== null && e > 0 && rf < 0 && Math.abs(rf) > 0.3 * e;
}

/**
 * Normaliza a lista de red flags da IA: remove qualquer variante da flag de
 * resultado financeiro (a regra é determinística, calculada em código) e
 * reinsere a string canônica somente se a condição valer.
 */
export function aplicarRedFlagResultadoFinanceiro(
  flags: unknown,
  resultadoFinanceiro: number | null | undefined,
  ebit: number | null | undefined,
): string[] {
  const lista = Array.isArray(flags)
    ? flags.filter((f): f is string => typeof f === "string")
    : [];
  const semRf = lista.filter((f) => !/resultado\s+financeiro/i.test(f));
  if (redFlagResultadoFinanceiro(resultadoFinanceiro, ebit)) {
    semRf.push(RED_FLAG_RESULTADO_FINANCEIRO);
  }
  return semRf;
}
