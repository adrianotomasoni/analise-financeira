// Schema da ferramenta que o modelo preenche na extração.
//
// É JSON Schema puro, sem dependência de SDK: o adaptador da Anthropic o entrega
// como `input_schema` de uma tool; o adaptador OpenAI-compatível, como
// `parameters` de uma function. Trocar de provedor não muda o contrato.
//
// Duas ausências são deliberadas e não devem ser "consertadas":
//
//   · NÃO existe campo de nota, score ou rating. A nota é calculada em código
//     (`score.ts`). Um campo aqui seria um convite a devolvê-la — e foi
//     exatamente assim que uma versão anterior deste motor produziu notas que
//     ninguém conseguia explicar.
//   · NÃO existe campo de EBITDA derivável. `ebitda` é aceito como fallback, mas
//     o valor usado é sempre `ebit + depreciacao_amortizacao`, calculado em
//     `derive.ts`. Pedir o EBITDA ao modelo, sem lhe dar um campo para a
//     depreciação, o leva a retirá-la das despesas administrativas para "chegar
//     lá" — e aí o EBIT sai inflado, junto com margem operacional e cobertura
//     de juros.

// As 12 chaves de total vêm de `indicadores.ts`, que é quem as consome na
// conferência — uma segunda lista aqui divergiria em silêncio.
import { CHAVES_TOTAL_IMPRESSO } from "../indicadores.js";

const numero = { type: ["number", "null"] } as const;

const CAMPOS_BP = [
  "ativo_circulante", "caixa_equivalentes", "contas_receber", "estoques",
  "ativo_nao_circulante", "realizavel_lp", "imobilizado", "intangivel", "ativo_total",
  "passivo_circulante", "fornecedores", "emprestimos_cp", "provisoes_trabalhistas",
  "passivo_nao_circulante", "emprestimos_lp",
  "patrimonio_liquido", "capital_social_bp", "reservas_lucros", "passivo_total",
  "partes_relacionadas_ativo", "partes_relacionadas_passivo",
  "depositos_judiciais", "prejuizos_acumulados",
  "dfc_caixa_operacional", "dfc_depreciacao", "dfc_caixa_final", "dfc_dividendos_pagos",
  "dmpl_pl_final", "dmpl_resultado_exercicio", "dmpl_ajustes_exercicios_anteriores",
] as const;

const CAMPOS_DRE = [
  "receita_bruta", "deducoes", "receita_liquida", "cmv", "lucro_bruto",
  "despesas_administrativas", "despesas_vendas", "despesas_tributarias",
  "outras_receitas_despesas_operacionais", "despesas_operacionais",
  "depreciacao_amortizacao", "ebitda", "ebit",
  "despesas_financeiras", "receitas_financeiras", "variacoes_cambiais",
  "outras_receitas_despesas_financeiras", "resultado_financeiro",
  "receitas_nao_operacionais", "despesas_nao_operacionais",
  "lucro_antes_ir", "ir_csll", "lucro_liquido",
] as const;

export type EscopoExtracao = "bp" | "dre" | "ambos";

/** Campos numéricos pertinentes a um escopo — usado para zerar o que ficou fora. */
export function camposDoEscopo(escopo: EscopoExtracao): string[] {
  if (escopo === "bp") return [...CAMPOS_BP];
  if (escopo === "dre") return [...CAMPOS_DRE];
  return [...CAMPOS_BP, ...CAMPOS_DRE];
}

export const NOME_FERRAMENTA_EXTRACAO = "salvar_analise_financeira";

export function schemaExtracao(escopo: EscopoExtracao = "ambos"): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    data_balanco: {
      type: ["string", "null"],
      description: "Data de corte impressa no documento, em YYYY-MM-DD. Não presuma 31/12.",
    },
  };
  for (const campo of camposDoEscopo(escopo)) properties[campo] = numero;

  properties.totais_impressos = {
    type: "array",
    maxItems: 12,
    description:
      "Linhas de TOTAL copiadas literalmente do documento, uma por chave. " +
      "Omita a chave cuja linha não existir.",
    items: {
      type: "object",
      properties: {
        chave: { type: "string", enum: [...CHAVES_TOTAL_IMPRESSO] },
        valor: { type: "number" },
        rotulo_original: { type: "string", description: "O rótulo da linha exatamente como impresso." },
      },
      required: ["chave", "valor", "rotulo_original"],
      additionalProperties: false,
    },
  };
  properties.indicios_periodo = {
    type: "array",
    items: { type: "string" },
    maxItems: 6,
    description:
      "Trechos LITERAIS do cabeçalho que indiquem o período coberto " +
      '(ex.: "BALANCETE DE VERIFICAÇÃO", "acumulado até 30/04/2026"). ' +
      "Apenas reporte — a classificação é feita em código.",
  };
  properties.meses_competencia_declarado = {
    type: ["integer", "null"],
    minimum: 1,
    maximum: 12,
    description: "Meses cobertos pela DRE, se o documento DECLARAR. Não infira: null quando não estiver escrito.",
  };
  properties.qualidade_extracao = { type: "string", enum: ["alta", "media", "baixa"] };
  properties.red_flags = { type: "array", items: { type: "string" }, maxItems: 12 };
  properties.observacoes_ia = { type: "string" };

  return {
    type: "object",
    properties,
    required: ["qualidade_extracao", "red_flags", "observacoes_ia"],
    additionalProperties: false,
  };
}

// ─── Parecer ─────────────────────────────────────────────────────────────────

export const NOME_FERRAMENTA_PARECER = "emitir_parecer";

export const SCHEMA_PARECER: Record<string, unknown> = {
  type: "object",
  properties: {
    sumario: { type: "string", description: "3 a 5 frases: quem é a empresa financeiramente e a leitura de risco." },
    estrutura_patrimonial: { type: "string" },
    liquidez_e_capital_de_giro: { type: "string" },
    endividamento_e_cobertura: { type: "string" },
    resultado_e_geracao_de_caixa: { type: "string" },
    qualidade_da_informacao: {
      type: "string",
      description: "Tipo de documento, conferência dos números, ressalvas. Se tudo fecha, diga isso em uma frase.",
    },
    conclusao: {
      type: "object",
      properties: {
        recomendacao: { type: "string", enum: ["favoravel", "favoravel_com_condicoes", "desfavoravel"] },
        condicoes: { type: "array", items: { type: "string" }, maxItems: 8 },
        pontos_de_atencao: { type: "array", items: { type: "string" }, maxItems: 6 },
        pontos_positivos: { type: "array", items: { type: "string" }, maxItems: 5 },
      },
      required: ["recomendacao", "condicoes", "pontos_de_atencao", "pontos_positivos"],
      additionalProperties: false,
    },
  },
  required: [
    "sumario", "estrutura_patrimonial", "liquidez_e_capital_de_giro",
    "endividamento_e_cobertura", "resultado_e_geracao_de_caixa",
    "qualidade_da_informacao", "conclusao",
  ],
  additionalProperties: false,
};
