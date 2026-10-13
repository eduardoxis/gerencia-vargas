// js/modules/servicos-publico.js
// Equivalente ao products.js, para serviços: cartão, grade, favoritos,
// compartilhar, filtros e ordenação. Diferença para produtos: serviço não é
// vendido pelo site, então não existe "Adicionar ao carrinho" — a ação é
// agendar/tirar dúvida pelo WhatsApp.
import { escHtml, formatBRL, imgPos } from "../utils/utils.js";
import { icon } from "../utils/icons.js";
import { linkWhatsApp } from "../utils/whatsapp.js";
import { servicoTemImagem, ordenarServicos, normalizarTexto } from "../services/servicos.js";

const NOME_SALAO = "Espaço Viviane Vargas";
const CHAVE_FAVORITOS = "evv_favoritos_servicos";

function linkServicoComPreview(servico) {
  if (!servico?.id) return "";
  const imagem = [servico.imagem, ...(Array.isArray(servico.imagens) ? servico.imagens : [])]
    .find(valor => typeof valor === "string" && valor.trim() && !valor.startsWith("data:")) || "";
  const dados = new URLSearchParams({
    n: String(servico.nome || "Serviço").slice(0, 160),
    d: String(servico.descricaoCurta || servico.descricao || "Confira este serviço no Espaço Viviane Vargas.").slice(0, 180)
  });
  if (imagem) dados.set("i", imagem);
  return `${window.location.origin}/s/${encodeURIComponent(servico.id)}?${dados}`;
}

// ---------- FAVORITOS (localStorage) ----------
export function obterIdsFavoritosServicos() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_FAVORITOS));
    return Array.isArray(lista) ? lista.filter(Boolean) : [];
  } catch { return []; }
}

export function alternarFavoritoServico(id) {
  const lista = obterIdsFavoritosServicos();
  const idx = lista.indexOf(id);
  if (idx >= 0) lista.splice(idx, 1); else lista.push(id);
  try { localStorage.setItem(CHAVE_FAVORITOS, JSON.stringify(lista)); } catch { /* storage indisponível */ }
  return lista.includes(id);
}

// ---------- WHATSAPP / COMPARTILHAR ----------
export function linkAgendarServico(servico) {
  const endereco = linkServicoComPreview(servico);
  const link = endereco ? `\n🔗 Link do serviço: ${endereco}` : "";
  return linkWhatsApp(`Olá! Vim do site do ${NOME_SALAO} e gostaria de agendar o serviço:\n*${servico.nome}*${link}\n\nPoderia me passar mais informações?`);
}

export function falarSobreServico(servico) {
  window.open(linkAgendarServico(servico), "_blank", "noopener");
}

export async function compartilharServico(servico) {
  const url = `${window.location.origin}/pages/servico.html?id=${servico.id}`;
  const dados = { title: servico.nome, text: `Confira: ${servico.nome}`, url };
  try {
    if (navigator.share) {
      await navigator.share(dados);
      return "compartilhado";
    }
    await navigator.clipboard.writeText(url);
    return "copiado";
  } catch {
    return "cancelado";
  }
}

// ---------- CARTÃO / GRADE ----------
export function textoPrecoServico(servico) {
  return Number(servico.preco) > 0 ? `A partir de ${formatBRL(servico.preco)}` : "Sob consulta";
}

export function cartaoServico(servico, favoritos = null) {
  const favoritado = favoritos instanceof Set ? favoritos.has(servico.id) : obterIdsFavoritosServicos().includes(servico.id);
  const primeira = servico.imagem || (Array.isArray(servico.imagens) ? servico.imagens.find(Boolean) : "") || "";
  const imagem = imgPos(primeira, 480).src || "/assets/images/placeholder.svg";
  const rotulo = [servico.categoriaNome, servico.subcategoriaNome].filter(Boolean).join(" · ");

  return `
    <div class="product-card" data-id="${servico.id}">
      <button class="product-card__fav ${favoritado ? "is-active" : ""}" data-fav-id="${servico.id}" aria-label="Favoritar serviço" aria-pressed="${favoritado}">${icon("heart")}</button>
      <a class="product-card__link" href="/pages/servico.html?id=${servico.id}">
        <div class="product-card__image">
          <img src="${imagem}" style="object-position:center center" alt="${escHtml(servico.nome)}" loading="lazy" decoding="async" width="411" height="732">
          ${servico.duracao ? `<div class="product-card__tags"><span class="tag-badge">${escHtml(servico.duracao)}</span></div>` : ""}
        </div>
        <div class="product-card__body">
          ${rotulo ? `<span class="product-card__brand">${escHtml(rotulo)}</span>` : ""}
          <h3 class="product-card__name">${escHtml(servico.nome)}</h3>
          <span class="product-card__price">${textoPrecoServico(servico)}</span>
        </div>
      </a>
      <div class="product-card__actions">
        <button class="btn-whatsapp product-card__ask" data-ask-id="${servico.id}" aria-label="Agendar este serviço pelo WhatsApp">${icon("whatsapp")}<span>Agendar</span></button>
      </div>
    </div>`;
}

