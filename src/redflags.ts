// Sinais de alerta determinísticos — fonte única.
//
// A divisão de trabalho aqui é deliberada e vale a pena entender antes de mexer:
//
//   · O QUE SE CALCULA DOS NÚMEROS é regra, em código, com severidade — PL
//     negativo, liquidez abaixo de 1, prejuízo, D/E acima de 3x, dividendos pagos
//     em ano de prejuízo. Uma regra sempre dispara nas mesmas condições e sempre
//     com o mesmo texto e o mesmo peso no score.
//
//   · O QUE SÓ SE LÊ NO DOCUMENTO fica com a IA — ressalva do auditor, dúvida
//     sobre continuidade operacional, parcelamento tributário, concentração de
//     receita. Isso não se deduz de índice nenhum.
//
// Pedir os dois ao modelo é o erro que este arquivo existe para não repetir:
// quando o prompt e o código mantinham listas paralelas para a mesma condição, um
// único caso saiu com 14 alertas, 4 deles a mesma coisa escrita de formas
// diferentes. `mesclarRedFlagsIa()` descarta da lista do modelo tudo que casa com
// o `padraoIa` de uma regra — a regra já decidiu, com número.

import {
  brlCompacto, calcularDividaFinanceiraBruta, calcularPlAjustado,
  type AnaliseFinanceira, type IndicadoresFinanceiros,
} from "./indicadores.js";
import type { ResumoConferencia } from "./conferencia.js";

export type SeveridadeRedFlag = "critica" | "alta" | "atencao" | "observacao_ia";

export const ORDEM_SEVERIDADE: Record<SeveridadeRedFlag, number> = {
  critica: 0, alta: 1, atencao: 2, observacao_ia: 3,
};

export const ROTULO_SEVERIDADE: Record<SeveridadeRedFlag, string> = {
  critica: "Crítico",
  alta: "Alerta",
  atencao: "Atenção",
  observacao_ia: "Observações do documento",
};

export interface RedFlag {
  chave: string;
  severidade: SeveridadeRedFlag;
  texto: string;
  origem: "regra" | "conferencia" | "ia";
}

export interface RegraRedFlag {
  chave: string;
  severidade: SeveridadeRedFlag;
  teste: (a: AnaliseFinanceira, ind: IndicadoresFinanceiros) => boolean;
  texto: (a: AnaliseFinanceira, ind: IndicadoresFinanceiros) => string;
  /** Casa as variantes textuais que a IA costuma emitir para a mesma condição. */
  padraoIa?: RegExp;
}

/** Mesma string emitida pela edge function (`derive.ts`) — dedup por texto. */
export const RED_FLAG_RESULTADO_FINANCEIRO =
  "Resultado financeiro negativo superior a 30% do EBIT";

