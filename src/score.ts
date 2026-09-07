// Score determinístico, com memória de cálculo.
//
// Regra de ouro do módulo: A IA NÃO DÁ NOTA. Ela lê o documento; a nota sai de
// código, dos semáforos dos indicadores ponderados por grupo, menos penalidades
// por sinal de alerta, com dois tetos que nenhum outro indicador compensa.
//
// O motivo é empírico. Quando a nota vinha do modelo na mesma chamada da
// extração, uma empresa com patrimônio líquido de −R$ 63,6 milhões, liquidez
// corrente de 0,21 e prejuízo de R$ 19,6 milhões recebeu −10, e outra com PL de
// R$ 493 mil sustentando R$ 35,8 milhões de passivo recebeu +3. O segundo número
// é defensável ou não? Não havia como saber: não existia memória de cálculo, e
// ninguém que subscreve um risco pode assinar embaixo de um número que não sabe
// explicar. Cada linha de `memoria` aqui diz o que pontuou, quanto e por quê.

import {
  INDICADORES_CONFIG, INDICADORES_GRUPOS, classifyHealthFromRating, ehBalanceteParcial,
  getIndicadorStatus, motivoEhDesfavoravel, motivosIndisponiveis, calcularPlAjustado,
  type AnaliseFinanceira, type GrupoIndicador, type IndicadoresFinanceiros, type SaudeFinanceira,
} from "./indicadores.js";
import type { RedFlag } from "./redflags.js";
import type { ResumoConferencia } from "./conferencia.js";

export type Rating = "A" | "B" | "C" | "D" | "E";

export const ROTULO_RATING: Record<Rating, string> = {
  A: "Excelente", B: "Bom", C: "Regular", D: "Restrito", E: "Crítico",
};

/** Peso de cada grupo na nota 0–100. Soma 100. */
export const PESO_GRUPO: Record<GrupoIndicador, number> = {
  liquidez: 20,
  endividamento: 25,
  rentabilidade: 20,
  cobertura: 20,
  ciclo: 10,
  solvencia: 5,
};

export const PENALIDADE_FLAG = { critica: 15, alta: 5, atencao: 0 } as const;
export const TETO_PENALIDADES = 40;
/** Teto de score para balancete (regra existente: melhora aparente não sobe muito). */
export const TETO_SCORE_BALANCETE = 3;

export interface LinhaMemoria {
  tipo: "grupo" | "penalidade" | "teto" | "bloqueio";
  label: string;
  detalhe: string;
  /** Contribuição na nota 0–100 (positiva para grupo, negativa para penalidade). */
  pontos: number;
}

export interface ScoreResultado {
  /** 0–100. */
  nota: number;
  /** −10..+10, o `score_ajuste_g` persistido. */
  score: number;
  rating: Rating;
  saude: SaudeFinanceira;
  memoria: LinhaMemoria[];
  /** `false` quando a extração não permite confiar no número. */
  liberado: boolean;
  motivoBloqueio?: string;
}

const PONTO_STATUS = { green: 1, yellow: 0.5, red: 0 } as const;

