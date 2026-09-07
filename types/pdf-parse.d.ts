// pdf-parse não publica tipos. Só a superfície que a CLI usa.
declare module "pdf-parse" {
  interface ResultadoPdf { text: string; numpages: number; info: unknown }
  function pdfParse(data: Buffer | Uint8Array): Promise<ResultadoPdf>;
  export default pdfParse;
}
