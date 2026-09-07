// Conferência contábil — a parte do motor que decide se dá para confiar no que
// foi lido do documento.
//
// São três blocos, e a diferença entre eles é o que este arquivo tem de mais
// importante:
//
//   1. IDENTIDADES (9) — "Ativo = Passivo + PL", "Lucro Bruto = RL − CMV" e as
//      demais. Baratas e úteis, mas com um limite fatal: os dois lados da conta
//      vêm da MESMA leitura. Se a IA leu o CMV errado e derivou o Lucro Bruto
//      desse CMV, a identidade fecha perfeitamente sobre um número errado.
//
//   2. ÂNCORAS — o campo extraído contra a linha de TOTAL copiada literalmente do
//      documento. Esta é a única checagem INDEPENDENTE da leitura: o campo
//      estruturado é o que o modelo entendeu, o total impresso é o que o contador
//      escreveu. No caso que originou o método, a identidade do
//      Lucro Bruto fechava e a âncora acusou os R$ 340.000,00 que faltavam no CMV.
//
//   3. CRUZAMENTOS — coerência com a DFC e a DMPL, quando o documento as traz.
//      O caixa final do fluxo tem de bater com o disponível do balanço; o PL final
//      da mutação, com o PL do balanço.
//
// Tudo é recalculado sobre o estado ATUAL das contas, nunca lido de um registro
// gravado numa execução anterior. Corrigir uma conta à mão tem de mover o
// semáforo na mesma hora — foi a ausência disso que deixou passar, num sistema
// anterior, um balanço que errava em R$ 27 milhões.

import {
  lerTotaisImpressos, type AnaliseFinanceira, type ChaveTotalImpresso,
} from "./indicadores.js";

/** Balanço não admite folga: meio ponto percentual já é erro de leitura. */
export const TOL_BP = 0.005;
/** DRE tolera 1%: arredondamento de centavos em cadeias longas de subtração. */
export const TOL_DRE = 0.01;
/** Depreciação DFC × DRE: 5% — a DFC costuma somar amortizações e baixas. */
export const TOL_DEPRECIACAO = 0.05;

export type QualidadeSugerida = "alta" | "media" | "baixa";

export type BlocoConferencia = "balanco" | "dre" | "ancoras" | "cruzamentos";

