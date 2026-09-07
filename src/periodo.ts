// Classificação do período contábil: exercício encerrado x balancete parcial.
//
// TS puro (sem APIs Deno/DOM) — importado pela edge function, pelo worker de
// reprocesso e pelo script de sanidade.
//
// REGRA DE OURO: a decisão é do CÓDIGO, nunca do modelo. A IA reporta indícios
// (`indicios_periodo`, `meses_competencia_declarado`) e nada mais. Um balancete
// classificado como exercício encerrado vira decisão de subscrição sobre
// demonstração não encerrada; o erro inverso custa um selo indevido na tela.
// A assimetria é essa, e é o que resolve todo conflito para `balancete_parcial`.
//
// EXCEÇÃO DELIBERADA: um balancete com
// data de corte em 31/12 e 12 meses de competência é um balancete de
// encerramento — cobre o exercício inteiro e é comparável a um BP/DRE assinado.
// A base tem 181 documentos `balancete_2025` nessa situação; classificá-los como
// parciais os privaria da coluna de variação % no comparativo sem nenhum ganho,
// já que o fator de anualização seria 12/12 = 1. Os 5 casos reais de balancete
// parcial têm corte fora de 31/12, então a exceção não afrouxa nenhum deles.
// O conflito fica registrado em `validacoes.classificacao_periodo` para auditoria.

export type TipoPeriodo = "exercicio_fechado" | "balancete_parcial";

export interface SinaisPeriodo {
  /** `tipo_documento_origem` da chamada, ou o `tipo_documento` do arquivo. */
  tipo_documento?: string | null;
  /** Data de corte do período (espelha `data_balanco`). */
  data_fim?: string | null;
  ano_referencia?: number | null;
  /** Ano corrente — injetado para manter a função pura e testável. */
  ano_corrente?: number | null;
  /** Trechos de cabeçalho extraídos do PDF, reportados pela IA. */
  indicios_texto?: string[] | null;
  /** `meses_competencia_declarado` da IA. Serve de insumo, não de decisão. */
  meses_declarado?: number | null;
}

export interface ClassificacaoPeriodo {
  tipo: TipoPeriodo;
  meses_competencia: number | null;
  data_inicio_periodo: string | null;
  data_fim_periodo: string | null;
  /** Qual regra decidiu. Gravado em `validacoes.classificacao_periodo`. */
  regra: string;
  /** Todos os sinais que dispararam, inclusive os vencidos pela exceção. */
  indicios: string[];
}

/** Cabeçalhos que denunciam balancete no texto do PDF. */
const PADROES_TEXTO = [
  /\bbalancete\s+de\s+verifica[çc][ãa]o\b/i,
  /\bbalancete\s+anal[íi]tico\b/i,
  /\bbalancete\b/i,
  /\bacumulado\s+at[ée]\b/i,
  /\bper[íi]odo\s+de\s+.{1,24}\s+a\s+/i,
];

function parseData(d?: string | null): { ano: number; mes: number; dia: number } | null {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d.trim());
  if (!m) return null;
  const ano = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { ano, mes, dia };
}

const ehFimDeExercicio = (p: { mes: number; dia: number }) => p.mes === 12 && p.dia === 31;

/**
 * Meses de competência a partir da data de corte, assumindo início do exercício
 * em 1º de janeiro — que é a regra no Brasil e o que os 5 casos reais seguem.
 * O valor declarado pela IA só é aceito quando não há data de corte para inferir.
 */
function inferirMeses(fim: { mes: number } | null, declarado?: number | null): number | null {
  if (fim) return fim.mes;
  if (typeof declarado === "number" && declarado >= 1 && declarado <= 12) {
    return Math.round(declarado);
  }
  return null;
}

