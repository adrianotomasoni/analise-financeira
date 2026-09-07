# analise-financeira-br

Motor de leitura, **conferência** e análise de Balanço Patrimonial e DRE brasileiros.
Lê o PDF com um modelo de IA, confere o que foi lido contra o próprio documento e
produz 33 indicadores, sinais de alerta, uma nota de 0 a 100 com memória de cálculo
e um parecer redigido.

TypeScript, Node 20+. Sem banco, sem framework, sem serviço obrigatório.

---

## O problema que ele resolve

Pedir a um modelo de IA que leia um balanço funciona quase sempre. É o "quase" que
custa caro, porque **o erro não se anuncia**.

O caso que originou este motor: um exercício de 2025 foi extraído por um modelo de
primeira linha, saiu com qualidade autodeclarada **"alta"** e com 7 das 9 identidades
contábeis fechando. Tinha três erros materiais. O CMV veio R$ 340.000,00 menor que o
impresso; os empréstimos de curto prazo, R$ 1,0 milhão menores; e o LAIR foi
*calculado* em vez de copiado.

O Lucro Bruto "fechava" porque o modelo o derivou do CMV errado. Conferir
`Lucro Bruto = Receita Líquida − CMV` era conferir a leitura do modelo **contra ela
mesma** — e os dois lados vinham da mesma leitura errada.

Este motor trata isso como o problema central, não como detalhe:

| | |
|---|---|
| **Âncoras impressas** | Além dos campos, o modelo copia **literalmente** as linhas de TOTAL do documento. O sistema compara campo × total impresso. É a única conferência independente da leitura — e é ela que pega os R$ 340.000,00. |
| **A IA não dá nota** | Ela lê. Indicadores, alertas e a nota de 0 a 100 saem de código, com memória de cálculo linha a linha. |
| **A IA não classifica o período** | Ela reporta trechos literais do cabeçalho; a decisão entre exercício encerrado e balancete é regra. |
| **`null` nunca vira zero** | Um campo ausente é ausente. Um índice que não se aplica (ROE com patrimônio líquido negativo) fica nulo **com o motivo registrado** — e o motivo conta como o pior caso na nota, não como falta de dado. |
| **A conferência manda** | Quando o modelo declara "alta" e a conferência discorda, vale a conferência. |

---

## Instalação

```bash
git clone <seu-repositorio> analise-financeira-br
cd analise-financeira-br
./install.sh
```

O script confere o Node, instala, compila e **roda o motor sobre um caso real
conhecido**, conferindo valor a valor. Não pede chave de API e não faz chamada a
modelo nenhum: ao final, a parte determinística está funcionando e verificada.

```bash
./install.sh --sem-teste   # pula a verificação
./install.sh --global      # instala também o comando `analise-financeira`
```

## Primeiro uso, sem chave de API

```bash
npm run cli -- analisar exemplos/exemplo-transportadora-2025.json --sem-ia
```

```
  E — Crítico   nota 0/100   ajuste -10
  Risco de insolvência: patrimônio líquido negativo, liquidez muito baixa ou
  dívida sem cobertura pela geração de caixa. Subscrição desaconselhada.

  Conferência: 24 de 25 verificações fecham
    ✗ Depreciação da demonstração de resultado confere com a do fluxo de caixa
      — diferença R$ 1,4 mi

  Endividamento e alavancagem
    ● Endividamento Geral          237,1%
    ○ Debt / Equity                não se aplica — patrimônio líquido negativo
  ...
```

## Lendo um PDF

Requer uma chave. Edite o `.env` (criado pelo instalador):

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npm run cli -- analisar balanco-2025.pdf --ano 2025 --parecer --json saida.json
```

## Plugando o seu modelo

Cada clone escolhe o próprio provedor. A configuração é lida do `.env` e do
ambiente, e o comando abaixo mostra o que está valendo — sem gastar uma chamada
para descobrir:

```bash
npm run cli -- ambiente
```

```
  Provedor em vigor
    provedor          anthropic
    modelo            claude-opus-5
    leitura de PDF    direta — o documento vai inteiro ao modelo
    credencial        ANTHROPIC_API_KEY definida

  ✓ Pronto.
