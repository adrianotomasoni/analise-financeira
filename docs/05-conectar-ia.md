# Conectar um modelo de IA

Este é o documento a ler antes da primeira extração.

---

## 1. A divisão de trabalho

A decisão mais importante do módulo não é qual modelo usar. É **o que se pede a
ele** — e, principalmente, o que não se pede.

| A IA faz | O código faz |
|---|---|
| Ler o documento e preencher campos | Derivar EBIT, EBITDA, resultado financeiro, não operacional |
| Copiar literalmente as linhas de TOTAL | Conferir cada campo contra o total copiado |
| Copiar trechos do cabeçalho sobre o período | Classificar exercício encerrado × balancete |
| Apontar o que **só se lê** no documento (ressalva do auditor, parcelamento, concentração) | Todos os alertas que se calculam de índice |
| Redigir o parecer sobre números já conferidos | Os 33 indicadores, a nota, o rating, a síntese |

Cada linha da coluna da direita já esteve na da esquerda em alguma versão deste
motor, e cada uma foi movida por um motivo concreto:

**A nota.** Quando `score` era um campo do schema, uma empresa com patrimônio líquido
de −R$ 63,6 milhões, liquidez corrente de 0,21 e prejuízo de R$ 19,6 milhões recebeu
−10; outra, com PL de R$ 493 mil sustentando R$ 35,8 milhões de passivo, recebeu +3.
O segundo número é defensável? Não havia como saber — não existia memória de cálculo.
Um número que quem decide não consegue explicar não serve para decidir.

**O EBITDA.** Pedir o EBITDA ao modelo *sem lhe dar um campo para a depreciação* o
leva a retirá-la das despesas administrativas para "chegar lá". O EBIT sai inflado,
e com ele margem operacional e as duas coberturas de juros. Hoje há campo próprio
para a depreciação, a instrução manda **não** removê-la das despesas, e o EBITDA é
`ebit + depreciacao_amortizacao`, em código.

**O período.** Um balancete classificado como exercício encerrado vira decisão sobre
demonstração não fechada — faltam provisão de IR, depreciação do ano inteiro, férias
e 13º. O erro inverso custa um rótulo a mais na tela. A assimetria é grande demais
para ficar a cargo de um modelo: ele reporta trechos literais do cabeçalho, e
`periodo.ts` decide.

**Os alertas numéricos.** Quando prompt e código mantinham listas paralelas para a
mesma condição, um caso saiu com 14 alertas, 4 deles a mesma coisa escrita de formas
diferentes ("PL negativo", "Patrimônio Líquido negativo", "passivo a descoberto",
"PL inferior a 10% do Ativo"). Hoje a regra numérica é uma só, em código, e
`mesclarRedFlagsIa()` descarta da lista do modelo o que casa com ela.

> **A regra prática:** se dá para calcular a partir dos números, calcule.
> Peça ao modelo o que exige ler o documento — e só isso.

---

## 2. Como a configuração chega ao motor

Antes de escolher o modelo, é preciso que a escolha chegue ao processo. Este é o
modo de falha mais barato de evitar e o mais caro de diagnosticar, porque ele é
**silencioso**: o `.env` está preenchido, ninguém o carrega, e o erro que aparece
é de credencial — mandando conferir exatamente a chave que já está certa.

A CLI é o **único** ponto do pacote que lê o `.env`. A biblioteca não lê:
`import { analisar }` não pode reescrever o `process.env` de quem importou. Num
serviço, a configuração vem do mecanismo do próprio serviço.

### Precedência

Da maior para a menor:

| # | Origem | Para quê |
|---|---|---|
| 1 | `--provedor` / `--modelo` na linha de comando | Uma execução avulsa |
| 2 | Variável exportada no shell, ou injetada pelo orquestrador | Container, CI, systemd |
| 3 | Arquivo em `ANALISE_ENV_FILE` | Vários perfis lado a lado |
| 4 | `.env` do diretório atual, depois o da raiz do pacote | O caso comum |

O nível 2 vencer o arquivo não é detalhe de implementação: é o que permite testar
um modelo sem editar nada,

```bash
IA_MODELO=claude-haiku-4-5 npm run cli -- analisar balanco.pdf
```

e é o que faz o mesmo build rodar em produção sem `.env` nenhum.

### Ver o que está valendo

```bash
npm run cli -- ambiente
```

```
  Configuração
    arquivo .env      /srv/analise/.env
    declara           IA_PROVEDOR, IA_BASE_URL, IA_API_KEY, IA_MODELO

  Provedor em vigor
    provedor          openai-compat
    modelo            qwen2.5:14b
    endpoint          http://localhost:11434/v1
    leitura de PDF    via --texto — o layout da tabela se perde
    credencial        IA_API_KEY definida

  ✓ Pronto.
```

