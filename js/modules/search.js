// js/modules/search.js
import { debounce } from "../utils/utils.js";

export function buscarProdutos(produtos, termo) {
  if (!termo?.trim()) return produtos;
  const t = termo.toLowerCase().trim();
  return produtos.filter(p =>
    p.nome?.toLowerCase().includes(t) ||
    p.marca?.toLowerCase().includes(t) ||
    p.categoria?.toLowerCase().includes(t) ||
    p.codigo?.toLowerCase().includes(t) ||
    (p.etiquetas || []).some(e => e.toLowerCase().includes(t))
  );
}

export function ativarBuscaTempoReal(inputEl, onBuscar, delay = 250) {
  inputEl.addEventListener("input", debounce(() => onBuscar(inputEl.value), delay));
}