```

**Anthropic** (padrão) — único que lê o PDF com o layout preservado:

```bash
IA_PROVEDOR=anthropic
ANTHROPIC_API_KEY=sk-ant-...
IA_MODELO=claude-opus-5        # ou claude-sonnet-5, claude-haiku-4-5
```

**Qualquer endpoint compatível com OpenAI** — OpenAI, OpenRouter, Groq, Together,
vLLM, Ollama, LM Studio, gateway corporativo. Exige `--texto`, e o modelo precisa
suportar chamada de função:

```bash
IA_PROVEDOR=openai-compat
IA_BASE_URL=http://localhost:11434/v1   # Ollama, por exemplo
IA_API_KEY=ollama
IA_MODELO=qwen2.5:14b
```

### Precedência

Da maior para a menor:

1. `--provedor` / `--modelo` na linha de comando
2. Variável exportada no shell, ou injetada pelo orquestrador
3. Arquivo apontado por `ANALISE_ENV_FILE`
4. `.env` do diretório atual, depois `.env` da raiz do pacote

O item 2 vencer o arquivo é o que permite testar um modelo sem editar nada —
`IA_MODELO=claude-haiku-4-5 npm run cli -- ambiente` — e é o que faz o motor se
comportar em container, CI e systemd, onde não existe `.env`.

O `.env` está no `.gitignore`. Nenhuma credencial é impressa em log ou
diagnóstico: o comando `ambiente` diz de qual variável a chave veio, nunca o
valor nem um trecho dele.

## Como biblioteca

```ts
import { analisar, provedorDoAmbiente, extrairDoDocumento, gerarParecer } from "analise-financeira-br";
import { readFile } from "node:fs/promises";

// 1. Ler o documento (a única etapa com IA)
const provedor = provedorDoAmbiente();
const extracao = await extrairDoDocumento(provedor, [{
  bytes: await readFile("balanco.pdf"), nome: "balanco.pdf", mime: "application/pdf",
}], { anoReferencia: 2025 });

// 2. Analisar — determinístico, offline, sem IA
const analise = analisar(extracao.contas, { redFlagsDocumento: extracao.redFlagsDocumento });

console.log(analise.score.rating);          // "E"
console.log(analise.score.nota);            // 0
console.log(analise.score.memoria);         // por que deu isso, linha a linha
console.log(analise.conferencia.quebradas); // o que não fecha
console.log(analise.indicadores.roe);       // null — com motivo em analise.motivos.roe

// 3. Parecer redigido sobre os números já conferidos (2ª chamada, opcional)
const { parecer } = await gerarParecer(provedor, analise);
```

Quem **já tem os números** (ERP, planilha, digitação) usa só o passo 2 — sem IA,
sem rede, sem chave.

---

## Documentação

| | |
|---|---|
| [`docs/01-mapeamento-do-balanco.md`](docs/01-mapeamento-do-balanco.md) | Os 53 campos, o que entra em cada um e as convenções de sinal |
| [`docs/02-indicadores.md`](docs/02-indicadores.md) | Os 33 indicadores: fórmula, faixas e o que cada um mede |
| [`docs/03-conferencia.md`](docs/03-conferencia.md) | Identidades, âncoras impressas e cruzamentos — o núcleo do método |
| [`docs/04-score-e-rating.md`](docs/04-score-e-rating.md) | Como a nota é composta, os tetos e a memória de cálculo |
| **[`docs/05-conectar-ia.md`](docs/05-conectar-ia.md)** | **Como ligar um modelo: provedores, custo, o que delegar e o que nunca delegar** |
| [`docs/06-prompts.md`](docs/06-prompts.md) | Os prompts, o schema e por que cada regra existe |
| [`docs/07-operacao.md`](docs/07-operacao.md) | Lote, custo, reprocesso e o que fazer quando a conferência acusa |
| [`CHANGELOG.md`](CHANGELOG.md) | O que mudou em cada versão |

---

## Estado e limites

**O que é sólido.** O motor determinístico — 93 verificações automatizadas sobre um
caso real, rodando offline. As fórmulas, as faixas, a conferência, a nota e a síntese
foram construídos a partir de auditoria linha a linha de documentos assinados.

**O que depende do modelo.** A leitura do PDF. O motor reduz o risco (âncoras,
identidades, cruzamentos, período em código) mas não o elimina: um documento em que
o modelo leia errado *e* copie o total impresso errado passa na conferência. Nunca
tratei a extração como confiável sem alguém ler a conferência.

**O que não existe aqui.** Comparativo entre exercícios, exportação em PDF, interface
gráfica e persistência. O motor devolve objetos; o que fazer com eles é do seu sistema.

**Faixas de referência são genéricas.** As faixas de `INDICADORES_CONFIG` valem para
empresa brasileira de médio porte. Setores com estrutura própria (construção,
concessionárias, instituições financeiras, varejo de giro rápido) merecem faixas
próprias — o arquivo é uma tabela, e trocar uma faixa é trocar uma linha.

---

## Publicando ou adaptando

- [`PUBLICAR.md`](PUBLICAR.md) — descrição, tópicos e as configurações que deixam
  um repositório público **fechado para alteração**, com a verificação de
  histórico que precede o primeiro push
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — o que é aceito aqui (issues, forks) e o
  que não é (pull requests)
- [`SECURITY.md`](SECURITY.md) — o que este repositório não contém, e os cuidados
  ao mandar balanço de cliente para um provedor de IA

## Sobre o exemplo

`exemplos/exemplo-transportadora-2025.json` vem de um documento real — Balanço,
DRE, DFC e DMPL assinados por contador. **Nome, CNPJ e a identificação do
profissional foram removidos**; os valores são os originais, porque é neles que
está o valor do teste, e um conjunto de números de balanço sem identidade não
identifica ninguém.

## Licença

MIT.
