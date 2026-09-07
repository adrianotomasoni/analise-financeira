// Indicadores financeiros calculados a partir das contas do Balanço Patrimonial e
// da DRE (mais DFC e DMPL quando existirem).
//
// Este é o núcleo do motor: recebe uma `AnaliseFinanceira` (as contas já lidas do
// documento) e devolve 33 indicadores com semáforo, faixas de referência e uma
// leitura em uma linha para cada um. Não depende de banco, de framework nem de IA.
//
// A regra que organiza o arquivo inteiro: `null` significa "não há como calcular",
// nunca "vale zero". Um indicador que divide pelo patrimônio líquido não é
// calculado quando o PL é negativo — a conta daria um número positivo enganoso
// (prejuízo ÷ PL negativo = "ROE de +30%") e `motivosIndisponiveis()` registra o
// porquê, para que o score conte esse caso como o pior, e não como ausência de dado.


export interface AnaliseFinanceira {
  ativo_circulante?: number | null;
  caixa_equivalentes?: number | null;
  contas_receber?: number | null;
  estoques?: number | null;
  ativo_nao_circulante?: number | null;
  realizavel_lp?: number | null;
  imobilizado?: number | null;
  intangivel?: number | null;
  ativo_total?: number | null;
  passivo_circulante?: number | null;
  fornecedores?: number | null;
  emprestimos_cp?: number | null;
  provisoes_trabalhistas?: number | null;
  passivo_nao_circulante?: number | null;
  emprestimos_lp?: number | null;
  patrimonio_liquido?: number | null;
  capital_social_bp?: number | null;
  reservas_lucros?: number | null;
  passivo_total?: number | null;
  receita_bruta?: number | null;
  deducoes?: number | null;
  receita_liquida?: number | null;
  cmv?: number | null;
  lucro_bruto?: number | null;
  // Quebra das despesas operacionais NÃO-financeiras (positivos; "outras" com sinal)
  despesas_administrativas?: number | null;
  despesas_vendas?: number | null;
  despesas_tributarias?: number | null;
  outras_receitas_despesas_operacionais?: number | null;
  despesas_operacionais?: number | null;
  /** Somada DENTRO de despesas_administrativas; existe em separado só para o EBITDA. */
  depreciacao_amortizacao?: number | null;
  ebitda?: number | null;
  ebit?: number | null;
  // Quebra do resultado financeiro (despesas/receitas positivos; demais com sinal)
  despesas_financeiras?: number | null;
  receitas_financeiras?: number | null;
  variacoes_cambiais?: number | null;
  outras_receitas_despesas_financeiras?: number | null;
  resultado_financeiro?: number | null;
  // Fora da operação (alienação de imobilizado, sinistros): entram no LAIR e em
  // mais lugar nenhum — nem no EBIT, nem no resultado financeiro.
  receitas_nao_operacionais?: number | null;
  despesas_nao_operacionais?: number | null;
  lucro_antes_ir?: number | null;
  ir_csll?: number | null;
  lucro_liquido?: number | null;
  // Período contábil. Num balancete o resultado do exercício em geral ainda não
  // foi transferido ao PL, e todo indicador que divide por PL sai inflado se
  // ignorar isso.
  tipo_periodo?: "exercicio_fechado" | "balancete_parcial" | null;
  meses_competencia?: number | null;
  resultado_periodo_nao_transferido?: number | null;
  // ── Contas complementares (migration 2026-09) ─────────────────────────────
  // Partes relacionadas: créditos com sócios/coligadas no ativo e débitos com
  // sócios/coligadas no passivo. Saldo alto contra o PL é sinal de que o
  // balanço se sustenta em dinheiro que entra e sai da mesma mesa.
  partes_relacionadas_ativo?: number | null;
  partes_relacionadas_passivo?: number | null;
  /** Depósitos judiciais no RLP — relevante para garantia judicial. */
  depositos_judiciais?: number | null;
  /** Saldo devedor de prejuízos acumulados, em valor ABSOLUTO (positivo). */
  prejuizos_acumulados?: number | null;
  // DFC (método indireto) e DMPL, quando o documento os traz. São os âncoras
  // externos ao BP/DRE: o caixa final da DFC tem de bater com o disponível do
  // balanço, o PL final da DMPL com o PL do balanço, e assim por diante.
  dfc_caixa_operacional?: number | null;
  dfc_depreciacao?: number | null;
  dfc_caixa_final?: number | null;
  /** Lucros/dividendos PAGOS no período (positivo = saída de caixa). */
  dfc_dividendos_pagos?: number | null;
  dmpl_pl_final?: number | null;
  dmpl_resultado_exercicio?: number | null;
  dmpl_ajustes_exercicios_anteriores?: number | null;
  /** Linhas de total copiadas literalmente do documento (ver TotalImpresso). */
  totais_impressos?: unknown;
}

/**
 * Chaves fixas das linhas de total que a extração copia LITERALMENTE do
 * documento. São o âncora independente da conferência: o campo estruturado é
 * o que a IA entendeu, o total impresso é o que o contador escreveu.
 */
export const CHAVES_TOTAL_IMPRESSO = [
  "total_ativo_circulante", "total_ativo_nao_circulante", "total_ativo",
  "total_passivo_circulante", "total_passivo_nao_circulante", "total_patrimonio_liquido",
  "total_passivo_mais_pl",
  "receita_liquida", "lucro_bruto", "resultado_operacional", "resultado_antes_ir",
  "resultado_exercicio",
] as const;
export type ChaveTotalImpresso = (typeof CHAVES_TOTAL_IMPRESSO)[number];

export interface TotalImpresso {
  chave: ChaveTotalImpresso;
  valor: number;
  rotulo_original?: string | null;
}

/** Normaliza a coluna jsonb `totais_impressos` (pode vir em qualquer formato). */
export function lerTotaisImpressos(raw: unknown): TotalImpresso[] {
  if (!Array.isArray(raw)) return [];
  const validas = new Set<string>(CHAVES_TOTAL_IMPRESSO);
  const out: TotalImpresso[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const chave = typeof o.chave === "string" ? o.chave : null;
    const valor = typeof o.valor === "number" && !isNaN(o.valor) ? o.valor : null;
    if (!chave || valor === null || !validas.has(chave)) continue;
    out.push({
      chave: chave as ChaveTotalImpresso,
      valor,
      rotulo_original: typeof o.rotulo_original === "string" ? o.rotulo_original : null,
    });
  }
  return out;
}

/**
 * PL ajustado pelo resultado do período ainda não transferido.
 *
 * Num exercício encerrado `resultado_periodo_nao_transferido` é nulo e isto é um
 * no-op. Num balancete, é a diferença entre um Debt/Equity plausível e um
 * absurdo: o lucro do período está numa conta de resultado, não no PL, e dividir
 * por um PL incompleto infla a alavancagem sem que nada tenha piorado.
 */
export function calcularPlAjustado(a: AnaliseFinanceira): number {
  return safe(a.patrimonio_liquido) + safe(a.resultado_periodo_nao_transferido);
}

const safe = (n: number | null | undefined) => (typeof n === "number" && !isNaN(n) ? n : 0);
const ratio = (a?: number | null, b?: number | null) => {
  const den = safe(b);
  return den === 0 ? null : safe(a) / den;
};

