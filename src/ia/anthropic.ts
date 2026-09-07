// Adaptador da API da Anthropic (Claude). É o provedor padrão.
//
// Duas escolhas que valem a explicação:
//
//   · O PDF vai INTEIRO para o modelo, como content block `document`, em vez de
//     ser convertido em texto antes. Balanço e DRE são tabelas, e o texto
//     extraído de um PDF perde exatamente a informação que importa aqui — qual
//     número está em qual coluna, qual linha é total e qual é subconta. Quando o
//     arquivo é grande ou escaneado, `--texto` faz o caminho antigo.
//   · Pensamento adaptativo ligado. Ler um DRE com sublinhas financeiras dentro
//     do bloco operacional é raciocínio, não transcrição; a qualidade da leitura
//     cai visivelmente sem ele.

import Anthropic from "@anthropic-ai/sdk";
import {
  ErroProvedor, extrairJson,
  type PedidoEstruturado, type ProvedorIA, type RespostaEstruturada,
} from "./provedor.js";

/** USD por milhão de tokens. Só estimativa — a fatura é a da Anthropic. */
const PRECOS: Record<string, { entrada: number; saida: number }> = {
  "claude-opus-5": { entrada: 5, saida: 25 },
  "claude-opus-4-8": { entrada: 5, saida: 25 },
  "claude-sonnet-5": { entrada: 2, saida: 10 },
  "claude-haiku-4-5": { entrada: 1, saida: 5 },
};

export const MODELO_PADRAO_ANTHROPIC = "claude-opus-5";

export interface OpcoesAnthropic {
  modelo?: string;
  apiKey?: string;
  maxTokens?: number;
  /** low | medium | high | xhigh | max. Padrão high. */
  esforco?: "low" | "medium" | "high" | "xhigh" | "max";
}

export class ProvedorAnthropic implements ProvedorIA {
  readonly nome = "anthropic";
  readonly modelo: string;
  readonly aceitaPdf = true;
  private readonly client: Anthropic;
  private readonly maxTokens: number;
  private readonly esforco: NonNullable<OpcoesAnthropic["esforco"]>;

  constructor(opts: OpcoesAnthropic = {}) {
    this.modelo = opts.modelo ?? MODELO_PADRAO_ANTHROPIC;
    this.maxTokens = opts.maxTokens ?? 16000;
    this.esforco = opts.esforco ?? "high";
    // Sem apiKey explícita o SDK resolve ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN
    // ou o perfil de `ant auth login`, nesta ordem.
    this.client = opts.apiKey ? new Anthropic({ apiKey: opts.apiKey }) : new Anthropic();
  }

  async gerarEstruturado(pedido: PedidoEstruturado): Promise<RespostaEstruturada> {
    const conteudo: Anthropic.ContentBlockParam[] = [];
    for (const doc of pedido.documentos ?? []) {
      const dados = Buffer.from(doc.bytes).toString("base64");
      if (doc.mime === "application/pdf") {
        conteudo.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: dados },
        });
      } else {
        conteudo.push({
          type: "image",
          source: {
            type: "base64",
            media_type: doc.mime as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
            data: dados,
          },
        });
      }
    }
    // O texto vem DEPOIS dos documentos: é a ordem recomendada e a que dá a
    // melhor leitura de PDF.
    conteudo.push({ type: "text", text: pedido.usuario });

    let resposta: Anthropic.Message;
    try {
      resposta = await this.client.messages.create({
        model: this.modelo,
        max_tokens: this.maxTokens,
        thinking: { type: "adaptive" },
        output_config: { effort: this.esforco },
        system: pedido.sistema,
        tools: [{
          name: pedido.ferramenta,
          description: pedido.descricaoFerramenta ?? "Registra o resultado estruturado da leitura.",
          input_schema: pedido.schema as Anthropic.Tool.InputSchema,
        }],
        tool_choice: { type: "tool", name: pedido.ferramenta },
        messages: [{ role: "user", content: conteudo }],
      });
    } catch (e) {
      throw traduzirErro(e);
    }

    if (resposta.stop_reason === "refusal") {
      throw new ErroProvedor(
        `o modelo recusou a solicitação (${resposta.stop_details?.category ?? "sem categoria"})`,
      );
    }

    const chamada = resposta.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === pedido.ferramenta,
    );
    if (!chamada) {
      throw new ErroProvedor(`o modelo não chamou '${pedido.ferramenta}' (stop_reason: ${resposta.stop_reason})`);
    }

    const dados = typeof chamada.input === "string"
      ? extrairJson(chamada.input, pedido.ferramenta)
      : (chamada.input as Record<string, unknown>);

    const tokensEntrada = resposta.usage.input_tokens ?? 0;
    const tokensSaida = resposta.usage.output_tokens ?? 0;
    return {
      dados,
      modelo: resposta.model ?? this.modelo,
      tokensEntrada,
      tokensSaida,
      custoUsd: estimarCusto(resposta.model ?? this.modelo, tokensEntrada, tokensSaida),
    };
  }
}

export function estimarCusto(modelo: string, entrada: number, saida: number): number | null {
  const p = PRECOS[modelo] ?? PRECOS[modelo.replace(/-\d{8}$/, "")];
  if (!p) return null;
  return (entrada * p.entrada + saida * p.saida) / 1_000_000;
}

function traduzirErro(e: unknown): ErroProvedor {
  if (e instanceof Anthropic.RateLimitError) {
    return new ErroProvedor("limite de taxa atingido (429)", 429, true);
  }
  if (e instanceof Anthropic.AuthenticationError) {
    return new ErroProvedor("credencial inválida — confira ANTHROPIC_API_KEY", 401, false);
  }
  if (e instanceof Anthropic.BadRequestError) {
    return new ErroProvedor(`requisição inválida: ${e.message}`, 400, false);
  }
  if (e instanceof Anthropic.APIError) {
    const status = e.status ?? 0;
    return new ErroProvedor(`erro da API (${status}): ${e.message}`, status, status >= 500);
  }
  return new ErroProvedor((e as Error)?.message ?? String(e));
}
