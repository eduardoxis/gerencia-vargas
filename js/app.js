// js/app.js
import {
  listarEtiquetas, listarProdutosVitrine, listarProdutosDestaque,
  listarProdutosRecentes, listarProdutosPorCategoria, obterProduto, listarCategorias, listarMarcas,
  criarPedido, listarPedidosUsuario, listarEnderecos, criarEndereco, atualizarEndereco, excluirEndereco, excluirPedido, excluirPedidos,
  atualizarPerfilUsuario, invalidarCachePublico
} from "./services/firestore.js";
import { renderizarGrade, obterFavoritos, alternarFavorito, migrarFavoritosLegados, aplicarFavoritosSincronizados } from "./modules/products.js";
import { buscarProdutos } from "./modules/search.js";
import {
  obterCarrinho, adicionarAoCarrinho, atualizarQuantidade, calcularTotais, atualizarBadgeCarrinho,
  finalizarPedidoWhatsApp, falarSobreProduto, registrarLeadPerdidoSeNecessario, aplicarCarrinhoSincronizado
} from "./modules/cart.js";
import { iniciarSincronizacaoConta } from "./services/contaSync.js";
import { formatBRL, escHtml, getQueryParam, toast, podeExecutar, podeExecutarPersistente, mascararCPF, mascararCNPJ, mascararTelefone, pareceEmail, imgPos, registrarErroCliente, confirmarAcao } from "./utils/utils.js";
import { ouvirEstadoAuth, ehAdmin, entrar, cadastrar, sair, usuarioAtual, perfilAtual, redefinirSenha, atualizarNomeAuth } from "./services/auth.js";
import { iniciarModais, abrirModal, fecharModal, trocarAba } from "./utils/modal.js";
import { iniciarOrcamento } from "./modules/orcamento.js";
import { ICONS, icon } from "./utils/icons.js";
import { STORE_CONFIG } from "../firebase/firebase-config.js";
import { iniciarLoadingGlobal } from "./utils/loadingUI.js";
import { observarAtualizacaoPublica } from "./services/public-sync.js";
import { listarCategoriasHomeServicos, invalidarCacheServicos, normalizarTexto } from "./services/servicos.js";

iniciarLoadingGlobal();