// Total do lado direito do BP (Passivo Exigível + PL), para apresentação.
// passivo_total no banco = PC + PNC (sem PL, conforme prompt da extração).
// Guarda defensiva: se um registro legado tiver passivo_total já incluindo o PL
// (bate com ativo_total em ±0,5%), não soma o PL duas vezes.
export function calcularPassivoMaisPL(a: AnaliseFinanceira): number | null {
  const temDado =
    a.passivo_total != null || a.passivo_circulante != null ||
    a.passivo_nao_circulante != null || a.patrimonio_liquido != null;
  if (!temDado) return null;
  const pt = a.passivo_total != null
    ? safe(a.passivo_total)
    : safe(a.passivo_circulante) + safe(a.passivo_nao_circulante);
  const pl = safe(a.patrimonio_liquido);
  const at = safe(a.ativo_total);
  if (at > 0 && Math.abs(at - pt) / at <= 0.005) return pt; // já inclui PL
  return pt + pl;
}

export interface IndicadoresFinanceiros {
  // Liquidez
  liquidezCorrente: number | null;
  liquidezSeca: number | null;
  liquidezGeral: number | null;
  liquidezImediata: number | null;
  // Endividamento
  endividamentoTotal: number | null;
  composicaoEndividamento: number | null;
  debtEquity: number | null;
  imobilizacaoPL: number | null;
  // Rentabilidade
  roe: number | null;
  roa: number | null;
  margemBruta: number | null;
  margemOperacional: number | null;
  margemEbitda: number | null;
  margemLiquida: number | null;
  // Eficiência, cobertura e geração de caixa
  giroAtivo: number | null;
  coberturaJuros: number | null;
  coberturaJurosEbitda: number | null;
  dividaLiquidaEbitda: number | null;
  dividaFinanceiraBruta: number | null;
  dividaLiquida: number | null;
  geracaoCaixaOperacional: number | null;
  capitalGiroLiquido: number | null;
  // Ciclo e capital de giro
  pmr: number | null;
  pme: number | null;
  pmp: number | null;
  cicloFinanceiro: number | null;
  ncg: number | null;
  saldoTesouraria: number | null;
  // Solvência
  kanitz: number | null;
  dividaFinanceiraPL: number | null;
  passivoSobreReceita: number | null;
  endividamentoFinanceiro: number | null;
  partesRelacionadasSobreAtivo: number | null;
}

/** Dias do ano comercial usados nos prazos médios (PMR, PME, PMP). */
export const DIAS_ANO_COMERCIAL = 360;

/**
 * Dívida financeira = empréstimos e financiamentos de curto e longo prazo.
 * `null` quando nenhum dos dois foi extraído — aí o indicador que depende
 * dela cai no fallback pelo Passivo Total, e diz isso no motivo.
 */
export function calcularDividaFinanceiraBruta(a: AnaliseFinanceira): number | null {
  if (a.emprestimos_cp == null && a.emprestimos_lp == null) return null;
  return safe(a.emprestimos_cp) + safe(a.emprestimos_lp);
}

export function calcularIndicadores(a: AnaliseFinanceira): IndicadoresFinanceiros {
  const ac = safe(a.ativo_circulante);
  const anc = safe(a.ativo_nao_circulante);
  const at = safe(a.ativo_total) || ac + anc;
  const pc = safe(a.passivo_circulante);
  const pnc = safe(a.passivo_nao_circulante);
  const pt = pc + pnc;
  // Ver calcularPlAjustado: no exercício encerrado é idêntico ao PL do balanço.
  const pl = calcularPlAjustado(a);
  // Índices que dividem pelo PL só fazem sentido com PL POSITIVO. Com PL
  // negativo, prejuízo ÷ PL negativo dá "ROE de +30%" e D/E de "−1,7x" — e o
  // semáforo pintava verde uma empresa com passivo a descoberto. Aqui viram null, e `motivosIndisponiveis` explica por quê.
  const plPositivo = pl > 0;
  const estoques = safe(a.estoques);
  const disp = safe(a.caixa_equivalentes);
  const rlp = safe(a.realizavel_lp);
  const imob = safe(a.imobilizado);
  const rl = safe(a.receita_liquida);
  const rb = safe(a.receita_bruta);
  const lb = safe(a.lucro_bruto);
  const ll = safe(a.lucro_liquido);
  const cmv = safe(a.cmv);
  const clientes = safe(a.contas_receber);
  const fornecedores = safe(a.fornecedores);

  // ebit, ebitda e resultado_financeiro: null significa "não fornecido no documento",
  // não "igual a zero". safe() converteria null→0 gerando margens de 0,0% incorretas.
  // Guardamos o flag de presença separadamente para o null-check nas fórmulas.
  const ebitFornecido = a.ebit != null;
  const ebit = safe(a.ebit);

  const ebitdaFornecido = a.ebitda != null;
  const ebitda = safe(a.ebitda);

  const rfFornecido = a.resultado_financeiro != null;
  const rf = safe(a.resultado_financeiro);

  // Cobertura de juros: denominador preferencial = TODAS as despesas financeiras da
  // quebra do DRE (linha de despesas financeiras + parcelas de despesa das linhas com
  // sinal: variação cambial passiva, outras despesas financeiras).
  // Fallback (linhas antigas sem quebra): proxy pelo resultado_financeiro negativo.
  const temDespFinQuebra =
    a.despesas_financeiras != null ||
    safe(a.variacoes_cambiais) < 0 ||
    safe(a.outras_receitas_despesas_financeiras) < 0;
  const despFinTotais = temDespFinQuebra
    ? safe(a.despesas_financeiras) +
      Math.max(0, -safe(a.variacoes_cambiais)) +
      Math.max(0, -safe(a.outras_receitas_despesas_financeiras))
    : null;
  const despFinanceiras = despFinTotais !== null
    ? (despFinTotais > 0 ? despFinTotais : null)
    : (rfFornecido && rf < 0) ? Math.abs(rf) : null;

  // Dívida financeira (empréstimos CP + LP). É o conceito de crédito: o que a
  // empresa deve a banco, não o que deve a fornecedor, fisco e empregado. Sem
  // empréstimos extraídos, cai no proxy antigo (Passivo Total − caixa) e o
  // motivo fica registrado em `motivosIndisponiveis`.
  const dividaBruta = calcularDividaFinanceiraBruta(a);
  const dividaLiquida = dividaBruta !== null ? dividaBruta - disp : null;
  const dividaParaEbitda = dividaBruta !== null ? dividaLiquida! : pt - disp;

  // Dívida líquida / EBITDA: só calcula quando ebitda foi extraído e é positivo.
  // EBITDA ≤ 0 não é "infinito": é "a operação não cobre dívida nenhuma", e vira
  // red flag em vez de número.
  const dividaLiquidaEbitda = (ebitdaFornecido && ebitda > 0) ? dividaParaEbitda / ebitda : null;

  // Prazos médios (ano comercial de 360 dias). PMR sobre a receita BRUTA, que é
  // a base do faturamento a receber; PME e PMP sobre o CMV/CSP, proxy das
  // compras quando o documento não as informa.
  const pmr = (a.contas_receber != null && rb > 0) ? (clientes / rb) * DIAS_ANO_COMERCIAL : null;
  const pme = (a.estoques != null && cmv > 0) ? (estoques / cmv) * DIAS_ANO_COMERCIAL : null;
  const pmp = (a.fornecedores != null && cmv > 0) ? (fornecedores / cmv) * DIAS_ANO_COMERCIAL : null;
  const cicloFinanceiro = (pmr !== null && pmp !== null) ? pmr + (pme ?? 0) - pmp : null;

  // Modelo Fleuriet: NCG = contas operacionais do giro (clientes + estoques −
  // fornecedores); saldo de tesouraria = capital de giro − NCG. ST negativo com
  // NCG crescente é o "efeito tesoura".
  const temGiro = a.contas_receber != null || a.estoques != null || a.fornecedores != null;
  const ncg = temGiro ? clientes + estoques - fornecedores : null;
  const temCg = a.ativo_circulante != null || a.passivo_circulante != null;
  const capitalGiroLiquido = temCg ? ac - pc : null;
  const saldoTesouraria = (capitalGiroLiquido !== null && ncg !== null) ? capitalGiroLiquido - ncg : null;

  // Termômetro de insolvência de Kanitz. Só com PL positivo: dois dos cinco
  // termos dividem pelo PL e explodem com PL ≤ 0.
  const lg = pt ? (ac + rlp) / pt : null;
  const ls = pc ? (ac - estoques) / pc : null;
  const lc = pc ? ac / pc : null;
  const kanitz = (plPositivo && lg !== null && ls !== null && lc !== null)
    ? 0.05 * (ll / pl) + 1.65 * lg + 3.55 * ls - 1.06 * lc - 0.33 * (pt / pl)
    : null;

  const partesAtivo = safe(a.partes_relacionadas_ativo);

  return {
    liquidezCorrente: lc,
    liquidezSeca: ls,
    liquidezGeral: lg,
    liquidezImediata: pc ? disp / pc : null,
    endividamentoTotal: at ? pt / at : null,
    composicaoEndividamento: pt ? pc / pt : null,
    debtEquity: plPositivo ? pt / pl : null,
    imobilizacaoPL: plPositivo ? imob / pl : null,
    roe: plPositivo ? ll / pl : null,
    roa: at ? ll / at : null,
    margemBruta: rl ? lb / rl : null,
    // Só calcula se o campo ebit foi realmente fornecido pela extração IA
    margemOperacional: (rl && ebitFornecido) ? ebit / rl : null,
    // Só calcula se o campo ebitda foi realmente fornecido
    margemEbitda: (rl && ebitdaFornecido) ? ebitda / rl : null,
    margemLiquida: rl ? ll / rl : null,
    giroAtivo: at ? rl / at : null,
    coberturaJuros: (despFinanceiras && ebitFornecido) ? ebit / despFinanceiras : null,
    coberturaJurosEbitda: (despFinanceiras && ebitdaFornecido) ? ebitda / despFinanceiras : null,
    dividaLiquidaEbitda,
    dividaFinanceiraBruta: dividaBruta,
    dividaLiquida,
    geracaoCaixaOperacional: a.dfc_caixa_operacional != null ? a.dfc_caixa_operacional : null,
    // Correto: usar null-check explícito. "ac - pc || null" retornaria null quando CG = 0 (falsy).
    capitalGiroLiquido,
    pmr,
    pme,
    pmp,
    cicloFinanceiro,
    ncg,
    saldoTesouraria,
    kanitz,
    dividaFinanceiraPL: (plPositivo && dividaBruta !== null) ? dividaBruta / pl : null,
    passivoSobreReceita: rl ? pt / rl : null,
    endividamentoFinanceiro: (at && dividaBruta !== null) ? dividaBruta / at : null,
    partesRelacionadasSobreAtivo: (at && a.partes_relacionadas_ativo != null) ? partesAtivo / at : null,
  };
}