export function ratingDaNota(nota: number): Rating {
  if (nota >= 80) return "A";
  if (nota >= 65) return "B";
  if (nota >= 50) return "C";
  if (nota >= 35) return "D";
  return "E";
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Nota de 0 a 100 → ajuste de score de −10 a +10. Fonte única da conversão: a
 * legenda deriva as faixas daqui em vez de repeti-las à mão, porque o
 * arredondamento move cada fronteira 2 pontos para baixo (nota 83 já dá +7, não
 * 85) e uma tabela escrita na mão sai errada.
 */
export const notaParaScore = (nota: number): number => clamp(Math.round((nota - 50) / 5), -10, 10);

export function calcularScore(
  a: AnaliseFinanceira,
  ind: IndicadoresFinanceiros,
  flags: RedFlag[],
  conferencia?: ResumoConferencia | null,
): ScoreResultado {
  const memoria: LinhaMemoria[] = [];
  const motivos = motivosIndisponiveis(a);
  const plNegativo = a.patrimonio_liquido != null && calcularPlAjustado(a) <= 0;

  // ── 1. Semáforos por grupo ──────────────────────────────────────────────────
  let somaPesos = 0;
  let somaPontos = 0;
  for (const grupo of INDICADORES_GRUPOS) {
    let n = 0;
    let pontosGrupo = 0;
    const partes: string[] = [];
    for (const key of grupo.items) {
      const cfg = INDICADORES_CONFIG[key];
      const valor = ind[key];
      const status = getIndicadorStatus(key, valor);
      if (status === "green" || status === "yellow" || status === "red") {
        n++;
        pontosGrupo += PONTO_STATUS[status];
        partes.push(`${cfg.label} ${status === "green" ? "verde" : status === "yellow" ? "amarelo" : "vermelho"}`);
        continue;
      }
      // Não calculado por PL ≤ 0 ou EBITDA ≤ 0 conta como o pior caso: não é
      // ausência de dado, é a pior versão do dado.
      const motivo = motivos[key];
      if (valor === null && motivoEhDesfavoravel(motivo)) {
        n++;
        partes.push(`${cfg.label} não se aplica (${motivo}) = vermelho`);
      }
    }
    if (n === 0) {
      memoria.push({ tipo: "grupo", label: grupo.label, detalhe: "sem indicadores calculáveis — peso redistribuído", pontos: 0 });
      continue;
    }
    const peso = PESO_GRUPO[grupo.key];
    const fracao = pontosGrupo / n;
    somaPesos += peso;
    somaPontos += fracao * peso;
    memoria.push({
      tipo: "grupo",
      label: grupo.label,
      detalhe: `${partes.join(" · ")} → ${(fracao * 100).toFixed(0)}% de ${peso} pts`,
      pontos: Math.round(fracao * peso * 10) / 10,
    });
  }
  let nota = somaPesos > 0 ? (somaPontos / somaPesos) * 100 : 50;

  // ── 2. Penalidades por red flag (só regras e conferência) ───────────────────
  let penalidade = 0;
  for (const f of flags) {
    if (f.origem === "ia") continue;
    const p = f.severidade === "critica" ? PENALIDADE_FLAG.critica
      : f.severidade === "alta" ? PENALIDADE_FLAG.alta : PENALIDADE_FLAG.atencao;
    if (p === 0) continue;
    penalidade += p;
    memoria.push({ tipo: "penalidade", label: f.severidade === "critica" ? "Red flag crítica" : "Red flag", detalhe: f.texto, pontos: -p });
  }
  if (penalidade > TETO_PENALIDADES) {
    memoria.push({ tipo: "teto", label: "Teto de penalidades", detalhe: `${penalidade} pts de penalidade limitados a ${TETO_PENALIDADES}`, pontos: penalidade - TETO_PENALIDADES });
    penalidade = TETO_PENALIDADES;
  }
  nota = clamp(nota - penalidade, 0, 100);

  // ── 3. Tetos que nenhum indicador compensa ──────────────────────────────────
  // A linha de memória entra mesmo quando as penalidades já levaram a nota
  // abaixo do teto: quem lê precisa saber que o rating NÃO subiria por mais
  // que os outros indicadores melhorassem.
  if (plNegativo) {
    memoria.push({ tipo: "teto", label: "PL negativo", detalhe: "rating limitado a E", pontos: Math.min(0, 20 - nota) });
    nota = Math.min(nota, 20);
  } else if (ind.liquidezCorrente !== null && ind.liquidezCorrente < 0.5) {
    memoria.push({ tipo: "teto", label: "Liquidez corrente abaixo de 0,5", detalhe: "rating limitado a D", pontos: Math.min(0, 45 - nota) });
    nota = Math.min(nota, 45);
  }
  nota = Math.round(nota);

  const rating = ratingDaNota(nota);
  let score = notaParaScore(nota);
  if (ehBalanceteParcial(a) && score > TETO_SCORE_BALANCETE) {
    memoria.push({ tipo: "teto", label: "Balancete", detalhe: `score limitado a +${TETO_SCORE_BALANCETE} em demonstração não encerrada`, pontos: 0 });
    score = TETO_SCORE_BALANCETE;
  }

  // ── 4. Liberação: só vale com a extração conferida ──────────────────────────
  let liberado = true;
  let motivoBloqueio: string | undefined;
  if (conferencia) {
    const ancoraQuebrada = conferencia.quebradas.some((q) => q.bloco === "ancoras");
    if (conferencia.balancoQuebrado) {
      liberado = false;
      motivoBloqueio = "O balanço não fecha — confira a extração antes de usar o score.";
    } else if (ancoraQuebrada) {
      liberado = false;
      motivoBloqueio = "Um total impresso no documento diverge do valor extraído — confira a extração antes de usar o score.";
    }
    if (!liberado) memoria.push({ tipo: "bloqueio", label: "Score não liberado", detalhe: motivoBloqueio!, pontos: 0 });
  }

  return { nota, score, rating, saude: classifyHealthFromRating(rating), memoria, liberado, motivoBloqueio };
}
