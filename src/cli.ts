#!/usr/bin/env node
// CLI: PDF (ou JSON de contas) → análise completa.
//
//   analise-financeira analisar balanco.pdf --ano 2025
//   analise-financeira analisar contas.json --sem-ia
//   analise-financeira analisar balanco.pdf --parecer --json saida.json
//   analise-financeira ambiente
//
// Este arquivo é o único ponto do pacote que carrega o `.env`. Ver `ambiente.ts`
// para o motivo de a biblioteca não fazer isso.

import { readFile, writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { analisar } from "./analisar.js";
import { carregarEnv, type OrigemEnv } from "./ambiente.js";
import { derivarCamposDre } from "./derive.js";
import { provedorDoAmbiente, configuracaoEfetiva } from "./ia/index.js";
import { extrairDoDocumento } from "./ia/extrair.js";
import { gerarParecer } from "./ia/parecer.js";
import { INDICADORES_CONFIG, INDICADORES_GRUPOS, formatarIndicador, getIndicadorStatus, brlCompacto } from "./indicadores.js";
import { ROTULO_RATING } from "./score.js";
import { ROTULO_SEVERIDADE } from "./redflags.js";
import { explicacaoRating } from "./legenda.js";
import type { AnaliseFinanceira } from "./indicadores.js";

const USO = `
analise-financeira — motor de leitura e análise de Balanço Patrimonial e DRE

  analise-financeira analisar <arquivo> [opções]
  analise-financeira ambiente            mostra a configuração de IA em vigor

Arquivo
  .pdf         extraído por IA e depois analisado
  .json        contas já prontas; com --sem-ia não faz chamada nenhuma

Opções
  --sem-ia            não chama modelo nenhum (exige .json de contas)
  --texto             extrai o texto do PDF localmente antes de enviar
                      (necessário em provedores que não aceitam PDF)
  --parecer           gera também o parecer redigido (2ª chamada ao modelo)
  --escopo bp|dre|ambos     padrão: ambos
  --ano <AAAA>        ano de referência do exercício
  --json <arquivo>    grava o resultado completo em JSON
  --provedor <nome>   anthropic (padrão) | openai-compat
  --modelo <id>       sobrepõe IA_MODELO
  --finalidade <txt>  contexto de uso, entra no papel do analista

Configuração
  Lida do .env (diretório atual, depois raiz do pacote) e do ambiente.
  Variável já exportada no shell vence o arquivo. ANALISE_ENV_FILE aponta outro.
  Rode "analise-financeira ambiente" para ver o que está valendo. Veja .env.example.
`;

interface Args { [k: string]: string | boolean | undefined }

function parseArgs(argv: string[]): { comando?: string; alvo?: string; args: Args } {
  const args: Args = {};
  const livres: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { livres.push(a); continue; }
    const chave = a.slice(2);
    const prox = argv[i + 1];
    if (prox && !prox.startsWith("--")) { args[chave] = prox; i++; }
    else args[chave] = true;
  }
  return { comando: livres[0], alvo: livres[1], args };
}

