// Síntese determinística da Análise Financeira.
//
// Frases montadas em código a partir dos indicadores, com os números dentro.
// Não substitui o parecer da IA (que lê contexto); garante que SEMPRE exista
// um texto coerente com os números da tela — inclusive enquanto o analista
// edita uma conta e o parecer da IA ainda descreve o valor antigo.

import {
  brlCompacto, calcularDividaFinanceiraBruta, calcularPlAjustado,
  type AnaliseFinanceira, type IndicadoresFinanceiros,
} from "./indicadores.js";
import type { RedFlag } from "./redflags.js";
import { ROTULO_RATING, type ScoreResultado } from "./score.js";
import type { ResumoConferencia } from "./conferencia.js";

const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
const x2 = (v: number) => `${v.toFixed(2).replace(".", ",")}x`;
const n2 = (v: number) => v.toFixed(2).replace(".", ",");
const dias = (v: number) => `${Math.round(v)} dias`;

export interface ParagrafoSintese {
  titulo: string;
  texto: string;
}

export function gerarSintese(
  a: AnaliseFinanceira,
  ind: IndicadoresFinanceiros,
  flags: RedFlag[],
  score: ScoreResultado,
  conferencia?: ResumoConferencia | null,
): ParagrafoSintese[] {
  const out: ParagrafoSintese[] = [];
  const pl = calcularPlAjustado(a);
  const temPl = a.patrimonio_liquido != null;
  const at = a.ativo_total ?? null;
  const pt = (a.passivo_circulante ?? 0) + (a.passivo_nao_circulante ?? 0);

  // ── Estrutura patrimonial ───────────────────────────────────────────────────
  {
    const partes: string[] = [];
    if (at != null) partes.push(`Ativo total de ${brlCompacto(at)}`);
    if (temPl) {
      partes.push(pl < 0
        ? `patrimônio líquido negativo de ${brlCompacto(pl)} (passivo a descoberto)`
        : `patrimônio líquido de ${brlCompacto(pl)}`);
    }
    if (ind.endividamentoTotal !== null) {
      partes.push(`endividamento geral de ${pct(ind.endividamentoTotal)}${ind.endividamentoTotal > 1 ? " — o passivo supera o ativo" : ""}`);
    }
    if (a.capital_social_bp != null && temPl && pl < a.capital_social_bp) {
      partes.push(`capital social de ${brlCompacto(a.capital_social_bp)} ${pl < 0 ? "integralmente consumido" : "parcialmente consumido"} por prejuízos`);
    }
    if (a.partes_relacionadas_passivo || a.partes_relacionadas_ativo) {
      partes.push(`partes relacionadas com ${brlCompacto(a.partes_relacionadas_ativo ?? 0)} no ativo e ${brlCompacto(a.partes_relacionadas_passivo ?? 0)} no passivo`);
    }
    if (partes.length) out.push({ titulo: "Estrutura patrimonial", texto: capitalizar(partes.join("; ")) + "." });
  }

  // ── Liquidez e giro ─────────────────────────────────────────────────────────
  {
    const partes: string[] = [];
    if (ind.liquidezCorrente !== null) {
      partes.push(`Liquidez corrente de ${n2(ind.liquidezCorrente)}${ind.liquidezImediata !== null ? ` e imediata de ${n2(ind.liquidezImediata)}` : ""}`);
    }
    if (ind.capitalGiroLiquido !== null) {
      partes.push(ind.capitalGiroLiquido < 0
        ? `capital de giro negativo em ${brlCompacto(-ind.capitalGiroLiquido)}`
        : `capital de giro positivo de ${brlCompacto(ind.capitalGiroLiquido)}`);
    }
    if (ind.pmr !== null && ind.pmp !== null) {
      partes.push(`recebe em ${dias(ind.pmr)} e paga fornecedores em ${dias(ind.pmp)}${ind.pmp > 120 ? ` — prazo típico de atraso: fornecedores de ${brlCompacto(a.fornecedores ?? 0)} financiam a operação` : ""}`);
    } else if (ind.pmr !== null) {
      partes.push(`prazo médio de recebimento de ${dias(ind.pmr)}`);
    }
    if (ind.saldoTesouraria !== null && ind.saldoTesouraria < 0) {
      partes.push(`saldo de tesouraria negativo (${brlCompacto(ind.saldoTesouraria)}), o giro depende de dívida de curto prazo`);
    }
    if (partes.length) out.push({ titulo: "Liquidez e capital de giro", texto: capitalizar(partes.join("; ")) + "." });
  }

  // ── Endividamento e cobertura ───────────────────────────────────────────────
  {
    const partes: string[] = [];
    const divida = calcularDividaFinanceiraBruta(a);
    if (divida !== null) {
      partes.push(`Dívida bancária bruta de ${brlCompacto(divida)}${ind.dividaLiquida !== null ? ` (líquida ${brlCompacto(ind.dividaLiquida)})` : ""}`);
    } else if (pt > 0) {
      partes.push(`Passivo exigível de ${brlCompacto(pt)} (empréstimos não destacados na extração)`);
    }
    if (ind.dividaLiquidaEbitda !== null) {
      partes.push(`equivalente a ${x2(ind.dividaLiquidaEbitda)} o EBITDA`);
    } else if (a.ebitda != null && a.ebitda <= 0) {
      partes.push(`EBITDA negativo — nenhuma cobertura operacional para a dívida`);
    }
    if (ind.coberturaJuros !== null) {
      partes.push(ind.coberturaJuros <= 0
        ? `cobertura de juros negativa (${x2(ind.coberturaJuros)}): o resultado operacional não paga os juros`
        : `cobertura de juros de ${x2(ind.coberturaJuros)} pelo EBIT${ind.coberturaJurosEbitda !== null ? ` e ${x2(ind.coberturaJurosEbitda)} pelo EBITDA` : ""}`);
    }
    if (a.despesas_financeiras != null && a.receita_liquida) {
      partes.push(`despesas financeiras consomem ${pct(a.despesas_financeiras / a.receita_liquida)} da receita líquida`);
    }
    if (partes.length) out.push({ titulo: "Endividamento e cobertura", texto: capitalizar(partes.join("; ")) + "." });
  }

  // ── Resultado e geração de caixa ────────────────────────────────────────────
  {
    const partes: string[] = [];
    if (a.receita_liquida != null) partes.push(`Receita líquida de ${brlCompacto(a.receita_liquida)}`);
    if (ind.margemBruta !== null) partes.push(`margem bruta de ${pct(ind.margemBruta)}`);
    if (ind.margemEbitda !== null) partes.push(`margem EBITDA de ${pct(ind.margemEbitda)}`);
    if (a.lucro_liquido != null) {
      partes.push(a.lucro_liquido < 0
        ? `prejuízo de ${brlCompacto(a.lucro_liquido)}${ind.margemLiquida !== null ? ` (${pct(ind.margemLiquida)} da receita)` : ""}`
        : `lucro líquido de ${brlCompacto(a.lucro_liquido)}${ind.margemLiquida !== null ? ` (${pct(ind.margemLiquida)})` : ""}`);
    }
    if (a.dfc_caixa_operacional != null) {
      const fco = a.dfc_caixa_operacional;
      partes.push(fco < 0
        ? `a operação consumiu ${brlCompacto(-fco)} de caixa (DFC)`
        : `a operação gerou ${brlCompacto(fco)} de caixa (DFC)${a.ebitda != null && fco > 2 * Math.max(a.ebitda, 0) ? ", muito acima do EBITDA — o caixa veio de alongar fornecedores e contas a pagar, não de resultado" : ""}`);
    }
    if (a.dfc_dividendos_pagos != null && a.dfc_dividendos_pagos > 0) {
      partes.push(`foram pagos ${brlCompacto(a.dfc_dividendos_pagos)} em lucros/dividendos${(a.lucro_liquido ?? 0) < 0 ? " apesar do prejuízo" : ""}`);
    }
    if (partes.length) out.push({ titulo: "Resultado e geração de caixa", texto: capitalizar(partes.join("; ")) + "." });
  }

  // ── Qualidade da informação ─────────────────────────────────────────────────
  if (conferencia) {
    const quebradas = conferencia.quebradas;
    if (quebradas.length === 0) {
      out.push({
        titulo: "Qualidade da informação",
        texto: `${conferencia.avaliadas} verificações feitas sobre os números do documento e todas fecham${a.dmpl_pl_final != null || a.dfc_caixa_final != null ? ", inclusive a coerência com o fluxo de caixa e a mutação do patrimônio" : ""}.`,
      });
    } else {
      out.push({
        titulo: "Qualidade da informação",
        texto: `${quebradas.length} de ${conferencia.avaliadas} verificações não fecham: ${quebradas.map((q) => `${q.label} (diferença ${brlCompacto(q.diff ?? 0)})`).join("; ")}. Os índices afetados devem ser lidos com reserva até a correção.`,
      });
    }
  }

  // ── Conclusão ───────────────────────────────────────────────────────────────
  {
    const criticas = flags.filter((f) => f.severidade === "critica").length;
    const altas = flags.filter((f) => f.severidade === "alta").length;
    const rotulo = ROTULO_RATING[score.rating];
    let recomendacao: string;
    switch (score.rating) {
      case "A": recomendacao = "Perfil compatível com subscrição em condições normais."; break;
      case "B": recomendacao = "Perfil compatível com subscrição; acompanhar os pontos de atenção."; break;
      case "C": recomendacao = "Subscrição possível com condições: limite reduzido, contragarantias e acompanhamento periódico."; break;
      case "D": recomendacao = "Subscrição restrita: exigir contragarantias reais, limites baixos e documentação complementar (balancete recente, endividamento bancário)."; break;
      default: recomendacao = "Subscrição desaconselhada nas condições atuais; qualquer exceção exige contragarantia integral e aprovação em alçada superior."; break;
    }
    const alertas = criticas + altas > 0
      ? ` ${criticas} alerta(s) crítico(s) e ${altas} alerta(s) relevante(s).`
      : " Sem alertas críticos.";
    out.push({
      titulo: "Conclusão",
      texto: `Rating ${score.rating} (${rotulo}), score G ${score.score > 0 ? "+" : ""}${score.score}, nota ${score.nota}/100.${alertas} ${recomendacao}${score.liberado ? "" : ` Score não liberado: ${score.motivoBloqueio}`}`,
    });
  }

  return out;
}

/** Texto corrido, para campos de uma linha só (histórico, dossiê). */
export function sinteseComoTexto(paragrafos: ParagrafoSintese[]): string {
  return paragrafos.map((p) => `${p.titulo}: ${p.texto}`).join("\n");
}

function capitalizar(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