Sai com código 1 quando falta algo, então serve de verificação em script de
implantação. E **nunca imprime credencial** — nem o valor, nem um trecho: só de
qual variável ela veio. O que o comando responde vem da mesma função que a
chamada real usa (`configuracaoEfetiva()`), e a sanidade exige que as duas
concordem; um diagnóstico livre para divergir do comportamento é pior que
diagnóstico nenhum.

---

## 3. Escolher o provedor

### Anthropic (padrão, recomendado)

```bash
IA_PROVEDOR=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

É o padrão por um motivo técnico, não comercial: **o PDF vai inteiro para o modelo**,
como bloco `document`, sem passar por extração de texto.

Balanço e DRE são tabelas. O texto extraído de um PDF perde exatamente a informação
que importa aqui — qual número está em qual coluna, qual linha é total e qual é
subconta, o que é nível 1 e o que é detalhe. Um `pdftotext` transforma

```
  Empréstimos e Financiamentos          13.622.255,97
      Empréstimos                        1.007.548,80
      (−) Juros a apropriar                 16.413,48 D
```

numa sequência de números sem hierarquia. É exatamente o caso que a instrução
"LINHAS DE TOTAL COM SUBCONTAS REDUTORAS" existe para resolver — e ela só funciona
se o modelo estiver vendo a indentação.

Modelo padrão: **`claude-opus-5`**, com pensamento adaptativo e esforço `high`.
Ler um DRE brasileiro com sublinhas financeiras dentro do bloco operacional
(o caso 3.07) é raciocínio, não transcrição.

```bash
# IA_MODELO=claude-sonnet-5     # economia defensável
# IA_MODELO=claude-haiku-4-5    # só documento simples, e leia a conferência
# IA_ESFORCO=medium             # low | medium | high | xhigh | max
```

### Endpoint compatível com OpenAI

OpenAI, OpenRouter, Groq, Together, vLLM, Ollama, LM Studio, gateway corporativo.

```bash
IA_PROVEDOR=openai-compat
IA_BASE_URL=https://api.openai.com/v1
IA_API_KEY=sk-...
IA_MODELO=gpt-4.1
```

**Exige `--texto`.** Esse dialeto não tem bloco de documento: o PDF precisa virar
texto antes, com a perda de layout descrita acima. Use quando houver uma restrição
real (contrato, dado que não pode sair da rede, modelo local obrigatório) — e,
nesse caso, leia a conferência de toda extração, sem exceção.

Modelos locais **sem suporte a chamada de função** não servem. O contrato do motor
é uma função validada contra JSON Schema; "peça JSON no prompt" devolve markdown com
cerca de código em uma execução a cada dez, e o motor não tem como distinguir isso
de uma leitura ruim.

### Outro provedor

Escreva um adaptador. A interface tem **uma operação**:

```ts
export interface ProvedorIA {
  readonly nome: string;
  readonly modelo: string;
  readonly aceitaPdf: boolean;
  gerarEstruturado(pedido: PedidoEstruturado): Promise<RespostaEstruturada>;
}
```

`src/ia/anthropic.ts` (≈120 linhas) e `src/ia/openai-compat.ts` (≈100) são os dois
exemplos. Nenhuma regra contábil, nenhum indicador e nenhuma parte da nota muda junto.

---

## 4. As duas chamadas

### Extração — documento → campos

```ts
const provedor = provedorDoAmbiente();
const extracao = await extrairDoDocumento(provedor, [{
  bytes: await readFile("balanco.pdf"), nome: "balanco.pdf", mime: "application/pdf",
}], { anoReferencia: 2025, escopo: "ambos" });
```

Depois da resposta do modelo, em código: derivação do DRE → classificação do período
→ conferência → **qualidade final**.

A última etapa é a que mais importa:

```ts
extracao.qualidadeDeclarada  // "alta"  ← o que o modelo achou do próprio trabalho
extracao.qualidade           // "baixa" ← o que a conferência mediu
```

`qualidade_extracao` é autoavaliação, e um modelo que leu o CMV errado e derivou o
Lucro Bruto desse CMV **não tem como saber que errou**: para ele, tudo fecha. A
conferência mede contra os totais impressos, que ele copiou mas não recalculou.
Quando as duas discordam, vale a conferência. A CLI marca a divergência em amarelo.

### Parecer — números conferidos → texto

```ts
const { parecer, texto } = await gerarParecer(provedor, analise, {
  empresa: { razao_social: "...", cnpj: "..." },
});
```

Chamada separada, e a separação é o ponto. Quando o parecer saía junto com a
extração, ele descrevia números que ninguém tinha conferido — e saía genérico
("situação crítica", "endividamento altíssimo"), **sem um valor sequer**, porque o
modelo estava ocupado lendo o PDF.

Aqui ele não vê o documento. Recebe o pacote pronto — contas, 33 indicadores, motivos
de cada "não se aplica", alertas com severidade, nota com memória, conferência e o
resumo determinístico — e a única tarefa é redigir. Não recalcula nada, e não tem
como: os números chegam prontos.

**O piso do rating é aplicado em código, depois da resposta.** Rating E força
`desfavoravel`; D e C não aceitam `favoravel`. O modelo pode ser mais duro que o
rating, nunca mais brando — e `parecer.recomendacaoRebaixada` registra quando isso
aconteceu. Um modelo tende a pedir licença para ser otimista; quem assume risco, não.

---

## 5. Custo

Por análise completa (extração + parecer), documento típico de 4 a 12 páginas:

| Modelo na extração | Ordem de grandeza |
|---|---|
| `claude-opus-5` | US$ 0,04 – 0,10 |
| `claude-sonnet-5` | US$ 0,02 – 0,04 |
| `claude-haiku-4-5` | US$ 0,01 – 0,02 |

`extracao.custoUsd` traz a estimativa da própria chamada, pela tabela de preços de
`src/ia/anthropic.ts`. É **estimativa** — a fatura é a do provedor, e a tabela local
envelhece; confira em <https://anthropic.com/pricing> antes de projetar volume.

Contexto para a decisão: a diferença entre o modelo mais caro e o mais barato, num
lote de 100 documentos, é da ordem de US$ 8. Uma leitura errada de patrimônio líquido
custa mais do que isso na primeira decisão tomada em cima dela. **Economize no
parecer, que é redação sobre dado pronto; não economize na extração.**

Para reprocessar em lote, sequencial com concorrência 2 e um teto de gasto diário.
Ver [`07-operacao.md`](07-operacao.md).

---

## 6. Erros e o que fazer

| Erro | Significa | O que fazer |
|---|---|---|
| `limite de taxa atingido (429)` | Rate limit | Repetir com espera exponencial. `ErroProvedor.repetivel` é `true` |
| `credencial inválida` | Chave errada, ou não chegou ao processo | `analise-financeira ambiente` — ele diz se a variável foi encontrada e de onde |
| `o modelo não chamou 'salvar_analise_financeira'` | Não houve chamada de função | Quase sempre modelo sem suporte a `tools`. Trocar de modelo |
| `o modelo recusou a solicitação` | Classificador de segurança | Raro em documento contábil. Verificar se o PDF é o esperado |
| `este provedor não aceita PDF direto` | `openai-compat` com PDF | Rodar com `--texto`, ou usar o provedor `anthropic` |
| `JSON inválido do modelo` | Argumentos malformados | Repetir uma vez; persistindo, o modelo não serve |

**Nunca** repita uma chamada que falhou por conteúdo (400, recusa, JSON inválido duas
vezes) esperando resultado diferente. Repita só o que é transitório: 429, 5xx, rede.

---

## 7. Segurança e privacidade

Balanço é documento sensível. Três pontos:

1. **O documento sai da sua rede.** Vai para o provedor. Se isso for inaceitável,
   a saída é modelo local com suporte a chamada de função via `openai-compat` — e
   aceitar a perda de leitura de tabela que o `--texto` impõe.
2. **A chave fica no `.env`, que está no `.gitignore`.** Nunca a coloque no código
   nem em log. O motor não a imprime em lugar nenhum.
3. **Retenção é do provedor.** Confira a política de retenção e de treinamento do
   fornecedor que escolher antes de mandar documento de cliente.

---

## 8. Trocando de modelo

Trocar de modelo muda a leitura. Antes de adotar um novo em produção:

```bash
npm run cli -- analisar documento-conhecido.pdf --json novo.json
```

e compare com a extração anterior do **mesmo documento**. O que olhar, em ordem:

1. **Âncoras quebradas** — `conferencia.quebradas` com `bloco: "ancoras"`. É o sinal
   mais forte de leitura pior.
2. **Sinal do patrimônio líquido e do resultado.** Uma troca de sinal aqui inverte
   a análise inteira.
3. **`qualidade` × `qualidadeDeclarada`.** Um modelo que declara "alta" enquanto a
   conferência mede "baixa" é pior que um que declara "média" e acerta.
4. **Empréstimos CP e LP.** É onde as linhas de total com subcontas redutoras
   derrubam a leitura.

Um modelo mais barato que passa nesses quatro pontos num conjunto de documentos
representativos é uma economia legítima. Um que passa em um documento não é evidência
de nada.
