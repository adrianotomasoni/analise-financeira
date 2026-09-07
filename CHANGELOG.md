# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
versionamento conforme [SemVer](https://semver.org/lang/pt-BR/).

---

## [Não publicado]

### Corrigido

- **A leitura local de PDF (`--texto`) estava quebrada.** A atualização
  automática da `pdf-parse` de 1.x para 2.4.5 trocou a função default pela
  classe `PDFParse`, e nada acusou: o typecheck passava porque havia um
  `declare module "pdf-parse"` local afirmando a API antiga, e as verificações
  de sanidade rodam offline, sem tocar em PDF. O CI ficou verde sobre um
  caminho que falhava em tempo de execução.
  - A extração foi movida para `src/pdf.ts` e reescrita para a API v2.
  - `types/pdf-parse.d.ts` foi removido: a v2 publica os próprios tipos, e era
    aquela declaração que impedia o typecheck de ver a mudança.
  - O texto passa a ser montado página a página. `resultado.text` da v2
    intercala um marcador `-- N of M --` que a v1 não produzia, e esse texto
    vai inteiro para o prompt — que foi calibrado sem ele.
  - Novo cenário de sanidade lê um PDF de verdade (`testes/exemplo-minimo.pdf`,
    sintético, gerado sem biblioteca). Com o código anterior, `npm run teste`
    sai com código 1.

---

## [1.1.0] — 2026-09-07

Primeira versão instalável. A `1.0.0` nunca chegou ao npm, e não teria
funcionado se tivesse: o comando declarado em `bin` apontava para um arquivo
que o build não gerava.

### Corrigido

- **A configuração de IA não chegava ao processo.** Nada no pacote lia o `.env`
  — sem `dotenv`, sem `--env-file`, sem `process.loadEnvFile`. O `install.sh`
  criava o arquivo e a documentação mandava editá-lo, mas as variáveis nunca
  saíam dele. O erro que aparecia era de credencial, mandando conferir a chave
  que já estava certa.
- **O pacote não entregava onde prometia.** `rootDir` era `"."`, então o build
  emitia em `dist/src/` enquanto `bin`, `main`, `types` e `exports` apontavam
  para `dist/`. O comando instalado por `install.sh --global` apontava para
  arquivo inexistente e `import ... from "analise-financeira-br"` falhava.
  Nenhum teste percorria esse caminho, porque tudo rodava via `tsx` a partir
  de `src/`.
- `.gitignore`, `.env.example` e `.github/CODEOWNERS` passam a existir no
  repositório. O upload pela interface web do GitHub os havia descartado por
  serem dotfiles — inclusive o `.gitignore` que protege o `.env`.
- `install.sh` volta a ser executável (modo `100755`).

### Adicionado

- **`src/ambiente.ts`** — carregamento do `.env` com precedência declarada:
  variável do shell > `ANALISE_ENV_FILE` > `.env` do diretório atual > `.env`
  da raiz do pacote. Usa `process.loadEnvFile` quando disponível (Node ≥ 20.12)
  e traz um parser mínimo para o resto da linha 20. Arquivo ausente não é erro:
  em container e CI a configuração vem inteira do ambiente. Sem dependências
  novas.
- **Comando `analise-financeira ambiente`** — mostra provedor, modelo, endpoint
  e credencial encontrada sem gastar uma chamada, e sai com código 1 quando
  falta configuração, para servir de verificação em script de implantação.
  Nunca imprime credencial: apenas de qual variável ela veio.
- **`configuracaoEfetiva()`** — fonte única da resolução de provedor e modelo.
  `provedorDoAmbiente()` constrói o adaptador em cima dela, para que o
  diagnóstico não possa divergir do que a chamada real faz. A sanidade exige
  que os dois concordem.
- **CI no GitHub Actions** — build, typecheck, as verificações de sanidade,
  smoke do binário compilado e conferência do pacote, em Node 20 e 22. Roda
  offline, sem segredo algum.
- 22 verificações de sanidade novas (93 → 126), cobrindo precedência de
  configuração, arquivo ausente, provedor inválido, a concordância entre
  diagnóstico e chamada real, e a correspondência entre o que o `package.json`
  promete e o que o build entrega.

- **Apoio a uso por terceiros** — `LICENSE` passa a nomear o titular do
  copyright (a MIT exige preservar o aviso, e não havia de quem); badges de CI,
  licença e Node no README; formulários de issue para erro de cálculo, faixa de
  referência e defeito de funcionamento, cada um avisando o que não colar em
  repositório público — demonstração de empresa identificável e chave de API;
  template de pull request que recusa antes, e não depois, explicando o caminho
  que funciona; e Dependabot mensal para npm e para as actions do workflow.
- **`package-lock.json` versionado**, e o CI passa a usar `npm ci`. Sem ele, uma
  versão nova de dependência podia deixar o CI vermelho sem que nada no
  repositório tivesse mudado — e verde de novo no dia seguinte.

### Alterado

- A biblioteca continua sem ler o `.env`, e isso passa a ser explícito: só a
  CLI carrega o arquivo. `import { analisar }` não reescreve o `process.env` de
  quem importou — num serviço multi-tenant, isso vazaria a chave de um cliente
  para a chamada de outro.
- O comando `ambiente` passa a reconhecer o placeholder do `.env.example` como
  credencial ausente. O `install.sh` copia aquele arquivo para `.env`, então
  logo após instalar a chave "existia" e não valia nada — e o diagnóstico dizia
  "pronto" justamente no cenário mais comum de não estar. Uma verificação de
  sanidade agora carrega o `.env.example` real do repositório e exige que o
  diagnóstico acuse.
- `SECURITY.md` dizia "não há workflows do GitHub Actions". Passou a haver, e a
  afirmação foi corrigida: o workflow não usa `secrets`, não chama provedor de
  IA e declara `permissions: contents: read`.

---

## [1.0.0] — 2026-09-07

Publicação inicial do motor de leitura, conferência e análise de Balanço
Patrimonial e DRE brasileiros.

- `analisar()` determinístico: 33 indicadores, conferência por identidades
  contábeis e por âncoras impressas, sinais de alerta com severidade, nota
  0–100 com memória de cálculo, rating e síntese. Sem IA e sem rede.
- Extração por IA com dois provedores plugáveis: Anthropic (PDF direto, com o
  layout da tabela preservado) e qualquer endpoint compatível com OpenAI (via
  `--texto`).
- A conferência manda na qualidade declarada pelo modelo: um modelo que derivou
  um total do próprio número errado não tem como saber que errou.
- O piso do rating é aplicado em código depois do parecer — o modelo pode ser
  mais duro que o rating, nunca mais brando.
- CLI, documentação em `docs/`, caso de referência anonimizado e verificação de
  sanidade offline.

[1.1.0]: https://github.com/adrianotomasoni/analise-financeira/releases/tag/v1.1.0
