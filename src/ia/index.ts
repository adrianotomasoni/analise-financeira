// Escolha do provedor a partir do ambiente.
//
// Precedência: o que o código passar > IA_PROVEDOR > anthropic (padrão).

import { ProvedorAnthropic, MODELO_PADRAO_ANTHROPIC, type OpcoesAnthropic } from "./anthropic.js";
import { ProvedorOpenAICompat } from "./openai-compat.js";
import type { ProvedorIA } from "./provedor.js";

export * from "./provedor.js";
export * from "./schema.js";
export * from "./prompts.js";
export { ProvedorAnthropic, MODELO_PADRAO_ANTHROPIC } from "./anthropic.js";
export { ProvedorOpenAICompat } from "./openai-compat.js";

export interface OpcoesProvedor extends OpcoesAnthropic {
  provedor?: "anthropic" | "openai-compat";
  baseUrl?: string;
}

/**
 * Monta o provedor a partir das variáveis de ambiente, com sobreposição pelo
 * que for passado em `opts`. Ver `.env.example` para a lista completa.
 */
export function provedorDoAmbiente(opts: OpcoesProvedor = {}): ProvedorIA {
  const escolhido = opts.provedor ?? (process.env.IA_PROVEDOR as OpcoesProvedor["provedor"]) ?? "anthropic";

  if (escolhido === "openai-compat") {
    const baseUrl = opts.baseUrl ?? process.env.IA_BASE_URL;
    if (!baseUrl) {
      throw new Error("IA_PROVEDOR=openai-compat exige IA_BASE_URL (ex.: https://api.openai.com/v1).");
    }
    return new ProvedorOpenAICompat({
      baseUrl,
      modelo: opts.modelo ?? process.env.IA_MODELO ?? "gpt-4.1",
      apiKey: opts.apiKey ?? process.env.IA_API_KEY,
      maxTokens: opts.maxTokens,
      headers: process.env.IA_HEADERS ? JSON.parse(process.env.IA_HEADERS) : undefined,
    });
  }

  return new ProvedorAnthropic({
    modelo: opts.modelo ?? process.env.IA_MODELO ?? MODELO_PADRAO_ANTHROPIC,
    apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
    maxTokens: opts.maxTokens,
    esforco: opts.esforco ?? (process.env.IA_ESFORCO as OpcoesAnthropic["esforco"]),
  });
}
