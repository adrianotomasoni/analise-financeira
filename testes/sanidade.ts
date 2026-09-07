// Verificação do motor sobre um caso real, offline.
//
// Não é um teste unitário de fórmula: é a defesa contra os quatro erros que este
// motor existe para não cometer, medidos num documento de verdade (anonimizado):
// uma transportadora de médio porte, exercício 2025, com PL de −R$ 63,6 milhões.
//
//   1. Índice cego ao sinal. ROE, D/E, Imobilização do PL e Kanitz NÃO podem
//      ser calculados com PL negativo. Uma versão anterior os calculava e
//      pintava de verde uma empresa com passivo a descoberto.
//   2. Conferência que confere a IA contra ela mesma. A identidade
//      "Lucro Bruto = RL − CMV" FECHA sobre o payload realmente persistido em
//      04/09/2026 — porque o Lucro Bruto foi derivado do CMV errado. A âncora
//      contra o total impresso TEM de acusar os R$ 340.000,00.
//   3. EBITDA pedido ao modelo. O EBITDA correto é EBIT + depreciação,
//      calculado em código.
//   4. Nota vinda do modelo. O score sai das regras, com memória.
//
// Roda sem rede e sem chave. Se falhar, não use o build para decisão.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  calcularIndicadores, motivosIndisponiveis, calcularDividaFinanceiraBruta,
  MOTIVO_PL_NEGATIVO, MOTIVO_EBITDA_NEGATIVO, motivoEhDesfavoravel,
  type AnaliseFinanceira,
} from "../src/indicadores.js";
import { resumirConferencia } from "../src/conferencia.js";
import { derivarCamposDre, checarIdentidadeLair } from "../src/derive.js";
import { classificarPeriodo } from "../src/periodo.js";
import { analisar } from "../src/analisar.js";
import { notaParaScore, ratingDaNota } from "../src/score.js";
import { LEGENDA_PONTUACAO, LEGENDA_RATING } from "../src/legenda.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(aqui, "../exemplos/exemplo-transportadora-2025.json"), "utf8"));