export function renderizarGradeServicos(container, servicos) {
  // Serviços sem foto também aparecem (o cartão usa a imagem padrão).
  const comFoto = Array.isArray(servicos) ? servicos : [];
  if (!comFoto.length) {
    container.innerHTML = `<div class="empty-state">Nenhum serviço encontrado. Tente ajustar sua busca ou filtros.</div>`;
    return;
  }
  const favoritos = new Set(obterIdsFavoritosServicos());
  container.__servicosPorId = new Map(comFoto.map(s => [s.id, s]));
  container.innerHTML = comFoto.map(s => cartaoServico(s, favoritos)).join("");

  if (!container.dataset.acoesLigadas) {
    container.dataset.acoesLigadas = "1";
    container.addEventListener("click", (e) => {
      const btnFav = e.target.closest("[data-fav-id]");
      if (btnFav) {
        e.preventDefault();
        const ativo = alternarFavoritoServico(btnFav.dataset.favId);
        btnFav.classList.toggle("is-active", ativo);
        btnFav.setAttribute("aria-pressed", String(ativo));
        return;
      }
      const btnAsk = e.target.closest("[data-ask-id]");
      if (!btnAsk) return;
      e.preventDefault();
      const servico = container.__servicosPorId?.get(btnAsk.dataset.askId);
      if (servico) falarSobreServico(servico);
    });
  }
}

// ---------- FILTROS / ORDENAÇÃO (client-side) ----------
function dentroDaFaixa(preco, faixa) {
  const [min, max] = String(faixa).split("-");
  const valor = Number(preco) || 0;
  if (valor <= 0) return false; // "Sob consulta" não entra em faixa de preço
  if (min !== "" && valor <= Number(min) && Number(min) > 0) return false;
  if (max !== "" && valor > Number(max)) return false;
  return true;
}

export function aplicarFiltrosServicos(servicos, { termo = "", catId = "", subId = "", faixasPreco = [] } = {}) {
  const busca = normalizarTexto(termo);
  return servicos.filter(s => {
    if (catId && s.categoriaId !== catId) return false;
    if (subId && s.subcategoriaId !== subId) return false;
    if (faixasPreco.length && !faixasPreco.some(f => dentroDaFaixa(s.preco, f))) return false;
    if (!busca) return true;
    return normalizarTexto([s.nome, s.categoriaNome, s.subcategoriaNome, s.descricaoCurta, s.descricao].join(" ")).includes(busca);
  });
}

export function ordenarListaServicos(servicos, criterio, categorias = []) {
  const lista = [...servicos];
  const preco = (s) => (Number(s.preco) > 0 ? Number(s.preco) : null);
  switch (criterio) {
    case "preco_asc": return lista.sort((a, b) => (preco(a) ?? Infinity) - (preco(b) ?? Infinity));
    case "preco_desc": return lista.sort((a, b) => (preco(b) ?? -Infinity) - (preco(a) ?? -Infinity));
    case "recentes": return lista.sort((a, b) => (Number(b.criadoEm) || 0) - (Number(a.criadoEm) || 0));
    case "nome": return lista.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    default: return ordenarServicos(lista, categorias);
  }
}

// ---------- CATÁLOGO NAVEGÁVEL (cards por categoria → serviço) ----------
const ICONE_RELOGIO = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.6"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function resumoServico(servico) {
  const curta = String(servico.descricaoCurta || "").trim();
  if (curta) return curta;
  const longa = String(servico.descricao || "").trim();
  return longa.length > 130 ? `${longa.slice(0, 127).trimEnd()}...` : longa;
}

export function cartaoServicoCatalogo(servico) {
  const primeira = servico.imagem || (Array.isArray(servico.imagens) ? servico.imagens.find(Boolean) : "") || "";
  const { src, pos } = imgPos(primeira, 640);
  const imagem = src || "/assets/images/placeholder.svg";
  const resumo = resumoServico(servico);

  return `
    <article class="svc-card" data-id="${escHtml(servico.id)}">
      <a class="svc-card__img" href="/pages/servico.html?id=${encodeURIComponent(servico.id)}" aria-label="Ver detalhes de ${escHtml(servico.nome)}">
        <img src="${escHtml(imagem)}" style="object-position:${pos}" alt="${escHtml(servico.nome)}" loading="lazy" decoding="async">
      </a>
      <div class="svc-card__body">
        <h3 class="svc-card__nome">${escHtml(servico.nome)}</h3>
        ${resumo ? `<p class="svc-card__desc">${escHtml(resumo)}</p>` : ""}
        <div class="svc-card__meta">
          ${servico.duracao ? `<span class="svc-card__duracao">${ICONE_RELOGIO}${escHtml(servico.duracao)}</span>` : "<span></span>"}
          <span class="svc-card__preco">${escHtml(textoPrecoServico(servico))}</span>
        </div>
        <div class="svc-card__acoes">
          <button type="button" class="btn-whatsapp svc-card__agendar" data-ask-id="${escHtml(servico.id)}">${icon("whatsapp")}<span>Agendar pelo WhatsApp</span></button>
          <a class="svc-card__detalhes" href="/pages/servico.html?id=${encodeURIComponent(servico.id)}">Ver detalhes</a>
        </div>
      </div>
    </article>`;
}

/** Desenha os serviços do catálogo (todos, com ou sem foto) e liga o botão de agendar. */
export function renderizarServicosCatalogo(container, servicos) {
  const lista = Array.isArray(servicos) ? servicos : [];
  container.__servicosPorId = new Map(lista.map(s => [s.id, s]));
  container.innerHTML = lista.map(cartaoServicoCatalogo).join("");

  if (!container.dataset.agendarLigado) {
    container.dataset.agendarLigado = "1";
    container.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ask-id]");
      if (!btn) return;
      e.preventDefault();
      const servico = container.__servicosPorId?.get(btn.dataset.askId);
      if (servico) falarSobreServico(servico);
    });
  }
}