// Captura qualquer erro de JS ou Promise rejeitada sem tratamento que
// aconteça em produção — sem isso, um bug em produção falha silenciosamente
// pro usuário e o admin nunca fica sabendo. Registrado 1x por sessão de
// cada tipo de erro pra não inundar o Firestore se algo ficar repetindo.
(function monitorarErrosGlobais() {
  const jaRegistrados = new Set();
  function registrar(origem, erro) {
    const chave = `${origem}:${String(erro?.message || erro)}`;
    if (jaRegistrados.has(chave)) return;
    jaRegistrados.add(chave);
    registrarErroCliente(origem, erro);
  }
  window.addEventListener("error", (e) => registrar("erro-js-global", e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => registrar("promise-rejeitada", e.reason));
})();

let filtrosAtivos = {};
let moduloPainelAdmin;

async function iniciarPainelAdminSobDemanda(root) {
  moduloPainelAdmin ||= import("./modules/dashboard.js");
  const { iniciarPainelAdmin } = await moduloPainelAdmin;
  return iniciarPainelAdmin(root);
}

/** Executa uma busca somente quando a seção estiver perto da área visível. */
function carregarAoAproximar(alvo, tarefa) {
  if (!alvo) return;
  let iniciado = false;
  const executar = () => {
    if (iniciado) return;
    iniciado = true;
    Promise.resolve(tarefa()).catch((erro) => console.error("Falha ao carregar seção:", erro));
  };
  if (!("IntersectionObserver" in window)) { executar(); return; }
  const observer = new IntersectionObserver((entradas) => {
    if (!entradas.some(e => e.isIntersecting)) return;
    observer.disconnect();
    executar();
  }, { rootMargin: "500px 0px" });
  observer.observe(alvo);
}

/** Anima entradas sem bloquear a navegação e respeita a preferência do usuário. */
function iniciarEfeitosVisuais() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.documentElement.classList.add("motion-enabled");
  const seletor = ".section, .whatsapp-cta, .newsletter, .site-footer, .product-card, .category-card, .sv-home__card";
  const observados = new WeakSet();
  const observer = new IntersectionObserver((entradas) => {
    entradas.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting) return;
      target.classList.add("reveal-item--visible");
      observer.unobserve(target);
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -28px" });

  const preparar = (raiz = document) => {
    const itens = [];
    if (raiz instanceof Element && raiz.matches(seletor)) itens.push(raiz);
    if (raiz.querySelectorAll) itens.push(...raiz.querySelectorAll(seletor));

    itens.forEach((item, indice) => {
      if (observados.has(item) || item.hidden) return;
      observados.add(item);
      item.classList.add("reveal-item");
      item.style.setProperty("--reveal-delay", `${Math.min(indice % 5, 4) * 70}ms`);
      observer.observe(item);
    });
  };

  preparar();
  new MutationObserver((mudancas) => {
    mudancas.forEach((mudanca) => {
      mudanca.addedNodes.forEach((no) => {
        if (no.nodeType === Node.ELEMENT_NODE) preparar(no);
      });
      if (mudanca.type === "attributes" && mudanca.target instanceof Element && !mudanca.target.hidden) {
        preparar(mudanca.target);
      }
    });
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
}

// ---------- Seção "Cuidados para você" (home) ----------
const SVG_SV = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONES_SERVICO_HOME = {
  facial: SVG_SV('<path d="M12 3.5c-3.3 0-5.5 2.5-5.5 6 0 4.2 2.4 8 5.5 8s5.5-3.8 5.5-8c0-3.5-2.2-6-5.5-6Z"/><path d="M9.6 10.4h.01M14.4 10.4h.01"/><path d="M10.2 14c1 .7 2.6.7 3.6 0"/><path d="M9.2 17.2 8.4 20.5h7.2l-.8-3.3"/>'),
  corporal: SVG_SV('<path d="M8.2 3.5c.4 3.2-1.2 5-1.8 7.2-.6 2.3.6 4 1.6 6.3L8.2 21"/><path d="M15.8 3.5c-.4 3.2 1.2 5 1.8 7.2.6 2.3-.6 4-1.6 6.3L15.8 21"/><path d="M9.6 13.6c1.4 1.2 3.4 1.2 4.8 0"/>'),
  capilar: SVG_SV('<path d="M12 3.5s5 5.2 5 9.3a5 5 0 0 1-10 0c0-4.1 5-9.3 5-9.3Z"/><path d="M12 9v8"/><path d="M9.5 20.5h5"/>'),
  bemestar: SVG_SV('<path d="M12 4.8c2.2 2.2 3 4.6 3 7s-1.2 4.4-3 6c-1.8-1.6-3-3.6-3-6s.8-4.8 3-7Z"/><path d="M9 17.5c-2.5 0-4.8-1.7-5.8-5.1 2.8-.2 5 .8 6.3 3M15 17.5c2.5 0 4.8-1.7 5.8-5.1-2.8-.2-5 .8-6.3 3"/><path d="M6 19.8c4 1.2 8 1.2 12 0"/>'),
  folha: SVG_SV('<path d="M12 4.5c1.8 2 2.8 4.2 2.8 6.4S13.8 14.9 12 16.5c-1.8-1.6-2.8-3.6-2.8-5.6S10.2 6.5 12 4.5Z"/><path d="M9.4 14.6C7 14.8 4.7 13.6 3.5 11.1c2.6-.3 4.7.5 6 2M14.6 14.6c2.4.2 4.7-1 5.9-3.5-2.6-.3-4.7.5-6 2M5 18c2.2 1.5 4.6 2 7 2s4.8-.5 7-2"/>')
};

function iconeServicoHome(nome = "") {
  const n = normalizarTexto(nome);
  if (/facial|rosto|pele|face/.test(n)) return ICONES_SERVICO_HOME.facial;
  if (/corporal|corpo/.test(n)) return ICONES_SERVICO_HOME.corporal;
  if (/capilar|cabelo|cabelos|fios/.test(n)) return ICONES_SERVICO_HOME.capilar;
  if (/bem.?estar|massagem|massagens|spa|relax/.test(n)) return ICONES_SERVICO_HOME.bemestar;
  return ICONES_SERVICO_HOME.folha;
}

/** Mostra as 4 primeiras categorias de serviço (que tenham serviço disponível). */
async function renderizarServicosHome(secao) {
  const grade = secao?.querySelector("#grade-servicos-home");
  if (!grade) return;
  let cats;
  try {
    cats = await listarCategoriasHomeServicos(4);
  } catch (erro) {
    console.error("[home] falha ao carregar serviços:", erro);
    secao.hidden = true;
    return;
  }
  // Sem categoria com serviço publicado: esconde a seção inteira.
  if (!cats.length) { secao.hidden = true; return; }

  grade.innerHTML = cats.map((c) => {
    const posY = Number.isFinite(Number(c.imagemPosY)) ? Number(c.imagemPosY) : 50;
    const desc = c.descricao || `${c.total} ${c.total === 1 ? "serviço" : "serviços"}`;
    const foto = c.imagem
      ? `<img src="${escHtml(c.imagem)}" alt="" style="object-position:50% ${posY}%" loading="lazy" decoding="async">`
      : `<span class="sv-home__img-vazia">${ICONES_SERVICO_HOME.folha}</span>`;
    return `
      <a class="sv-home__card" href="/pages/servicos.html?categoria=${encodeURIComponent(c.id)}">
        <span class="sv-home__img">${foto}</span>
        <span class="sv-home__body">
          <span class="sv-home__icon">${iconeServicoHome(c.nome)}</span>
          <span class="sv-home__nome">${escHtml(c.nome)}</span>
          <span class="sv-home__desc">${escHtml(desc)}</span>
          <span class="sv-home__btn">Ver serviços <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        </span>
      </a>`;
  }).join("");
}

function iconeParaCategoria(nome = "") {
  const n = nome.toLowerCase();
  if (n.includes("escolar")) return "backpack";
  if (n.includes("inform") || n.includes("tecnolog") || n.includes("computa")) return "laptop";
  if (n.includes("arte") || n.includes("criativ")) return "palette";
  if (n.includes("impress")) return "printer";
  if (n.includes("cadern") || n.includes("bloco")) return "notebook";
  if (n.includes("canet") || n.includes("escrita")) return "pen";
  if (n.includes("escritório") || n.includes("escritorio")) return "briefcase";
  if (n.includes("organiz")) return "archive";
  if (n.includes("presente") || n.includes("premium") || n.includes("kit")) return "gift";
  return "tag";
}

const EMOJI_POR_CATEGORIA = {
  backpack: "🎒",
  laptop: "💻",
  palette: "🎨",
  printer: "🖨️",
  notebook: "📓",
  pen: "🖊️",
  archive: "🗄️",
  gift: "🎁",
  tag: "🏷️",
};

const COR_POR_CATEGORIA = {
  backpack: "#f4e8df",
  laptop: "#efe2d8",
  palette: "#f1ddd2",
  printer: "#f3eae2",
  notebook: "#f2dcd3",
  pen: "#ece0d4",
  briefcase: "#f0e1cf",
  archive: "#ebe0d6",
  gift: "#f1e3dc",
  tag: "#f3eae2",
};

const TEXTO_POR_CATEGORIA = {
  backpack: "#6b0e12",
  laptop: "#7a4a2e",
  palette: "#8a2a2f",
  printer: "#5b4a41",
  notebook: "#6b0e12",
  pen: "#7a4a2e",
  briefcase: "#8a5a2b",
  archive: "#7a6558",
  gift: "#6b0e12",
  tag: "#5b4a41",
};

function corParaCategoria(nome = "") {
  return COR_POR_CATEGORIA[iconeParaCategoria(nome)] || COR_POR_CATEGORIA.tag;
}

function corTextoParaCategoria(nome = "") {
  return TEXTO_POR_CATEGORIA[iconeParaCategoria(nome)] || TEXTO_POR_CATEGORIA.tag;
}

function conteudoIconeCategoria(c) {
  if (c.imagem) {
    const { src, pos } = imgPos(c.imagem, 192);
    return `<img class="category-card__img" src="${src}" style="object-position:${pos}" alt="" loading="lazy" decoding="async" width="96" height="96">`;
  }
  const custom = (c.emoji || "").trim();
  if (!custom) return icon(iconeParaCategoria(c.nome));
  if (custom.startsWith("<svg")) return custom;
  return escHtml(custom);
}

function aplicarIconesEstaticos() {
  document.querySelectorAll("[data-icon]").forEach(el => {
    const nome = el.dataset.icon;
    if (ICONS[nome] && !el.querySelector("svg")) {
      el.innerHTML = ICONS[nome];
      el.classList.add("icon");
    }
  });
  const logo = document.querySelector("#admin-logo-icon");
  if (logo && !logo.querySelector("svg")) logo.innerHTML = ICONS.logo;
  document.querySelectorAll(".modal__close").forEach(el => {
    if (!el.querySelector("svg")) el.innerHTML = ICONS.close;
  });
}

async function iniciar() {
  iniciarModais();
  aplicarIconesEstaticos();
  atualizarBadgeCarrinho();
  iniciarEfeitosVisuais();

  // Home mostra só prévias — cada seção busca só o que precisa direto do
  // Firestore (nada de baixar o catálogo inteiro pra montar 3 vitrines de
  // 8 a 10 itens). Não é mais "ao vivo" (onSnapshot); atualiza a cada
  // carregamento de página, o que é suficiente para uma vitrine.
  const gradeProdutos = document.querySelector("#grade-produtos");
  carregarAoAproximar(gradeProdutos, async () => {
    renderizarGrade(gradeProdutos, await listarProdutosVitrine(10));
  });
  const gradeDestaques = document.querySelector("#grade-destaques");
  carregarAoAproximar(gradeDestaques, async () => {
    // Dez itens formam duas linhas completas de cinco no desktop.
    renderizarGrade(gradeDestaques, await listarProdutosDestaque(10));
  });
  const secaoServicosHome = document.querySelector("#servicos-home");
  carregarAoAproximar(secaoServicosHome, () => renderizarServicosHome(secaoServicosHome));
  const gradeRecentes = document.querySelector("#grade-recentes");
  carregarAoAproximar(gradeRecentes, async () => {
    renderizarGrade(gradeRecentes, await listarProdutosRecentes(10));
  });

  listarCategorias().then((categorias) => {
    renderizarFiltros(categorias);
    const catUrl = getQueryParam("categoria");
    if (catUrl && !window.__categoriaAplicadaDaUrl) {
      window.__categoriaAplicadaDaUrl = true;
      selecionarCategoria(decodeURIComponent(catUrl));
    }
  });

  configurarLinksEstaticos();
  configurarEventosCategorias();
  iniciarOrcamento();

  // "F5" automático para visitantes após um CRUD público no painel. Se o
  // próprio painel estiver aberto, aguardamos ele fechar para não interromper
  // um formulário; em qualquer outra aba a recarga é imediata.
  let recargaPublicaAgendada = false;
  let atualizacaoPendenteNoPainel = false;
  const agendarRecargaPublica = () => {
    if (recargaPublicaAgendada) return;
    recargaPublicaAgendada = true;
    invalidarCachePublico();
    invalidarCacheServicos();
    toast("A loja foi atualizada.");
    window.setTimeout(() => window.location.reload(), 700);
  };
  observarAtualizacaoPublica(() => {
    if (document.querySelector("#modal-admin.is-open")) {
      atualizacaoPendenteNoPainel = true;
      return;
    }
    agendarRecargaPublica();
  });
  document.querySelector("#modal-admin")?.addEventListener("modal:fechado", () => {
    if (atualizacaoPendenteNoPainel) agendarRecargaPublica();
  });

  document.querySelector("#btn-sair-conta")?.addEventListener("click", () => {
    sair();
    fecharModal(document.querySelector("#modal-conta"));
  });

  document.querySelectorAll("[data-scroll-top]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
  document.querySelectorAll("[data-bottom-nav]").forEach(el => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".bottom-nav__item").forEach(i => i.classList.remove("is-active"));
      el.classList.add("is-active");
    });
  });

  document.querySelector("#bottom-nav-conta")?.addEventListener("click", () => {
    const modal = usuarioAtual
      ? document.querySelector("#modal-conta")
      : document.querySelector("#modal-login");
    if (modal) abrirModal(modal);
  });

  document.querySelector("#toggle-categorias-grid")?.addEventListener("click", () => {
    document.querySelector("#categorias")?.scrollIntoView({ behavior: "smooth" });
  });

  const inputBusca = document.querySelector("#busca-header");
  document.querySelector(".search-bar")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const termo = inputBusca?.value?.trim() || "";
    window.location.href = termo
      ? `/pages/catalogo.html?q=${encodeURIComponent(termo)}`
      : "/pages/catalogo.html";
  });

  configurarCarrinhoUI();
  configurarLogin();
  configurarModalAuth();
  configurarMenuConta();

  document.addEventListener("adicionar-carrinho", (e) => {
    adicionarAoCarrinho(e.detail, 1);
    toast("Produto adicionado ao carrinho.");
  });
  document.addEventListener("falar-produto", (e) => {
    falarSobreProduto(e.detail);
  });

  function dadosLeadAtual() {
    const nomeDigitado = document.querySelector("#nome-cliente")?.value?.trim();
    const nome = usuarioAtual
      ? (nomeDigitado && !pareceEmail(nomeDigitado) ? nomeDigitado
        : [usuarioAtual.displayName, perfilAtual?.nome, perfilAtual?.responsavel, perfilAtual?.razaoSocial].find(c => c && !pareceEmail(c)) || "")
      : (nomeDigitado && !pareceEmail(nomeDigitado) ? nomeDigitado : "");
    const telefone = perfilAtual?.telefone || "";
    return { nome, telefone };
  }

  window.addEventListener("beforeunload", () => registrarLeadPerdidoSeNecessario(dadosLeadAtual()));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") registrarLeadPerdidoSeNecessario(dadosLeadAtual());
  });
}

