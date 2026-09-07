#!/usr/bin/env bash
#
# Instalação do analise-financeira-br.
#
#   ./install.sh              instala, compila e roda a sanidade
#   ./install.sh --sem-teste  pula a sanidade
#   ./install.sh --global     e ainda instala o comando `analise-financeira`
#
# Não pede chave de API e não faz chamada nenhuma a modelo: ao final, o motor
# determinístico está funcionando e verificado. A chave só é necessária para
# ler PDF, e o próprio script diz como configurá-la no fim.

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ"

if [ -t 1 ]; then
  VERDE='\033[0;32m'; AMARELO='\033[0;33m'; VERMELHO='\033[0;31m'; NEGRITO='\033[1m'; FIM='\033[0m'
else
  VERDE=''; AMARELO=''; VERMELHO=''; NEGRITO=''; FIM=''
fi
ok()    { printf "${VERDE}✓${FIM} %s\n" "$1"; }
aviso() { printf "${AMARELO}!${FIM} %s\n" "$1"; }
erro()  { printf "${VERMELHO}✗${FIM} %s\n" "$1" >&2; }
passo() { printf "\n${NEGRITO}%s${FIM}\n" "$1"; }

SEM_TESTE=0
GLOBAL=0
for arg in "$@"; do
  case "$arg" in
    --sem-teste) SEM_TESTE=1 ;;
    --global)    GLOBAL=1 ;;
    -h|--help)
      sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) erro "opção desconhecida: $arg"; exit 2 ;;
  esac
done

printf "${NEGRITO}analise-financeira-br${FIM} — instalação\n"

# ── 1. Node ──────────────────────────────────────────────────────────────────
passo "1/5  Verificando o Node"
if ! command -v node >/dev/null 2>&1; then
  erro "Node não encontrado. Instale a versão 20 ou superior: https://nodejs.org"
  exit 1
fi
VERSAO_NODE="$(node -p 'process.versions.node')"
MAIOR="${VERSAO_NODE%%.*}"
if [ "$MAIOR" -lt 20 ]; then
  erro "Node $VERSAO_NODE encontrado; o pacote exige 20 ou superior."
  erro "O motor usa fetch nativo e módulos ES — em versões anteriores ele não roda."
  exit 1
fi
ok "Node $VERSAO_NODE"

if ! command -v npm >/dev/null 2>&1; then
  erro "npm não encontrado, embora o Node esteja instalado."
  exit 1
fi
ok "npm $(npm -v)"

# ── 2. Dependências ──────────────────────────────────────────────────────────
passo "2/5  Instalando dependências"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi
ok "dependências instaladas"

# ── 3. Compilação ────────────────────────────────────────────────────────────
passo "3/5  Compilando"
npm run build
ok "TypeScript compilado em dist/"

# ── 4. Sanidade ──────────────────────────────────────────────────────────────
# Roda o motor inteiro sobre um caso real conhecido e confere valor a valor:
# os índices que dividem pelo PL negativo NÃO podem ser calculados, e a âncora
# do Lucro Bruto TEM de acusar os R$ 340.000,00 que a extração original errou.
# É o teste que impede uma alteração de fórmula de passar despercebida.
if [ "$SEM_TESTE" -eq 0 ]; then
  passo "4/5  Verificando o motor (caso de referência, offline)"
  if npm run --silent sanidade; then
    ok "motor verificado"
  else
    erro "a verificação falhou — não use este build para decisão."
    exit 1
  fi
else
  passo "4/5  Verificação pulada (--sem-teste)"
  aviso "rode 'npm run sanidade' antes de confiar no resultado"
fi

# ── 5. Ambiente ──────────────────────────────────────────────────────────────
passo "5/5  Ambiente"
if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  ok ".env criado a partir do .env.example"
else
  ok ".env já existe (mantido como está)"
fi

if [ "$GLOBAL" -eq 1 ]; then
  passo "Extra  Instalando o comando global"
  if npm link; then
    ok "comando 'analise-financeira' disponível"
  else
    aviso "npm link falhou (permissão?). Use 'npx tsx src/cli.ts' ou 'sudo npm link'."
  fi
fi

# ── Fim ──────────────────────────────────────────────────────────────────────
printf "\n${VERDE}${NEGRITO}Instalado.${FIM}\n\n"
cat <<'FIM_TEXTO'
O que já funciona, sem chave de API e sem rede:

    npm run cli -- analisar exemplos/exemplo-transportadora-2025.json --sem-ia

Para ler um PDF é preciso uma chave. Edite o .env:

    ANTHROPIC_API_KEY=sk-ant-...

Confira se a configuração chegou ao motor — mostra provedor, modelo e se a
credencial foi encontrada, sem gastar uma chamada:

    npm run cli -- ambiente

e então:

    npm run cli -- analisar balanco.pdf --ano 2025 --parecer

Outro provedor (OpenAI, OpenRouter, Groq, vLLM, Ollama, gateway próprio):

    IA_PROVEDOR=openai-compat
    IA_BASE_URL=http://localhost:11434/v1
    IA_API_KEY=ollama
    IA_MODELO=qwen2.5:14b

Leia docs/05-conectar-ia.md antes da primeira extração — em especial a
seção sobre por que a conferência manda na qualidade declarada pelo modelo.
FIM_TEXTO