export interface Identidade {
  chave: string;
  label: string;
  formula: string;
  bloco: BlocoConferencia;
  /** `false` quando faltam insumos — ausência de dado não é reprovação. */
  aplicavel: boolean;
  esperado: number | null;
  obtido: number | null;
  /** Diferença absoluta em reais. */
  diff: number | null;
  ok: boolean;
  /** Preenchido quando o balanço só fecha somando o resultado do período. */
  observacao?: string;
  /** Âncoras: o rótulo da linha como impresso no documento. */
  rotuloImpresso?: string | null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && !isNaN(v) ? v : null;
const zero = (v: unknown): number => num(v) ?? 0;

interface DefIdentidade {
  chave: string;
  label: string;
  formula: string;
  bloco: BlocoConferencia;
  /** Campos sem os quais a identidade não pode ser avaliada. */
  exige: (keyof AnaliseFinanceira)[];
  obtido: (a: AnaliseFinanceira) => number | null;
  esperado: (a: AnaliseFinanceira) => number | null;
  tolerancia: number;
  rotuloImpresso?: string | null;
  /** Âncoras com mais de uma leitura válida (ex.: resultado operacional com/sem financeiro). */
  candidatos?: (a: AnaliseFinanceira) => (number | null)[];
}

const DEFINICOES: DefIdentidade[] = [
  {
    chave: "ativo_composicao",
    label: "Ativo Total = Circulante + Não Circulante",
    formula: "AT = AC + ANC",
    bloco: "balanco", tolerancia: TOL_BP,
    exige: ["ativo_total"],
    obtido: (a) => num(a.ativo_total),
    esperado: (a) => zero(a.ativo_circulante) + zero(a.ativo_nao_circulante),
  },
  {
    chave: "equilibrio_balanco",
    label: "Ativo Total = Passivo + Patrimônio Líquido",
    formula: "AT = PC + PNC + PL",
    bloco: "balanco", tolerancia: TOL_BP,
    exige: ["ativo_total"],
    obtido: (a) => num(a.ativo_total),
    esperado: (a) =>
      zero(a.passivo_circulante) + zero(a.passivo_nao_circulante) + zero(a.patrimonio_liquido),
  },
  {
    chave: "passivo_composicao",
    label: "Passivo Total = Circulante + Não Circulante",
    formula: "PT = PC + PNC",
    bloco: "balanco", tolerancia: TOL_BP,
    exige: ["passivo_total"],
    obtido: (a) => num(a.passivo_total),
    esperado: (a) => zero(a.passivo_circulante) + zero(a.passivo_nao_circulante),
  },
  {
    chave: "consistencia_receita",
    label: "Receita Líquida = Receita Bruta − Deduções",
    formula: "RL = RB − Deduções",
    bloco: "dre", tolerancia: TOL_DRE,
    exige: ["receita_liquida", "receita_bruta"],
    obtido: (a) => num(a.receita_liquida),
    esperado: (a) => zero(a.receita_bruta) - zero(a.deducoes),
  },
  {
    chave: "lucro_bruto",
    label: "Lucro Bruto = Receita Líquida − CMV",
    formula: "LB = RL − CMV",
    bloco: "dre", tolerancia: TOL_DRE,
    exige: ["lucro_bruto", "receita_liquida"],
    obtido: (a) => num(a.lucro_bruto),
    esperado: (a) => zero(a.receita_liquida) - zero(a.cmv),
  },
  {
    chave: "consistencia_ebit",
    label: "EBIT = Lucro Bruto − Despesas Operacionais",
    formula: "EBIT = LB − Desp. Operacionais",
    bloco: "dre", tolerancia: TOL_DRE,
    exige: ["ebit", "lucro_bruto"],
    obtido: (a) => num(a.ebit),
    esperado: (a) => zero(a.lucro_bruto) - zero(a.despesas_operacionais),
  },
  {
    chave: "ebitda",
    label: "EBITDA = EBIT + Depreciação e Amortização",
    formula: "EBITDA = EBIT + D&A",
    bloco: "dre", tolerancia: TOL_DRE,
    exige: ["ebitda", "ebit", "depreciacao_amortizacao"],
    obtido: (a) => num(a.ebitda),
    esperado: (a) => zero(a.ebit) + zero(a.depreciacao_amortizacao),
  },
  {
    chave: "lucro_antes_ir",
    label: "LAIR = EBIT + Resultado Financeiro + Não Operacional",
    formula: "LAIR = EBIT + RF + RNO",
    bloco: "dre", tolerancia: TOL_DRE,
    exige: ["lucro_antes_ir", "ebit"],
    obtido: (a) => num(a.lucro_antes_ir),
    esperado: (a) =>
      zero(a.ebit) + zero(a.resultado_financeiro)
      + zero(a.receitas_nao_operacionais) - zero(a.despesas_nao_operacionais),
  },
  {
    chave: "lucro_liquido",
    label: "Lucro Líquido = LAIR − IR/CSLL",
    formula: "LL = LAIR − IR/CSLL",
    bloco: "dre", tolerancia: TOL_DRE,
    exige: ["lucro_liquido", "lucro_antes_ir"],
    obtido: (a) => num(a.lucro_liquido),
    esperado: (a) => zero(a.lucro_antes_ir) - zero(a.ir_csll),
  },
];

// ─── Âncoras: campo extraído × total impresso ────────────────────────────────

const ROTULO_ANCORA: Record<ChaveTotalImpresso, string> = {
  total_ativo_circulante: "Ativo Circulante",
  total_ativo_nao_circulante: "Ativo Não Circulante",
  total_ativo: "Ativo Total",
  total_passivo_circulante: "Passivo Circulante",
  total_passivo_nao_circulante: "Passivo Não Circulante",
  total_patrimonio_liquido: "Patrimônio Líquido",
  total_passivo_mais_pl: "Passivo + PL",
  receita_liquida: "Receita Líquida",
  lucro_bruto: "Lucro Bruto",
  resultado_operacional: "Resultado Operacional",
  resultado_antes_ir: "LAIR",
  resultado_exercicio: "Resultado do Exercício",
};

const ehBp = (c: ChaveTotalImpresso) => c.startsWith("total_");

/** O(s) valor(es) extraído(s) que devem bater com cada total impresso. */
function candidatosDaAncora(chave: ChaveTotalImpresso, a: AnaliseFinanceira): (number | null)[] {
  switch (chave) {
    case "total_ativo_circulante": return [num(a.ativo_circulante)];
    case "total_ativo_nao_circulante": return [num(a.ativo_nao_circulante)];
    case "total_ativo": return [num(a.ativo_total)];
    case "total_passivo_circulante": return [num(a.passivo_circulante)];
    case "total_passivo_nao_circulante": return [num(a.passivo_nao_circulante)];
    case "total_patrimonio_liquido": return [num(a.patrimonio_liquido)];
    case "total_passivo_mais_pl": {
      const temPassivo = num(a.passivo_total) !== null || num(a.passivo_circulante) !== null || num(a.passivo_nao_circulante) !== null;
      const pt = num(a.passivo_total) ?? (zero(a.passivo_circulante) + zero(a.passivo_nao_circulante));
      return [temPassivo ? pt + zero(a.patrimonio_liquido) : null];
    }
    case "receita_liquida": return [num(a.receita_liquida)];
    case "lucro_bruto": return [num(a.lucro_bruto)];
    case "resultado_operacional": {
      // Duas convenções brasileiras: com o financeiro embutido (a mais comum
      // em DRE de escritório) ou sem. Aceita a que bater.
      const ebit = num(a.ebit);
      return [ebit !== null ? ebit + zero(a.resultado_financeiro) : null, ebit];
    }
    case "resultado_antes_ir": return [num(a.lucro_antes_ir)];
    case "resultado_exercicio": return [num(a.lucro_liquido)];
  }
}

function definicoesAncoras(a: AnaliseFinanceira): DefIdentidade[] {
  return lerTotaisImpressos(a.totais_impressos).map((t) => ({
    chave: `ancora_${t.chave}`,
    label: `${ROTULO_ANCORA[t.chave]} confere com o total impresso${t.rotulo_original ? ` "${t.rotulo_original}"` : ""}`,
    formula: `${ROTULO_ANCORA[t.chave]} lido = total impresso no documento`,
    bloco: "ancoras" as const,
    tolerancia: ehBp(t.chave) ? TOL_BP : TOL_DRE,
    exige: [],
    obtido: (x) => {
      // O candidato mais próximo do impresso; null quando nenhum foi extraído.
      const presentes = candidatosDaAncora(t.chave, x).filter((c): c is number => c !== null);
      if (presentes.length === 0) return null;
      return presentes.reduce((m, c) => (Math.abs(c - t.valor) < Math.abs(m - t.valor) ? c : m), presentes[0]);
    },
    esperado: () => t.valor,
    rotuloImpresso: t.rotulo_original ?? null,
  }));
}

// ─── Cruzamentos com DMPL e DFC ─────────────────────────────────────────────

const CRUZAMENTOS: DefIdentidade[] = [
  {
    chave: "dmpl_resultado",
    label: "Resultado do exercício confere com a mutação do patrimônio",
    formula: "LL = DMPL resultado",
    bloco: "cruzamentos", tolerancia: TOL_DRE,
    exige: ["dmpl_resultado_exercicio", "lucro_liquido"],
    obtido: (a) => num(a.dmpl_resultado_exercicio),
    esperado: (a) => num(a.lucro_liquido),
  },
  {
    chave: "dmpl_pl_final",
    label: "Patrimônio líquido confere com o saldo final da mutação",
    formula: "PL = DMPL PL final",
    bloco: "cruzamentos", tolerancia: TOL_BP,
    exige: ["dmpl_pl_final", "patrimonio_liquido"],
    obtido: (a) => num(a.dmpl_pl_final),
    esperado: (a) => num(a.patrimonio_liquido),
  },
  {
    chave: "dfc_caixa_final",
    label: "Caixa confere com o saldo final do fluxo de caixa",
    formula: "Caixa = DFC caixa final",
    bloco: "cruzamentos", tolerancia: TOL_BP,
    exige: ["dfc_caixa_final", "caixa_equivalentes"],
    obtido: (a) => num(a.dfc_caixa_final),
    esperado: (a) => num(a.caixa_equivalentes),
  },
  {
    chave: "dfc_depreciacao",
    label: "Depreciação da demonstração de resultado confere com a do fluxo de caixa",
    formula: "Depreciação: resultado vs. fluxo de caixa (tolerância 5%)",
    bloco: "cruzamentos", tolerancia: TOL_DEPRECIACAO,
    exige: ["dfc_depreciacao", "depreciacao_amortizacao"],
    obtido: (a) => num(a.dfc_depreciacao),
    esperado: (a) => num(a.depreciacao_amortizacao),
  },
];

function avaliar(def: DefIdentidade, a: AnaliseFinanceira): Identidade {
  const base = {
    chave: def.chave, label: def.label, formula: def.formula, bloco: def.bloco,
    rotuloImpresso: def.rotuloImpresso ?? undefined,
  };
  const aplicavel = def.exige.every((c) => num(a[c]) !== null);
  if (!aplicavel) {
    return { ...base, aplicavel: false, esperado: null, obtido: null, diff: null, ok: true };
  }

  const obtido = def.obtido(a);
  const esperado = def.esperado(a);
  // Âncora sem campo extraído para comparar não é reprovação.
  if (def.bloco === "ancoras" && obtido === null) {
    return { ...base, aplicavel: false, esperado, obtido: null, diff: null, ok: true };
  }
  const diff = Math.abs((obtido ?? 0) - (esperado ?? 0));
  // Âncoras e cruzamentos medem contra o valor de referência externo (o
  // impresso / o da DMPL-DFC); identidades, contra o total obtido.
  const referencia = Math.max(Math.abs(def.bloco === "balanco" || def.bloco === "dre" ? (obtido ?? 0) : (esperado ?? 0)), 1);
  const tol = def.tolerancia;
  let ok = diff / referencia <= tol;
  let observacao: string | undefined;

  // Num balancete o resultado do período em geral ainda não foi transferido ao
  // PL, e a identidade do balanço não fecha por natureza — erra exatamente pelo
  // valor do resultado acumulado. Reprovar isso trocaria um falso positivo por
  // um falso negativo.
  if (!ok && def.chave === "equilibrio_balanco") {
    const comResultado = (esperado ?? 0) + zero(a.lucro_liquido);
    if (zero(a.lucro_liquido) !== 0
      && Math.abs((obtido ?? 0) - comResultado) / referencia <= tol) {
      ok = true;
      observacao = "fecha somando o resultado do período, ainda não transferido ao PL";
    }
  }

  return { ...base, aplicavel: true, esperado, obtido, diff, ok, observacao };
}

/**
 * As nove identidades, mais as âncoras impressas e os cruzamentos DMPL/DFC
 * que o registro permitir, avaliadas sobre o estado atual da tela.
 */
export function conferirIdentidades(a: AnaliseFinanceira): Identidade[] {
  return [
    ...DEFINICOES.map((d) => avaliar(d, a)),
    ...definicoesAncoras(a).map((d) => avaliar(d, a)),
    ...CRUZAMENTOS.map((d) => avaliar(d, a)),
  ];
}

export interface ResumoConferencia {
  identidades: Identidade[];
  quebradas: Identidade[];
  /** `true` quando a identidade do balanço está quebrada. Trava o Concluir. */
  balancoQuebrado: boolean;
  /** `true` quando algum total impresso diverge do extraído. Bloqueia o score. */
  ancoraQuebrada: boolean;
  avaliadas: number;
  /** A qualidade que a conferência sugere — o gate da extração usa a mesma regra. */
  qualidadeSugerida: QualidadeSugerida;
}

/** Quebras internas do DRE e a depreciação da DFC valem `media`; o resto, `baixa`. */
const QUEBRA_MEDIA = new Set(["consistencia_receita", "lucro_bruto", "consistencia_ebit", "ebitda", "dfc_depreciacao"]);

export function qualidadeSugerida(quebradas: Identidade[]): QualidadeSugerida {
  if (quebradas.length === 0) return "alta";
  return quebradas.every((q) => QUEBRA_MEDIA.has(q.chave)) ? "media" : "baixa";
}

export function resumirConferencia(a: AnaliseFinanceira): ResumoConferencia {
  const identidades = conferirIdentidades(a);
  const quebradas = identidades.filter((i) => i.aplicavel && !i.ok);
  return {
    identidades,
    quebradas,
    balancoQuebrado: quebradas.some((i) => i.chave === "equilibrio_balanco"),
    ancoraQuebrada: quebradas.some((i) => i.bloco === "ancoras"),
    avaliadas: identidades.filter((i) => i.aplicavel).length,
    qualidadeSugerida: qualidadeSugerida(quebradas),
  };
}

/**
 * Traduz a conferência para o formato de `validacoes` que o banco persiste —
 * as três chaves que a edge function também grava. Usado ao salvar, para que o
 * jsonb passe a refletir o valor CORRIGIDO e não o da última extração.
 */
export function validacoesPersistiveis(a: AnaliseFinanceira): Record<string, unknown> {
  const porChave = new Map(conferirIdentidades(a).map((i) => [i.chave, i]));
  const out: Record<string, unknown> = {};

  const eq = porChave.get("equilibrio_balanco");
  if (eq?.aplicavel) {
    out.equilibrio_balanco = {
      ativo: eq.obtido, passivo_pl: eq.esperado, diff: eq.diff, ok: eq.ok,
      metodo: eq.observacao ? "com_resultado_periodo" : "direto",
      ...(eq.observacao ? { resultado_periodo_nao_transferido: a.lucro_liquido ?? null } : {}),
    };
  }
  const rec = porChave.get("consistencia_receita");
  if (rec?.aplicavel) out.consistencia_receita = { ok: rec.ok, diff: rec.diff };
  const ebit = porChave.get("consistencia_ebit");
  if (ebit?.aplicavel) out.consistencia_ebit = { ok: ebit.ok, diff: ebit.diff };

  const todas = conferirIdentidades(a);
  const ancoras: Record<string, unknown> = {};
  for (const i of todas) {
    if (i.bloco !== "ancoras" || !i.aplicavel) continue;
    ancoras[i.chave.replace(/^ancora_/, "")] = {
      ok: i.ok, diff: i.diff, impresso: i.esperado, extraido: i.obtido, rotulo: i.rotuloImpresso ?? null,
    };
  }
  if (Object.keys(ancoras).length > 0) out.ancoras = ancoras;
  const cruzamentos: Record<string, unknown> = {};
  for (const i of todas) {
    if (i.bloco !== "cruzamentos" || !i.aplicavel) continue;
    cruzamentos[i.chave] = { ok: i.ok, diff: i.diff, esperado: i.esperado, obtido: i.obtido };
  }
  if (Object.keys(cruzamentos).length > 0) out.cruzamentos = cruzamentos;
  out.qualidade_sugerida = qualidadeSugerida(todas.filter((i) => i.aplicavel && !i.ok));

  return out;
}