async function aplicarBuscaEFiltros(termo = "") {
  const termoLimpo = termo.trim();
  const secao = document.querySelector("#resultados-busca");
  const temFiltro = !!termoLimpo || !!filtrosAtivos.categoria;

  if (!temFiltro) {
    if (secao) secao.hidden = true;
    return;
  }

  // Sem categoria selecionada não dá pra fazer uma busca textual eficiente
  // sem baixar o catálogo inteiro — orientamos para o catálogo completo,
  // que tem busca dedicada (ver pages/catalogo.html).
  let lista = [];
  if (filtrosAtivos.categoria) {
    lista = await listarProdutosPorCategoria(filtrosAtivos.categoria);
    if (termoLimpo) lista = buscarProdutos(lista, termoLimpo);
  }
  renderizarGrade(document.querySelector("#grade-resultados"), lista);

  const titulo = document.querySelector("#resultados-busca-titulo");
  if (titulo) {
    const partes = [];
    if (termoLimpo) partes.push(`"${termoLimpo}"`);
    if (filtrosAtivos.categoria) partes.push(filtrosAtivos.categoria);
    titulo.textContent = filtrosAtivos.categoria
      ? `Resultados para ${partes.join(" em ")} (${lista.length})`
      : `Digite e aperte Enter para buscar em todo o catálogo`;
  }
  if (secao) secao.hidden = false;
}

function renderizarFiltros(categorias) {
  const seletor = document.querySelector("#filtro-categoria");
  if (seletor) {
    const valorAtual = seletor.value;
    seletor.innerHTML = `<option value="">Todas as categorias</option>` +
      categorias.map(c => `<option value="${escHtml(c.nome)}">${escHtml(c.nome)}</option>`).join("");
    seletor.value = valorAtual;
  }

  const navLinks = document.querySelector("#header-nav-links");
  if (navLinks) {
    navLinks.innerHTML = categorias.slice(0, 6)
      .map(c => `<button type="button" data-categoria-nome="${escHtml(c.nome)}">${escHtml(c.nome)}</button>`).join("");
  }

  const grid = document.querySelector("#grade-categorias");
  if (grid) {
    grid.innerHTML = categorias.length
      ? categorias.map(c => `
        <button type="button" class="category-card" data-categoria-nome="${escHtml(c.nome)}">
          <span class="category-card__icon" style="background:${corParaCategoria(c.nome)};color:${corTextoParaCategoria(c.nome)}">${conteudoIconeCategoria(c)}</span>
          <span>${escHtml(c.nome)}</span>
        </button>`).join("")
      : `<div class="empty-state">Nenhuma categoria cadastrada ainda.</div>`;
  }
}