export function classificarPeriodo(sinais: SinaisPeriodo): ClassificacaoPeriodo {
  const indicios: string[] = [];
  const fim = parseData(sinais.data_fim);
  const tipoDoc = (sinais.tipo_documento || "").toLowerCase();
  const meses = inferirMeses(fim, sinais.meses_declarado);

  const rotuloBalancete = tipoDoc.includes("balancete");
  if (rotuloBalancete) indicios.push(`tipo_documento contém "balancete": ${sinais.tipo_documento}`);

  const corteForaDeDezembro = !!fim && !ehFimDeExercicio(fim);
  if (corteForaDeDezembro) indicios.push(`data de corte fora de 31/12: ${sinais.data_fim}`);

  const anoCorrente = sinais.ano_corrente ?? null;
  const emCurso = !!fim && anoCorrente !== null
    && sinais.ano_referencia === anoCorrente && !ehFimDeExercicio(fim);
  if (emCurso) indicios.push(`exercício em curso: ano de referência ${sinais.ano_referencia} ainda não encerrado`);

  const textoBatido = (sinais.indicios_texto || [])
    .filter((t) => typeof t === "string" && PADROES_TEXTO.some((re) => re.test(t)));
  for (const t of textoBatido) indicios.push(`cabeçalho do PDF: "${t.slice(0, 80)}"`);

  const algumSinal = rotuloBalancete || corteForaDeDezembro || emCurso || textoBatido.length > 0;

  // Exceção do balancete de encerramento — ver o cabeçalho deste arquivo.
  if (algumSinal && fim && ehFimDeExercicio(fim) && meses === 12) {
    return {
      tipo: "exercicio_fechado",
      meses_competencia: 12,
      data_inicio_periodo: `${fim.ano}-01-01`,
      data_fim_periodo: sinais.data_fim ?? null,
      regra: "balancete_de_encerramento_31_12",
      indicios,
    };
  }

  if (algumSinal) {
    const regra = corteForaDeDezembro ? "data_de_corte_fora_de_31_12"
      : rotuloBalancete ? "rotulo_tipo_documento"
      : emCurso ? "exercicio_em_curso"
      : "cabecalho_do_pdf";
    return {
      tipo: "balancete_parcial",
      meses_competencia: meses,
      data_inicio_periodo: fim ? `${fim.ano}-01-01` : null,
      data_fim_periodo: sinais.data_fim ?? null,
      regra,
      indicios,
    };
  }

  return {
    tipo: "exercicio_fechado",
    meses_competencia: fim ? 12 : (meses ?? null),
    data_inicio_periodo: fim ? `${fim.ano}-01-01` : null,
    data_fim_periodo: sinais.data_fim ?? null,
    regra: "nenhum_sinal_de_balancete",
    indicios,
  };
}

/**
 * Ressalvas de natureza do documento. NÃO são red flags: red flag é risco de
 * crédito, ressalva é o que o balancete ainda não contém. Misturar as duas
 * listas envenena o score.
 */
export function calcularRessalvasPeriodo(
  d: Record<string, unknown>,
  meses: number | null,
  depreciacaoExercicioAnterior?: number | null,
): string[] {
  const r: string[] = [];
  const n = (v: unknown): number | null => (typeof v === "number" && !isNaN(v) ? v : null);

  const ir = n(d.ir_csll);
  const lair = n(d.lucro_antes_ir);
  if ((ir === null || ir === 0) && lair !== null && lair > 0) {
    r.push("Sem provisão de IR/CSLL — lucro líquido do período superestimado");
  }

  const dep = n(d.depreciacao_amortizacao);
  const depAnterior = n(depreciacaoExercicioAnterior);
  const proporcional = depAnterior !== null && meses ? (depAnterior * meses) / 12 : null;
  if (dep === null || (proporcional !== null && dep < proporcional * 0.5)) {
    r.push("Depreciação possivelmente não apropriada no período");
  }

  // Provisões de férias e 13º ficam no passivo circulante. Sem quebra dessa conta
  // não dá para afirmar que faltam — só que não há como confirmar que existem.
  if (n(d.passivo_circulante) !== null && n(d.provisoes_trabalhistas) === null) {
    r.push("Provisões trabalhistas possivelmente não constituídas");
  }

  if (meses !== null && meses < 6) {
    r.push("Período curto — alta sensibilidade a sazonalidade");
  }

  return r;
}
