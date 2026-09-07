# Publicar este repositório com segurança

Guia de uma passada só: descrição, tópicos e as configurações que deixam o
repositório **público para leitura e fechado para alteração**.

---

## Antes de tornar público — a verificação que não pode ser pulada

Tornar um repositório público é **irreversível na prática**. O histórico do Git
vai junto, e basta um clone de trinta segundos para que qualquer coisa que já
tenha sido commitada, mesmo que apagada depois, continue existindo fora do seu
controle. Voltar para privado não desfaz isso.

```bash
# 1. Nenhuma credencial em NENHUM commit do histórico — não basta olhar o HEAD.
#    Os quantificadores evitam alarme falso com os placeholders "sk-ant-..." que
#    aparecem de propósito na documentação: uma chave real tem dezenas de
#    caracteres depois do prefixo.
git log -p --all | grep -nE 'sk-ant-[A-Za-z0-9_-]{20}|sk-[A-Za-z0-9]{32}|eyJhbGciOi|BEGIN [A-Z ]*PRIVATE KEY' | head

# 2. Nenhum CNPJ, CPF ou registro profissional
git grep -nE '[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}|CRC ?[A-Z]{2}[0-9]+'

# 3. O .env nunca foi versionado
git log --all --oneline -- .env

# 4. O que EXATAMENTE vai público
git ls-files
```

A segunda e a terceira devem voltar vazias. A quarta lista os arquivos que vão a
público: confira que não há nada inesperado ali.

A primeira varre o **histórico**, e ali há duas ocorrências conhecidas — ambas
inofensivas, ambas nomeadas aqui para que uma terceira salte aos olhos:

1. A própria linha de comando escrita neste arquivo, que contém o padrão literal.
2. Uma string sintética que esteve em `testes/sanidade.ts` até o commit seguinte a
   `c219172`, imitando o formato de uma chave. Foi trocada por um valor que não
   imita chave nenhuma, justamente para não gastar a atenção de quem revisa.

Para verificar o que vai a público **hoje**, sem o ruído do histórico:

```bash
git grep -nE 'sk-ant-[A-Za-z0-9_-]{20}|sk-[A-Za-z0-9]{32}|eyJhbGciOi' -- . ':!PUBLICAR.md'
```

Essa tem de voltar vazia, sem exceção. O `:!PUBLICAR.md` exclui este arquivo, que
contém os padrões literais e casaria consigo mesmo — o mesmo motivo pelo qual a
varredura do histórico tem a ocorrência 1.

> Se você afrouxar o padrão da primeira para um `sk-ant-` solto, ela acusa cinco
> ocorrências — são os placeholders `sk-ant-...` na documentação, propositais.
> Confira sempre **o que** casou antes de concluir que há vazamento; um padrão
> largo demais treina você a ignorar o alarme, que é o pior resultado possível.

Se alguma acusar algo, **não publique ainda**: apagar o arquivo num commit novo
não resolve — o dado continua no histórico. Ou reescreva o histórico
(`git filter-repo`) antes do primeiro push, ou comece um repositório novo a
partir de um commit único.

> **Nota sobre o exemplo.** `exemplos/exemplo-transportadora-2025.json` vem de um
> documento real e já foi anonimizado: nome, CNPJ e identificação do contador
> removidos. Os valores são os originais, porque é neles que está o valor do
> teste — e um conjunto de números de balanço, sem identidade, não identifica
> ninguém. Se ainda assim quiser afastar qualquer chance de correspondência,
> multiplique todos os valores monetários por um fator constante: as identidades,
> os índices e a nota são invariantes a escala; só as asserções de valor absoluto
> no `testes/sanidade.ts` precisam ser ajustadas pelo mesmo fator.

---

## Descrição do repositório

**Campo "Description"** (aparece na busca e no topo da página — limite ~350
caracteres). Escolha uma:

*Curta:*
```
Motor de leitura e análise de Balanço Patrimonial e DRE brasileiros. Extrai o PDF com IA, confere a leitura contra os totais impressos no próprio documento e calcula 33 indicadores, sinais de alerta e uma nota 0–100 com memória de cálculo. A IA lê; quem pontua é o código.
```

*Longa (usa melhor o espaço disponível):*
```
Motor de leitura, conferência e análise de Balanço Patrimonial e DRE brasileiros. Lê o PDF com um modelo de IA e confere o que foi lido contra as linhas de total impressas no próprio documento — a única checagem independente da leitura. Produz 33 indicadores com semáforo, sinais de alerta, nota 0–100 com memória de cálculo e parecer redigido. TypeScript, sem banco, provedor de IA plugável.
```

**Website:** deixe vazio, ou aponte para `docs/05-conectar-ia.md` no próprio repo.

**Tópicos** (máx. 20; estes 14 cobrem como as pessoas realmente buscam):

```
balanco-patrimonial   dre                  analise-financeira    analise-de-credito
demonstracoes-financeiras                  indicadores-financeiros
contabilidade         credit-risk          financial-statements  financial-analysis
pdf-extraction        llm                  claude                typescript
```

**Marque:** *Releases*, *Packages* — desmarque se não for publicar no npm.

---

## Configurações — público, mas fechado para alteração

### O ponto de partida que já é seguro

**Num repositório público, ninguém de fora consegue alterar o seu código.** Não
existe "editar direto"; sem acesso de escrita, o máximo que alguém faz é *forkar*
(cria uma cópia na conta dele, não toca na sua) e *abrir um pull request* (uma
proposta, que só entra se você mesclar).

Então o que a configuração abaixo faz não é impedir estranhos — isso é o padrão.
É fechar as três frestas que sobram: **erro seu ou de quem tem acesso**, **ruído
de terceiros** e **execução de código de fork**.