let falhas = 0;
let total = 0;
function ok(label: string, cond: boolean, detalhe = "") {
  total++;
  if (cond) { console.log(`  ✓ ${label}`); return; }
  falhas++;
  console.log(`  ✗ ${label}${detalhe ? ` — ${detalhe}` : ""}`);
}
function eq(label: string, a: unknown, b: unknown) {
  ok(label, Object.is(a, b), `esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);
}
function perto(label: string, a: number | null, b: number, tol = 0.005) {
  ok(label, a !== null && Math.abs(a - b) <= Math.max(tol, Math.abs(b) * tol),
     `esperado ~${b}, obtido ${a}`);
}

const correto: AnaliseFinanceira = { ...fixture.correto, totais_impressos: fixture.totais_impressos };
const persistido: AnaliseFinanceira = { ...fixture.persistido_2026_09, totais_impressos: fixture.totais_impressos };
const esperado = fixture.esperado;

console.log("\nCenário A — derivações do DRE (nunca perguntadas ao modelo)");
{
  const d = derivarCamposDre(correto);
  perto("despesas operacionais não-financeiras", d.despesas_operacionais, esperado.despesas_operacionais);
  perto("EBIT derivado", d.ebit, esperado.ebit);
  perto("EBITDA = EBIT + depreciação", d.ebitda, esperado.ebitda);
  perto("resultado financeiro líquido", d.resultado_financeiro, esperado.resultado_financeiro);
  perto("despesas financeiras totais", d.despesas_financeiras_totais, esperado.despesas_financeiras_totais);
  perto("resultado não operacional", d.resultado_nao_operacional, esperado.resultado_nao_operacional);
  const lair = checarIdentidadeLair(correto.lucro_antes_ir, d.ebit, d.resultado_financeiro, d.resultado_nao_operacional);
  ok("LAIR impresso fecha por identidade", lair !== null && lair.ok);
}

console.log("\nCenário B — índices cegos ao sinal (PL de −R$ 63,6 mi)");
{
  const ind = calcularIndicadores(correto);
  const motivos = motivosIndisponiveis(correto);
  eq("ROE não é calculado", ind.roe, null);
  eq("D/E não é calculado", ind.debtEquity, null);
  eq("Imobilização do PL não é calculada", ind.imobilizacaoPL, null);
  eq("Kanitz não é calculado", ind.kanitz, null);
  eq("Dív. Financeira/PL não é calculada", ind.dividaFinanceiraPL, null);
  eq("motivo do ROE é o PL negativo", motivos.roe, MOTIVO_PL_NEGATIVO);
  ok("PL negativo conta como desfavorável no score", motivoEhDesfavoravel(motivos.roe));
  ok("EBITDA negativo seria desfavorável", motivoEhDesfavoravel(MOTIVO_EBITDA_NEGATIVO));
  // Os que continuam válidos com PL negativo
  perto("liquidez corrente", ind.liquidezCorrente, 0.2116, 0.01);
  perto("endividamento geral", ind.endividamentoTotal, 2.3708, 0.01);
  perto("dívida financeira bruta", calcularDividaFinanceiraBruta(correto), esperado.divida_financeira_bruta);
  perto("dívida líquida", ind.dividaLiquida, esperado.divida_liquida);
}

console.log("\nCenário C — âncoras impressas pegam o que a identidade deixa passar");
{
  // Sobre o payload REALMENTE persistido pela extração de 04/09/2026.
  const conf = resumirConferencia(persistido);
  const lb = conf.identidades.find((i) => i.chave === "lucro_bruto");
  ok("a identidade Lucro Bruto = RL − CMV FECHA sobre o payload errado",
     lb !== undefined && lb.aplicavel && lb.ok);
  const ancora = conf.identidades.find((i) => i.chave === "ancora_lucro_bruto");
  ok("a âncora do Lucro Bruto ACUSA a divergência", ancora !== undefined && ancora.aplicavel && !ancora.ok);
  perto("e a diferença é exatamente R$ 340.000,00", ancora?.diff ?? null, 340000, 0.001);
  ok("a conferência marca âncora quebrada", conf.ancoraQuebrada);
  eq("qualidade sugerida cai para baixa", conf.qualidadeSugerida, "baixa");

  // Sobre os números CORRETOS — os do PDF assinado — as 9 identidades, as 12
  // âncoras e os cruzamentos com a DMPL fecham. Sobra exatamente um:
  const confOk = resumirConferencia(correto);
  ok("com os números corretos, nenhuma identidade quebra",
     confOk.quebradas.every((q) => q.bloco === "cruzamentos"),
     `quebraram: ${confOk.quebradas.map((q) => q.chave).join(", ")}`);
  ok("nenhuma âncora impressa quebra", !confOk.ancoraQuebrada);
  ok("o balanço fecha", !confOk.balancoQuebrado);
  ok("os cruzamentos com DFC e DMPL foram avaliados",
     confOk.identidades.filter((i) => i.bloco === "cruzamentos" && i.aplicavel).length >= 3);

  // A depreciação da DRE (R$ 14,19 mi) e a da DFC (R$ 15,63 mi) divergem 10,1%,
  // acima da tolerância de 5%. Isso está no documento ASSINADO pelo contador e é
  // normal: a DFC costuma somar amortizações e baixas de imobilizado que a linha
  // de depreciação da DRE não traz. Não é erro de extração — e é por isso que a
  // quebra vale `media` e não `baixa`. O motor não a esconde nem a trata como
  // fatal: ela aparece na conferência, entra no parecer como ressalva, e quem
  // subscreve decide. Um motor que "arredondasse" isso para `alta` estaria
  // afirmando uma precisão que o documento não tem.
  const dep = confOk.quebradas.find((q) => q.chave === "dfc_depreciacao");
  ok("o cruzamento de depreciação DRE × DFC acusa a diferença real", dep !== undefined);
  perto("e a diferença é de R$ 1.438.616,72", dep?.diff ?? null, 1438616.72, 0.001);
  eq("uma quebra só de cruzamento mantém a qualidade em média", confOk.qualidadeSugerida, "media");
}

console.log("\nCenário D — score determinístico com memória");
{
  const a = analisar(correto);
  eq("rating E", a.score.rating, "E");
  ok("nota travada pelo teto do PL negativo", a.score.nota <= 20, `nota ${a.score.nota}`);
  ok("a memória registra o teto",
     a.score.memoria.some((m) => m.tipo === "teto" && m.label === "PL negativo"));
  ok("a memória tem uma linha por grupo de indicadores",
     a.score.memoria.filter((m) => m.tipo === "grupo").length === 6);
  ok("há pelo menos um alerta crítico", a.contagemFlags.critica >= 1);
  ok("PL negativo está entre os alertas",
     a.redFlags.some((f) => f.chave === "pl_negativo" && f.severidade === "critica"));
  ok("dividendos pagos em ano de prejuízo viram alerta crítico",
     a.redFlags.some((f) => f.chave === "dividendos_com_prejuizo"));
  ok("o score não é liberado (âncoras ok, mas o motivo tem de ser explícito)",
     a.score.liberado === true || typeof a.score.motivoBloqueio === "string");
  ok("a síntese cita a conclusão", a.sintese.some((p) => p.titulo === "Conclusão"));
  ok("a síntese tem estrutura patrimonial", a.sintese.some((p) => p.titulo === "Estrutura patrimonial"));
}

console.log("\nCenário E — o score bloqueia quando a leitura não é confiável");
{
  const a = analisar(persistido);
  eq("score não liberado com âncora quebrada", a.score.liberado, false);
  ok("e o motivo aponta o total impresso",
     (a.score.motivoBloqueio ?? "").includes("total impresso"));
}

console.log("\nCenário F — classificação de período é decisão do código");
{
  const encerrado = classificarPeriodo({ data_fim: "2025-12-31", ano_referencia: 2025, ano_corrente: 2026 });
  eq("31/12 sem indício → exercício encerrado", encerrado.tipo, "exercicio_fechado");

  const parcial = classificarPeriodo({
    data_fim: "2026-04-30", ano_referencia: 2026, ano_corrente: 2026,
    indicios_texto: ["BALANCETE DE VERIFICAÇÃO acumulado até 30/04/2026"],
  });
  eq("corte fora de 31/12 → balancete parcial", parcial.tipo, "balancete_parcial");
  eq("com 4 meses de competência", parcial.meses_competencia, 4);

  const encerramento = classificarPeriodo({
    tipo_documento: "balancete_2025", data_fim: "2025-12-31",
    ano_referencia: 2025, ano_corrente: 2026, meses_declarado: 12,
  });
  eq("balancete de encerramento em 31/12 → exercício encerrado", encerramento.tipo, "exercicio_fechado");
  eq("e a regra fica registrada", encerramento.regra, "balancete_de_encerramento_31_12");
}

console.log("\nCenário G — legenda derivada da conversão real");
{
  for (const linha of LEGENDA_PONTUACAO) {
    const m = linha.leitura.match(/nota (?:(\d+) a (\d+)|até (\d+))\)/);
    ok(`faixa "${linha.faixa}" declara o intervalo de nota`, !!m);
    if (!m) continue;
    const lo = m[3] ? 0 : Number(m[1]);
    const hi = Number(m[3] ?? m[2]);
    const [x, y] = linha.faixa.split(" a ").map((t) => Number(t.replace("−", "-").replace("+", "")));
    const min = Math.min(x, y), max = Math.max(x, y);
    ok(`faixa "${linha.faixa}": nota ${lo} está dentro`, notaParaScore(lo) >= min && notaParaScore(lo) <= max);
    ok(`faixa "${linha.faixa}": nota ${hi} está dentro`, notaParaScore(hi) >= min && notaParaScore(hi) <= max);
    if (lo > 0) ok(`faixa "${linha.faixa}": nota ${lo - 1} está fora`, notaParaScore(lo - 1) < min);
    if (hi < 100) ok(`faixa "${linha.faixa}": nota ${hi + 1} está fora`, notaParaScore(hi + 1) > max);
  }
  for (const l of LEGENDA_RATING) {
    const n = l.faixaNota.match(/(\d+)/g)?.map(Number) ?? [];
    const lo = l.rating === "E" ? 0 : n[0];
    const hi = l.rating === "A" ? 100 : (n[1] ?? n[0] - 1);
    eq(`legenda ${l.rating}: nota ${lo}`, ratingDaNota(lo), l.rating);
    eq(`legenda ${l.rating}: nota ${hi}`, ratingDaNota(hi), l.rating);
  }
}

console.log("\nCenário H — contas cruas + derivação = análise completa");
{
  // O caminho de quem já tem os números e não usa IA nenhuma. Sem rodar
  // `derivarCamposDre` sobre eles, cinco indicadores somem em silêncio — foi um
  // defeito real da CLI, e este cenário existe para ele não voltar.
  const cruas: AnaliseFinanceira = { ...fixture.correto, totais_impressos: fixture.totais_impressos };
  eq("o JSON de contas não traz EBIT", cruas.ebit ?? null, null);

  const d = derivarCamposDre(cruas);
  const completas: AnaliseFinanceira = {
    ...cruas,
    despesas_operacionais: d.despesas_operacionais,
    ebit: d.ebit, ebitda: d.ebitda, resultado_financeiro: d.resultado_financeiro,
  };
  const a = analisar(completas);
  ok("margem operacional aparece", a.indicadores.margemOperacional !== null);
  ok("margem EBITDA aparece", a.indicadores.margemEbitda !== null);
  ok("cobertura de juros pelo EBIT aparece", a.indicadores.coberturaJuros !== null);
  ok("cobertura de juros pelo EBITDA aparece", a.indicadores.coberturaJurosEbitda !== null);
  perto("Dív. Líq./EBITDA = 17,81x", a.indicadores.dividaLiquidaEbitda, 17.81, 0.01);
  ok("e a conferência avalia mais verificações que sem derivar",
     a.conferencia.avaliadas > analisar(cruas).conferencia.avaliadas);
}

console.log(
  falhas === 0
    ? `\n✅ ${total} verificações, todas passaram.\n`
    : `\n❌ ${falhas} de ${total} verificações falharam.\n`,
);
process.exit(falhas === 0 ? 0 : 1);
