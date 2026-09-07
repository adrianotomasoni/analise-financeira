// Extração: documento → contas.
//
// O que a IA faz aqui é UMA coisa: ler o documento e preencher campos. Tudo o
// que se calcula a partir do que ela leu é feito depois, em código:
//
//   modelo → campos brutos
//     → derivarCamposDre()   EBIT, EBITDA, resultado financeiro, não operacional
//     → classificarPeriodo() exercício encerrado x balancete
//     → resumirConferencia() identidades, âncoras impressas, cruzamentos
//     → qualidade final      rebaixada quando a conferência discorda do modelo
//
// A última linha é a que mais importa. `qualidade_extracao` vem do modelo, isto
// é, é a nota que ele dá para o próprio trabalho — e um modelo que leu o CMV
// errado e derivou o Lucro Bruto desse CMV não tem como saber que errou: para
// ele, tudo fecha. A conferência mede contra os totais impressos, que ele copiou
// mas não recalculou, e é ela que manda quando as duas discordam.

import { derivarCamposDre, checarIdentidadeLair, aplicarRedFlagResultadoFinanceiro, RED_FLAG_LAIR_PREFIXO } from "../derive.js";
import { classificarPeriodo, calcularRessalvasPeriodo, type ClassificacaoPeriodo } from "../periodo.js";
import { resumirConferencia, qualidadeSugerida, type QualidadeSugerida } from "../conferencia.js";
import { lerTotaisImpressos, type AnaliseFinanceira } from "../indicadores.js";
import { camposDoEscopo, schemaExtracao, NOME_FERRAMENTA_EXTRACAO, type EscopoExtracao } from "./schema.js";
import { promptExtracao } from "./prompts.js";
import type { DocumentoEntrada, ProvedorIA } from "./provedor.js";

export interface OpcoesExtracao {
  escopo?: EscopoExtracao;
  /** Ano de referência do exercício. Usado na classificação de período. */
  anoReferencia?: number;
  /** Rótulo do documento na origem ("balancete_2026"), se houver. */
  tipoDocumento?: string;
  /** Contexto de uso, para o papel do analista no prompt. */
  finalidade?: string;
  /** Texto já extraído, quando o provedor não aceita PDF. */
  textoDocumento?: string;
}

export interface ResultadoExtracao {
  /** As contas, prontas para `analisar()`. */
  contas: AnaliseFinanceira;
  qualidade: QualidadeSugerida;
  /** A qualidade que o próprio modelo declarou, para comparação. */
  qualidadeDeclarada: string;
  /** Alertas que só se leem no documento — os numéricos são calculados depois. */
  redFlagsDocumento: string[];
  observacoesIa: string;
  periodo: ClassificacaoPeriodo;
  ressalvasPeriodo: string[];
  modelo: string;
  custoUsd: number | null;
  tokensEntrada: number;
  tokensSaida: number;
}

const num = (v: unknown): number | null => (typeof v === "number" && !isNaN(v) ? v : null);

export async function extrairDoDocumento(
  provedor: ProvedorIA,
  documentos: DocumentoEntrada[],
  opts: OpcoesExtracao = {},
): Promise<ResultadoExtracao> {
  const escopo = opts.escopo ?? "ambos";

  if (!documentos.length && !opts.textoDocumento) {
    throw new Error("nenhum documento e nenhum texto para extrair.");
  }

  const usuario = opts.textoDocumento
    ? `Extraia os dados do documento abaixo.\n\n<documento>\n${opts.textoDocumento}\n</documento>`
    : "Extraia os dados do(s) documento(s) anexado(s).";

  const resposta = await provedor.gerarEstruturado({
    sistema: promptExtracao({ escopo, finalidade: opts.finalidade }),
    usuario,
    documentos: opts.textoDocumento ? [] : documentos,
    ferramenta: NOME_FERRAMENTA_EXTRACAO,
    schema: schemaExtracao(escopo),
    descricaoFerramenta: "Registra a leitura estruturada do Balanço Patrimonial e da DRE.",
  });

  const d = resposta.dados;

  // ── Derivações: nunca perguntadas ao modelo ──────────────────────────────
  const derivada = derivarCamposDre(d as never);

  const contas: AnaliseFinanceira = {};
  for (const campo of camposDoEscopo(escopo)) {
    (contas as Record<string, number | null>)[campo] = num(d[campo]);
  }
  contas.despesas_operacionais = derivada.despesas_operacionais;
  contas.ebit = derivada.ebit;
  contas.ebitda = derivada.ebitda;
  contas.resultado_financeiro = derivada.resultado_financeiro;
  contas.totais_impressos = lerTotaisImpressos(d.totais_impressos);

  // ── Período: decisão do código, a partir do que o modelo REPORTOU ────────
  const periodo = classificarPeriodo({
    tipo_documento: opts.tipoDocumento ?? null,
    data_fim: typeof d.data_balanco === "string" ? d.data_balanco : null,
    ano_referencia: opts.anoReferencia ?? null,
    ano_corrente: new Date().getFullYear(),
    indicios_texto: Array.isArray(d.indicios_periodo) ? (d.indicios_periodo as string[]) : null,
    meses_declarado: num(d.meses_competencia_declarado),
  });
  contas.tipo_periodo = periodo.tipo;
  contas.meses_competencia = periodo.meses_competencia;
  if (periodo.tipo === "balancete_parcial") {
    contas.resultado_periodo_nao_transferido = null; // preenchido pelo operador, se houver
  }

  // ── Alertas do documento, sem os que o motor calcula ─────────────────────
  let redFlags = aplicarRedFlagResultadoFinanceiro(
    d.red_flags, derivada.resultado_financeiro, derivada.ebit,
  );
  const lair = checarIdentidadeLair(
    num(d.lucro_antes_ir), derivada.ebit,
    derivada.resultado_financeiro, derivada.resultado_nao_operacional,
  );
  if (lair && !lair.ok) {
    redFlags = redFlags.filter((f) => !f.startsWith(RED_FLAG_LAIR_PREFIXO));
    redFlags.push(
      `${RED_FLAG_LAIR_PREFIXO} LAIR informado ${brl(num(d.lucro_antes_ir))} vs ` +
      `EBIT + resultado financeiro + não operacional ${brl(lair.esperado)} ` +
      `(diferença ${brl(lair.diff)})`,
    );
  }

  // ── Qualidade: a conferência manda ───────────────────────────────────────
  const conferencia = resumirConferencia(contas);
  const qualidade = qualidadeSugerida(
    lair && !lair.ok
      ? [...conferencia.quebradas, { chave: "lair", bloco: "dre" } as never]
      : conferencia.quebradas,
  );

  return {
    contas,
    qualidade,
    qualidadeDeclarada: typeof d.qualidade_extracao === "string" ? d.qualidade_extracao : "desconhecida",
    redFlagsDocumento: redFlags,
    observacoesIa: typeof d.observacoes_ia === "string" ? d.observacoes_ia : "",
    periodo,
    ressalvasPeriodo: periodo.tipo === "balancete_parcial"
      ? calcularRessalvasPeriodo(d, periodo.meses_competencia)
      : [],
    modelo: resposta.modelo,
    custoUsd: resposta.custoUsd,
    tokensEntrada: resposta.tokensEntrada,
    tokensSaida: resposta.tokensSaida,
  };
}

const brl = (v: number | null): string =>
  v === null ? "n/d" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