function configurarEventosCategorias() {
  document.querySelector("#filtro-categoria")?.addEventListener("change", async (e) => {
    filtrosAtivos.categoria = e.target.value || undefined;
    await aplicarBuscaEFiltros(document.querySelector("#busca-header")?.value || "");
    rolarAteResultados();
  });
  document.querySelector("#header-nav-links")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-categoria-nome]");
    if (btn) selecionarCategoria(btn.dataset.categoriaNome);
  });
  document.querySelector("#grade-categorias")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-categoria-nome]");
    if (btn) selecionarCategoria(btn.dataset.categoriaNome);
  });
  document.querySelector("#limpar-resultados")?.addEventListener("click", () => {
    filtrosAtivos.categoria = undefined;
    const seletor = document.querySelector("#filtro-categoria");
    if (seletor) seletor.value = "";
    const inputBusca = document.querySelector("#busca-header");
    if (inputBusca) inputBusca.value = "";
    aplicarBuscaEFiltros("");
  });
}

async function selecionarCategoria(nome) {
  const seletor = document.querySelector("#filtro-categoria");
  if (seletor) seletor.value = nome;
  filtrosAtivos.categoria = nome || undefined;
  await aplicarBuscaEFiltros(document.querySelector("#busca-header")?.value || "");
  rolarAteResultados();
}

function rolarAteResultados() {
  const secao = document.querySelector("#resultados-busca");
  if (!secao) return;

  const rolar = () => secao.scrollIntoView({ behavior: "smooth", block: "start" });
  // Marcas e imagens carregadas acima da seção podem alterar a altura da
  // página logo após o clique. A segunda passagem mantém os resultados no
  // topo em vez de deixá-los abaixo da seção de marcas.
  requestAnimationFrame(() => requestAnimationFrame(rolar));
  window.setTimeout(rolar, 500);
}

function configurarLinksEstaticos() {
  const numero = STORE_CONFIG.whatsapp;
  const mensagem = encodeURIComponent(`Olá! Vim do site da ${STORE_CONFIG.nome} e gostaria de fazer um pedido.`);
  document.querySelectorAll("#hero-whatsapp, #whatsapp-cta-link").forEach(a => {
    a.href = `https://wa.me/${numero}?text=${mensagem}`;
  });

  const marcasEl = document.querySelector("#marcas-parceiras");
  if (marcasEl) {
    carregarAoAproximar(marcasEl, async () => {
      const marcas = await listarMarcas();
      const lista = [...marcas].filter(m => m.visivel !== false).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
      marcasEl.innerHTML = lista
        .map(m => `<span class="brands__badge"><img src="${imgPos(m.logo, 240).src || "/assets/images/placeholder.svg"}" alt="${escHtml(m.nome)}" loading="lazy" decoding="async"></span>`)
        .join("") || "";
    });
  }

}

function configurarCarrinhoUI() {
  const drawer = document.querySelector("#cart-drawer");
  const overlay = document.querySelector("#cart-overlay");
  const abrirBtn = document.querySelector("#abrir-carrinho");
  const fecharBtn = document.querySelector("#fechar-carrinho");

  function renderCarrinho() {
    const carrinho = obterCarrinho();
    const lista = document.querySelector("#itens-carrinho");
    const { subtotal, total } = calcularTotais(carrinho);
    lista.innerHTML = carrinho.map(item => `
      <div class="cart-item" data-chave="${escHtml(item.chave || item.id)}">
        <img src="${imgPos(item.imagem, 160).src || "/assets/images/placeholder.svg"}" alt="${escHtml(item.nome)}" loading="lazy" decoding="async">
        <div>
          <div class="cart-item__name">${escHtml(item.nome)}</div>
          <div class="cart-item__brand">${escHtml(item.marca)}${item.cor ? ` • Cor: ${escHtml(item.cor)}` : ""}</div>
          <div class="qty-stepper">
            <button data-diminuir>-</button>
            <input type="number" value="${item.quantidade}" min="1" data-qtd>
            <button data-aumentar>+</button>
          </div>
        </div>
        <strong>${formatBRL(item.preco * item.quantidade)}</strong>
      </div>`).join("") || `<p class="empty-state">Seu carrinho está vazio.</p>`;

    document.querySelector("#subtotal-carrinho").textContent = formatBRL(subtotal);
    document.querySelector("#total-carrinho").textContent = formatBRL(total);

    lista.querySelectorAll(".cart-item").forEach(el => {
      const chave = el.dataset.chave;
      const input = el.querySelector("[data-qtd]");
      el.querySelector("[data-aumentar]").addEventListener("click", () => {
        atualizarQuantidade(chave, parseInt(input.value, 10) + 1);
        renderCarrinho();
      });
      el.querySelector("[data-diminuir]").addEventListener("click", () => {
        atualizarQuantidade(chave, parseInt(input.value, 10) - 1);
        renderCarrinho();
      });
      input.addEventListener("change", () => {
        atualizarQuantidade(chave, parseInt(input.value, 10) || 0);
        renderCarrinho();
      });
    });
  }

  function abrir() {
    renderCarrinho();
    const campoNome = document.querySelector("#campo-nome-convidado");
    if (campoNome) campoNome.hidden = !!usuarioAtual;
    drawer.classList.add("is-open");
    overlay.classList.add("is-open");
  }
  function fechar() {
    drawer.classList.remove("is-open");
    overlay.classList.remove("is-open");
  }

  abrirBtn?.addEventListener("click", abrir);
  fecharBtn?.addEventListener("click", fechar);
  overlay?.addEventListener("click", fechar);

  document.querySelector("#finalizar-pedido")?.addEventListener("click", async () => {
    const carrinho = obterCarrinho();
    if (!carrinho.length) { toast("Seu carrinho está vazio.", "error"); return; }
    if (!podeExecutar("finalizar-pedido", 5, 60_000)) {
      toast("Muitos pedidos em pouco tempo. Aguarde um instante.", "error");
      return;
    }
    const nome = document.querySelector("#nome-cliente")?.value?.trim();
    const candidatosPerfil = [usuarioAtual?.displayName, perfilAtual?.nome, perfilAtual?.responsavel, perfilAtual?.razaoSocial];
    const nomeDoPerfil = candidatosPerfil.find(c => c && !pareceEmail(c)) || "";
    const nomeParaPedido = usuarioAtual
      ? ((nome && !pareceEmail(nome)) ? nome : nomeDoPerfil)
      : (nome && !pareceEmail(nome) ? nome : "");
    if (usuarioAtual) {
      const { total } = calcularTotais(carrinho);
      criarPedido({
        usuarioId: usuarioAtual.uid,
        nomeCliente: nomeParaPedido,
        itens: carrinho.map(i => ({ id: i.id, nome: i.nome, quantidade: i.quantidade, preco: i.preco, cor: i.cor || "" })),
        total
      }).catch((erro) => {
        toast("Pedido não foi salvo no seu histórico, mas o WhatsApp vai abrir normalmente.", "error");
        registrarErroCliente("checkout-criarPedido", erro, { usuarioId: usuarioAtual.uid });
      });
    }
    finalizarPedidoWhatsApp(nomeParaPedido);
    fechar();
  });
}

