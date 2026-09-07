// Legenda da Análise Financeira — o que a classificação, a pontuação e as cores
// querem dizer, em linguagem de quem subscreve.
//
// Fonte única para a aba e para o PDF. Existe porque "Rating E · Score G −10 ·
// nota 0/100" não se lê sozinho: sem dizer o que a letra significa e o que ela
// implica para a subscrição, o número vira enfeite — e quem recebe o relatório
// não tem como agir sobre ele.
//
// Os textos aqui descrevem as regras de `analiseFinanceiraScore.ts`. Mudou lá,
// muda aqui: o script de sanidade confere que as faixas de nota batem.

import {
  INDICADORES_CONFIG, INDICADORES_GRUPOS,
  type IndicadoresFinanceiros,
} from "./indicadores.js";
import { notaParaScore, PESO_GRUPO, PENALIDADE_FLAG, TETO_PENALIDADES, type Rating } from "./score.js";

export interface LinhaLegendaRating {
  rating: Rating;
  nome: string;
  faixaNota: string;
  significado: string;
  acaoSubscricao: string;
}

/**
 * As cinco faixas. `faixaNota` tem de espelhar `ratingDaNota()` — A ≥ 80,
 * B ≥ 65, C ≥ 50, D ≥ 35, E abaixo disso.
 */
export const LEGENDA_RATING: LinhaLegendaRating[] = [
  {
    rating: "A",
    nome: "Excelente",
    faixaNota: "80 a 100",
    significado: "Estrutura financeira sólida: paga o curto prazo com folga, é pouco dependente de dívida e gera resultado consistente.",
    acaoSubscricao: "Sem restrição pelo critério econômico-financeiro.",
  },
  {
    rating: "B",
    nome: "Bom",
    faixaNota: "65 a 79",
    significado: "Indicadores acima da média, com um ou outro ponto fora da faixa saudável.",
    acaoSubscricao: "Subscrição normal, acompanhando os pontos de atenção do parecer.",
  },
  {
    rating: "C",
    nome: "Regular",
    faixaNota: "50 a 64",
    significado: "Situação equilibrada, mas com fragilidades relevantes — em geral liquidez apertada ou endividamento alto.",
    acaoSubscricao: "Subscrição com condições: limite moderado e acompanhamento periódico.",
  },
  {
    rating: "D",
    nome: "Restrito",
    faixaNota: "35 a 49",
    significado: "Fragilidades que se somam: a empresa depende de refinanciamento ou de capital novo para seguir operando no ritmo atual.",
    acaoSubscricao: "Exige contragarantia, limite baixo, prazo curto e documentação complementar (balancete recente e relação de dívidas bancárias).",
  },
  {
    rating: "E",
    nome: "Crítico",
    faixaNota: "abaixo de 35",
    significado: "Risco de insolvência: patrimônio líquido negativo, liquidez muito baixa ou dívida sem cobertura pela geração de caixa.",
    acaoSubscricao: "Subscrição desaconselhada. Qualquer exceção exige contragarantia integral e aprovação em alçada superior.",
  },
];

const POR_RATING = new Map(LEGENDA_RATING.map((l) => [l.rating, l]));

/** A frase que acompanha a letra no painel e no PDF. */
export function explicacaoRating(rating: Rating): string {
  const l = POR_RATING.get(rating)!;
  return `${l.significado} ${l.acaoSubscricao}`;
}

export function legendaDoRating(rating: Rating): LinhaLegendaRating {
  return POR_RATING.get(rating)!;
}

export interface LinhaLegendaPontuacao {
  faixa: string;
  leitura: string;
}

/** As seis faixas, com a leitura em texto; o intervalo de nota é derivado. */
const FAIXAS_PONTUACAO: Array<{ min: number; max: number; leitura: string }> = [
  { min: 7, max: 10, leitura: "Situação financeira excelente" },
  { min: 3, max: 6, leitura: "Situação boa, indicadores acima da média" },
  { min: 0, max: 2, leitura: "Situação adequada, sem alertas relevantes" },
  { min: -3, max: -1, leitura: "Atenção: um ou dois alertas relevantes, ainda administráveis" },
  { min: -6, max: -4, leitura: "Preocupante: alertas múltiplos, análise criteriosa" },
  { min: -10, max: -7, leitura: "Crítico: problemas financeiros graves" },
];

const sinalScore = (s: number): string => (s > 0 ? `+${s}` : s < 0 ? `−${Math.abs(s)}` : "0");

/** Notas que caem numa faixa de score, segundo a conversão real (arredondada). */
function notasDaFaixa(min: number, max: number): [number, number] {
  const notas: number[] = [];
  for (let n = 0; n <= 100; n++) {
    const s = notaParaScore(n);
    if (s >= min && s <= max) notas.push(n);
  }
  return [notas[0], notas[notas.length - 1]];
}

