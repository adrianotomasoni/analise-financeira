// API pública do pacote.

export * from "./indicadores.js";
export * from "./conferencia.js";
export * from "./redflags.js";
export * from "./score.js";
export * from "./sintese.js";
export * from "./legenda.js";
export * from "./analisar.js";

// `derive.ts` e `redflags.ts` declaram a mesma constante de texto (é a mesma
// string, de propósito — as duas cópias dedupam o alerta pelo conteúdo). Aqui a
// que vale é a de `redflags.ts`, já exportada acima.
export {
  derivarCamposDre, checarIdentidadeLair, redFlagResultadoFinanceiro,
  aplicarRedFlagResultadoFinanceiro, RED_FLAG_LAIR_PREFIXO,
  type DreQuebra, type DreDerivada,
} from "./derive.js";

export * from "./periodo.js";

// `CHAVES_TOTAL_IMPRESSO` já sai de `indicadores.js`; `ia/index.js` a reexporta
// via schema.ts, então aqui os nomes de IA são listados um a um.
export {
  provedorDoAmbiente, ProvedorAnthropic, ProvedorOpenAICompat,
  MODELO_PADRAO_ANTHROPIC, ErroProvedor,
  schemaExtracao, camposDoEscopo, SCHEMA_PARECER,
  NOME_FERRAMENTA_EXTRACAO, NOME_FERRAMENTA_PARECER,
  promptExtracao, promptParecer,
  type ProvedorIA, type PedidoEstruturado, type RespostaEstruturada,
  type DocumentoEntrada, type EscopoExtracao, type OpcoesProvedor,
} from "./ia/index.js";

export { extrairDoDocumento, type ResultadoExtracao, type OpcoesExtracao } from "./ia/extrair.js";
export {
  gerarParecer, montarPacote, parecerComoTexto,
  type Parecer, type ResultadoParecer, type OpcoesParecer, type Recomendacao,
} from "./ia/parecer.js";
