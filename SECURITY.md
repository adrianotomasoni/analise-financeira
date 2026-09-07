# Segurança

## Reportar uma vulnerabilidade

Abra uma **Security advisory** (aba *Security* → *Report a vulnerability*). Não
abra issue pública para falha explorável.

Se preferir, use a issue pública para qualquer coisa que **não** seja explorável —
inclusive erro de cálculo, que é o defeito mais provável neste código.

## O que este repositório não contém

- **Nenhuma credencial.** `.env` está no `.gitignore` desde o primeiro commit; o
  que está versionado é o `.env.example`, com placeholders.
- **Nenhum segredo de CI.** Não há workflows do GitHub Actions.
- **Nenhum dado identificável.** O arquivo de exemplo vem de um documento real,
  mas nome, CNPJ e a identificação do contador foram removidos. Os valores são os
  originais — sem identidade, um conjunto de números de balanço não identifica
  ninguém.

## Ao usar este código

**Balanço é documento sensível.** Três pontos que o `docs/05-conectar-ia.md`
detalha:

1. **O documento sai da sua rede** quando você usa um provedor de IA em nuvem.
   Se isso for inaceitável no seu caso, a saída é modelo local com suporte a
   chamada de função, aceitando a perda de leitura de tabela.
2. **A chave de API fica no `.env`.** O motor nunca a imprime, nunca a registra
   em log e nunca a envia a lugar nenhum além do provedor configurado.
3. **A retenção é do provedor.** Confira a política de retenção e de treinamento
   do fornecedor antes de mandar documento de cliente.

## Escopo

O motor não abre porta de rede, não escreve fora do diretório de trabalho e só
faz uma requisição de saída: a chamada ao provedor de IA que você configurar.
Rodar com `--sem-ia` não faz requisição nenhuma.