/**
 * Motivos pelos quais um indicador não pôde ser calculado. São constantes, e
 * não texto solto, porque o score compara por identidade para saber quais
 * contam como o pior caso — antes isso era um `RegExp` sobre a frase, que
 * quebrava a cada ajuste de redação.
 */
export const MOTIVO_PL_NEGATIVO = "patrimônio líquido negativo";
export const MOTIVO_EBITDA_NEGATIVO = "a operação não gera caixa (EBITDA negativo)";
export const MOTIVO_SEM_EMPRESTIMOS = "empréstimos e financiamentos não informados no documento";
export const MOTIVO_PASSIVO_NO_LUGAR = "calculado sobre o passivo total — o documento não separa os empréstimos";
export const MOTIVO_SEM_DFC = "o documento não traz demonstração do fluxo de caixa";

/** Os motivos que significam "o dado existe e é ruim", não "falta dado". */
const MOTIVOS_DESFAVORAVEIS = new Set([MOTIVO_PL_NEGATIVO, MOTIVO_EBITDA_NEGATIVO]);

export const motivoEhDesfavoravel = (motivo?: string | null): boolean =>
  !!motivo && MOTIVOS_DESFAVORAVEIS.has(motivo);

/**
 * Por que um indicador saiu `null` quando havia dado para calculá-lo. É a
 * diferença entre "sem dados" (neutro) e "não se aplica" (informação de risco —
 * e, no score, contado como o pior caso quando o motivo é patrimônio líquido
 * ou EBITDA negativo).
 */
export function motivosIndisponiveis(
  a: AnaliseFinanceira,
): Partial<Record<keyof IndicadoresFinanceiros, string>> {
  const out: Partial<Record<keyof IndicadoresFinanceiros, string>> = {};
  const pl = calcularPlAjustado(a);
  const temPl = a.patrimonio_liquido != null;
  if (temPl && pl <= 0) {
    out.roe = MOTIVO_PL_NEGATIVO;
    out.debtEquity = MOTIVO_PL_NEGATIVO;
    out.imobilizacaoPL = MOTIVO_PL_NEGATIVO;
    out.dividaFinanceiraPL = MOTIVO_PL_NEGATIVO;
    out.kanitz = MOTIVO_PL_NEGATIVO;
  }
  if (a.ebitda != null && a.ebitda <= 0) {
    out.dividaLiquidaEbitda = MOTIVO_EBITDA_NEGATIVO;
  }
  if (calcularDividaFinanceiraBruta(a) === null) {
    out.dividaFinanceiraBruta = MOTIVO_SEM_EMPRESTIMOS;
    out.dividaLiquida = MOTIVO_SEM_EMPRESTIMOS;
    out.dividaFinanceiraPL = out.dividaFinanceiraPL ?? MOTIVO_SEM_EMPRESTIMOS;
    out.endividamentoFinanceiro = MOTIVO_SEM_EMPRESTIMOS;
    if (a.ebitda != null && a.ebitda > 0) out.dividaLiquidaEbitda = MOTIVO_PASSIVO_NO_LUGAR;
  }
  if (a.dfc_caixa_operacional == null) out.geracaoCaixaOperacional = MOTIVO_SEM_DFC;
  return out;
}

// ─── Classificação de saúde financeira ───────────────────────────────────────

