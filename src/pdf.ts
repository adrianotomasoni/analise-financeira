// Extração local de texto de PDF, para provedores que não aceitam o documento.
//
// Mora num módulo próprio, e não dentro da CLI, por um motivo concreto: é a
// única parte do motor cujo comportamento depende de uma biblioteca de
// terceiro com API instável. Separada, ela é testável — e o teste é o que
// impede uma atualização de dependência de quebrar a leitura em silêncio.
//
// A `pdf-parse` v2 é uma reescrita: a v1 exportava uma função default
// (`pdfParse(buffer) → { text }`), a v2 expõe a classe `PDFParse`. Uma
// atualização automática de major trocou uma pela outra sem que nada
// acusasse, porque havia uma declaração `declare module "pdf-parse"` local
// dizendo ao TypeScript que a API antiga existia. A declaração foi removida:
// a v2 publica os próprios tipos, e agora o typecheck vê a API de verdade.

import { PDFParse } from "pdf-parse";

/**
 * Texto de todas as páginas, concatenado.
 *
 * Vale lembrar por que este caminho é o pior dos dois: balanço e DRE são
 * tabelas, e a extração de texto destrói a informação que mais importa — qual
 * número está em qual coluna, qual linha é total e qual é subconta. Use-o
 * quando o provedor não aceitar o PDF inteiro. Ver `docs/05-conectar-ia.md`.
 */
export async function extrairTextoDePdf(bytes: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data: bytes });
  try {
    const resultado = await parser.getText();
    // `resultado.text` intercala um marcador "-- N of M --" entre as páginas,
    // que a v1 não produzia. Esse texto vai inteiro para o prompt, e os
    // prompts foram calibrados sem ele; concatenar as páginas preserva o
    // comportamento sobre o qual a documentação foi escrita.
    return resultado.pages.map((p) => p.text).join("\n\n");
  } finally {
    // A v2 segura recursos do pdfjs até `destroy()`; sem isto o processo da
    // CLI pode não encerrar sozinho depois de ler um documento grande.
    await parser.destroy();
  }
}