function configurarLogin() {
  let jaAbriuViaParam = false;
  ouvirEstadoAuth((usuario) => {
    iniciarSincronizacaoConta(usuario?.uid, {
      carrinhoLocal: obterCarrinho,
      favoritosLocais: obterFavoritos,
      aplicarCarrinho: aplicarCarrinhoSincronizado,
      aplicarFavoritos: aplicarFavoritosSincronizados
    });
    const btnAdmin = document.querySelector("#abrir-admin");
    const btnEntrar = document.querySelector("#btn-entrar");
    const btnSair = document.querySelector("#btn-sair");
    const btnMinhaConta = document.querySelector("#btn-minha-conta");

    if (usuario) {
      btnEntrar?.setAttribute("hidden", "");
      btnSair?.removeAttribute("hidden");
      btnMinhaConta?.removeAttribute("hidden");
      const nomeEl = document.querySelector("#conta-nome");
      const emailEl = document.querySelector("#conta-email");
      if (nomeEl) nomeEl.textContent = usuario.displayName ? `Olá, ${usuario.displayName}!` : "Olá!";
      if (emailEl) emailEl.textContent = usuario.email || "";
      if (ehAdmin()) {
        btnAdmin?.removeAttribute("hidden");
        if (btnAdmin && !btnAdmin.dataset.bound) {
          btnAdmin.dataset.bound = "1";
          btnAdmin.addEventListener("click", async () => {
            const modal = document.querySelector("#modal-admin");
            abrirModal(modal);
            await iniciarPainelAdminSobDemanda(modal);
          });
        }
      }
    } else {
      btnEntrar?.removeAttribute("hidden");
      btnSair?.setAttribute("hidden", "");
      btnMinhaConta?.setAttribute("hidden", "");
      btnAdmin?.setAttribute("hidden", "");
    }

    if (btnSair && !btnSair.dataset.bound) {
      btnSair.dataset.bound = "1";
      btnSair.addEventListener("click", sair);
    }

    // Veio de outra página (produto/catálogo) pedindo pra abrir um modal
    // específico — ex: /?abrir=login vindo do botão "Entrar" da produto.html.
    if (!jaAbriuViaParam) {
      jaAbriuViaParam = true;
      const abrir = getQueryParam("abrir");
      if (abrir === "login" && !usuario) {
        abrirModal(document.querySelector("#modal-login"));
      } else if (abrir === "conta") {
        // Vindo do botão "Conta" de outra página: abre a conta se logado, senão o login.
        abrirModal(document.querySelector(usuario ? "#modal-conta" : "#modal-login"));
      } else if (abrir === "admin" && usuario && ehAdmin()) {
        const modal = document.querySelector("#modal-admin");
        abrirModal(modal);
        iniciarPainelAdminSobDemanda(modal);
      }
      if (abrir) {
        const url = new URL(window.location.href);
        url.searchParams.delete("abrir");
        window.history.replaceState({}, "", url);
      }
    }
  });

  document.querySelectorAll("[data-tab-trigger]").forEach(tab => {
    tab.addEventListener("click", () => trocarAba(document.querySelector("#modal-admin"), tab.dataset.tabTrigger));
  });
}

