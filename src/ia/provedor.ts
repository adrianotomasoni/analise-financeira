// Contrato do provedor de IA.
//
// O motor inteiro conversa com o modelo por esta interface. Trocar de fornecedor
// é escrever um adaptador de ~80 linhas; nenhuma regra contábil, nenhum
// indicador e nenhuma parte do score muda junto.
//
// O contrato é estreito de propósito — uma única operação: "receba estes
// documentos e este prompt, devolva um objeto que obedeça a este JSON Schema".
// É tudo que a extração e o parecer precisam.

export interface DocumentoEntrada {
  /** Conteúdo do arquivo. */
  bytes: Uint8Array;
  /** Nome, só para log e mensagem de erro. */
  nome: string;
  /** "application/pdf" ou "image/png", "image/jpeg". */
  mime: string;
}

export interface PedidoEstruturado {
  /** Instruções de sistema. */
  sistema: string;
  /** Mensagem do usuário — o pedido concreto desta chamada. */
  usuario: string;
  /** Documentos a ler. Vazio quando o insumo já é texto dentro de `usuario`. */
  documentos?: DocumentoEntrada[];
  /** Nome da função que o modelo deve chamar. */
  ferramenta: string;
  /** JSON Schema dos argumentos dessa função. */
  schema: Record<string, unknown>;
  descricaoFerramenta?: string;
}

export interface RespostaEstruturada {
  /** Os argumentos da chamada de função, já parseados. */
  dados: Record<string, unknown>;
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
  /** Custo estimado em USD, quando a tabela de preços conhece o modelo. */
  custoUsd: number | null;
}

export interface ProvedorIA {
  readonly nome: string;
  readonly modelo: string;
  /** `true` quando o provedor aceita PDF direto, sem extração de texto local. */
  readonly aceitaPdf: boolean;
  gerarEstruturado(pedido: PedidoEstruturado): Promise<RespostaEstruturada>;
}

/** Erro de provedor com o suficiente para decidir se vale repetir a chamada. */
export class ErroProvedor extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly repetivel = false,
  ) {
    super(message);
    this.name = "ErroProvedor";
  }
}

export function extrairJson(texto: string, contexto: string): Record<string, unknown> {
  try {
    // Nunca casar string crua: modelos variam o escape (unicode, barras) dentro
    // dos argumentos da função. Só JSON.parse é confiável aqui.
    const v = JSON.parse(texto);
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      throw new Error("o modelo devolveu " + (Array.isArray(v) ? "um array" : typeof v));
    }
    return v as Record<string, unknown>;
  } catch (e) {
    throw new ErroProvedor(`${contexto}: JSON inválido do modelo — ${(e as Error).message}`);
  }
}