### 1. Proteger a branch `main` — Settings → Rules → Rulesets → New branch ruleset

Rulesets substituíram as *branch protection rules* e funcionam em repositório
público de conta gratuita.

| Campo | Valor |
|---|---|
| Ruleset Name | `main protegida` |
| Enforcement status | **Active** |
| Bypass list | **deixe vazia** — inclusive você |
| Target branches | Include default branch |

Regras a marcar:

- ☑ **Restrict deletions** — ninguém apaga a `main`
- ☑ **Block force pushes** — ninguém reescreve o histórico
- ☑ **Require a pull request before merging** → *Required approvals:* **1**
  - ☑ Require review from Code Owners
  - ☑ Dismiss stale pull request approvals when new commits are pushed
- ☑ **Require signed commits** *(opcional; exige assinatura GPG/SSH configurada)*

> **Deixar a bypass list vazia vale mais do que parece.** É o que impede o
> `git push --force` distraído às onze da noite. Se atrapalhar demais o seu
> próprio fluxo, trabalhe em branch e abra PR para você mesmo — em código que
> embasa decisão financeira, esse atrito é o produto, não o efeito colateral.

Com o `CODEOWNERS` incluído neste repositório, ajuste `@SEU-USUARIO-GITHUB` para
o seu usuário antes de ativar a regra de Code Owners.

### 2. Desligar o que não vai usar — Settings → General → Features

| Item | Recomendado | Por quê |
|---|---|---|
| **Wikis** | ☐ desligar | Qualquer um com acesso de leitura pode editar wiki em alguns cenários. A documentação está em `docs/`, versionada |
| **Issues** | ☑ **manter** | É o canal para alguém avisar de um erro de cálculo. Vale o ruído |
| **Projects** | ☐ desligar | Não usa |
| **Discussions** | ☐ desligar | Vira canal de suporte que você não vai atender |
| **Sponsorships** | ☐ desligar | — |
| **Preserve this repository** | ☑ ligar | Arquivo no GitHub Archive Program |

**Pull Requests:** desmarque *Allow merge commits* e *Allow rebase merging*, deixe
só **Squash merging**; marque *Automatically delete head branches*.

> Não é possível desativar pull requests num repositório público — nem desativar
> forks. É o modelo do GitHub. O `CONTRIBUTING.md` deste repositório diz
> explicitamente que PRs não são mesclados, o que resolve a expectativa sem
> depender de configuração.

### 3. Actions — Settings → Actions → General

Este repositório **não tem workflows**, e é o que elimina a maior superfície de
risco de um repositório público: workflow que roda em PR de fork.

| Campo | Valor |
|---|---|
| Actions permissions | **Disable actions** |

Se um dia adicionar CI, volte aqui e configure:
- *Fork pull request workflows* → **Require approval for all external collaborators**
- *Workflow permissions* → **Read repository contents permission**
- ☐ desmarcar *Allow GitHub Actions to create and approve pull requests*
- **Nunca** use o gatilho `pull_request_target` com checkout do código do fork.
  É a receita conhecida de execução de código não confiável com o seu token.

### 4. Segurança — Settings → Advanced Security

Tudo abaixo é **gratuito em repositório público**. Ligue os quatro:

- ☑ **Secret scanning** — varre o histórico atrás de credenciais e avisa
- ☑ **Push protection** — **bloqueia o push** que contenha uma credencial. Este é
  o que efetivamente salva: age antes de o segredo existir publicamente
- ☑ **Dependabot alerts** — avisa de CVE nas dependências
- ☑ **Private vulnerability reporting** — dá a alguém um canal privado para
  reportar falha, em vez de abrir issue pública

*Dependabot security updates* (que abre PR automático) é opcional: com PRs
fechados por política, ele vira ruído. Prefira os alertas e atualize à mão.

### 5. Colaboradores — Settings → Collaborators and teams

Menos é mais. Se precisar de alguém, dê **Read** (ou **Triage**, que permite
gerenciar issues sem escrever código). **Write** só para quem de fato mantém.
Nunca **Admin** para outra pessoa: Admin pode desligar tudo o que você acabou de
configurar, inclusive a ruleset.

---

## A opção nuclear: arquivar

Se o repositório é uma **publicação encerrada** — não haverá mais versões:

**Settings → General → Danger Zone → Archive this repository**

O repositório fica **inteiramente somente-leitura**: ninguém edita, comenta,
abre issue ou faz push — **você incluído**. Continua público, clonável e
indexado. É a garantia mais forte de "não editável" que existe no GitHub, e é
reversível: desarquivar devolve tudo.

Faça isso **depois** de publicar a versão final, nunca antes.

---

## Sequência

```bash
# 1. Ajuste o CODEOWNERS
sed -i 's/@SEU-USUARIO-GITHUB/@seu-usuario/' .github/CODEOWNERS

# 2. Rode as quatro verificações da primeira seção deste arquivo

# 3. Crie o repositório no GitHub — PRIVADO primeiro
git remote add origin git@github.com:seu-usuario/analise-financeira-br.git
git branch -M main
git push -u origin main

# 4. Confira no navegador o que subiu, arquivo por arquivo

# 5. Só então: Settings → General → Danger Zone → Change visibility → Public

# 6. Aplique as seções 1 a 5 acima
```

**Publicar primeiro como privado é o passo que mais evita arrependimento.** É a
única chance de olhar o repositório renderizado, com o histórico completo, antes
de ele ser clonável pelo mundo — e voltar de público para privado não desfaz um
clone que já aconteceu.