function configurarModalAuth() {
  const modal = document.querySelector("#modal-login");
  if (!modal) return;

  function mostrarView(view) {
    modal.querySelector("#form-entrar-modal").hidden = view !== "entrar";
    modal.querySelector("#form-esqueci-senha").hidden = view !== "esqueci";
    modal.querySelector("#form-cadastrar-modal").hidden = view !== "cadastrar";
    modal.querySelector(".auth-tabs:not(.auth-tabs--tipo)").hidden = view === "esqueci";
  }

  modal.querySelectorAll("[data-auth-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      modal.querySelectorAll("[data-auth-tab]").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      mostrarView(btn.dataset.authTab);
    });
  });

  modal.querySelector("#link-esqueci-senha").addEventListener("click", () => mostrarView("esqueci"));
  modal.querySelector("#voltar-esqueci-senha").addEventListener("click", () => {
    modal.querySelectorAll("[data-auth-tab]").forEach(b => b.classList.toggle("is-active", b.dataset.authTab === "entrar"));
    mostrarView("entrar");
  });

  // mostrar/ocultar senha em qualquer campo do modal
  modal.querySelectorAll("[data-toggle-senha]").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = btn.previousElementSibling;
      const mostrando = input.type === "text";
      input.type = mostrando ? "password" : "text";
      btn.innerHTML = mostrando ? ICONS.eye : ICONS.eyeOff;
      btn.setAttribute("aria-label", mostrando ? "Mostrar senha" : "Ocultar senha");
    });
  });

  // pessoa física / empresa no cadastro
  modal.querySelectorAll("[data-tipo-conta]").forEach(btn => {
    btn.addEventListener("click", () => {
      modal.querySelectorAll("[data-tipo-conta]").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const tipo = btn.dataset.tipoConta;
      modal.querySelector('input[name="tipoConta"]').value = tipo;
      modal.querySelector('[data-campos-tipo="fisica"]').hidden = tipo !== "fisica";
      modal.querySelector('[data-campos-tipo="empresa"]').hidden = tipo !== "empresa";
    });
  });

  // máscaras de CPF, CNPJ e telefone, aplicadas enquanto a pessoa digita
  const campoCpf = modal.querySelector('input[name="cpf"]');
  campoCpf?.addEventListener("input", () => { campoCpf.value = mascararCPF(campoCpf.value); });

  const campoCnpj = modal.querySelector('input[name="cnpj"]');
  campoCnpj?.addEventListener("input", () => { campoCnpj.value = mascararCNPJ(campoCnpj.value); });

  modal.querySelectorAll('input[name="telefone"], input[name="telefoneEmpresa"]').forEach(campo => {
    campo.addEventListener("input", () => { campo.value = mascararTelefone(campo.value); });
  });

  modal.querySelector("#form-entrar-modal").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const erroEl = modal.querySelector("#erro-entrar-modal");
    erroEl.textContent = "";
    if (!podeExecutar("login", 5, 60_000)) {
      erroEl.textContent = "Muitas tentativas. Aguarde um minuto e tente novamente.";
      return;
    }
    try {
      await entrar(form.email.value, form.senha.value, form.manterLogin.checked);
      fecharModal(modal);
      form.reset();
    } catch {
      erroEl.textContent = "Não foi possível entrar. Verifique seus dados.";
    }
  });

  modal.querySelector("#form-esqueci-senha").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const erroEl = modal.querySelector("#erro-esqueci-senha");
    const sucessoEl = modal.querySelector("#sucesso-esqueci-senha");
    erroEl.textContent = "";
    sucessoEl.hidden = true;

    const email = form.email.value.trim().toLowerCase();
    const chave = `reset-senha-${email}`;
    // até 5 tentativas por e-mail, depois bloqueia por 1h (persiste mesmo fechando a aba)
    if (!podeExecutarPersistente(chave, 5, 60 * 60_000)) {
      erroEl.textContent = "Muitas tentativas para este e-mail. Tente novamente mais tarde.";
      return;
    }
    try {
      await redefinirSenha(email);
      sucessoEl.textContent = "Link enviado! Pode levar alguns minutos — se não chegar, confira a caixa de spam/lixo eletrônico ou promoções.";
      sucessoEl.hidden = false;
      form.reset();
    } catch {
      erroEl.textContent = "Não foi possível enviar o link. Confira o e-mail digitado.";
    }
  });

  modal.querySelector("#form-cadastrar-modal").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const erroEl = modal.querySelector("#erro-cadastrar-modal");
    erroEl.textContent = "";
    if (!podeExecutar("cadastrar", 3, 60_000)) {
      erroEl.textContent = "Muitas tentativas. Aguarde um minuto e tente novamente.";
      return;
    }
    if (form.senha.value !== form.confirmarSenha.value) {
      erroEl.textContent = "As senhas não coincidem.";
      return;
    }
    if (!form.aceiteTermos.checked) {
      erroEl.textContent = "É preciso concordar com a Política de Privacidade para criar a conta.";
      return;
    }
    const tipoConta = form.tipoConta.value;
    const dados = tipoConta === "empresa"
      ? {
          email: form.email.value, senha: form.senha.value, tipoConta,
          razaoSocial: form.razaoSocial.value.trim(),
          cnpj: form.cnpj.value.trim(),
          responsavel: form.responsavel.value.trim(),
          telefone: form.telefoneEmpresa.value.trim()
        }
      : {
          email: form.email.value, senha: form.senha.value, tipoConta,
          nome: form.nome.value.trim(),
          cpf: form.cpf.value.trim(),
          telefone: form.telefone.value.trim()
        };
    try {
      await cadastrar(dados);
      fecharModal(modal);
      form.reset();
    } catch {
      erroEl.textContent = "Não foi possível criar a conta.";
    }
  });
}

function formatarMesAno(isoString) {
  if (!isoString) return "";
  const data = new Date(isoString);
  if (isNaN(data)) return "";
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[data.getMonth()]}/${data.getFullYear()}`;
}

function formatarDataBR(isoDate) {
  if (!isoDate) return "";
  const [ano, mes, dia] = isoDate.split("-");
  if (!ano || !mes || !dia) return "";
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${parseInt(dia, 10)} de ${meses[parseInt(mes, 10) - 1]} de ${ano}`;
}

function renderizarPerfil() {
  if (!usuarioAtual) return;
  const identificacaoPerfil = usuarioAtual.email || perfilAtual?.nome || usuarioAtual.displayName || "";
  document.querySelector("#perfil-saudacao").textContent = identificacaoPerfil ? `Olá,\n${identificacaoPerfil}` : "Olá!";
  document.querySelector("#perfil-email-hero").textContent = usuarioAtual.email || "";
  document.querySelector("#perfil-membro-desde").textContent = perfilAtual?.criadoEm ? `Membro desde ${formatarMesAno(perfilAtual.criadoEm)}` : "";

  document.querySelector("#perfil-view-nome").textContent = perfilAtual?.nome || usuarioAtual.displayName || "Não informado";
  document.querySelector("#perfil-view-email").textContent = usuarioAtual.email || "—";
  document.querySelector("#perfil-view-telefone").textContent = perfilAtual?.telefone || "Não informado";
  document.querySelector("#perfil-view-nascimento").textContent = formatarDataBR(perfilAtual?.dataNascimento) || "Não informado";
}

async function dispararRedefinicaoSenha() {
  if (!usuarioAtual?.email) return;
  const chave = `reset-senha-${usuarioAtual.email.toLowerCase()}`;
  if (!podeExecutarPersistente(chave, 5, 60 * 60_000)) {
    toast("Muitas tentativas. Tente novamente mais tarde.", "error");
    return;
  }
  await redefinirSenha(usuarioAtual.email);
  toast("Link enviado! Se não chegar em alguns minutos, confira a caixa de spam ou promoções.");
}

function abrirSubModalConta(idModal) {
  fecharModal(document.querySelector("#modal-conta"));
  const modal = document.querySelector(idModal);
  if (modal) abrirModal(modal);
  return modal;
}

const pedidosSelecionados = new Set();
let enderecoEditandoId = null;

function atualizarAcoesPedidos(total) {
  const selecionados = pedidosSelecionados.size;
  const btnSelecionados = document.querySelector("#btn-apagar-pedidos-selecionados");
  const btnTodos = document.querySelector("#btn-apagar-todos-pedidos");
  if (btnSelecionados) {
    btnSelecionados.disabled = selecionados === 0;
    btnSelecionados.innerHTML = `${icon("trash")}<span>Apagar selecionados${selecionados ? ` (${selecionados})` : ""}</span>`;
  }
  if (btnTodos) btnTodos.disabled = total === 0;
}

async function confirmarEExcluirPedidos(ids, mensagem) {
  const lista = [...new Set(ids)].filter(Boolean);
  if (!lista.length) return;
  const ok = await confirmarAcao(mensagem, {
    titulo: lista.length === 1 ? "Apagar pedido?" : "Apagar pedidos?",
    textoConfirmar: lista.length === 1 ? "Apagar pedido" : "Apagar pedidos",
    textoCancelar: "Cancelar"
  });
  if (!ok) return;
  try {
    if (lista.length === 1) await excluirPedido(lista[0]);
    else await excluirPedidos(lista);
    lista.forEach(id => pedidosSelecionados.delete(id));
    toast(lista.length === 1 ? "Pedido apagado." : `${lista.length} pedidos apagados.`);
    await renderizarPedidos();
  } catch (erro) {
    console.error("Não foi possível apagar pedido(s):", erro);
    toast("Não foi possível apagar o pedido. Tente novamente.", "error");
  }
}

