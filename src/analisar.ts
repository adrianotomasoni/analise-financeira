// A análise completa sobre contas já lidas. SEM IA, SEM REDE.
//
// Esta é a função que importa: dadas as contas, ela é determinística. As mesmas
// contas produzem sempre os mesmos 33 indicadores, a mesma conferência, os
// mesmos alertas, a mesma nota e o mesmo resumo — hoje, daqui a um ano e na
// máquina de outra pessoa. Nada aqui depende de modelo de IA, de temperatura ou
// de fornecedor.
//
// Vale por si: quem já tem os números (de um ERP, de uma planilha, de uma
// digitação) não precisa de IA nenhuma para usar este módulo.

import {
  calcularIndicadores, motivosIndisponiveis, calcularIndicadoresAnualizados,
  type AnaliseFinanceira, type IndicadoresFinanceiros,
} from "./indicadores.js";
import { resumirConferencia, type ResumoConferencia } from "./conferencia.js";
import { calcularRedFlags, mesclarRedFlagsIa, contarPorSeveridade, type RedFlag, type SeveridadeRedFlag } from "./redflags.js";
import { calcularScore, type ScoreResultado } from "./score.js";
import { gerarSintese, sinteseComoTexto, type ParagrafoSintese } from "./sintese.js";

export interface OpcoesAnalise {
  /**
   * Alertas que só se leem no documento (ressalva do auditor, parcelamento,
   * concentração). O que casa com uma regra numérica é descartado — a regra já
   * decidiu, com número.
   */
  redFlagsDocumento?: string[];
}

export interface ResultadoAnalise {
  contas: AnaliseFinanceira;
  indicadores: IndicadoresFinanceiros;
  /** Por que cada indicador nulo é nulo: "sem dado" x "não se aplica". */
  motivos: Partial<Record<keyof IndicadoresFinanceiros, string>>;
  /** Projeção anualizada dos indicadores mistos. Só balancete, só exibição. */
  anualizados: Partial<Record<keyof IndicadoresFinanceiros, number | null>> | null;
  conferencia: ResumoConferencia;
  redFlags: RedFlag[];
  contagemFlags: Record<SeveridadeRedFlag, number>;
  score: ScoreResultado;
  sintese: ParagrafoSintese[];
  sinteseTexto: string;
}

export function analisar(contas: AnaliseFinanceira, opts: OpcoesAnalise = {}): ResultadoAnalise {
  const indicadores = calcularIndicadores(contas);
  const conferencia = resumirConferencia(contas);
  const locais = calcularRedFlags(contas, indicadores, conferencia);
  const redFlags = opts.redFlagsDocumento?.length
    ? mesclarRedFlagsIa(opts.redFlagsDocumento, locais)
    : locais;
  const score = calcularScore(contas, indicadores, redFlags, conferencia);
  const sintese = gerarSintese(contas, indicadores, redFlags, score, conferencia);

  return {
    contas,
    indicadores,
    motivos: motivosIndisponiveis(contas),
    anualizados: calcularIndicadoresAnualizados(contas),
    conferencia,
    redFlags,
    contagemFlags: contarPorSeveridade(redFlags),
    score,
    sintese,
    sinteseTexto: sinteseComoTexto(sintese),
  };
}
