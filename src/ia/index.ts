// Escolha do provedor a partir do ambiente.
//
// Precedência: o que o código passar > variável de ambiente > padrão.
//
// A resolução mora em `configuracaoEfetiva()`, e `provedorDoAmbiente()` apenas
// constrói o adaptador em cima dela. Isso existe para que o diagnóstico da CLI
// (`analise-financeira ambiente`) responda exatamente o que a próxima chamada
// faria — e não uma segunda leitura das mesmas variáveis, livre para divergir
// da primeira no dia em que uma das duas mudar.

import { ProvedorAnthropic, MODELO_PADRAO_ANTHROPIC, type OpcoesAnthropic } from "./anthropic.js";
import { ProvedorOpenAICompat } from "./openai-compat.js";
import type { ProvedorIA } from "./provedor.js";

export * from "./provedor.js";
export * from "./schema.js";
export * from "./prompts.js";
export { ProvedorAnthropic, MODELO_PADRAO_ANTHROPIC } from "./anthropic.js";
export { ProvedorOpenAICompat } from "./openai-compat.js";

export const MODELO_PADRAO_OPENAI_COMPAT = "gpt-4.1";

export interface OpcoesProvedor extends OpcoesAnthropic {
  provedor?: "anthropic" | "openai-compat";
  baseUrl?: string;
}

export interface ConfiguracaoIA {
  provedor: "anthropic" | "openai-compat";
  modelo: string;
  /** `true` quando o PDF vai inteiro ao modelo, sem extração de texto local. */
  aceitaPdf: boolean;
  baseUrl: string | null;
  /** Variáveis onde a credencial é procurada, na ordem. */
  varsCredencial: string[];
  /** Nome da variável que forneceu a credencial, ou `null`. Nunca o valor. */
  credencialDe: string | null;
  /**
   * Variável preenchida com o placeholder do `.env.example`, se houver. O
   * `install.sh` copia aquele arquivo para `.env`, então logo após instalar a
   * chave "existe" e não vale nada: tratá-la como definida faz o diagnóstico
   * dizer "pronto" exatamente no cenário mais comum de não estar.
   */
  credencialPlaceholderEm: string | null;
  esforco: string | null;
  /**
   * O que impede uma chamada agora, em texto acionável — ou `null` se está
   * pronto. Configuração faltando é o caso comum de quem acabou de clonar, e
   * merece resposta melhor que um erro de credencial vindo do SDK.
   */
  problema: string | null;
}

/**
 * Valor que é claramente um marcador de lugar, não uma credencial. Os do
 * `.env.example` (`sk-ant-...`, `sk-...`) caem na primeira regra; as outras
 * cobrem as convenções que as pessoas escrevem à mão ao adaptar o arquivo.
 */
function ehPlaceholder(valor: string): boolean {
  const v = valor.trim();
  return v.includes("...")
    || /^<.*>$/.test(v)
    // `\b` não serve aqui: entre "SEU" e "_" não há fronteira de palavra,
    // porque "_" conta como caractere de palavra — e "SEU_TOKEN_AQUI" é
    // justamente a forma mais comum de placeholder escrito à mão.
    || /^(seu|sua|your|change ?me|troque|todo|x{3,})([^a-z0-9]|$)/i.test(v);
}

/** Estado de uma credencial. Devolve nomes de variável, nunca valores. */
function acharCredencial(vars: string[]): { definidaEm: string | null; placeholderEm: string | null } {
  let placeholderEm: string | null = null;
  for (const v of vars) {
    const valor = (process.env[v] ?? "").trim();
    if (valor === "") continue;
    if (ehPlaceholder(valor)) { placeholderEm ??= v; continue; }
    return { definidaEm: v, placeholderEm: null };
  }
  return { definidaEm: null, placeholderEm };
}

/**
 * O que a próxima chamada usaria, sem construir cliente e sem tocar a rede.
 * Seguro de chamar com o ambiente vazio: reporta o problema em vez de lançar.
 */
