// Parecer estruturado, escrito sobre números JÁ CONFERIDOS.
//
// É a segunda chamada, e a separação da primeira é o ponto do desenho. Quando o
// parecer saía na mesma chamada da extração, ele descrevia números que ninguém
// tinha conferido — e saía genérico ("situação crítica", "endividamento
// altíssimo"), sem um valor sequer, porque o modelo estava ocupado lendo o PDF.
//
// Aqui ele não vê o documento. Recebe o pacote pronto — contas, 33 indicadores,
// motivos de cada "não se aplica", alertas com severidade, nota com memória de
// cálculo, conferência e o resumo determinístico — e a única tarefa é redigir.
// Não recalcula nada, e não tem como: os números chegam prontos.
//
// O piso do rating é aplicado em código depois da resposta. Um modelo pede
// licença para ser otimista; a subscrição, não.

import { promptParecer } from "./prompts.js";
import { NOME_FERRAMENTA_PARECER, SCHEMA_PARECER } from "./schema.js";
import type { ProvedorIA } from "./provedor.js";
import type { ResultadoAnalise } from "../analisar.js";

export type Recomendacao = "favoravel" | "favoravel_com_condicoes" | "desfavoravel";

export interface Parecer {
  sumario: string;
  estrutura_patrimonial: string;
  liquidez_e_capital_de_giro: string;
  endividamento_e_cobertura: string;
  resultado_e_geracao_de_caixa: string;
  qualidade_da_informacao: string;
  conclusao: {
    recomendacao: Recomendacao;
    condicoes: string[];
    pontos_de_atencao: string[];
    pontos_positivos: string[];
  };
  /** `true` quando o piso do rating rebaixou a recomendação do modelo. */
  recomendacaoRebaixada?: boolean;
}

export interface ResultadoParecer {
  parecer: Parecer;
  texto: string;
  modelo: string;
  custoUsd: number | null;
}

export interface OpcoesParecer {
  /** Identificação da empresa, quando disponível — entra no pacote. */
  empresa?: { razao_social?: string; cnpj?: string; setor?: string; porte?: string };
  finalidade?: string;
  /** Teto do pacote em caracteres. Acima disso, a chamada é recusada. */
  maxChars?: number;
}

const ROTULO_RECOMENDACAO: Record<Recomendacao, string> = {
  favoravel: "Favorável",
  favoravel_com_condicoes: "Favorável com condições",
  desfavoravel: "Desfavorável",
};

const SECOES: Array<[keyof Parecer, string]> = [
  ["sumario", "Sumário"],
  ["estrutura_patrimonial", "Estrutura patrimonial"],
  ["liquidez_e_capital_de_giro", "Liquidez e capital de giro"],
  ["endividamento_e_cobertura", "Endividamento e cobertura"],
  ["resultado_e_geracao_de_caixa", "Resultado e geração de caixa"],
  ["qualidade_da_informacao", "Qualidade da informação"],
];

/** O pacote que vai ao modelo. Só dado conferido — nunca o documento. */
export function montarPacote(analise: ResultadoAnalise, opts: OpcoesParecer = {}) {
  return {
    empresa: opts.empresa ?? null,
    exercicio: {
      tipo_periodo: analise.contas.tipo_periodo ?? "exercicio_fechado",
      meses_competencia: analise.contas.meses_competencia ?? null,
    },
    contas: analise.contas,
    indicadores: analise.indicadores,
    motivos_indisponiveis: analise.motivos,
    red_flags: analise.redFlags.map((f) => ({ severidade: f.severidade, texto: f.texto })),
    score: {
      nota: analise.score.nota,
      score: analise.score.score,
      rating: analise.score.rating,
      saude: analise.score.saude,
      liberado: analise.score.liberado,
      motivo_bloqueio: analise.score.motivoBloqueio ?? null,
      memoria: analise.score.memoria,
    },
    conferencia: {
      avaliadas: analise.conferencia.avaliadas,
      quebradas: analise.conferencia.quebradas.map((q) => ({
        label: q.label, diff: q.diff, bloco: q.bloco,
      })),
      qualidade_sugerida: analise.conferencia.qualidadeSugerida,
    },
    sintese: analise.sintese,
  };
}

export async function gerarParecer(
  provedor: ProvedorIA,
  analise: ResultadoAnalise,
  opts: OpcoesParecer = {},
): Promise<ResultadoParecer> {
  const pacote = JSON.stringify(montarPacote(analise, opts));
  const teto = opts.maxChars ?? 120_000;
  if (pacote.length > teto) {
    throw new Error(`pacote grande demais (${pacote.length} caracteres, teto ${teto}).`);
  }

  const balancete = analise.contas.tipo_periodo === "balancete_parcial";
  const resposta = await provedor.gerarEstruturado({
    sistema: promptParecer(opts.finalidade),
    usuario:
      `Escreva o parecer técnico${balancete ? " (BALANCETE — período não encerrado; pondere isso)" : ""}. ` +
      `Pacote conferido:\n\n${pacote}`,
    ferramenta: NOME_FERRAMENTA_PARECER,
    schema: SCHEMA_PARECER,
    descricaoFerramenta: "Registra o parecer técnico estruturado.",
  });

  const parecer = resposta.dados as unknown as Parecer;

  // ── Piso do rating: o modelo pode ser mais duro, nunca mais brando ───────
  const rating = analise.score.rating;
  const c = parecer.conclusao ?? ({} as Parecer["conclusao"]);
  if (rating === "E" && c.recomendacao !== "desfavoravel") {
    c.recomendacao = "desfavoravel";
    parecer.recomendacaoRebaixada = true;
  } else if ((rating === "D" || rating === "C") && c.recomendacao === "favoravel") {
    c.recomendacao = "favoravel_com_condicoes";
    parecer.recomendacaoRebaixada = true;
  }
  parecer.conclusao = c;

  return {
    parecer,
    texto: parecerComoTexto(parecer),
    modelo: resposta.modelo,
    custoUsd: resposta.custoUsd,
  };
}

/** Texto corrido, para quem só tem um campo de observação para gravar. */
export function parecerComoTexto(p: Parecer): string {
  const partes: string[] = [];
  for (const [chave, titulo] of SECOES) {
    const t = p[chave];
    if (typeof t === "string" && t.trim()) partes.push(`${titulo}: ${t.trim()}`);
  }
  const c = p.conclusao;
  const cond = c?.condicoes?.length ? ` Condições: ${c.condicoes.join("; ")}.` : "";
  partes.push(`Conclusão: ${ROTULO_RECOMENDACAO[c?.recomendacao] ?? c?.recomendacao ?? "—"}.${cond}`);
  return partes.join("\n\n");
}