async function renderizarPedidos() {
  const container = document.querySelector("#lista-pedidos");
  if (!container || !usuarioAtual) return;
  container.innerHTML = `<div class="empty-state">Carregando...</div>`;
  const pedidos = await listarPedidosUsuario(usuarioAtual.uid);
  const idsAtuais = new Set(pedidos.map(p => p.id));
  [...pedidosSelecionados].forEach(id => { if (!idsAtuais.has(id)) pedidosSelecionados.delete(id); });

  container.innerHTML = pedidos.length ? pedidos.map(p => `
    <article class="pedido-card ${pedidosSelecionados.has(p.id) ? "is-selected" : ""}" data-pedido-id="${p.id}">
      <label class="pedido-card__select" aria-label="Selecionar pedido de ${formatBRL(p.total || 0)}">
        <input type="checkbox" data-selecionar-pedido="${p.id}" ${pedidosSelecionados.has(p.id) ? "checked" : ""}>
        <span aria-hidden="true"></span>
      </label>
      <div class="pedido-card__content">
        <div class="pedido-card__head">
          <strong>${formatBRL(p.total || 0)}</strong>
          <span class="pedido-card__status">${escHtml(p.status || "pendente")}</span>
        </div>
        <p class="pedido-card__itens">${(p.itens || []).map(i => `${i.quantidade}x ${escHtml(i.nome)}`).join(", ")}</p>
      </div>
      <button type="button" class="pedido-card__delete" data-apagar-pedido="${p.id}" aria-label="Apagar pedido">${icon("trash")}</button>
    </article>`).join("") : `<div class="empty-state">Você ainda não fez nenhum pedido.</div>`;

  container.querySelectorAll("[data-selecionar-pedido]").forEach(input => {
    input.addEventListener("change", () => {
      input.checked ? pedidosSelecionados.add(input.dataset.selecionarPedido) : pedidosSelecionados.delete(input.dataset.selecionarPedido);
      input.closest(".pedido-card")?.classList.toggle("is-selected", input.checked);
      atualizarAcoesPedidos(pedidos.length);
    });
  });
  container.querySelectorAll("[data-apagar-pedido]").forEach(btn => {
    btn.addEventListener("click", () => confirmarEExcluirPedidos([btn.dataset.apagarPedido], "Tem certeza que deseja apagar este pedido? Esta ação não pode ser desfeita."));
  });
  atualizarAcoesPedidos(pedidos.length);
}
async function renderizarEnderecos() {
  const lista = document.querySelector("#lista-enderecos");
  if (!lista || !usuarioAtual) return;
  const enderecos = await listarEnderecos(usuarioAtual.uid);
  lista.innerHTML = enderecos.length ? enderecos.map(e => `
    <li class="endereco-card" data-id="${e.id}">
      <div class="endereco-card__info">
        <strong>${escHtml(e.apelido)}</strong>
        <span>${escHtml(e.rua)}, ${escHtml(e.numero)} - ${escHtml(e.bairro)}, ${escHtml(e.cidade)}${e.cep ? " - " + escHtml(e.cep) : ""}</span>
      </div>
      <div class="endereco-card__acoes">
        <button type="button" data-editar-endereco="${e.id}" class="account-menu__icon" aria-label="Editar endereço">${icon("pencil")}</button>
        <button type="button" data-excluir-endereco="${e.id}" class="account-menu__icon" aria-label="Apagar endereço">${icon("trash")}</button>
      </div>
    </li>`).join("") : `<div class="empty-state">Nenhum endereço cadastrado ainda.</div>`;

  lista.querySelectorAll("[data-excluir-endereco]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ok = await confirmarAcao("Remover este endereço? Esta ação não pode ser desfeita.", {
        titulo: "Remover endereço",
        textoConfirmar: "Remover"
      });
      if (!ok) return;
      await excluirEndereco(btn.dataset.excluirEndereco);
      toast("Endereço removido.", "success");
      renderizarEnderecos();
    });
  });

  lista.querySelectorAll("[data-editar-endereco]").forEach(btn => {
    btn.addEventListener("click", () => {
      const endereco = enderecos.find(item => item.id === btn.dataset.editarEndereco);
      const form = document.querySelector("#form-endereco");
      if (!endereco || !form) return;

      enderecoEditandoId = endereco.id;
      ["apelido", "rua", "numero", "bairro", "cidade", "cep"].forEach(campo => {
        form[campo].value = endereco[campo] || "";
      });
      const titulo = form.querySelector(".stacked-form__title");
      const submit = form.querySelector('button[type="submit"]');
      if (titulo) titulo.textContent = "Editar endereço";
      if (submit) submit.textContent = "Salvar alteração";
      form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}

async function renderizarFavoritos() {
  const container = document.querySelector("#lista-favoritos");
  if (!container) return;
  const favoritos = obterFavoritos();
  const produtosSalvos = favoritos.filter(item => item && typeof item === "object" && item.id);
  const idsLegados = favoritos.filter(item => typeof item === "string");
  // Favoritos novos carregam seu pequeno resumo junto do próprio documento
  // favoritos/{uid}; não geram leituras extras de produtos. IDs antigos
  // continuam compatíveis e usam getDoc cacheado até serem substituídos ao
  // usuário favoritar novamente.
  const produtosLegados = (await Promise.all(idsLegados.map(id => obterProduto(id)))).filter(Boolean);
  if (produtosLegados.length) migrarFavoritosLegados(produtosLegados);
  const produtos = [...produtosSalvos, ...produtosLegados];
  container.innerHTML = produtos.length ? produtos.map(p => `
    <div class="favorito-card" data-id="${p.id}">
      <img src="${imgPos(p.imagem, 240).src || "/assets/images/placeholder.svg"}" style="object-position:center center" alt="${escHtml(p.nome)}" loading="lazy" decoding="async">
      <div class="favorito-card__info">
        <strong>${escHtml(p.nome)}</strong>
        <span>${formatBRL(p.preco)}</span>
      </div>
      <div class="favorito-card__acoes">
        <button type="button" data-add-favorito="${p.id}" class="account-menu__icon" aria-label="Adicionar ao carrinho">${icon("cart")}</button>
        <button type="button" data-remover-favorito="${p.id}" class="account-menu__icon" aria-label="Remover dos favoritos">${icon("trash")}</button>
      </div>
    </div>`).join("") : `<div class="empty-state">Você ainda não favoritou nenhum produto.</div>`;

  container.querySelectorAll("[data-remover-favorito]").forEach(btn => {
    btn.addEventListener("click", () => {
      alternarFavorito(btn.dataset.removerFavorito);
      renderizarFavoritos();
    });
  });
  container.querySelectorAll("[data-add-favorito]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const produto = await obterProduto(btn.dataset.addFavorito);
      if (produto) { adicionarAoCarrinho(produto, 1); toast("Produto adicionado ao carrinho."); }
    });
  });
}

