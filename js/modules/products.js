// js/modules/products.js
import { escHtml, formatBRL, imgPos } from "../utils/utils.js";
import { incrementarCompartilhamento } from "../services/firestore.js";
import { salvarFavoritosNuvem } from "../services/contaSync.js";
import { icon } from "../utils/icons.js";

const CHAVE_FAVORITOS = "futura_favoritos";

export function obterFavoritos() {
  try { return JSON.parse(localStorage.getItem(CHAVE_FAVORITOS)) || []; }
  catch { return []; }
}

export function obterIdsFavoritos() {
  return obterFavoritos()
    .map(item => typeof item === "string" ? item : item?.id)
    .filter(Boolean);
}

function resumoFavorito(produto) {
  return {
    id: produto.id,
    nome: produto.nome || "Produto",
    marca: produto.marca || "",
    preco: Number(produto.preco) || 0,
    imagem: produto.imagem || "",
    status: produto.status || "disponivel",
    quantidade: Number(produto.quantidade) || 0
  };
}

function salvarFavoritos(lista) {
  localStorage.setItem(CHAVE_FAVORITOS, JSON.stringify(lista));
  salvarFavoritosNuvem(lista).catch(() => {});
}

function atualizarBotoesFavoritos() {
  const favoritos = new Set(obterIdsFavoritos());
  document.querySelectorAll("[data-fav-id]").forEach(botao => {
    const ativo = favoritos.has(botao.dataset.favId);
    botao.classList.toggle("is-active", ativo);
    botao.setAttribute("aria-pressed", String(ativo));
  });
}

export function aplicarFavoritosSincronizados(lista) {
  localStorage.setItem(CHAVE_FAVORITOS, JSON.stringify(Array.isArray(lista) ? lista : []));
  atualizarBotoesFavoritos();
}

export function alternarFavorito(id, produto = null) {
  const lista = obterFavoritos();
  const idx = lista.findIndex(item => (typeof item === "string" ? item : item?.id) === id);
  if (idx >= 0) lista.splice(idx, 1);
  else lista.push(produto ? resumoFavorito(produto) : id);
  salvarFavoritos(lista);
  const ativo = lista.some(item => (typeof item === "string" ? item : item?.id) === id);
  atualizarBotoesFavoritos();
  return ativo;
}

// Migração gradual dos favoritos antigos (que guardavam apenas o ID). Uma
// única escrita substitui várias leituras futuras da tela "Minha conta".
export function migrarFavoritosLegados(produtos = []) {
  const porId = new Map(produtos.filter(Boolean).map(produto => [produto.id, produto]));
  const atuais = obterFavoritos();
  if (!atuais.some(item => typeof item === "string")) return;
  const migrados = atuais
    .map(item => typeof item === "string" ? (porId.has(item) ? resumoFavorito(porId.get(item)) : null) : item)
    .filter(Boolean);
  salvarFavoritos(migrados);
}

export function cartaoProduto(produto, favoritos = null) {
  const semEstoque = produto.status === "sem_estoque" || Number(produto.quantidade) <= 0;
  const etiquetasHtml = (produto.etiquetas || [])
    .map(e => `<span class="tag-badge">${escHtml(e)}</span>`)
    .join("");
  const favoritado = favoritos instanceof Set ? favoritos.has(produto.id) : obterIdsFavoritos().includes(produto.id);
  const imagem = imgPos(produto.imagem, 480).src || "/assets/images/placeholder.svg";

  return `
    <div class="product-card ${semEstoque ? "is-out" : ""}" data-id="${produto.id}">
      <button class="product-card__fav ${favoritado ? "is-active" : ""}" data-fav-id="${produto.id}" aria-label="Favoritar produto" aria-pressed="${favoritado}">${icon("heart")}</button>
      <a class="product-card__link" href="/pages/produto.html?id=${produto.id}">
        <div class="product-card__image">
          <img src="${imagem}" style="object-position:center center" alt="${escHtml(produto.nome)}" loading="lazy" decoding="async" width="411" height="732">
          ${etiquetasHtml ? `<div class="product-card__tags">${etiquetasHtml}</div>` : ""}
          ${semEstoque ? `<span class="badge-outofstock">Sem estoque</span>` : ""}
        </div>
        <div class="product-card__body">
          ${produto.marca ? `<span class="product-card__brand">${escHtml(produto.marca)}</span>` : ""}
          <h3 class="product-card__name">${escHtml(produto.nome)}</h3>
          <span class="product-card__price">${formatBRL(produto.preco)}</span>
          ${Array.isArray(produto.cores) && produto.cores.length ? `
          <div class="product-card__cores" aria-hidden="true">
            ${produto.cores.slice(0, 5).map(c => `<span class="product-card__cor-dot" style="background:${escHtml(c.hex || "#cccccc")}" title="${escHtml(c.nome)}"></span>`).join("")}
          </div>` : ""}
        </div>
      </a>
      ${!semEstoque ? `
      <div class="product-card__actions">
        <button class="btn-primary product-card__add" data-add-id="${produto.id}">Adicionar</button>
        <button class="btn-whatsapp product-card__ask" data-ask-id="${produto.id}" aria-label="Falar sobre este produto no WhatsApp">${icon("whatsapp")}<span>WhatsApp</span></button>
      </div>` : ""}
    </div>`;
}