export function configuracaoEfetiva(opts: OpcoesProvedor = {}): ConfiguracaoIA {
  const provedor = opts.provedor
    ?? (process.env.IA_PROVEDOR as OpcoesProvedor["provedor"])
    ?? "anthropic";

  if (provedor !== "anthropic" && provedor !== "openai-compat") {
    return {
      provedor: "anthropic", modelo: MODELO_PADRAO_ANTHROPIC, aceitaPdf: true,
      baseUrl: null, varsCredencial: [], credencialDe: null,
      credencialPlaceholderEm: null, esforco: null,
      problema: `IA_PROVEDOR="${provedor}" não existe. Use "anthropic" ou "openai-compat".`,
    };
  }

  if (provedor === "openai-compat") {
    const baseUrl = opts.baseUrl ?? process.env.IA_BASE_URL ?? null;
    const varsCredencial = ["IA_API_KEY"];
    const achado = acharCredencial(varsCredencial);
    const credencialDe = opts.apiKey ? "(passada em código)" : achado.definidaEm;
    return {
      provedor, aceitaPdf: false, baseUrl, varsCredencial, credencialDe,
      credencialPlaceholderEm: opts.apiKey ? null : achado.placeholderEm, esforco: null,
      modelo: opts.modelo ?? process.env.IA_MODELO ?? MODELO_PADRAO_OPENAI_COMPAT,
      problema: !baseUrl
        ? 'IA_PROVEDOR=openai-compat exige IA_BASE_URL (ex.: https://api.openai.com/v1).'
        : achado.placeholderEm && !credencialDe
          ? `${achado.placeholderEm} ainda está com o valor de exemplo do .env.example. Troque pela chave real.`
          : !credencialDe
            ? "IA_API_KEY não definida. Endpoint local sem autenticação? Deixe qualquer valor."
            : null,
    };
  }

  // O SDK da Anthropic também aceita ANTHROPIC_AUTH_TOKEN e o perfil gravado
  // por `ant auth login`. O perfil é um arquivo fora do ambiente: quando nenhuma
  // das variáveis está definida a chamada ainda pode funcionar, então isto é
  // relatado como aviso na CLI, não como impedimento.
  const varsCredencial = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];
  const achado = acharCredencial(varsCredencial);
  const credencialDe = opts.apiKey ? "(passada em código)" : achado.definidaEm;
  const placeholderEm = opts.apiKey ? null : achado.placeholderEm;
  return {
    provedor, aceitaPdf: true, baseUrl: null, varsCredencial, credencialDe,
    credencialPlaceholderEm: placeholderEm,
    modelo: opts.modelo ?? process.env.IA_MODELO ?? MODELO_PADRAO_ANTHROPIC,
    esforco: opts.esforco ?? process.env.IA_ESFORCO ?? "high",
    problema: credencialDe
      ? null
      : placeholderEm
        ? `${placeholderEm} ainda está com o valor de exemplo do .env.example — o install.sh copia aquele arquivo. Troque pela chave real.`
        : "ANTHROPIC_API_KEY não definida — a chamada só funciona se houver perfil de `ant auth login`.",
  };
}

/**
 * Monta o provedor a partir das variáveis de ambiente, com sobreposição pelo
 * que for passado em `opts`. Ver `.env.example` para a lista completa.
 */
export function provedorDoAmbiente(opts: OpcoesProvedor = {}): ProvedorIA {
  const cfg = configuracaoEfetiva(opts);

  if (cfg.provedor === "openai-compat") {
    if (!cfg.baseUrl) throw new Error(cfg.problema ?? "IA_BASE_URL ausente.");
    return new ProvedorOpenAICompat({
      baseUrl: cfg.baseUrl,
      modelo: cfg.modelo,
      apiKey: opts.apiKey ?? process.env.IA_API_KEY,
      maxTokens: opts.maxTokens,
      headers: process.env.IA_HEADERS ? JSON.parse(process.env.IA_HEADERS) : undefined,
    });
  }

  return new ProvedorAnthropic({
    modelo: cfg.modelo,
    apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
    maxTokens: opts.maxTokens,
    esforco: opts.esforco ?? (process.env.IA_ESFORCO as OpcoesAnthropic["esforco"]),
  });
}
