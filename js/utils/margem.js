// js/utils/margem.js
// Cálculo de lucro e margem de um produto. São funções puras (sem DOM e sem
// Firebase), usadas pelo painel admin no formulário e na tabela de produtos.
//
// Entradas (todas opcionais; vazio/inválido/negativo conta como 0):
//   preco       preço de venda (R$)
//   custo       quanto o produto custou (R$ por unidade)
//   gastos      outros gastos por unidade: frete, embalagem... (R$)
//   impostoPct  impostos sobre a venda (%)
//   taxaPct     taxas de pagamento/comissão sobre a venda (%)
//   quantidade  estoque atual (para o lucro potencial do estoque)

function numero(valor) {
  const n = typeof valor === "string" ? parseFloat(valor.replace(",", ".")) : Number(valor);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const percentual = (valor) => Math.min(numero(valor), 100);
const centavos = (n) => Math.round(n * 100) / 100;

/**
 * Faixas de margem (referência simples, só para colorir o painel):
 *   prejuízo  lucro negativo
 *   baixa     margem abaixo de 10%
 *   media     de 10% até 20%
 *   boa       20% ou mais
 */
export function nivelDaMargem(lucro, margemPct) {
  if (margemPct === null) return null;
  if (lucro < 0) return "prejuizo";
  if (margemPct < 10) return "baixa";
  if (margemPct < 20) return "media";
  return "boa";
}

export const ROTULO_NIVEL_MARGEM = {
  prejuizo: "Prejuízo",
  baixa: "Margem baixa",
  media: "Margem média",
  boa: "Margem boa"
};

export function calcularMargem({ preco, custo, gastos, impostoPct, taxaPct, quantidade } = {}) {
  const venda = numero(preco);
  const custoUnit = numero(custo);
  const gastosUnit = numero(gastos);
  const pctImposto = percentual(impostoPct);
  const pctTaxa = percentual(taxaPct);
  const qtd = Math.max(0, Math.floor(numero(quantidade)));

  const imposto = venda * pctImposto / 100;
  const taxa = venda * pctTaxa / 100;
  const custoTotal = custoUnit + gastosUnit;
  const lucro = venda - custoTotal - imposto - taxa;

  // Margem = quanto do preço de venda vira lucro. Markup = lucro sobre o custo.
  const margemPct = venda > 0 ? (lucro / venda) * 100 : null;
  const markupPct = custoTotal > 0 ? (lucro / custoTotal) * 100 : null;

  // Preço em que o lucro é zero: o que sobra depois de impostos e taxas
  // (que são % do preço) precisa cobrir só o custo e os gastos.
  const fator = 1 - (pctImposto + pctTaxa) / 100;
  const precoMinimo = custoTotal > 0 && fator > 0 ? custoTotal / fator : null;

  return {
    preco: centavos(venda),
    custo: centavos(custoUnit),
    gastos: centavos(gastosUnit),
    imposto: centavos(imposto),
    taxa: centavos(taxa),
    lucro: centavos(lucro),
    margemPct: margemPct === null ? null : Math.round(margemPct * 10) / 10,
    markupPct: markupPct === null ? null : Math.round(markupPct * 10) / 10,
    precoMinimo: precoMinimo === null ? null : Math.ceil(precoMinimo * 100) / 100,
    lucroEstoque: centavos(lucro * qtd),
    quantidade: qtd,
    temCusto: custoTotal > 0,
    nivel: nivelDaMargem(lucro, margemPct)
  };
}

export function formatarPct(valor) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—";
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