function configurarMenuConta() {
  document.querySelector("#btn-abrir-perfil")?.addEventListener("click", () => {
    abrirSubModalConta("#modal-perfil");
    renderizarPerfil();
  });
  document.querySelector("#btn-abrir-perfil")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.click(); }
  });

  document.querySelector("#btn-editar-perfil")?.addEventListener("click", () => {
    const form = document.querySelector("#form-editar-perfil");
    form.nome.value = perfilAtual?.nome || usuarioAtual?.displayName || "";
    form.telefone.value = perfilAtual?.telefone || "";
    form.dataNascimento.value = perfilAtual?.dataNascimento || "";
    document.querySelector("#perfil-visualizacao").hidden = true;
    document.querySelector("#btn-editar-perfil").hidden = true;
    form.hidden = false;
    form.nome.focus();
  });

  document.querySelector("#btn-cancelar-editar-perfil")?.addEventListener("click", () => {
    document.querySelector("#form-editar-perfil").hidden = true;
    document.querySelector("#perfil-visualizacao").hidden = false;
    document.querySelector("#btn-editar-perfil").hidden = false;
  });

  document.querySelector('#form-editar-perfil input[name="telefone"]')?.addEventListener("input", (e) => {
    e.target.value = mascararTelefone(e.target.value);
  });

  document.querySelector("#form-editar-perfil")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!usuarioAtual) return;
    const form = e.target;
    const nome = form.nome.value.trim();
    const dados = {
      nome,
      telefone: form.telefone.value.trim(),
      dataNascimento: form.dataNascimento.value
    };
    await atualizarPerfilUsuario(usuarioAtual.uid, dados);
    if (nome) await atualizarNomeAuth(nome);
    if (perfilAtual) Object.assign(perfilAtual, dados);

    document.querySelector("#conta-nome").textContent = nome ? `Olá, ${nome}!` : "Olá!";
    form.hidden = true;
    document.querySelector("#perfil-visualizacao").hidden = false;
    document.querySelector("#btn-editar-perfil").hidden = false;
    renderizarPerfil();
    toast("Perfil atualizado.");
  });

  document.querySelector("#btn-alterar-senha-perfil")?.addEventListener("click", dispararRedefinicaoSenha);

  document.querySelector("#btn-abrir-pedidos")?.addEventListener("click", () => {
    abrirSubModalConta("#modal-pedidos");
    renderizarPedidos();
  });

  document.querySelector("#btn-apagar-pedidos-selecionados")?.addEventListener("click", () => {
    confirmarEExcluirPedidos([...pedidosSelecionados], "Tem certeza que deseja apagar os pedidos selecionados? Esta ação não pode ser desfeita.");
  });
  document.querySelector("#btn-apagar-todos-pedidos")?.addEventListener("click", async () => {
    if (!usuarioAtual) return;
    const pedidos = await listarPedidosUsuario(usuarioAtual.uid);
    confirmarEExcluirPedidos(pedidos.map(p => p.id), "Tem certeza que deseja apagar todos os seus pedidos? Esta ação não pode ser desfeita.");
  });
  document.querySelector("#btn-sair-perfil")?.addEventListener("click", async () => {
    const ok = await confirmarAcao("Deseja sair da sua conta agora?", { titulo: "Sair da conta", textoConfirmar: "Sair", textoCancelar: "Cancelar" });
    if (!ok) return;
    fecharModal(document.querySelector("#modal-perfil"));
    await sair();
  });
  document.querySelector("#btn-abrir-enderecos")?.addEventListener("click", () => {
    abrirSubModalConta("#modal-enderecos");
    const form = document.querySelector("#form-endereco");
    if (form) {
      enderecoEditandoId = null;
      form.reset();
      form.querySelector(".stacked-form__title").textContent = "Novo endereço";
      form.querySelector('button[type="submit"]').textContent = "Salvar endereço";
    }
    renderizarEnderecos();
  });

  document.querySelector("#btn-abrir-pagamento")?.addEventListener("click", async () => {
    abrirSubModalConta("#modal-pagamento");
    if (usuarioAtual) {
      const perfil = perfilAtual;
      const form = document.querySelector("#form-pagamento");
      if (perfil?.formaPagamentoPreferida && form) {
        const input = form.querySelector(`input[value="${perfil.formaPagamentoPreferida}"]`);
        if (input) input.checked = true;
      }
    }
  });

  document.querySelector("#btn-abrir-favoritos")?.addEventListener("click", () => {
    abrirSubModalConta("#modal-favoritos");
    renderizarFavoritos();
  });

  document.querySelector("#btn-abrir-configuracoes")?.addEventListener("click", async () => {
    abrirSubModalConta("#modal-configuracoes");
    if (usuarioAtual) {
      const perfil = perfilAtual;
      const toggle = document.querySelector("#toggle-notificacoes");
      if (toggle) toggle.checked = !!perfil?.notificacoesPromocoes;
    }
  });

  document.querySelector("#form-endereco")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!usuarioAtual) return;
    const form = e.target;
    const dadosEndereco = {
      apelido: form.apelido.value.trim(),
      rua: form.rua.value.trim(),
      numero: form.numero.value.trim(),
      bairro: form.bairro.value.trim(),
      cidade: form.cidade.value.trim(),
      cep: form.cep.value.trim()
    };
    if (enderecoEditandoId) await atualizarEndereco(enderecoEditandoId, dadosEndereco);
    else await criarEndereco(usuarioAtual.uid, dadosEndereco);
    form.reset();
    enderecoEditandoId = null;
    form.querySelector(".stacked-form__title").textContent = "Novo endereço";
    form.querySelector('button[type="submit"]').textContent = "Salvar endereço";
    renderizarEnderecos();
    toast("Endereço salvo.");
  });

  document.querySelector("#form-pagamento")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!usuarioAtual) return;
    const forma = e.target.forma.value;
    if (!forma) { toast("Escolha uma forma de pagamento.", "error"); return; }
    await atualizarPerfilUsuario(usuarioAtual.uid, { formaPagamentoPreferida: forma });
    toast("Preferência salva.");
  });

  document.querySelector("#toggle-notificacoes")?.addEventListener("change", async (e) => {
    if (!usuarioAtual) return;
    await atualizarPerfilUsuario(usuarioAtual.uid, { notificacoesPromocoes: e.target.checked });
    toast("Preferência atualizada.");
  });

  document.querySelector("#btn-alterar-senha")?.addEventListener("click", dispararRedefinicaoSenha);
}

iniciar();
