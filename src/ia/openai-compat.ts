// Adaptador para qualquer endpoint que fale o dialeto /v1/chat/completions:
// OpenAI, OpenRouter, Groq, Together, vLLM, Ollama, LM Studio e a maioria dos
// gateways corporativos. Só `fetch` — nenhuma dependência.
//
// LIMITAÇÃO QUE IMPORTA: este dialeto não tem um bloco de documento. PDF não vai
// direto; o texto precisa ser extraído antes (`--texto`, que usa `pdf-parse`).
// Isso degrada a leitura de tabela, que é justamente o que um balanço é — a
// coluna de cada número se perde, e com ela a diferença entre uma linha de total
// e uma subconta. Para leitura de PDF, prefira o adaptador da Anthropic.
//
// Modelos locais sem suporte a `tools` também não servem: o contrato do motor é
// uma chamada de função validada contra JSON Schema, e "peça JSON no prompt"
// devolve markdown com cerca de código em uma execução a cada dez.

import {
  ErroProvedor, extrairJson,
  type PedidoEstruturado, type ProvedorIA, type RespostaEstruturada,
} from "./provedor.js";

export interface OpcoesOpenAICompat {
  /** Ex.: https://api.openai.com/v1, https://openrouter.ai/api/v1, http://localhost:11434/v1 */
  baseUrl: string;
  modelo: string;
  apiKey?: string;
  maxTokens?: number;
  /** Cabeçalhos extras (OpenRouter pede HTTP-Referer e X-Title, por exemplo). */
  headers?: Record<string, string>;
  /** USD por milhão de tokens, para a estimativa de custo. */
  precos?: { entrada: number; saida: number };
}

export class ProvedorOpenAICompat implements ProvedorIA {
  readonly nome: string;
  readonly modelo: string;
  readonly aceitaPdf = false;

  constructor(private readonly opts: OpcoesOpenAICompat) {
    this.modelo = opts.modelo;
    this.nome = `openai-compat(${new URL(opts.baseUrl).host})`;
  }

  async gerarEstruturado(pedido: PedidoEstruturado): Promise<RespostaEstruturada> {
    if (pedido.documentos?.length) {
      throw new ErroProvedor(
        "este provedor não aceita PDF direto. Rode com --texto para extrair o texto antes, " +
        "ou use o provedor anthropic, que lê o PDF com o layout preservado.",
      );
    }

    const corpo = {
      model: this.modelo,
      max_tokens: this.opts.maxTokens ?? 16000,
      messages: [
        { role: "system", content: pedido.sistema },
        { role: "user", content: pedido.usuario },
      ],
      tools: [{
        type: "function",
        function: {
          name: pedido.ferramenta,
          description: pedido.descricaoFerramenta ?? "Registra o resultado estruturado da leitura.",
          parameters: pedido.schema,
        },
      }],
      tool_choice: { type: "function", function: { name: pedido.ferramenta } },
    };

    let resp: Response;
    try {
      resp = await fetch(`${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
          ...(this.opts.headers ?? {}),
        },
        body: JSON.stringify(corpo),
      });
    } catch (e) {
      throw new ErroProvedor(`falha de rede: ${(e as Error).message}`, undefined, true);
    }

    if (!resp.ok) {
      const texto = (await resp.text()).slice(0, 500);
      throw new ErroProvedor(
        `erro do provedor (${resp.status}): ${texto}`,
        resp.status,
        resp.status === 429 || resp.status >= 500,
      );
    }

    const json = await resp.json() as {
      model?: string;
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const chamada = json.choices?.[0]?.message?.tool_calls?.find(
      (c) => c.function?.name === pedido.ferramenta,
    ) ?? json.choices?.[0]?.message?.tool_calls?.[0];
    if (!chamada?.function?.arguments) {
      throw new ErroProvedor(`o modelo não chamou '${pedido.ferramenta}'`);
    }

    const tokensEntrada = json.usage?.prompt_tokens ?? 0;
    const tokensSaida = json.usage?.completion_tokens ?? 0;
    const p = this.opts.precos;
    return {
      dados: extrairJson(chamada.function.arguments, pedido.ferramenta),
      modelo: json.model ?? this.modelo,
      tokensEntrada,
      tokensSaida,
      custoUsd: p ? (tokensEntrada * p.entrada + tokensSaida * p.saida) / 1_000_000 : null,
    };
  }
}