/**
 * O ajuste de score (−10 a +10) é o que entra na metodologia de risco do
 * tomador; a nota de 0 a 100 é a mesma medida noutra escala.
 *
 * As faixas de nota são DERIVADAS de `notaParaScore()`, não escritas à mão. A
 * versão escrita à mão estava errada nas seis linhas: como o score é
 * arredondado, cada fronteira fica 2 pontos abaixo do valor "redondo" — nota 83
 * já dá +7 e nota 63 já dá +3 —, e a legenda contradizia a nota impressa ao lado
 * dela no mesmo relatório.
 */
export const LEGENDA_PONTUACAO: LinhaLegendaPontuacao[] = FAIXAS_PONTUACAO.map(({ min, max, leitura }) => {
  const [lo, hi] = notasDaFaixa(min, max);
  const faixa = max < 0 ? `${sinalScore(max)} a ${sinalScore(min)}` : `${sinalScore(min)} a ${sinalScore(max)}`;
  const nota = lo === 0 ? `nota até ${hi}` : `nota ${lo} a ${hi}`;
  return { faixa, leitura: `${leitura} (${nota}).` };
});

export const EXPLICACAO_PONTUACAO =
  "A nota de 0 a 100 e o ajuste de score de −10 a +10 são a mesma medida em escalas diferentes: " +
  "o ajuste é a nota descontada de 50 e dividida por 5. Uma empresa na média do aceitável fica em " +
  "zero; o sinal diz se ela melhora ou piora a avaliação de risco do tomador.";

export interface LinhaLegendaCor {
  cor: "verde" | "amarelo" | "vermelho" | "cinza";
  titulo: string;
  significado: string;
}

export const LEGENDA_CORES: LinhaLegendaCor[] = [
  { cor: "verde", titulo: "Saudável", significado: "O indicador está dentro da faixa considerada confortável para o setor." },
  { cor: "amarelo", titulo: "Atenção", significado: "Fora do confortável, mas ainda administrável. Merece acompanhamento." },
  { cor: "vermelho", titulo: "Crítico", significado: "Fora do aceitável. Entra na lista de sinais de alerta e reduz a nota." },
  { cor: "cinza", titulo: "Sem valor", significado: "Ou o dado não estava no documento, ou o indicador não se aplica — é o caso do retorno sobre o patrimônio quando o patrimônio líquido é negativo: a conta daria um número positivo enganoso, e por isso não é calculada." },
];

/** Como a nota é composta, em frases — reflete `calcularScore()`. */
export function composicaoNota(): string[] {
  const pesos = INDICADORES_GRUPOS
    .map((g) => `${g.label.toLowerCase()} ${PESO_GRUPO[g.key]}`)
    .join(", ");
  return [
    `A nota parte de 100 pontos distribuídos entre os grupos de indicadores (${pesos}). ` +
    "Dentro de cada grupo, um indicador saudável vale o ponto inteiro, um em atenção vale meio ponto e um crítico não pontua.",
    `Cada sinal de alerta desconta pontos: ${PENALIDADE_FLAG.critica} para os críticos e ${PENALIDADE_FLAG.alta} para os demais, ` +
    `limitados a ${TETO_PENALIDADES} pontos no total.`,
    "Duas situações limitam a nota por si só, independentemente do resto: patrimônio líquido negativo trava a classificação em E, " +
    "e liquidez corrente abaixo de 0,5 trava em D.",
    "Quando o documento é um balancete (período não encerrado), o ajuste de score não passa de +3: " +
    "os lançamentos que faltam para fechar o exercício só pioram o resultado, nunca melhoram.",
    "Se a conferência dos números acusa divergência, a pontuação é exibida mas não fica liberada para decisão — " +
    "primeiro se corrige a leitura do documento.",
  ];
}

export interface LinhaLegendaIndicador {
  grupo: string;
  label: string;
  formula: string;
  significado: string;
  faixas: string;
}

/**
 * Legenda dos indicadores que aparecem num relatório. Recebe as chaves usadas
 * para não descrever indicador que o exercício não tinha como calcular.
 */
export function legendaIndicadores(
  chavesUsadas: Set<keyof IndicadoresFinanceiros>,
): LinhaLegendaIndicador[] {
  const out: LinhaLegendaIndicador[] = [];
  for (const grupo of INDICADORES_GRUPOS) {
    for (const key of grupo.items) {
      if (!chavesUsadas.has(key)) continue;
      const cfg = INDICADORES_CONFIG[key];
      out.push({
        grupo: grupo.label,
        label: cfg.label,
        formula: cfg.description ?? "",
        significado: cfg.legend ?? "",
        faixas: cfg.referencia ?? "informativo — não tem faixa boa ou ruim por si só",
      });
    }
  }
  return out;
}