export type SaudeFinanceira = "Saudável" | "Moderado" | "Crítico";

/**
 * Classificação rápida de saúde, sem o score completo. É a leitura de tetos:
 * PL negativo, liquidez corrente abaixo de 1, endividamento acima de 80% ou
 * prejuízo (ROA negativo) já são críticos por si. O rating A–E do score
 * (`analiseFinanceiraScore.ts`) refina isto; `classifyHealthFromRating` é a
 * ponte entre os dois.
 */
export function classifyHealth(ind: IndicadoresFinanceiros, a?: AnaliseFinanceira): SaudeFinanceira {
  const lc = ind.liquidezCorrente ?? 0;
  const eg = ind.endividamentoTotal ?? 0;
  const roa = ind.roa ?? 0;
  const plNegativo = a ? (a.patrimonio_liquido != null && calcularPlAjustado(a) <= 0) : false;
  if (plNegativo || lc < 1 || eg > 0.8 || roa < 0) return "Crítico";
  if (lc > 1.5 && eg < 0.6 && roa > 0) return "Saudável";
  return "Moderado";
}

export function classifyHealthFromRating(rating: "A" | "B" | "C" | "D" | "E"): SaudeFinanceira {
  return rating === "A" || rating === "B" ? "Saudável" : rating === "C" ? "Moderado" : "Crítico";
}

// ─── Faixas de referência por indicador ──────────────────────────────────────

// "gray"    = dado não disponível/não calculável (não indica problema, não semaforiza)
// "neutral" = valor informativo (R$, dias) que não tem faixa boa/ruim por si só
export type IndicadorStatus = "green" | "yellow" | "red" | "gray" | "neutral";

export type GrupoIndicador =
  | "liquidez" | "endividamento" | "rentabilidade" | "cobertura" | "ciclo" | "solvencia";

export interface IndicadorConfig {
  label: string;
  format: (v: number) => string;
  getStatus: (v: number) => IndicadorStatus;
  group: GrupoIndicador;
  description?: string;
  legend?: string;
  /** Faixas de referência em texto curto: verde · amarelo · vermelho. */
  referencia?: string;
  /** Frase de uma linha para a tela, o PDF e a síntese. */
  leitura?: (v: number, a: AnaliseFinanceira) => string;
}

