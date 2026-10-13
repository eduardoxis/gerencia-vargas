// js/modules/listaOrcamento.js
// A "Lista de Orçamento" é o mesmo carrinho já usado no restante do site
// (js/cart.js). Este módulo só expõe leituras simples para o fluxo de
// solicitação de orçamento, sem duplicar a lógica de armazenamento.
import { obterCarrinho } from "../modules/cart.js";

export function obterItensOrcamento() {
  return obterCarrinho();
}

export function listaVazia() {
  return obterItensOrcamento().length === 0;
}