// Placeholder é útil no painel, mas não deve transformar um produto sem foto
// em item público do catálogo. Também considera fotos das variações de cor.
export function produtoTemImagem(produto = {}) {
  const temUrl = (url) => typeof url === "string" && url.trim().length > 0;
  if (temUrl(produto.imagem) || (Array.isArray(produto.imagens) && produto.imagens.some(temUrl))) return true;
  return Array.isArray(produto.cores) && produto.cores.some((cor) =>
    temUrl(cor?.imagem) || (Array.isArray(cor?.imagens) && cor.imagens.some(temUrl))
  );
}

export function renderizarGrade(container, produtos) {
  const produtosComFoto = (Array.isArray(produtos) ? produtos : []).filter(produtoTemImagem);
  if (!produtosComFoto.length) {
    container.innerHTML = `<div class="empty-state">Nenhum produto encontrado. Tente ajustar sua busca ou filtros.</div>`;
    return;
  }
  const favoritos = new Set(obterIdsFavoritos());
  container.__produtosPorId = new Map(produtosComFoto.map(produto => [produto.id, produto]));
  container.innerHTML = produtosComFoto.map(produto => cartaoProduto(produto, favoritos)).join("");

  if (!container.dataset.acoesLigadas) {
    container.dataset.acoesLigadas = "1";
    container.addEventListener("click", (e) => {
      const btnFav = e.target.closest("[data-fav-id]");
      if (btnFav) {
        e.preventDefault();
        const ativo = alternarFavorito(btnFav.dataset.favId, container.__produtosPorId?.get(btnFav.dataset.favId));
        btnFav.classList.toggle("is-active", ativo);
        btnFav.setAttribute("aria-pressed", String(ativo));
        return;
      }
      const btnAdd = e.target.closest("[data-add-id]");
      const btnAsk = e.target.closest("[data-ask-id]");
      if (!btnAdd && !btnAsk) return;
      e.preventDefault();
      const id = (btnAdd || btnAsk).dataset.addId || (btnAdd || btnAsk).dataset.askId;
      const produto = container.__produtosPorId?.get(id);
      if (!produto) return;
      if (btnAdd) container.dispatchEvent(new CustomEvent("adicionar-carrinho", { detail: produto, bubbles: true }));
      if (btnAsk) container.dispatchEvent(new CustomEvent("falar-produto", { detail: produto, bubbles: true }));
    });
  }
}

export async function compartilharProduto(produto) {
  const url = `${window.location.origin}/pages/produto.html?id=${produto.id}`;
  const dados = { title: produto.nome, text: `Confira: ${produto.nome}`, url };
  try {
    if (navigator.share) {
      await navigator.share(dados);
    } else {
      await navigator.clipboard.writeText(url);
      return "copiado";
    }
    await incrementarCompartilhamento(produto.id);
    return "compartilhado";
  } catch {
    return "cancelado";
  }
}

export function ordenarProdutos(produtos, criterio) {
  const lista = [...produtos];
  switch (criterio) {
    case "preco_asc": return lista.sort((a, b) => a.preco - b.preco);
    case "preco_desc": return lista.sort((a, b) => b.preco - a.preco);
    case "recentes": return lista.sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
    case "nome": return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    default: return lista;
  }
}

export function aplicarFiltros(produtos, filtros) {
  return produtos.filter(p => {
    if (filtros.categoria && p.categoria !== filtros.categoria) return false;
    if (filtros.marca && p.marca !== filtros.marca) return false;
    if (filtros.etiqueta && !(p.etiquetas || []).includes(filtros.etiqueta)) return false;
    if (filtros.disponibilidade === "disponivel" && p.status !== "disponivel") return false;
    if (filtros.precoMin != null && p.preco < filtros.precoMin) return false;
    if (filtros.precoMax != null && p.preco > filtros.precoMax) return false;
    return true;
  });
}