// Formatadores em PT-BR: vírgula decimal, como o resto do sistema.
const dec = (v: number, casas: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (v: number) => `${dec(v * 100, 1)}%`;
const num2 = (v: number) => dec(v, 2);
const numX = (v: number) => `${dec(v, 2)}x`;
export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** R$ compacto para frases: "R$ 50,8 mi", "R$ 351 mil". */
export const brlCompacto = (v: number) => {
  const abs = Math.abs(v);
  const sinal = v < 0 ? "−" : "";
  if (abs >= 1e9) return `${sinal}R$ ${(abs / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} bi`;
  if (abs >= 1e6) return `${sinal}R$ ${(abs / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1e3) return `${sinal}R$ ${(abs / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `${sinal}R$ ${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};
const dias = (v: number) => `${Math.round(v)} d`;
const pctTxt = pct;

export const INDICADORES_CONFIG: Record<keyof IndicadoresFinanceiros, IndicadorConfig> = {
  liquidezCorrente: {
    label: "Liquidez Corrente",
    format: num2,
    group: "liquidez",
    description: "AC / PC",
    legend: "Mede a capacidade da empresa de pagar dívidas de curto prazo com seus ativos circulantes. Acima de 1,5 indica boa folga financeira; abaixo de 1,0 é sinal de alerta.",
    referencia: "> 1,5 · 1,0–1,5 · < 1,0",
    getStatus: (v) => v > 1.5 ? "green" : v >= 1.0 ? "yellow" : "red",
    leitura: (v) => v >= 1.5
      ? `Para cada R$ 1 de dívida de curto prazo há R$ ${num2(v)} no circulante — folga confortável.`
      : v >= 1
        ? `R$ ${num2(v)} de circulante por R$ 1 de curto prazo — cobre, com folga apertada.`
        : `R$ ${num2(v)} de circulante por R$ 1 de dívida de curto prazo — o circulante não cobre o que vence em 12 meses.`,
  },
  liquidezSeca: {
    label: "Liquidez Seca",
    format: num2,
    group: "liquidez",
    description: "(AC − Estoques) / PC",
    legend: "Igual à liquidez corrente, mas exclui estoques (ativos menos líquidos). Avalia a capacidade de pagamento sem depender da venda de mercadorias.",
    referencia: "> 1,0 · 0,7–1,0 · < 0,7",
    getStatus: (v) => v > 1.0 ? "green" : v >= 0.7 ? "yellow" : "red",
    leitura: (v, a) => a.estoques
      ? `Sem contar estoques, ${num2(v)} de cobertura do curto prazo.`
      : `Sem estoques relevantes, igual à liquidez corrente (${num2(v)}).`,
  },
  liquidezGeral: {
    label: "Liquidez Geral",
    format: num2,
    group: "liquidez",
    description: "(AC + RLP) / PT",
    legend: "Considera o realizável de longo prazo além do circulante. Avalia a solidez financeira no médio e longo prazo frente a todo o passivo exigível.",
    referencia: "> 1,0 · 0,8–1,0 · < 0,8",
    getStatus: (v) => v > 1.0 ? "green" : v >= 0.8 ? "yellow" : "red",
    leitura: (v) => v >= 1
      ? `Ativos realizáveis cobrem ${num2(v)}x todo o passivo exigível.`
      : `Ativos realizáveis cobrem só ${pctTxt(v)} do passivo exigível — o restante depende do imobilizado ou de capital novo.`,
  },
  liquidezImediata: {
    label: "Liquidez Imediata",
    format: num2,
    group: "liquidez",
    description: "Caixa / PC",
    legend: "Mede quanto do passivo circulante pode ser pago imediatamente com o caixa e equivalentes disponíveis (bancos, aplicações). Indicador de liquidez de curtíssimo prazo.",
    referencia: "> 0,3 · 0,1–0,3 · < 0,1",
    getStatus: (v) => v > 0.3 ? "green" : v >= 0.1 ? "yellow" : "red",
    leitura: (v) => `O caixa paga ${pctTxt(v)} do que vence em 12 meses.`,
  },
  endividamentoTotal: {
    label: "Endividamento Geral",
    format: pct,
    group: "endividamento",
    description: "PT / AT",
    legend: "Proporção do ativo total financiada por capital de terceiros (dívidas). Acima de 70% indica alta dependência de recursos externos e maior risco financeiro.",
    referencia: "< 50% · 50–70% · > 70%",
    getStatus: (v) => v < 0.5 ? "green" : v < 0.7 ? "yellow" : "red",
    leitura: (v) => v > 1
      ? `Terceiros financiam ${pctTxt(v)} do ativo — o passivo supera o ativo (passivo a descoberto).`
      : `Terceiros financiam ${pctTxt(v)} do ativo; capital próprio, ${pctTxt(1 - v)}.`,
  },
  composicaoEndividamento: {
    label: "Comp. Endividamento",
    format: pct,
    group: "endividamento",
    description: "PC / PT",
    legend: "Percentual do passivo total que vence no curto prazo (até 12 meses). Quanto maior, maior o risco de necessidade imediata de refinanciamento ou pagamento.",
    referencia: "< 50% · 50–70% · > 70%",
    getStatus: (v) => v < 0.5 ? "green" : v < 0.7 ? "yellow" : "red",
    leitura: (v) => `${pctTxt(v)} do passivo vence em até 12 meses.`,
  },
  debtEquity: {
    label: "Debt / Equity",
    format: numX,
    group: "endividamento",
    description: "PT / PL",
    legend: "Razão entre capital de terceiros (passivo total) e capital próprio (patrimônio líquido). Acima de 2x indica alta alavancagem; acima de 3x é sinal crítico em análise de crédito. Não se aplica com PL negativo.",
    referencia: "< 1,0x · 1,0–2,0x · > 2,0x",
    getStatus: (v) => v < 1.0 ? "green" : v <= 2.0 ? "yellow" : "red",
    leitura: (v) => `R$ ${num2(v)} de capital de terceiros para cada R$ 1 de capital próprio.`,
  },
  imobilizacaoPL: {
    label: "Imobilização do PL",
    format: pct,
    group: "endividamento",
    description: "Imobilizado / PL",
    legend: "Percentual do patrimônio líquido comprometido com ativos imobilizados (máquinas, equipamentos, imóveis). Acima de 100% significa que o imobilizado supera o PL, exigindo recursos de terceiros. Não se aplica com PL negativo.",
    referencia: "< 50% · 50–100% · > 100%",
    getStatus: (v) => v < 0.5 ? "green" : v <= 1.0 ? "yellow" : "red",
    leitura: (v) => v > 1
      ? `O imobilizado vale ${pctTxt(v)} do PL: parte dos ativos fixos é financiada por terceiros.`
      : `${pctTxt(v)} do PL está aplicado em imobilizado.`,
  },
  endividamentoFinanceiro: {
    label: "Endividamento Financeiro",
    format: pct,
    group: "endividamento",
    description: "Dív. Fin. Bruta / AT",
    legend: "Parcela do ativo financiada por empréstimos e financiamentos (dívida bancária), excluindo fornecedores, fisco e pessoal. Isola a dívida onerosa.",
    referencia: "< 30% · 30–50% · > 50%",
    getStatus: (v) => v < 0.3 ? "green" : v <= 0.5 ? "yellow" : "red",
    leitura: (v) => `Empréstimos e financiamentos respondem por ${pctTxt(v)} do ativo.`,
  },
  roe: {
    label: "ROE",
    format: pct,
    group: "rentabilidade",
    description: "LL / PL",
    legend: "Return on Equity — retorno sobre o patrimônio líquido. Mede quanto a empresa gera de lucro para cada R$ investido pelos sócios. Acima de 15% é considerado excelente. Não se aplica com PL negativo.",
    referencia: "> 15% · 5–15% · < 5%",
    getStatus: (v) => v > 0.15 ? "green" : v > 0.05 ? "yellow" : "red",
    leitura: (v) => v < 0
      ? `O prejuízo consumiu ${pctTxt(-v)} do patrimônio líquido no período.`
      : `Retorno de ${pctTxt(v)} sobre o capital próprio.`,
  },
  roa: {
    label: "ROA",
    format: pct,
    group: "rentabilidade",
    description: "LL / AT",
    legend: "Return on Assets — retorno sobre o ativo total. Mede a eficiência da empresa em transformar seus ativos em lucro. Acima de 5% indica boa utilização dos recursos.",
    referencia: "> 5% · 2–5% · < 2%",
    getStatus: (v) => v > 0.05 ? "green" : v > 0.02 ? "yellow" : "red",
    leitura: (v) => v < 0
      ? `Cada R$ 100 de ativo perdeu R$ ${dec(-v * 100, 1)} no período.`
      : `Cada R$ 100 de ativo gerou R$ ${dec(v * 100, 1)} de lucro.`,
  },
  margemBruta: {
    label: "Margem Bruta",
    format: pct,
    group: "rentabilidade",
    description: "Lucro Bruto / RL",
    legend: "Percentual da receita líquida que sobra após descontar os custos diretos de produção ou prestação de serviço (CMV/CSP). Reflete eficiência produtiva e poder de precificação.",
    referencia: "> 30% · 15–30% · < 15%",
    getStatus: (v) => v > 0.3 ? "green" : v > 0.15 ? "yellow" : "red",
    leitura: (v) => v < 0
      ? `Os custos diretos superam a receita líquida em ${pctTxt(-v)} — a operação perde dinheiro antes das despesas.`
      : `Sobram ${pctTxt(v)} da receita líquida após os custos diretos.`,
  },
  margemOperacional: {
    label: "Margem Operacional",
    format: pct,
    group: "rentabilidade",
    description: "EBIT / RL",
    legend: "Percentual da receita líquida que sobra após custos e todas as despesas operacionais (EBIT). Indica a rentabilidade da operação principal, antes do resultado financeiro e impostos.",
    referencia: "> 10% · 5–10% · < 5%",
    getStatus: (v) => v > 0.1 ? "green" : v > 0.05 ? "yellow" : "red",
    leitura: (v) => v < 0
      ? `Resultado operacional negativo em ${pctTxt(-v)} da receita, antes dos juros.`
      : `A operação principal rende ${pctTxt(v)} da receita antes dos juros.`,
  },
  margemEbitda: {
    label: "Margem EBITDA",
    format: pct,
    group: "rentabilidade",
    description: "EBITDA / RL",
    legend: "EBITDA sobre a receita líquida. Aproxima o fluxo de caixa operacional ao excluir depreciação e amortização. Muito utilizado para comparação entre empresas do mesmo setor.",
    referencia: "> 12% · 6–12% · < 6%",
    getStatus: (v) => v > 0.12 ? "green" : v > 0.06 ? "yellow" : "red",
    leitura: (v) => v <= 0
      ? `A operação não gera caixa: EBITDA de ${pctTxt(v)} da receita.`
      : `Geração operacional de caixa de ${pctTxt(v)} da receita.`,
  },
  margemLiquida: {
    label: "Margem Líquida",
    format: pct,
    group: "rentabilidade",
    description: "LL / RL",
    legend: "Percentual final que sobra para os sócios após todos os custos, despesas, resultado financeiro e impostos. É a principal métrica de rentabilidade final da empresa.",
    referencia: "> 8% · 3–8% · < 3%",
    getStatus: (v) => v > 0.08 ? "green" : v > 0.03 ? "yellow" : "red",
    leitura: (v) => v < 0
      ? `Prejuízo de ${pctTxt(-v)} da receita líquida.`
      : `Lucro final de ${pctTxt(v)} da receita líquida.`,
  },
  giroAtivo: {
    label: "Giro do Ativo",
    format: numX,
    group: "cobertura",
    description: "RL / AT",
    legend: "Receita líquida dividida pelo ativo total. Indica quantas vezes o ativo total é 'girado' pelas vendas no período. Empresas de serviços costumam ter giro mais alto que as industriais.",
    referencia: "> 1,5x · 0,8–1,5x · < 0,8x",
    getStatus: (v) => v > 1.5 ? "green" : v > 0.8 ? "yellow" : "red",
    leitura: (v) => `A receita gira ${num2(v)}x o ativo total no período.`,
  },
  coberturaJuros: {
    label: "Cobertura de Juros (EBIT)",
    format: numX,
    group: "cobertura",
    description: "EBIT / |Desp. Fin.|",
    legend: "Quantas vezes o resultado operacional (EBIT) cobre as despesas financeiras (juros). Abaixo de 2x a empresa pode ter dificuldade em honrar sua dívida financeira.",
    referencia: "> 4x · 2–4x · < 2x",
    getStatus: (v) => v > 4 ? "green" : v >= 2 ? "yellow" : "red",
    leitura: (v) => v <= 0
      ? `O resultado operacional é negativo: não cobre nem parte dos juros.`
      : `O resultado operacional cobre ${num2(v)}x as despesas financeiras.`,
  },
  coberturaJurosEbitda: {
    label: "Cobertura de Juros (EBITDA)",
    format: numX,
    group: "cobertura",
    description: "EBITDA / |Desp. Fin.|",
    legend: "Quantas vezes a geração operacional de caixa (EBITDA) cobre as despesas financeiras. É a medida usada em seguro de crédito: abaixo de 1,5x os juros consomem a maior parte do caixa gerado.",
    referencia: "> 3x · 1,5–3x · < 1,5x",
    getStatus: (v) => v > 3 ? "green" : v >= 1.5 ? "yellow" : "red",
    leitura: (v) => v < 1
      ? `O caixa operacional cobre só ${pctTxt(Math.max(v, 0))} dos juros — a dívida se paga com dívida nova.`
      : `O caixa operacional cobre ${num2(v)}x as despesas financeiras.`,
  },
  dividaLiquidaEbitda: {
    label: "Dív. Líq. / EBITDA",
    format: numX,
    group: "cobertura",
    description: "(Dív. Fin. − Caixa) / EBITDA",
    legend: "Dívida financeira líquida (empréstimos e financiamentos menos caixa) dividida pelo EBITDA. Indica em quantos anos a empresa pagaria a dívida bancária usando apenas a geração operacional de caixa. Abaixo de 2x é saudável; acima de 4x é alavancagem alta. Não se aplica com EBITDA negativo.",
    referencia: "< 2x · 2–3x · > 3x",
    getStatus: (v) => v < 2 ? "green" : v < 3 ? "yellow" : "red",
    leitura: (v) => v <= 0
      ? `Caixa maior que a dívida financeira.`
      : `Seriam necessários ${dec(v, 1)} anos de EBITDA para quitar a dívida líquida.`,
  },
  dividaFinanceiraBruta: {
    label: "Dívida Financeira Bruta",
    format: brl,
    group: "cobertura",
    description: "Empréstimos CP + LP",
    legend: "Total de empréstimos e financiamentos (curto + longo prazo). É a dívida onerosa — a que cobra juros.",
    getStatus: () => "neutral",
    leitura: (v, a) => {
      const cp = safe(a.emprestimos_cp);
      return v > 0 ? `${brlCompacto(v)} em bancos, ${pctTxt(cp / v)} vencendo em 12 meses.` : "Sem dívida bancária.";
    },
  },
  dividaLiquida: {
    label: "Dívida Líquida",
    format: brl,
    group: "cobertura",
    description: "Dív. Fin. Bruta − Caixa",
    legend: "Dívida financeira descontada do caixa e equivalentes. Negativa significa caixa líquido (mais caixa do que dívida bancária).",
    getStatus: (v) => v <= 0 ? "green" : "neutral",
    leitura: (v) => v <= 0 ? `Posição de caixa líquido de ${brlCompacto(-v)}.` : `Dívida bancária líquida de ${brlCompacto(v)}.`,
  },
  geracaoCaixaOperacional: {
    label: "Caixa Operacional (DFC)",
    format: brl,
    group: "cobertura",
    description: "DFC — atividades operacionais",
    legend: "Caixa líquido gerado pelas atividades operacionais, conforme a Demonstração dos Fluxos de Caixa. Confere se o EBITDA virou caixa de verdade — e de onde veio (resultado ou alongamento de fornecedores).",
    getStatus: (v) => v > 0 ? "green" : "red",
    leitura: (v, a) => {
      const ebitda = a.ebitda;
      if (v <= 0) return `A operação consumiu ${brlCompacto(-v)} de caixa no período.`;
      if (ebitda != null && v > ebitda * 2) {
        return `Operação gerou ${brlCompacto(v)} — bem acima do EBITDA: caixa veio de alongar fornecedores/contas a pagar, não de resultado.`;
      }
      return `Operação gerou ${brlCompacto(v)} de caixa no período.`;
    },
  },
  capitalGiroLiquido: {
    label: "Capital de Giro",
    format: brl,
    group: "cobertura",
    description: "AC − PC",
    legend: "Diferença entre ativo circulante e passivo circulante (AC − PC). Positivo significa que a empresa tem folga para cobrir suas obrigações de curto prazo; negativo indica pressão de liquidez.",
    referencia: "> 0 · > −100 mil · ≤ −100 mil",
    getStatus: (v) => v > 0 ? "green" : v > -100000 ? "yellow" : "red",
    leitura: (v) => v >= 0
      ? `Folga de ${brlCompacto(v)} entre o circulante e o que vence em 12 meses.`
      : `Faltam ${brlCompacto(-v)} no circulante para cobrir o que vence em 12 meses.`,
  },
  pmr: {
    label: "PMR",
    format: dias,
    group: "ciclo",
    description: "Clientes / Receita Bruta × 360",
    legend: "Prazo médio de recebimento: quantos dias, em média, a empresa leva para receber dos clientes. Acima de 90 dias sugere carteira longa ou inadimplência.",
    referencia: "≤ 60 d · 60–90 d · > 90 d",
    getStatus: (v) => v <= 60 ? "green" : v <= 90 ? "yellow" : "red",
    leitura: (v) => `Recebe dos clientes, em média, em ${Math.round(v)} dias.`,
  },
  pme: {
    label: "PME",
    format: dias,
    group: "ciclo",
    description: "Estoques / CMV × 360",
    legend: "Prazo médio de estocagem: dias que a mercadoria fica em estoque antes de virar custo. Serviços e transporte têm estoque irrelevante.",
    referencia: "≤ 45 d · 45–90 d · > 90 d",
    getStatus: (v) => v <= 45 ? "green" : v <= 90 ? "yellow" : "red",
    leitura: (v) => `Estoque gira a cada ${Math.round(v)} dias.`,
  },
  pmp: {
    label: "PMP",
    format: dias,
    group: "ciclo",
    description: "Fornecedores / CMV × 360",
    legend: "Prazo médio de pagamento a fornecedores. Alto pode ser poder de negociação — ou atraso: acima de 120 dias, tratar como financiamento forçado por fornecedores.",
    referencia: "30–90 d · 90–120 d · > 120 d ou < 15 d",
    getStatus: (v) => (v >= 30 && v <= 90) ? "green" : (v <= 120 && v >= 15) ? "yellow" : "red",
    leitura: (v) => v > 120
      ? `Paga fornecedores em ${Math.round(v)} dias — prazo incompatível com o mercado, típico de atraso.`
      : `Paga fornecedores, em média, em ${Math.round(v)} dias.`,
  },
  cicloFinanceiro: {
    label: "Ciclo Financeiro",
    format: dias,
    group: "ciclo",
    description: "PMR + PME − PMP",
    legend: "Dias entre pagar o fornecedor e receber do cliente. Positivo = a empresa financia o giro; negativo = os fornecedores financiam a empresa. Muito negativo combinado com PMP alto é sinal de fornecedores em atraso, não de eficiência.",
    referencia: "≤ 30 d · 30–90 d · > 90 d",
    getStatus: (v) => v <= 30 ? "green" : v <= 90 ? "yellow" : "red",
    leitura: (v) => v < 0
      ? `Recebe ${Math.round(-v)} dias antes de pagar — os fornecedores financiam o giro.`
      : `Financia ${Math.round(v)} dias de giro com recursos próprios ou bancários.`,
  },
  ncg: {
    label: "NCG",
    format: brl,
    group: "ciclo",
    description: "Clientes + Estoques − Fornecedores",
    legend: "Necessidade de capital de giro (modelo Fleuriet): recursos presos na operação. Positiva precisa ser financiada; negativa significa que a operação se financia sozinha.",
    getStatus: () => "neutral",
    leitura: (v) => v > 0
      ? `A operação prende ${brlCompacto(v)} que precisam de financiamento.`
      : `A operação libera ${brlCompacto(-v)} — fornecedores financiam clientes e estoques.`,
  },
  saldoTesouraria: {
    label: "Saldo de Tesouraria",
    format: brl,
    group: "ciclo",
    description: "Capital de Giro − NCG",
    legend: "Modelo Fleuriet: parcela do capital de giro que sobra (ou falta) depois de financiar a operação. Negativo indica dependência de dívida de curto prazo para girar — o 'efeito tesoura'.",
    getStatus: (v) => v >= 0 ? "green" : "red",
    leitura: (v) => v >= 0
      ? `Sobra de ${brlCompacto(v)} após financiar a operação.`
      : `Faltam ${brlCompacto(-v)} para financiar a operação — cobertos por dívida de curto prazo (efeito tesoura).`,
  },
  kanitz: {
    label: "Termômetro de Kanitz",
    format: num2,
    group: "solvencia",
    description: "0,05·LL/PL + 1,65·LG + 3,55·LS − 1,06·LC − 0,33·PT/PL",
    legend: "Fator de insolvência de Kanitz. Acima de 0: solvente; entre −3 e 0: penumbra; abaixo de −3: insolvência. Não se aplica com PL negativo — a empresa já está tecnicamente insolvente.",
    referencia: "> 0 · −3 a 0 · < −3",
    getStatus: (v) => v > 0 ? "green" : v >= -3 ? "yellow" : "red",
    leitura: (v) => v > 0 ? "Faixa de solvência." : v >= -3 ? "Faixa de penumbra: risco intermediário." : "Faixa de insolvência.",
  },
  dividaFinanceiraPL: {
    label: "Dív. Financeira / PL",
    format: numX,
    group: "solvencia",
    description: "Dív. Fin. Bruta / PL",
    legend: "Alavancagem bancária: quantas vezes a dívida onerosa supera o capital próprio. Não se aplica com PL negativo.",
    referencia: "< 1x · 1–2x · > 2x",
    getStatus: (v) => v < 1 ? "green" : v <= 2 ? "yellow" : "red",
    leitura: (v) => `Dívida bancária equivale a ${num2(v)}x o capital próprio.`,
  },
  passivoSobreReceita: {
    label: "Passivo / Receita",
    format: numX,
    group: "solvencia",
    description: "PT / RL",
    legend: "Quantos anos de receita líquida seriam necessários para cobrir todo o passivo. Acima de 1x a dívida total supera um ano inteiro de faturamento.",
    referencia: "< 0,6x · 0,6–1,0x · > 1,0x",
    getStatus: (v) => v < 0.6 ? "green" : v <= 1.0 ? "yellow" : "red",
    leitura: (v) => `O passivo equivale a ${num2(v)} ano(s) de receita líquida.`,
  },
  partesRelacionadasSobreAtivo: {
    label: "Partes Relacionadas / AT",
    format: pct,
    group: "solvencia",
    description: "Créditos com sócios e ligadas / AT",
    legend: "Parcela do ativo aplicada em créditos com sócios, controladas e coligadas. Acima de 30% o balanço depende de dinheiro que circula dentro do grupo, não da operação.",
    referencia: "< 10% · 10–30% · > 30%",
    getStatus: (v) => v < 0.1 ? "green" : v <= 0.3 ? "yellow" : "red",
    leitura: (v) => `${pctTxt(v)} do ativo são créditos com sócios ou empresas ligadas.`,
  },
};

export function getIndicadorStatus(key: keyof IndicadoresFinanceiros, value: number | null): IndicadorStatus {
  // null = dado não disponível; não deve semaforizar como alerta, apenas indicar ausência
  if (value === null || value === undefined) return "gray";
  return INDICADORES_CONFIG[key]?.getStatus(value) ?? "gray";
}

/** Formata um valor pelo formatador do indicador; `—` quando ausente. */
export function formatarIndicador(key: keyof IndicadoresFinanceiros, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return INDICADORES_CONFIG[key]?.format(value) ?? value.toFixed(2);
}

/** Leitura de uma linha do indicador, quando o config a define e há valor. */
export function leituraIndicador(
  key: keyof IndicadoresFinanceiros, value: number | null | undefined, a: AnaliseFinanceira,
): string | null {
  if (value === null || value === undefined) return null;
  const cfg = INDICADORES_CONFIG[key];
  return cfg?.leitura ? cfg.leitura(value, a) : null;
}

export const INDICADORES_GRUPOS: { key: GrupoIndicador; label: string; items: (keyof IndicadoresFinanceiros)[] }[] = [
  {
    key: "liquidez",
    label: "Liquidez",
    items: ["liquidezCorrente", "liquidezSeca", "liquidezGeral", "liquidezImediata"],
  },
  {
    key: "endividamento",
    label: "Endividamento e alavancagem",
    items: ["endividamentoTotal", "composicaoEndividamento", "endividamentoFinanceiro", "debtEquity", "imobilizacaoPL"],
  },
  {
    key: "rentabilidade",
    label: "Rentabilidade",
    items: ["margemBruta", "margemOperacional", "margemEbitda", "margemLiquida", "roe", "roa"],
  },
  {
    key: "cobertura",
    label: "Cobertura e geração de caixa",
    items: [
      "dividaFinanceiraBruta", "dividaLiquida", "dividaLiquidaEbitda", "coberturaJuros",
      "coberturaJurosEbitda", "geracaoCaixaOperacional", "capitalGiroLiquido", "giroAtivo",
    ],
  },
  {
    key: "ciclo",
    label: "Ciclo e capital de giro",
    items: ["pmr", "pme", "pmp", "cicloFinanceiro", "ncg", "saldoTesouraria"],
  },
  {
    key: "solvencia",
    label: "Solvência",
    items: ["kanitz", "dividaFinanceiraPL", "passivoSobreReceita", "partesRelacionadasSobreAtivo"],
  },
];

// ─── Famílias de indicador e leitura de balancete ────────────────────────────
//
// Num balancete a duração do período importa — mas não para todos os
// indicadores da mesma forma. São três comportamentos distintos, e tratá-los
// como um só é o que produz leituras como "ROE de 0,3%" para uma empresa que
// simplesmente teve o trimestre medido em vez do ano.

export type FamiliaIndicador = "patrimonial" | "fluxo" | "misto";

export const FAMILIA_INDICADOR: Record<keyof IndicadoresFinanceiros, FamiliaIndicador> = {
  // Saldo ÷ saldo. Fotografias na data de corte — plenamente comparáveis com
  // exercícios encerrados, sem ajuste nenhum.
  liquidezCorrente: "patrimonial",
  liquidezSeca: "patrimonial",
  liquidezGeral: "patrimonial",
  liquidezImediata: "patrimonial",
  endividamentoTotal: "patrimonial",
  composicaoEndividamento: "patrimonial",
  debtEquity: "patrimonial",
  imobilizacaoPL: "patrimonial",
  capitalGiroLiquido: "patrimonial",

  // Fluxo ÷ fluxo do MESMO período: a duração se cancela na divisão. Também
  // válidos sem ajuste.
  margemBruta: "fluxo",
  margemOperacional: "fluxo",
  margemEbitda: "fluxo",
  margemLiquida: "fluxo",
  coberturaJuros: "fluxo",

  coberturaJurosEbitda: "fluxo",

  // Informativos de saldo (R$ na data de corte).
  dividaFinanceiraBruta: "patrimonial",
  dividaLiquida: "patrimonial",
  ncg: "patrimonial",
  saldoTesouraria: "patrimonial",
  endividamentoFinanceiro: "patrimonial",
  partesRelacionadasSobreAtivo: "patrimonial",
  dividaFinanceiraPL: "patrimonial",
  // Caixa gerado no período: é fluxo puro, mas sem par de fluxo para dividir —
  // não se anualiza para não parecer resultado realizado.
  geracaoCaixaOperacional: "fluxo",

  // Fluxo ÷ saldo. Distorcidos: o numerador cobre N meses e o denominador é a
  // posição na data. São estes que ganham a projeção anualizada ao lado.
  roe: "misto",
  roa: "misto",
  giroAtivo: "misto",
  dividaLiquidaEbitda: "misto",
  pmr: "misto",
  pme: "misto",
  pmp: "misto",
  cicloFinanceiro: "misto",
  passivoSobreReceita: "misto",
  kanitz: "misto",
};

/** Abaixo disto, projetar um ano não é informação: é ruído de sazonalidade. */
export const MESES_MINIMOS_ANUALIZACAO = 3;

export const ehBalanceteParcial = (a: AnaliseFinanceira): boolean =>
  a.tipo_periodo === "balancete_parcial";

/**
 * Projeção anualizada dos indicadores mistos — SÓ PARA EXIBIÇÃO.
 *
 * O fator 12/meses é aplicado ao FLUXO, nunca ao saldo. O resultado nunca é
 * gravado no banco, nunca entra no `score_ajuste_g` nem nos red flags, e nunca
 * aparece como número principal no PDF. É valor secundário, com selo de
 * projeção — porque projetar não é medir.
 *
 * Devolve `null` quando não faz sentido projetar: exercício encerrado, período
 * de 12 meses, ou período curto demais.
 */
export function calcularIndicadoresAnualizados(
  a: AnaliseFinanceira,
): Partial<Record<keyof IndicadoresFinanceiros, number | null>> | null {
  if (!ehBalanceteParcial(a)) return null;
  const meses = a.meses_competencia ?? null;
  if (meses === null || meses >= 12 || meses < MESES_MINIMOS_ANUALIZACAO) return null;

  const fator = 12 / meses;
  // A projeção é só o fluxo × fator; todo o resto é o mesmo cálculo. Reusar
  // `calcularIndicadores` sobre a linha projetada garante que as regras de
  // sinal (PL ≤ 0, EBITDA ≤ 0, dívida financeira) valem também na projeção.
  const projetada: AnaliseFinanceira = {
    ...a,
    lucro_liquido: a.lucro_liquido != null ? a.lucro_liquido * fator : null,
    receita_liquida: a.receita_liquida != null ? a.receita_liquida * fator : null,
    receita_bruta: a.receita_bruta != null ? a.receita_bruta * fator : null,
    cmv: a.cmv != null ? a.cmv * fator : null,
    ebitda: a.ebitda != null ? a.ebitda * fator : null,
  };
  const ind = calcularIndicadores(projetada);
  return {
    roe: ind.roe,
    roa: ind.roa,
    giroAtivo: ind.giroAtivo,
    dividaLiquidaEbitda: ind.dividaLiquidaEbitda,
    pmr: ind.pmr,
    pme: ind.pme,
    pmp: ind.pmp,
    cicloFinanceiro: ind.cicloFinanceiro,
    passivoSobreReceita: ind.passivoSobreReceita,
    kanitz: ind.kanitz,
  };
}

/**
 * Rótulo curto do exercício, para o chip do seletor e o cabeçalho do
 * comparativo: `2025` para encerrado, `2026 · parcial (abr)` para balancete.
 */
export function rotuloPeriodo(a: {
  ano_referencia: number;
  tipo_periodo?: string | null;
  data_fim_periodo?: string | null;
  data_balanco?: string | null;
  meses_competencia?: number | null;
}): string {
  if (a.tipo_periodo !== "balancete_parcial") return String(a.ano_referencia);
  const data = a.data_fim_periodo ?? a.data_balanco;
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const mes = data ? MES[Number(data.slice(5, 7)) - 1] : null;
  return `${a.ano_referencia} · parcial${mes ? ` (${mes})` : ""}`;
}

/**
 * A nota de um balancete só vale para decisão se existir um exercício encerrado
 * da MESMA empresa como referência.
 *
 * O motivo: num balancete faltam os lançamentos de encerramento (provisão de
 * IR, depreciação do ano inteiro, férias, 13º), e todos eles pioram o resultado.
 * Uma nota calculada sobre isso, sem um exercício fechado ao lado para comparar,
 * mede uma melhora que pode não existir. Sem a referência, exiba o número
 * marcado como provisório em vez de tratá-lo como decidido.
 *
 * É política de uso, não regra contábil: chame se fizer sentido no seu processo.
 */
export function scoreLiberadoParaDecisao(
  analise: { tipo_periodo?: string | null; score_provisorio?: boolean | null },
  todasDaEmpresa: Array<{ tipo_periodo?: string | null }>,
): boolean {
  if (analise.tipo_periodo !== "balancete_parcial" && !analise.score_provisorio) return true;
  return todasDaEmpresa.some((a) => a.tipo_periodo === "exercicio_fechado");
}

// ─── Red flags ───────────────────────────────────────────────────────────────
//
// As regras vivem em `redflags.ts` (fonte única, com severidade). Não são
// reexportadas daqui para não criar ciclo de import entre os dois módulos.