const num = (v: unknown): number | null => (typeof v === "number" && !isNaN(v) ? v : null);
const dec = (v: number, casas: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (v: number) => `${dec(v * 100, 1)}%`;

export const REGRAS_RED_FLAG: RegraRedFlag[] = [
  {
    chave: "pl_negativo",
    severidade: "critica",
    teste: (a) => a.patrimonio_liquido != null && calcularPlAjustado(a) < 0,
    texto: (a) => `Patrimônio Líquido negativo (${brlCompacto(calcularPlAjustado(a))}) — passivo a descoberto`,
    padraoIa: /patrim[oô]nio\s+l[ií]quido\s+negativo|PL\s+negativo|passivo\s+a\s+descoberto/i,
  },
  {
    chave: "pl_baixo",
    severidade: "alta",
    teste: (a) => {
      const pl = calcularPlAjustado(a);
      const at = num(a.ativo_total);
      return a.patrimonio_liquido != null && pl >= 0 && at !== null && at > 0 && pl < 0.1 * at;
    },
    texto: (a) => `Patrimônio Líquido inferior a 10% do Ativo Total (${pct(calcularPlAjustado(a) / (num(a.ativo_total) ?? 1))})`,
    padraoIa: /PL\s+(negativo\s+ou\s+)?inferior\s+a\s+10%|patrim[oô]nio\s+l[ií]quido\s+(negativo\s+ou\s+)?inferior/i,
  },
  {
    chave: "liquidez_corrente_critica",
    severidade: "critica",
    teste: (_a, ind) => ind.liquidezCorrente !== null && ind.liquidezCorrente < 0.5,
    texto: (_a, ind) => `Liquidez corrente de ${dec(ind.liquidezCorrente!, 2)} — o circulante cobre menos da metade do curto prazo`,
    padraoIa: /liquidez\s+corrente/i,
  },
  {
    chave: "liquidez_corrente_baixa",
    severidade: "alta",
    teste: (_a, ind) => ind.liquidezCorrente !== null && ind.liquidezCorrente >= 0.5 && ind.liquidezCorrente < 1,
    texto: () => "Liquidez corrente abaixo de 1",
    padraoIa: /liquidez\s+corrente/i,
  },
  {
    chave: "prejuizo",
    severidade: "alta",
    teste: (a) => num(a.lucro_liquido) !== null && (a.lucro_liquido as number) < 0,
    texto: (a, ind) => ind.margemLiquida !== null
      ? `Prejuízo no exercício (${brlCompacto(a.lucro_liquido as number)}, margem líquida ${pct(ind.margemLiquida)})`
      : `Prejuízo no exercício (${brlCompacto(a.lucro_liquido as number)})`,
    padraoIa: /preju[ií]zo|margem\s+l[ií]quida\s+negativa|ROE\s+negativo/i,
  },
  {
    chave: "capital_giro_negativo",
    severidade: "alta",
    teste: (_a, ind) => ind.capitalGiroLiquido !== null && ind.capitalGiroLiquido < 0,
    texto: () => "Capital de giro negativo",
    padraoIa: /capital\s+de\s+giro\s+negativo|AC\s*<\s*PC/i,
  },
  {
    chave: "endividamento_alto",
    severidade: "alta",
    teste: (_a, ind) => ind.endividamentoTotal !== null && ind.endividamentoTotal > 0.8,
    texto: () => "Endividamento geral acima de 80%",
    padraoIa: /endividamento\s+geral/i,
  },
  {
    chave: "alavancagem_alta",
    severidade: "alta",
    teste: (_a, ind) => ind.debtEquity !== null && ind.debtEquity > 3,
    texto: (_a, ind) => `Alavancagem D/E acima de 3x (${dec(ind.debtEquity!, 2)}x)`,
    padraoIa: /D\s*\/\s*E|debt\s*\/?\s*equity|PT\s*\/\s*PL/i,
  },
  {
    chave: "ebitda_negativo_com_divida",
    severidade: "critica",
    teste: (a) => a.ebitda != null && a.ebitda <= 0 && (calcularDividaFinanceiraBruta(a) ?? 0) > 0,
    texto: (a) => `EBITDA negativo com dívida bancária de ${brlCompacto(calcularDividaFinanceiraBruta(a) ?? 0)} — a operação não gera caixa para servir a dívida`,
    padraoIa: /EBITDA\s+negativo/i,
  },
  {
    chave: "cobertura_juros_baixa",
    severidade: "alta",
    teste: (_a, ind) => ind.coberturaJuros !== null && ind.coberturaJuros < 2,
    texto: (_a, ind) => ind.coberturaJuros! <= 0
      ? "Cobertura de juros abaixo de 2x — o resultado operacional é negativo"
      : "Cobertura de juros abaixo de 2x",
    padraoIa: /cobertura\s+de\s+juros/i,
  },
  {
    chave: "divida_ebitda_critica",
    severidade: "critica",
    teste: (_a, ind) => ind.dividaLiquidaEbitda !== null && ind.dividaLiquidaEbitda > 6,
    texto: (_a, ind) => `Dívida Líquida/EBITDA de ${dec(ind.dividaLiquidaEbitda!, 1)}x — acima de 6x`,
    padraoIa: /d[ií]vida\s+l[ií]quida\s*\/?\s*EBITDA|DL\s*\/\s*EBITDA/i,
  },
  {
    chave: "divida_ebitda_alta",
    severidade: "alta",
    teste: (_a, ind) => ind.dividaLiquidaEbitda !== null && ind.dividaLiquidaEbitda > 4 && ind.dividaLiquidaEbitda <= 6,
    texto: () => "Dívida Líquida/EBITDA acima de 4x",
    padraoIa: /d[ií]vida\s+l[ií]quida\s*\/?\s*EBITDA|DL\s*\/\s*EBITDA/i,
  },
  {
    chave: "resultado_financeiro_pesado",
    severidade: "atencao",
    teste: (a) =>
      a.resultado_financeiro != null && a.ebit != null && a.ebit > 0 &&
      a.resultado_financeiro < 0 && Math.abs(a.resultado_financeiro) > 0.3 * a.ebit,
    texto: () => RED_FLAG_RESULTADO_FINANCEIRO,
    padraoIa: /resultado\s+financeiro/i,
  },
  {
    chave: "cmv_acima_receita",
    severidade: "alta",
    teste: (a) => num(a.cmv) !== null && num(a.receita_liquida) !== null &&
      (a.cmv as number) > (a.receita_liquida as number) && (a.receita_liquida as number) > 0,
    texto: (_a, ind) => `Custos diretos superam a receita líquida (margem bruta ${ind.margemBruta !== null ? pct(ind.margemBruta) : "negativa"})`,
    padraoIa: /CMV\s+superior|custos?\s+(diretos?\s+)?superam?/i,
  },
  {
    chave: "capital_consumido",
    severidade: "atencao",
    teste: (a) => {
      const cs = num(a.capital_social_bp);
      const pl = calcularPlAjustado(a);
      return a.patrimonio_liquido != null && cs !== null && cs > 0 && pl >= 0 && pl < cs;
    },
    texto: (a) => `PL (${brlCompacto(calcularPlAjustado(a))}) abaixo do capital social (${brlCompacto(a.capital_social_bp as number)}) — prejuízos consumiram parte do capital`,
    padraoIa: /capital\s+social\s+consumido|abaixo\s+do\s+capital\s+social/i,
  },
  {
    chave: "dividendos_com_prejuizo",
    severidade: "critica",
    teste: (a) => num(a.dfc_dividendos_pagos) !== null && (a.dfc_dividendos_pagos as number) > 0 &&
      num(a.lucro_liquido) !== null && (a.lucro_liquido as number) < 0,
    texto: (a) => `Distribuição de lucros/dividendos de ${brlCompacto(a.dfc_dividendos_pagos as number)} (DFC) em exercício com prejuízo de ${brlCompacto(a.lucro_liquido as number)}`,
    padraoIa: /dividendos|distribui[cç][aã]o\s+de\s+lucros/i,
  },
  {
    chave: "partes_relacionadas_relevantes",
    severidade: "atencao",
    teste: (a) => {
      const ac = num(a.ativo_circulante) ?? 0;
      const pc = num(a.passivo_circulante) ?? 0;
      const at = num(a.ativo_total) ?? 0;
      const pra = num(a.partes_relacionadas_ativo) ?? 0;
      const prp = num(a.partes_relacionadas_passivo) ?? 0;
      return (at > 0 && pra > 0.3 * at) || (ac > 0 && pra > 0.3 * ac) || (pc > 0 && prp > 0.3 * pc);
    },
    texto: (a) => `Partes relacionadas relevantes: ${brlCompacto(num(a.partes_relacionadas_ativo) ?? 0)} no ativo e ${brlCompacto(num(a.partes_relacionadas_passivo) ?? 0)} no passivo`,
    padraoIa: /partes?\s+relacionadas?|s[oó]cios?,?\s+(administradores|coligadas)/i,
  },
  {
    chave: "pmp_alto",
    severidade: "atencao",
    teste: (_a, ind) => ind.pmp !== null && ind.pmp > 120,
    texto: (a, ind) => `Prazo médio de pagamento de ${Math.round(ind.pmp!)} dias (fornecedores ${brlCompacto(num(a.fornecedores) ?? 0)}) — a empresa se financia em fornecedores`,
    padraoIa: /prazo\s+m[eé]dio\s+de\s+pagamento|PMP/i,
  },
  {
    chave: "ciclo_financeiro_longo",
    severidade: "atencao",
    teste: (_a, ind) => ind.cicloFinanceiro !== null && ind.cicloFinanceiro > 90,
    texto: (_a, ind) => `Ciclo financeiro de ${Math.round(ind.cicloFinanceiro!)} dias — giro financiado com recursos próprios ou bancários`,
    padraoIa: /ciclo\s+financeiro/i,
  },
  {
    chave: "caixa_operacional_negativo",
    severidade: "alta",
    teste: (a) => num(a.dfc_caixa_operacional) !== null && (a.dfc_caixa_operacional as number) < 0,
    texto: (a) => `Fluxo de caixa operacional negativo (${brlCompacto(a.dfc_caixa_operacional as number)}, DFC)`,
    padraoIa: /caixa\s+operacional\s+negativo|fluxo\s+de\s+caixa\s+(operacional\s+)?negativo/i,
  },
];

/** Padrões que a IA emite e que o motor já cobre por regra ou pela conferência. */
const PADROES_COBERTOS_PELA_CONFERENCIA = [
  /^DRE\s+n[aã]o\s+fecha/i,
  /^Balan[cç]o\s+n[aã]o\s+fecha/i,
  /^Total\s+impresso\s+diverge/i,
  /^Extra[cç][aã]o\s+incompleta/i,
];

/**
 * Regras determinísticas + quebras da conferência ao vivo. A conferência entra
 * aqui, e não como string persistida, para que corrigir uma conta na grade
 * apague a flag na hora.
 */
export function calcularRedFlags(
  a: AnaliseFinanceira,
  ind: IndicadoresFinanceiros,
  conferencia?: ResumoConferencia | null,
): RedFlag[] {
  const out: RedFlag[] = [];
  for (const regra of REGRAS_RED_FLAG) {
    if (regra.teste(a, ind)) {
      out.push({ chave: regra.chave, severidade: regra.severidade, texto: regra.texto(a, ind), origem: "regra" });
    }
  }
  if (conferencia) {
    for (const q of conferencia.quebradas) {
      const grave = q.chave === "equilibrio_balanco" || q.bloco === "ancoras";
      out.push({
        chave: `conferencia_${q.chave}`,
        severidade: grave ? "alta" : "atencao",
        texto: `Conferência: ${q.label} não fecha (diferença ${brlCompacto(q.diff ?? 0)})`,
        origem: "conferencia",
      });
    }
  }
  return out;
}

/** Assinatura antiga — só os textos. Usada pelo PDF, pelo dossiê e pela sanidade. */
export function calcularRedFlagsLocais(a: AnaliseFinanceira, ind: IndicadoresFinanceiros): string[] {
  return calcularRedFlags(a, ind).map((f) => f.texto);
}

/**
 * Une a lista da IA (coluna `red_flags`) às regras locais, sem duplicar: toda
 * string da IA que casa com o `padraoIa` de alguma regra é descartada — a regra
 * já decidiu, com número, se a condição vale. O que sobra é observação
 * qualitativa da leitura do documento e vai com a severidade mais baixa.
 */
export function mesclarRedFlagsIa(ia: unknown, locais: RedFlag[]): RedFlag[] {
  const lista = Array.isArray(ia) ? ia.filter((f): f is string => typeof f === "string" && f.trim().length > 0) : [];
  const padroes = [
    ...REGRAS_RED_FLAG.map((r) => r.padraoIa).filter((p): p is RegExp => !!p),
    ...PADROES_COBERTOS_PELA_CONFERENCIA,
  ];
  const textosLocais = new Set(locais.map((f) => f.texto.trim().toLowerCase()));
  const daIa: RedFlag[] = [];
  const vistos = new Set<string>();
  for (const texto of lista) {
    const chave = texto.trim().toLowerCase();
    if (vistos.has(chave) || textosLocais.has(chave)) continue;
    if (padroes.some((p) => p.test(texto))) continue;
    vistos.add(chave);
    daIa.push({ chave: `ia_${daIa.length}`, severidade: "observacao_ia", texto: texto.trim(), origem: "ia" });
  }
  return [...locais, ...daIa].sort((x, y) => ORDEM_SEVERIDADE[x.severidade] - ORDEM_SEVERIDADE[y.severidade]);
}

export function contarPorSeveridade(flags: RedFlag[]): Record<SeveridadeRedFlag, number> {
  const c: Record<SeveridadeRedFlag, number> = { critica: 0, alta: 0, atencao: 0, observacao_ia: 0 };
  for (const f of flags) c[f.severidade]++;
  return c;
}
