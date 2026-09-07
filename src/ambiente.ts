// Configuração por ambiente — só para os pontos de entrada executáveis.
//
// Por que isto NÃO está na biblioteca: `import { analisar }` não pode ter efeito
// colateral sobre o `process.env` de quem importou. Quem embute o motor num
// serviço já gerencia a própria configuração, e um import que reescreve o
// ambiente alheio é surpresa desagradável — além de ser o caminho curto para a
// chave de um tenant vazar para a chamada de outro. Quem chama `carregarEnv()`
// é a CLI, e só ela.
//
// Precedência, da maior para a menor:
//
//   1. Variável já exportada no shell, ou injetada pelo orquestrador
//   2. Arquivo apontado por ANALISE_ENV_FILE
//   3. `.env` do diretório de trabalho
//   4. `.env` da raiz do pacote
//
// O item 1 vem de graça: nem `process.loadEnvFile` nem o fallback daqui
// sobrescrevem o que já existe. É o que permite `IA_MODELO=… comando` para uma
// execução isolada sem editar arquivo nenhum, e é o que faz o motor se comportar
// em container, CI e systemd — onde não existe `.env` e a configuração chega
// inteira pelo ambiente.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Raiz do pacote. Funciona de `src/` (tsx) e de `dist/` (compilado). */
export function raizDoPacote(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

export interface OrigemEnv {
  /** Arquivo efetivamente carregado, ou `null` quando nenhum foi encontrado. */
  arquivo: string | null;
  /** Nomes declarados no arquivo. Só nomes — nenhum valor sai daqui. */
  chaves: string[];
  /** Caminhos consultados, na ordem. Para a mensagem de diagnóstico. */
  procurados: string[];
}

const RE_ATRIBUICAO = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

function candidatos(): string[] {
  const explicito = process.env.ANALISE_ENV_FILE;
  if (explicito) return [resolve(explicito)];
  return [...new Set([resolve(process.cwd(), ".env"), resolve(raizDoPacote(), ".env")])];
}

/**
 * Carrega o primeiro `.env` encontrado. Não encontrar nenhum é situação normal,
 * não erro: em produção a configuração costuma vir só do ambiente.
 */
export function carregarEnv(): OrigemEnv {
  const procurados = candidatos();
  for (const arquivo of procurados) {
    let bruto: string;
    try {
      bruto = readFileSync(arquivo, "utf8");
    } catch {
      continue; // não existe ou não é legível — tenta o próximo
    }
    aplicar(arquivo, bruto);
    return { arquivo, chaves: chavesDeclaradas(bruto), procurados };
  }
  return { arquivo: null, chaves: [], procurados };
}

function aplicar(arquivo: string, bruto: string): void {
  // `process.loadEnvFile` só existe a partir do Node 20.12, e o pacote aceita a
  // linha 20 inteira. O fallback cobre o formato que o `.env.example` usa.
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(arquivo);
    return;
  }
  for (const linha of bruto.split(/\r?\n/)) {
    const m = linha.match(RE_ATRIBUICAO);
    if (!m) continue;
    const [, nome, valor] = m;
    if (nome in process.env) continue; // o ambiente real manda
    process.env[nome] = desaspar(valor.trim());
  }
}

/** Só os nomes declarados, para o diagnóstico dizer o que veio do arquivo. */
export function chavesDeclaradas(bruto: string): string[] {
  const nomes: string[] = [];
  for (const linha of bruto.split(/\r?\n/)) {
    const m = linha.match(RE_ATRIBUICAO);
    if (m && !nomes.includes(m[1])) nomes.push(m[1]);
  }
  return nomes;
}

function desaspar(valor: string): string {
  const aspa = valor[0];
  if ((aspa === '"' || aspa === "'") && valor.endsWith(aspa) && valor.length > 1) {
    return valor.slice(1, -1);
  }
  // Comentário no fim da linha, mas só fora de aspas: `IA_HEADERS={"a":"b"}`
  // não pode perder o valor por causa de uma cerquilha que faz parte dele.
  const corte = valor.indexOf(" #");
  return corte === -1 ? valor : valor.slice(0, corte).trimEnd();
}