const SIMBOLO: Record<string, string> = {
  green: "●", yellow: "●", red: "●", gray: "○", neutral: "◆",
};
const COR: Record<string, string> = {
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", gray: "\x1b[90m", neutral: "\x1b[36m",
};
const RESET = "\x1b[0m";
const cor = (c: string, t: string) => (process.stdout.isTTY ? `${COR[c] ?? ""}${t}${RESET}` : t);

async function lerPdfComoTexto(caminho: string): Promise<string> {
  const { default: pdfParse } = await import("pdf-parse");
  const buf = await readFile(caminho);
  const r = await pdfParse(buf);
  return r.text;
}

/**
 * `analise-financeira ambiente` — responde "com o que eu vou falar, e está
 * pronto?" sem gastar uma chamada para descobrir. Existe porque o modo de falha
 * de quem acabou de clonar é silencioso: o `.env` está preenchido, a variável
 * não chegou ao processo, e o erro que aparece é de credencial — que manda
 * conferir justamente a chave que está certa.
 *
 * Não imprime credencial nenhuma, nem trecho: só de qual variável ela veio.
 */
function mostrarAmbiente(origem: OrigemEnv): number {
  const cfg = configuracaoEfetiva();
  const linha = (rotulo: string, valor: string) => console.log(`    ${rotulo.padEnd(18)}${valor}`);

  console.log("\n  Configuração");
  if (origem.arquivo) {
    linha("arquivo .env", origem.arquivo);
    linha("declara", origem.chaves.length ? origem.chaves.join(", ") : "(vazio)");
  } else {
    linha("arquivo .env", cor("yellow", "nenhum encontrado"));
    linha("procurado em", origem.procurados.join("  ·  "));
    console.log("                      (normal em container e CI, onde tudo vem do ambiente)");
  }

  console.log("\n  Provedor em vigor");
  linha("provedor", cfg.provedor);
  linha("modelo", cfg.modelo);
  if (cfg.baseUrl) linha("endpoint", cfg.baseUrl);
  if (cfg.esforco) linha("esforço", cfg.esforco);
  linha("leitura de PDF", cfg.aceitaPdf
    ? "direta — o documento vai inteiro ao modelo"
    : cor("yellow", "via --texto — o layout da tabela se perde"));
  linha("credencial", cfg.credencialDe
    ? cor("green", `${cfg.credencialDe} definida`)
    : cfg.credencialPlaceholderEm
      ? cor("red", `${cfg.credencialPlaceholderEm} ainda é o exemplo do .env.example`)
      : cor("red", `ausente (procurada em ${cfg.varsCredencial.join(", ")})`));

  console.log("");
  if (cfg.problema) {
    console.log(cor("red", `  ✗ ${cfg.problema}`));
    console.log("");
    console.log("  Para apontar o motor a outro modelo, edite o .env ou exporte no shell:");
    console.log("    IA_PROVEDOR=anthropic      ANTHROPIC_API_KEY=...");
    console.log("    IA_PROVEDOR=openai-compat  IA_BASE_URL=...  IA_API_KEY=...  IA_MODELO=...");
    console.log("  Ou, só para esta execução:  --provedor <nome> --modelo <id>");
    console.log("");
    return 1;
  }
  console.log(cor("green", "  ✓ Pronto. O motor offline (--sem-ia) não depende de nada disto."));
  console.log("");
  return 0;
}

async function main() {
  const { comando, alvo, args } = parseArgs(process.argv.slice(2));
  if (!comando || comando === "ajuda" || args.help || args.h) { console.log(USO); return; }

  // Antes de qualquer leitura de process.env, e depois de resolver a ajuda:
  // `--help` não pode depender de haver arquivo de configuração.
  const origemEnv = carregarEnv();

  if (comando === "ambiente") { process.exit(mostrarAmbiente(origemEnv)); }
  if (comando !== "analisar") { console.error(`comando desconhecido: ${comando}`); console.log(USO); process.exit(2); }
  if (!alvo) { console.error("faltou o arquivo."); console.log(USO); process.exit(2); }

  const ehJson = extname(alvo).toLowerCase() === ".json";
  let contas: AnaliseFinanceira;
  let redFlagsDocumento: string[] = [];
  let extracao: Awaited<ReturnType<typeof extrairDoDocumento>> | null = null;

  if (ehJson && args["sem-ia"]) {
    const bruto = JSON.parse(await readFile(alvo, "utf8"));
    // Aceita tanto o arquivo de contas direto quanto uma fixture com bloco "correto".
    contas = (bruto.correto ?? bruto) as AnaliseFinanceira;
    if (bruto.totais_impressos) contas.totais_impressos = bruto.totais_impressos;
    // As MESMAS derivações da extração. Sem isto, um JSON com a quebra de
    // despesas mas sem a linha de EBIT perde margem operacional, margem EBITDA,
    // as duas coberturas de juros e a Dív.Líq./EBITDA — cinco indicadores em
    // silêncio, e a nota sai de um conjunto menor sem dizer que saiu.
    const d = derivarCamposDre(contas);
    contas.despesas_operacionais ??= d.despesas_operacionais;
    contas.ebit ??= d.ebit;
    contas.ebitda ??= d.ebitda;
    contas.resultado_financeiro ??= d.resultado_financeiro;
  } else if (ehJson) {
    console.error("um .json de contas só faz sentido com --sem-ia."); process.exit(2); return;
  } else {
    const provedor = provedorDoAmbiente({
      provedor: args.provedor as "anthropic" | "openai-compat" | undefined,
      modelo: typeof args.modelo === "string" ? args.modelo : undefined,
    });
    const usarTexto = !!args.texto || !provedor.aceitaPdf;
    process.stderr.write(`lendo ${basename(alvo)} com ${provedor.modelo}${usarTexto ? " (texto extraído localmente)" : ""}…\n`);

    extracao = await extrairDoDocumento(
      provedor,
      usarTexto ? [] : [{ bytes: await readFile(alvo), nome: basename(alvo), mime: "application/pdf" }],
      {
        escopo: (args.escopo as "bp" | "dre" | "ambos") ?? "ambos",
        anoReferencia: args.ano ? Number(args.ano) : undefined,
        finalidade: typeof args.finalidade === "string" ? args.finalidade : undefined,
        textoDocumento: usarTexto ? await lerPdfComoTexto(alvo) : undefined,
      },
    );
    contas = extracao.contas;
    redFlagsDocumento = extracao.redFlagsDocumento;
  }

  const analise = analisar(contas, { redFlagsDocumento });

  // ── Saída ────────────────────────────────────────────────────────────────
  const s = analise.score;
  console.log("");
  console.log(`  ${s.rating} — ${ROTULO_RATING[s.rating]}   nota ${s.nota}/100   ajuste ${s.score > 0 ? "+" : ""}${s.score}`);
  console.log(`  ${explicacaoRating(s.rating)}`);
  if (!s.liberado) console.log(cor("red", `  ⚠ ${s.motivoBloqueio}`));
  if (extracao) {
    console.log(`  Período: ${analise.contas.tipo_periodo === "balancete_parcial" ? "balancete parcial" : "exercício encerrado"} (${extracao.periodo.regra})`);
    console.log(`  Qualidade dos dados: ${extracao.qualidade}` +
      (extracao.qualidade !== extracao.qualidadeDeclarada ? cor("yellow", `  (o modelo declarou "${extracao.qualidadeDeclarada}")`) : ""));
  }

  const c = analise.conferencia;
  console.log("");
  console.log(`  Conferência: ${c.avaliadas - c.quebradas.length} de ${c.avaliadas} verificações fecham`);
  for (const q of c.quebradas) {
    console.log(cor("red", `    ✗ ${q.label} — diferença ${brlCompacto(q.diff ?? 0)}`));
  }

  for (const grupo of INDICADORES_GRUPOS) {
    console.log("");
    console.log(`  ${grupo.label}`);
    for (const key of grupo.items) {
      const v = analise.indicadores[key];
      const st = getIndicadorStatus(key, v);
      const motivo = analise.motivos[key];
      const valor = v === null
        ? (motivo ? `não se aplica — ${motivo}` : "sem dado")
        : formatarIndicador(key, v);
      console.log(`    ${cor(st, SIMBOLO[st])} ${INDICADORES_CONFIG[key].label.padEnd(28)} ${valor}`);
    }
  }

  if (analise.redFlags.length) {
    console.log("");
    console.log("  Sinais de alerta");
    for (const f of analise.redFlags) {
      const c2 = f.severidade === "critica" ? "red" : f.severidade === "alta" ? "yellow" : "gray";
      console.log(`    ${cor(c2, "•")} [${ROTULO_SEVERIDADE[f.severidade]}] ${f.texto}`);
    }
  }

  console.log("");
  console.log("  Resumo da análise");
  for (const p of analise.sintese) console.log(`    ${p.titulo}: ${p.texto}`);

  let parecer = null;
  if (args.parecer) {
    process.stderr.write("\ngerando parecer…\n");
    const provedor = provedorDoAmbiente({
      provedor: args.provedor as "anthropic" | "openai-compat" | undefined,
      modelo: typeof args.modelo === "string" ? args.modelo : undefined,
    });
    const r = await gerarParecer(provedor, analise, {
      finalidade: typeof args.finalidade === "string" ? args.finalidade : undefined,
    });
    parecer = r.parecer;
    console.log("");
    console.log("  Parecer técnico");
    console.log(r.texto.split("\n").map((l) => `    ${l}`).join("\n"));
    if (parecer.recomendacaoRebaixada) {
      console.log(cor("yellow", "    (recomendação rebaixada pelo piso do rating)"));
    }
  }

  if (typeof args.json === "string") {
    await writeFile(args.json, JSON.stringify({ analise, extracao, parecer }, null, 2), "utf8");
    console.log(`\n  JSON gravado em ${args.json}`);
  }
  console.log("");
}

main().catch((e) => { console.error(`\nerro: ${(e as Error).message}\n`); process.exit(1); });
