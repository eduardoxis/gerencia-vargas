// js/modules/dashboard.js
import {
  listarProdutosPagina, buscarProdutosPorPrefixo, criarProduto, atualizarProduto, excluirProduto, duplicarProduto,
  listarCategorias, listarCategoriasPagina, criarCategoria, atualizarCategoria, excluirCategoria,
  listarEtiquetas, listarEtiquetasPagina, criarEtiqueta, excluirEtiqueta,
  listarMarcas, listarMarcasPagina, criarMarca, atualizarMarca, excluirMarca,
  listarClientes, listarClientesPagina, criarCliente, atualizarCliente, excluirCliente,
  ajustarEstoque, listarUsuarios, listarUsuariosPagina, migrarCamposFiltroCatalogo, migrarIndiceBuscaProdutos, listarUltimoAlertaEstoque,
  obterResumoDashboard, listarPedidosAdminPagina, atualizarStatusPedido, listarHistoricoEstoquePagina,
  obterCustoProduto, listarCustosProdutos, salvarCustoProduto
} from "../services/firestore.js";
import { formatBRL, escHtml, generateCode, converterParaPNG, converterParaProporcaoPadrao, toast, confirmarAcao, imgPos } from "../utils/utils.js";
import { comprimirParaBase64 } from "../services/imagem-base64.js";
import { calcularMargem, formatarPct, ROTULO_NIVEL_MARGEM } from "../utils/margem.js";
import { carregarPainelLeads } from "../modules/leads.js";
import { ICONS, icon } from "../utils/icons.js";
import { auth } from "../../firebase/firebase-config.js";
import { carregarAbaServicos } from "./servicos-admin.js";

let cacheProdutos = [];
let cacheCategorias = [];
let cacheEtiquetas = [];
// Custos dos produtos já carregados (id -> custos, ou null = sem custo cadastrado).
// Usado só para mostrar a margem na tabela; é atualizado ao salvar/excluir.
const cacheCustos = new Map();

function htmlCelulaMargem(produto) {
  if (!cacheCustos.has(produto.id)) return `<span class="margem-vazia" title="Carregando...">…</span>`;
  const custos = cacheCustos.get(produto.id);
  if (!custos) return `<span class="margem-vazia" title="Sem custo cadastrado">—</span>`;
  const r = calcularMargem({ ...custos, preco: produto.preco, quantidade: produto.quantidade });
  if (r.margemPct === null) return `<span class="margem-vazia" title="Sem preço de venda">—</span>`;
  return `<span class="margem-pill margem-pill--${r.nivel}" title="${ROTULO_NIVEL_MARGEM[r.nivel]} — lucro de ${escHtml(formatBRL(r.lucro))} por unidade">${formatarPct(r.margemPct)}</span><small class="margem-lucro">${escHtml(formatBRL(r.lucro))}</small>`;
}

/** Busca os custos que faltam e preenche a coluna "Margem" sem travar a tabela. */
async function preencherMargensProdutos(container, produtos) {
  const faltando = produtos.map(p => p.id).filter(id => !cacheCustos.has(id));
  if (faltando.length) {
    try {
      const mapa = await listarCustosProdutos(faltando);
      faltando.forEach(id => cacheCustos.set(id, mapa.get(id) || null));
    } catch (erro) {
      console.warn("Não foi possível carregar os custos dos produtos:", erro);
      container.querySelectorAll("#tabela-produtos td.margem-cell").forEach(td => {
        td.innerHTML = `<span class="margem-vazia" title="Não foi possível carregar os custos. Confira se as regras do Firestore foram publicadas.">—</span>`;
      });
      return;
    }
  }
  const tbody = container.querySelector("#tabela-produtos tbody");
  if (!tbody) return;
  produtos.forEach(p => {
    const td = tbody.querySelector(`tr[data-id="${CSS.escape(p.id)}"] td.margem-cell`);
    if (td) td.innerHTML = htmlCelulaMargem(p);
  });
}

/** Painel de resumo (lucro, margem, markup...) mostrado no formulário de produto. */
function htmlResumoMargem(r) {
  if (r.preco <= 0) return `<p class="margem-resumo__vazio">Informe o preço de venda para ver o lucro.</p>`;
  if (!r.temCusto && !r.imposto && !r.taxa) {
    return `<p class="margem-resumo__vazio">Informe o custo do produto (e, se houver, gastos, impostos e taxas) para calcular o lucro e a margem.</p>`;
  }
  const linha = (rotulo, valor, negativo = false) =>
    `<div><dt>${rotulo}</dt><dd>${negativo ? "−" : ""}${escHtml(formatBRL(valor))}</dd></div>`;
  return `
    <dl class="margem-resumo__linhas">
      ${linha("Preço de venda", r.preco)}
      ${r.custo > 0 ? linha("Custo do produto", r.custo, true) : ""}
      ${r.gastos > 0 ? linha("Outros gastos", r.gastos, true) : ""}
      ${r.imposto > 0 ? linha("Impostos", r.imposto, true) : ""}
      ${r.taxa > 0 ? linha("Taxas", r.taxa, true) : ""}
    </dl>
    <div class="margem-resumo__destaque margem-resumo__destaque--${r.nivel}">
      <div><span>Lucro por unidade</span><strong>${escHtml(formatBRL(r.lucro))}</strong></div>
      <div><span>Margem de lucro</span><strong>${formatarPct(r.margemPct)}</strong></div>
      <div><span>Markup (sobre o custo)</span><strong>${formatarPct(r.markupPct)}</strong></div>
    </div>
    <p class="margem-resumo__nivel"><span class="margem-pill margem-pill--${r.nivel}">${ROTULO_NIVEL_MARGEM[r.nivel]}</span></p>
    <ul class="margem-resumo__extras">
      ${r.precoMinimo !== null ? `<li>Preço mínimo para não ter prejuízo: <strong>${escHtml(formatBRL(r.precoMinimo))}</strong></li>` : ""}
      ${r.quantidade > 0 ? `<li>Lucro potencial do estoque (${r.quantidade} un.): <strong>${escHtml(formatBRL(r.lucroEstoque))}</strong></li>` : ""}
    </ul>`;
}

/**
 * Padroniza a foto (proporção fixa), comprime para WebP e devolve um data URL
 * (base64) para salvar direto no Firestore. Retorna null se falhar.
 */
async function enviarImagem(file, nomeBase) {
  try {
    const padronizada = await converterParaProporcaoPadrao(file);
    return await comprimirParaBase64(padronizada, { maxLargura: 800, maxBytes: 110 * 1024 });
  } catch (erro) {
    toast(erro.message || "Falha ao processar a imagem.", "error");
    return null;
  }
}

function blobParaDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Falha ao ler a imagem."));
    r.readAsDataURL(blob);
  });
}

/**
 * Para categorias e marcas: mantém PNG (transparência de logos). Se o PNG
 * ficar grande demais para o Firestore, cai para WebP comprimido.
 */
async function enviarImagemComoPNG(file, nomeBase) {
  try {
    const png = await converterParaPNG(file, 500);
    const dataUrl = await blobParaDataUrl(png);
    if (dataUrl.length <= 200 * 1024) return dataUrl;
    return await comprimirParaBase64(file, { maxLargura: 500, maxBytes: 110 * 1024 });
  } catch (erro) {
    toast(erro.message || "Falha ao processar a imagem.", "error");
    return null;
  }
}

// Mapa aba -> função de carregamento. Cada aba só busca dados do Firestore
// na PRIMEIRA vez que é aberta (lazy-load) — antes disso, o painel inteiro
// (9 abas: dashboard, produtos, categorias, marcas, etiquetas, estoque,
// leads, usuários, clientes) era recarregado por completo toda vez que o
// admin clicava no botão "Admin", mesmo pra só olhar uma aba. Isso sozinho
// gerava a maior parte do consumo de leitura do Firestore no painel.
const abasCarregadas = new Set();
let painelBotoesLigados = false;

function definirCarregadoresAba(root) {
  return {
    dashboard: () => carregarDashboard(root.querySelector("#painel-dashboard")),
    produtos: () => carregarAbaProdutos(root.querySelector("#painel-produtos")),
    servicos: () => carregarAbaServicos(root.querySelector("#painel-servicos"), { abrirAjusteEnquadramento, enviarImagem }),
    categorias: () => carregarAbaCategorias(root.querySelector("#painel-categorias")),
    marcas: () => carregarAbaMarcas(root.querySelector("#painel-marcas")),
    etiquetas: () => carregarAbaEtiquetas(root.querySelector("#painel-etiquetas")),
    estoque: () => carregarAbaEstoque(root.querySelector("#painel-estoque")),
    pedidos: () => carregarAbaPedidos(root.querySelector("#painel-pedidos")),
    historico: () => carregarAbaHistorico(root.querySelector("#painel-historico")),
    leads: () => carregarPainelLeads(root.querySelector("#painel-leads")),
    usuarios: () => carregarAbaUsuarios(root.querySelector("#painel-usuarios")),
    clientes: () => carregarAbaClientes(root.querySelector("#painel-clientes"))
  };
}

function formatarData(data) {
  return data?.seconds ? new Date(data.seconds * 1000).toLocaleString("pt-BR") : "—";
}

const estadoPedidos = { cursores: [null], pagina: 0, temMais: false };
const estadoHistorico = { cursores: [null], pagina: 0, temMais: false };
const estadoCategorias = { cursores: [null], pagina: 0, temMais: false };
const estadoMarcas = { cursores: [null], pagina: 0, temMais: false };
const estadoEtiquetas = { cursores: [null], pagina: 0, temMais: false };
const estadoClientes = { cursores: [null], pagina: 0, temMais: false };
const estadoUsuarios = { cursores: [null], pagina: 0, temMais: false };

function htmlPaginacaoAdmin(id, estado) {
  return `<div class="table-pagination"><span> Página ${estado.pagina + 1} · até 30 itens</span><div class="table-pagination__botoes"><button type="button" class="btn-secondary" data-pagina-admin="anterior" data-paginador="${id}" ${estado.pagina === 0 ? "disabled" : ""}>${icon("chevronLeft")} Anterior</button><button type="button" class="btn-secondary" data-pagina-admin="proxima" data-paginador="${id}" ${!estado.temMais ? "disabled" : ""}>Próxima ${icon("chevronRight")}</button></div></div>`;
}

function ligarPaginacaoAdmin(container, id, estado, recarregar) {
  container.querySelector(`[data-paginador="${id}"][data-pagina-admin="anterior"]`)?.addEventListener("click", () => recarregar(container, estado.pagina - 1));
  container.querySelector(`[data-paginador="${id}"][data-pagina-admin="proxima"]`)?.addEventListener("click", () => recarregar(container, estado.pagina + 1));
}

async function carregarAbaPedidos(container, pagina = 0) {
  const { itens: pedidos, cursor, temMais } = await listarPedidosAdminPagina({ tamanho: 30, cursor: estadoPedidos.cursores[pagina] });
  estadoPedidos.pagina = pagina;
  estadoPedidos.temMais = temMais;
  if (temMais) estadoPedidos.cursores[pagina + 1] = cursor;
  container.innerHTML = `<div class="admin-panel-head"><h1>Pedidos</h1><p>Acompanhe e atualize os pedidos da loja.</p></div>
    <div class="table-wrap"><table class="admin-table"><thead><tr><th>Data</th><th>Cliente</th><th>Itens</th><th>Total</th><th>Status</th></tr></thead><tbody>
    ${pedidos.map(p => `<tr><td>${formatarData(p.criadoEm)}</td><td>${escHtml(p.nomeCliente || p.usuarioId || "Cliente")}</td><td>${(p.itens || []).length}</td><td>${formatBRL(p.total)}</td><td><select data-pedido-status="${p.id}"><option ${p.status === "pendente" ? "selected" : ""} value="pendente">Novo</option><option ${p.status === "separacao" ? "selected" : ""} value="separacao">Em separação</option><option ${p.status === "pronto" ? "selected" : ""} value="pronto">Pronto</option><option ${p.status === "entregue" ? "selected" : ""} value="entregue">Entregue</option></select></td></tr>`).join("") || `<tr><td colspan="5">Nenhum pedido encontrado.</td></tr>`}
    </tbody></table></div>${htmlPaginacaoAdmin("pedidos", estadoPedidos)}`;
  container.querySelectorAll("[data-pedido-status]").forEach(select => select.addEventListener("change", async () => {
    await atualizarStatusPedido(select.dataset.pedidoStatus, select.value);
    toast("Status do pedido atualizado.");
  }));
  ligarPaginacaoAdmin(container, "pedidos", estadoPedidos, carregarAbaPedidos);
}

async function carregarAbaHistorico(container, pagina = 0) {
  const { itens: historico, cursor, temMais } = await listarHistoricoEstoquePagina({ tamanho: 30, cursor: estadoHistorico.cursores[pagina] });
  estadoHistorico.pagina = pagina;
  estadoHistorico.temMais = temMais;
  if (temMais) estadoHistorico.cursores[pagina + 1] = cursor;
  container.innerHTML = `<div class="admin-panel-head"><h1>Histórico de estoque</h1><p>Últimas alterações de quantidade registradas no painel.</p></div>
    <div class="table-wrap"><table class="admin-table"><thead><tr><th>Data</th><th>Produto</th><th>Alteração</th><th>Motivo</th></tr></thead><tbody>
    ${historico.map(h => `<tr><td>${formatarData(h.data)}</td><td>${escHtml(h.produtoId)}</td><td>${Number(h.delta) > 0 ? "+" : ""}${Number(h.delta) || 0}</td><td>${escHtml(h.motivo || "Ajuste manual")}</td></tr>`).join("") || `<tr><td colspan="4">Nenhuma alteração registrada.</td></tr>`}
    </tbody></table></div>${htmlPaginacaoAdmin("historico", estadoHistorico)}`;
  ligarPaginacaoAdmin(container, "historico", estadoHistorico, carregarAbaHistorico);
}

/** Força a aba a recarregar na próxima vez que for aberta (usar após uma ação que muda dados de OUTRA aba, ex: excluir categoria usada em produtos). */
export function invalidarAbaPainel(nomeAba) {
  abasCarregadas.delete(nomeAba);
}

export async function iniciarPainelAdmin(root) {
  const carregadores = definirCarregadoresAba(root);

  // Sempre garante a aba ativa no momento (padrão: dashboard) carregada.
  const abaAtiva = root.querySelector("[data-tab-trigger].is-active")?.dataset.tabTrigger || "dashboard";
  if (!abasCarregadas.has(abaAtiva)) {
    abasCarregadas.add(abaAtiva);
    await carregadores[abaAtiva]?.();
  }

  if (painelBotoesLigados) return;
  painelBotoesLigados = true;
  root.querySelectorAll("[data-tab-trigger]").forEach(botao => {
    botao.addEventListener("click", async () => {
      const aba = botao.dataset.tabTrigger;
      if (abasCarregadas.has(aba)) return;
      abasCarregadas.add(aba);
      try {
        await carregadores[aba]?.();
      } catch (erro) {
        abasCarregadas.delete(aba); // deixa tentar de novo se falhar
        console.error(`[painel] falha ao carregar aba "${aba}":`, erro);
      }
    });
  });
}

// ---------- DASHBOARD ----------
const formatadorNumeroDashboard = new Intl.NumberFormat("pt-BR");

function formatarNumeroDashboard(valor) {
  return formatadorNumeroDashboard.format(Number(valor) || 0);
}

function renderizarRankingDashboard(produtos, campo) {
  if (!Array.isArray(produtos) || !produtos.length) {
    return `<li class="dashboard-ranking-empty">Sem dados ainda</li>`;
  }

  return produtos.map(produto => {
    const imagem = imgPos(produto.imagem, 72);
    return `
      <li class="dashboard-ranking-item">
        <img
          class="dashboard-ranking-thumb"
          src="${escHtml(imagem.src || "/assets/images/placeholder.svg")}"
          style="object-position:${imagem.pos}"
          alt=""
          width="38"
          height="38"
          loading="lazy"
          decoding="async"
        >
        <span class="dashboard-ranking-name" title="${escHtml(produto.nome || "Produto sem nome")}">${escHtml(produto.nome || "Produto sem nome")}</span>
        <strong class="dashboard-ranking-value">${formatarNumeroDashboard(produto[campo])}</strong>
      </li>`;
  }).join("");
}

async function carregarDashboard(container) {
  if (!container) return;

  const {
    totalProdutos, totalCategorias, totalEstoque, semEstoque,
    totalUsuarios, maisVistos, maisCompartilhados
  } = await obterResumoDashboard();

  container.innerHTML = `
    <div class="dashboard-shell">
      <div class="admin-panel-head admin-panel-head--dashboard">
        <span class="dashboard-title-icon">${icon("trendingUp")}</span>
        <div>
          <h1>Dashboard</h1>
          <p>Visão geral do desempenho da sua loja.</p>
        </div>
      </div>

      <section class="dashboard-stat-grid" aria-label="Resumo da loja">
        <article class="dashboard-stat-card dashboard-stat-card--blue">
          <span class="dashboard-stat-icon">${icon("box")}</span>
          <div class="dashboard-stat-content">
            <strong>${formatarNumeroDashboard(totalProdutos)}</strong>
            <span>Produtos</span>
            <small>Total cadastrado</small>
          </div>
        </article>
        <article class="dashboard-stat-card dashboard-stat-card--purple">
          <span class="dashboard-stat-icon">${icon("tag")}</span>
          <div class="dashboard-stat-content">
            <strong>${formatarNumeroDashboard(totalCategorias)}</strong>
            <span>Categorias</span>
            <small>Organização do catálogo</small>
          </div>
        </article>
        <article class="dashboard-stat-card dashboard-stat-card--green">
          <span class="dashboard-stat-icon">${icon("archive")}</span>
          <div class="dashboard-stat-content">
            <strong>${formatarNumeroDashboard(totalEstoque)}</strong>
            <span>Itens em estoque</span>
            <small>Soma das unidades</small>
          </div>
        </article>
        <article class="dashboard-stat-card dashboard-stat-card--red">
          <span class="dashboard-stat-icon">${icon("inboxEmpty")}</span>
          <div class="dashboard-stat-content">
            <strong>${formatarNumeroDashboard(semEstoque)}</strong>
            <span>Sem estoque</span>
            <small>Disponibilidade atual</small>
          </div>
        </article>
        <article class="dashboard-stat-card dashboard-stat-card--blue">
          <span class="dashboard-stat-icon">${icon("users")}</span>
          <div class="dashboard-stat-content">
            <strong>${formatarNumeroDashboard(totalUsuarios)}</strong>
            <span>Usuários</span>
            <small>Contas cadastradas</small>
          </div>
        </article>
      </section>

      <section class="dashboard-ranking-grid" aria-label="Destaques de produtos">
        <article class="dashboard-card dashboard-ranking-card">
          <header class="dashboard-card-head">
            <span class="dashboard-card-head__icon dashboard-card-head__icon--blue">${icon("star")}</span>
            <h2>Produtos mais vistos</h2>
          </header>
          <ol class="dashboard-ranking-list">${renderizarRankingDashboard(maisVistos, "visualizacoes")}</ol>
          <button class="dashboard-card-link" type="button" data-dashboard-tab="produtos">
            Ver todos os produtos ${icon("chevronRight")}
          </button>
        </article>
        <article class="dashboard-card dashboard-ranking-card">
          <header class="dashboard-card-head">
            <span class="dashboard-card-head__icon dashboard-card-head__icon--purple">${icon("messageSquare")}</span>
            <h2>Produtos mais compartilhados</h2>
          </header>
          <ol class="dashboard-ranking-list">${renderizarRankingDashboard(maisCompartilhados, "compartilhamentos")}</ol>
          <button class="dashboard-card-link" type="button" data-dashboard-tab="produtos">
            Ver todos os produtos compartilhados ${icon("chevronRight")}
          </button>
        </article>
      </section>

      <section class="dashboard-action-stack" aria-label="Ferramentas de manutenção">
        <article class="dashboard-action-card" id="bloco-migracao-filtros">
          <span class="dashboard-action-icon dashboard-action-icon--green">${icon("filter")}</span>
          <div class="dashboard-action-copy">
            <h2>Filtros do catálogo (preço/disponibilidade)</h2>
            <p>Preenche os campos usados para filtrar preço e disponibilidade sem baixar o catálogo inteiro.</p>
            <p class="dashboard-action-status" id="status-migracao-filtros" aria-live="polite"></p>
          </div>
          <button class="btn-secondary dashboard-action-button dashboard-action-button--green" id="btn-migrar-filtros">
            ${icon("filter")}Preparar produtos para o catálogo
          </button>
        </article>
      </section>

      <section class="dashboard-bottom-grid" aria-label="Relatórios e acompanhamento">
        <article class="dashboard-card dashboard-tool-card" id="bloco-relatorio-vendas">
          <header class="dashboard-card-head dashboard-card-head--spaced">
            <span class="dashboard-card-head__icon dashboard-card-head__icon--purple">${icon("clipboardList")}</span>
            <div>
              <h2>Relatório de vendas</h2>
              <p>Calcula total vendido, ticket médio e produtos mais vendidos no período.</p>
            </div>
          </header>
          <div class="dashboard-report-form">
            <label class="dashboard-date-field">De<input type="date" id="relatorio-inicio"></label>
            <label class="dashboard-date-field">Até<input type="date" id="relatorio-fim"></label>
            <button class="btn-secondary dashboard-tool-button" id="btn-gerar-relatorio">${icon("clipboardList")}Gerar relatório</button>
            <button class="btn-secondary dashboard-tool-button" id="btn-baixar-relatorio-csv" style="display:none;">${icon("download")}Baixar CSV</button>
          </div>
          <div class="dashboard-tool-result" id="resultado-relatorio" aria-live="polite"></div>
        </article>
        <article class="dashboard-card dashboard-tool-card" id="bloco-erros-recentes">
          <header class="dashboard-card-head dashboard-card-head--spaced">
            <span class="dashboard-card-head__icon dashboard-card-head__icon--orange">${icon("bell")}</span>
            <div>
              <h2>Erros recentes do sistema</h2>
              <p>Falhas de upload, relatório ou pedidos registradas automaticamente (últimos 20).</p>
            </div>
          </header>
          <div class="dashboard-tool-actions">
            <button class="btn-secondary dashboard-action-button dashboard-action-button--orange" id="btn-carregar-erros">
              ${icon("refresh")}Carregar erros recentes
            </button>
          </div>
          <div class="dashboard-tool-result" id="lista-erros-recentes" aria-live="polite"></div>
        </article>
      </section>
    </div>`;

  container.querySelectorAll("[data-dashboard-tab]").forEach(botao => {
    botao.addEventListener("click", () => {
      const aba = botao.dataset.dashboardTab;
      container.closest("#modal-admin")?.querySelector(`[data-tab-trigger="${aba}"]`)?.click();
    });
  });

  container.querySelector("#btn-migrar-filtros")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const status = container.querySelector("#status-migracao-filtros");
    btn.disabled = true;
    status.textContent = "Procurando produtos pendentes...";
    try {
      const resultado = await migrarCamposFiltroCatalogo((feitos, total) => {
        status.textContent = `Atualizando ${feitos}/${total}...`;
      });
      status.textContent = resultado.total === 0
        ? "Tudo certo — nenhum produto pendente."
        : `Concluído: ${resultado.total} produtos preparados para os filtros do catálogo.`;
      toast("Migração concluída.");
    } catch (erro) {
      status.textContent = "Erro na migração: " + (erro.message || "tente novamente.");
      toast("Falha ao preparar produtos.", "error");
    } finally {
      btn.disabled = false;
    }
  });

  let ultimaQueryRelatorio = "";
  container.querySelector("#btn-gerar-relatorio")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const resultado = container.querySelector("#resultado-relatorio");
    const btnCsv = container.querySelector("#btn-baixar-relatorio-csv");
    const inicio = container.querySelector("#relatorio-inicio")?.value;
    const fim = container.querySelector("#relatorio-fim")?.value;
    btn.disabled = true;
    btnCsv.style.display = "none";
    resultado.innerHTML = `<p style="color:var(--cinza-500);font-size:0.85rem;">Calculando...</p>`;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const params = new URLSearchParams();
      if (inicio) params.set("inicio", inicio);
      if (fim) params.set("fim", fim);
      ultimaQueryRelatorio = params.toString();
      const resp = await fetch(`/api/relatorio-vendas?${ultimaQueryRelatorio}`, {
        headers: { Authorization: `Bearer ${idToken}` }
      });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro || "Falha ao gerar relatório.");

      resultado.innerHTML = `
        <div class="dash-grid" style="margin-bottom:0.75rem;">
          <div class="stat-card"><span>${formatBRL(dados.totalVendido)}</span><label>Total vendido</label></div>
          <div class="stat-card"><span>${dados.quantidadePedidos}</span><label>Pedidos</label></div>
          <div class="stat-card"><span>${formatBRL(dados.ticketMedio)}</span><label>Ticket médio</label></div>
        </div>
        <h4 style="margin:0.5rem 0;">Produtos mais vendidos</h4>
        <ol>${dados.maisVendidos.map(p => `<li>${escHtml(p.nome || "—")} <span>${p.quantidade} un · ${formatBRL(p.receita)}</span></li>`).join("") || "<li>Sem vendas no período</li>"}</ol>`;
      btnCsv.style.display = "";
      toast("Relatório gerado.");
    } catch (erro) {
      resultado.innerHTML = `<p style="color:var(--erro,#c0392b);font-size:0.85rem;">${escHtml(erro.message || "Erro ao gerar relatório.")}</p>`;
      toast("Falha ao gerar relatório.", "error");
    } finally {
      btn.disabled = false;
    }
  });

  container.querySelector("#btn-baixar-relatorio-csv")?.addEventListener("click", async () => {
    const idToken = await auth.currentUser?.getIdToken();
    const resp = await fetch(`/api/relatorio-vendas?${ultimaQueryRelatorio}&formato=csv`, {
      headers: { Authorization: `Bearer ${idToken}` }
    });
    if (!resp.ok) { toast("Falha ao baixar CSV.", "error"); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "relatorio-vendas.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  container.querySelector("#btn-carregar-erros")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const lista = container.querySelector("#lista-erros-recentes");
    btn.disabled = true;
    lista.innerHTML = `<p style="color:var(--cinza-500);font-size:0.85rem;">Carregando...</p>`;
    try {
      const { collection, query, orderBy, limit, getDocs } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js");
      const { db } = await import("../../firebase/firebase-config.js");
      const snap = await getDocs(query(collection(db, "logsErros"), orderBy("criadoEm", "desc"), limit(20)));
      if (snap.empty) {
        lista.innerHTML = `<p style="color:var(--cinza-500);font-size:0.85rem;">Nenhum erro registrado. 🎉</p>`;
        return;
      }
      lista.innerHTML = `<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:0.5rem;">${snap.docs.map(d => {
        const l = d.data();
        const quando = l.criadoEm?.toDate ? l.criadoEm.toDate().toLocaleString("pt-BR") : "—";
        return `<li style="border:1px solid var(--cinza-200,#eee);border-radius:8px;padding:0.5rem 0.75rem;font-size:0.82rem;">
          <strong>${escHtml(l.origem || "desconhecido")}</strong> · <span style="color:var(--cinza-500);">${quando}</span>
          <br>${escHtml(l.mensagem || "")}
        </li>`;
      }).join("")}</ul>`;
    } catch (erro) {
      lista.innerHTML = `<p style="color:var(--erro,#c0392b);font-size:0.85rem;">Falha ao carregar erros: ${escHtml(erro.message || "")}</p>`;
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- PRODUTOS ----------
// Estado da paginação da tabela admin de produtos. cursores[i] guarda o
// cursor do Firestore usado pra buscar a página i (cursores[0] = null = primeira
// página). Evita baixar o catálogo inteiro (pode ter dezenas de milhares de
// produtos) toda vez que o painel abre.
const TAMANHO_PAGINA_PRODUTOS = 20;
let estadoPaginacaoProdutos = {
  cursores: [null],
  paginaIndex: 0,
  temMais: false,
  ordenarPor: "nome",
  direcao: "asc",
  buscaAtiva: false,
  termoBusca: "",
  buscaCursores: [null],
  buscaPaginaIndex: 0,
  buscaTemMais: false,
    semFoto: false
};
// Cada leitura recebe um token. Quando uma busca antiga termina depois de o
// usuário limpar o campo, ela é descartada e não pode redesenhar a tabela.
let tokenRequisicaoProdutos = 0;

async function carregarAbaProdutos(container) {
  if (!container) return;
  cacheCategorias = await listarCategorias();
  cacheEtiquetas = await listarEtiquetas();
  // Recarregar a tabela (após salvar, importar ou trocar de aba) não deve
  // desfazer uma escolha explícita do administrador no filtro Sem fotos.
  const manterFiltroSemFoto = estadoPaginacaoProdutos.semFoto;

  estadoPaginacaoProdutos = {
    cursores: [null],
    paginaIndex: 0,
    temMais: false,
    ordenarPor: "nome",
    direcao: "asc",
    buscaAtiva: false,
    termoBusca: "",
    buscaCursores: [null],
    buscaPaginaIndex: 0,
    buscaTemMais: false,
    semFoto: manterFiltroSemFoto
  };

  container.innerHTML = `
    <div class="admin-panel-head">
      <h1>Produtos</h1>
      <p>Adicione, edite e gerencie os produtos da sua loja.</p>
    </div>
    <div class="admin-toolbar">
      <form class="admin-search" id="form-busca-admin-produtos" role="search">
        <div class="input-icon">
          ${icon("search")}
          <input type="search" id="busca-admin-produtos" placeholder="Pesquisar produtos..." autocomplete="off">
        </div>
        <button type="submit" class="btn-secondary" id="btn-pesquisar-produtos">${icon("search")}Pesquisar</button>
        <button type="button" class="btn-link" id="btn-limpar-busca-produtos" hidden>Limpar</button>
      </form>
      <div class="select-icon">
        ${icon("sort")}
        <select id="ordenar-admin-produtos">
          <option value="nome_asc">Ordenar: Nome</option>
          <option value="preco_asc">Menor preço</option>
          <option value="preco_desc">Maior preço</option>
        </select>
      </div>
      <label class="admin-filter-check" title="Mostrar somente produtos sem imagem cadastrada"><input type="checkbox" id="filtro-produtos-sem-foto" ${estadoPaginacaoProdutos.semFoto ? "checked" : ""}><span>Sem fotos</span></label>
      <button class="btn-secondary" id="btn-prompt-importacao">${icon("clipboardList")}Prompt para IA</button>
      <button class="btn-secondary" id="btn-importar-json">${icon("upload")}Importar JSON</button>
      <input type="file" id="input-importar-json" accept="application/json,.json" hidden>
      <button class="btn-primary" id="btn-novo-produto">${icon("plus")}Novo produto</button>
    </div>
    <div class="table-wrap"><table class="admin-table" id="tabela-produtos">
      <thead><tr><th></th><th>Nome</th><th>Categoria</th><th>Preço</th><th>Margem</th><th>Qtd</th><th>Status</th><th>Ações</th></tr></thead>
      <tbody></tbody>
    </table></div>
    <div class="table-pagination">
      <p class="table-count" id="contagem-produtos"></p>
      <div class="table-pagination__botoes">
        <button type="button" class="btn-secondary" id="btn-pagina-anterior" disabled>${icon("chevronLeft")} Anterior</button>
        <span id="label-pagina-produtos">Página 1</span>
        <button type="button" class="btn-secondary" id="btn-pagina-proxima" disabled>Próxima ${icon("chevronRight")}</button>
      </div>
    </div>
    <dialog id="dialog-produto" class="dialog-form"></dialog>
    <dialog id="dialog-importar-json" class="dialog-form">
      <h2>Resultado da importação</h2>
      <div id="resultado-importacao-json" class="import-result"></div>
      <div class="form-actions">
        <button type="button" class="btn-primary" id="btn-fechar-importacao">Fechar</button>
      </div>
    </dialog>
    <dialog id="dialog-prompt-importacao" class="dialog-form dialog-prompt-importacao">
      <div class="prompt-importacao__head">
        <div><h2>Prompt para criar JSON com IA</h2><p>Copie, cole na IA e depois importe o arquivo gerado.</p></div>
        <button type="button" class="prompt-importacao__close" id="btn-fechar-prompt-importacao" aria-label="Fechar">${icon("close")}</button>
      </div>
      <textarea id="texto-prompt-importacao" class="prompt-importacao__texto" readonly spellcheck="false"></textarea>
      <div class="form-actions">
        <button type="button" class="btn-primary" id="btn-copiar-prompt-importacao">${icon("copy")}Copiar prompt</button>
      </div>
    </dialog>`;

  await carregarPaginaProdutos(container, 0);

  const inputBusca = container.querySelector("#busca-admin-produtos");
  const btnLimparBusca = container.querySelector("#btn-limpar-busca-produtos");
  container.querySelector("#form-busca-admin-produtos").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearTimeout(atrasoBusca);
    await buscarProdutosAdmin(container, inputBusca.value.trim());
  });
  let atrasoBusca;
  const agendarBusca = () => {
    const termo = inputBusca.value.trim();
    btnLimparBusca.hidden = !termo;
    clearTimeout(atrasoBusca);
    // Ao limpar, voltamos à lista normal imediatamente.
    if (!termo) {
      buscarProdutosAdmin(container, "");
      return;
    }
    // Pesquisa enquanto digita, sem disparar uma leitura para cada tecla.
    atrasoBusca = setTimeout(() => {
      buscarProdutosAdmin(container, inputBusca.value.trim());
    }, 300);
  };
  inputBusca.addEventListener("input", agendarBusca);
  // Alguns navegadores disparam somente "search" ao usar o X nativo do campo.
  inputBusca.addEventListener("search", agendarBusca);
  btnLimparBusca.addEventListener("click", async () => {
    clearTimeout(atrasoBusca);
    inputBusca.value = "";
    btnLimparBusca.hidden = true;
    await buscarProdutosAdmin(container, "");
    inputBusca.focus();
  });

  container.querySelector("#filtro-produtos-sem-foto").addEventListener("change", async (e) => {
    estadoPaginacaoProdutos.semFoto = e.target.checked;
    estadoPaginacaoProdutos.cursores = [null];
    estadoPaginacaoProdutos.buscaCursores = [null];
    const termo = inputBusca.value.trim();
    if (termo) await buscarProdutosAdmin(container, termo);
    else await carregarPaginaProdutos(container, 0);
  });
  container.querySelector("#ordenar-admin-produtos").addEventListener("change", (e) => {
    const [campo, direcao] = e.target.value.split("_");
    estadoPaginacaoProdutos.ordenarPor = campo === "preco" ? "preco" : "nome";
    estadoPaginacaoProdutos.direcao = direcao === "desc" ? "desc" : "asc";
    estadoPaginacaoProdutos.cursores = [null];
    carregarPaginaProdutos(container, 0);
  });

  container.querySelector("#btn-pagina-anterior").addEventListener("click", () => {
    if (estadoPaginacaoProdutos.buscaAtiva) {
      if (estadoPaginacaoProdutos.buscaPaginaIndex > 0) {
        buscarProdutosAdmin(container, estadoPaginacaoProdutos.termoBusca, estadoPaginacaoProdutos.buscaPaginaIndex - 1);
      }
      return;
    }
    if (estadoPaginacaoProdutos.paginaIndex > 0) {
      carregarPaginaProdutos(container, estadoPaginacaoProdutos.paginaIndex - 1);
    }
  });
  container.querySelector("#btn-pagina-proxima").addEventListener("click", () => {
    if (estadoPaginacaoProdutos.buscaAtiva) {
      if (estadoPaginacaoProdutos.buscaTemMais) {
        buscarProdutosAdmin(container, estadoPaginacaoProdutos.termoBusca, estadoPaginacaoProdutos.buscaPaginaIndex + 1);
      }
      return;
    }
    if (estadoPaginacaoProdutos.temMais) {
      carregarPaginaProdutos(container, estadoPaginacaoProdutos.paginaIndex + 1);
    }
  });

  container.querySelector("#btn-novo-produto").addEventListener("click", () => abrirFormularioProduto(container));

  const inputJson = container.querySelector("#input-importar-json");
  container.querySelector("#btn-importar-json").addEventListener("click", () => inputJson.click());
  inputJson.addEventListener("change", async () => {
    const arquivo = inputJson.files?.[0];
    inputJson.value = "";
    if (!arquivo) return;
    await importarProdutosJson(container, arquivo);
  });

  const dialogPrompt = container.querySelector("#dialog-prompt-importacao");
  const textoPrompt = container.querySelector("#texto-prompt-importacao");
  container.querySelector("#btn-prompt-importacao").addEventListener("click", async () => {
    // Lê as listas atualizadas no instante em que o prompt é aberto. Assim,
    // marcas recém-criadas, editadas ou removidas já aparecem corretamente.
    [cacheCategorias, cacheMarcas] = await Promise.all([listarCategorias(), listarMarcas()]);
    textoPrompt.value = criarPromptImportacaoProdutos(cacheCategorias, cacheMarcas);
    dialogPrompt.showModal();
  });
  container.querySelector("#btn-fechar-prompt-importacao").addEventListener("click", () => dialogPrompt.close());
  container.querySelector("#btn-copiar-prompt-importacao").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textoPrompt.value);
    } catch {
      textoPrompt.focus();
      textoPrompt.select();
      document.execCommand("copy");
    }
    toast("Prompt copiado. Cole na IA para gerar o arquivo JSON.");
  });

}

async function prepararBuscaAntiga(container) {
  const btn = container.querySelector("#btn-preparar-busca-vazia");
  if (!btn) return;
  const textoOriginal = btn.innerHTML;
  btn.disabled = true;
  try {
    const resultado = await migrarIndiceBuscaProdutos((feitos, total) => {
      btn.textContent = `Atualizando ${feitos}/${total}...`;
    });
    toast(resultado.total
      ? `Busca atualizada para ${resultado.total} produto(s).`
      : "A busca já está atualizada para todos os produtos.");
    const termoAtual = container.querySelector("#busca-admin-produtos")?.value.trim();
    if (termoAtual) await buscarProdutosAdmin(container, termoAtual);
  } catch (erro) {
    console.error("Falha ao atualizar busca de produtos:", erro);
    toast("Não foi possível atualizar a busca. Tente novamente.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = textoOriginal;
  }
}

async function carregarPaginaProdutos(container, indice) {
  const meuToken = ++tokenRequisicaoProdutos;
  const estado = estadoPaginacaoProdutos;
  estado.buscaAtiva = false;
  const cursor = estado.cursores[indice] ?? null;

  let resultado;
  try {
    resultado = await listarProdutosPagina({
      tamanho: TAMANHO_PAGINA_PRODUTOS,
      cursor,
      apenasAtivos: false,
      semFoto: estado.semFoto,
      ordenarPor: estado.ordenarPor,
      direcao: estado.direcao
    });
  } catch (erro) {
    if (estado.semFoto && erro?.code === "failed-precondition") {
      cacheProdutos = [];
      renderizarTabelaProdutos(container, []);
      atualizarControlesPaginacao(container);
      toast("O índice do filtro Sem fotos ainda está sendo criado no Firebase. Aguarde alguns minutos e tente novamente.", "error");
      return;
    }
    throw erro;
  }
  const { produtos, cursor: novoCursor, temMais } = resultado;
  if (meuToken !== tokenRequisicaoProdutos) return;

  estado.paginaIndex = indice;
  estado.temMais = temMais;
  if (temMais) estado.cursores[indice + 1] = novoCursor;

  cacheProdutos = produtos;
  renderizarTabelaProdutos(container, produtos);
  atualizarControlesPaginacao(container);
}

function produtoTemFoto(produto = {}) {
  if (String(produto.imagem || "").trim()) return true;
  if (Array.isArray(produto.imagens) && produto.imagens.some(Boolean)) return true;
  return Array.isArray(produto.cores) && produto.cores.some((cor) =>
    String(cor?.imagem || "").trim() || (Array.isArray(cor?.imagens) && cor.imagens.some(Boolean))
  );
}
async function buscarProdutosAdmin(container, termo, indiceBusca = 0) {
  const meuToken = ++tokenRequisicaoProdutos;
  if (!termo) {
    estadoPaginacaoProdutos.buscaAtiva = false;
    estadoPaginacaoProdutos.termoBusca = "";
    estadoPaginacaoProdutos.buscaCursores = [null];
    estadoPaginacaoProdutos.buscaPaginaIndex = 0;
    estadoPaginacaoProdutos.buscaTemMais = false;
    estadoPaginacaoProdutos.cursores = [null];
    await carregarPaginaProdutos(container, 0);
    return;
  }
  if (termo !== estadoPaginacaoProdutos.termoBusca) {
    estadoPaginacaoProdutos.termoBusca = termo;
    estadoPaginacaoProdutos.buscaCursores = [null];
    estadoPaginacaoProdutos.buscaPaginaIndex = 0;
    estadoPaginacaoProdutos.buscaTemMais = false;
    indiceBusca = 0;
  }
  estadoPaginacaoProdutos.buscaAtiva = true;
  try {
    const { produtos, cursor, temMais } = await buscarProdutosPorPrefixo(termo, {
      tamanho: 30,
      cursor: estadoPaginacaoProdutos.buscaCursores[indiceBusca] ?? null,
      semFoto: estadoPaginacaoProdutos.semFoto
    });
    if (meuToken !== tokenRequisicaoProdutos) return;
    estadoPaginacaoProdutos.buscaPaginaIndex = indiceBusca;
    estadoPaginacaoProdutos.buscaTemMais = temMais;
    if (temMais) estadoPaginacaoProdutos.buscaCursores[indiceBusca + 1] = cursor;
    const filtrados = estadoPaginacaoProdutos.semFoto ? produtos.filter(produto => !produtoTemFoto(produto)) : produtos;
    cacheProdutos = filtrados;
    renderizarTabelaProdutos(container, filtrados, { busca: true });
    atualizarControlesPaginacao(container);
  } catch (erro) {
    if (meuToken !== tokenRequisicaoProdutos) return;
    console.error("Falha ao pesquisar produtos:", erro);
    cacheProdutos = [];
    renderizarTabelaProdutos(container, [], { busca: true });
    atualizarControlesPaginacao(container);
    toast("Não foi possível pesquisar agora. Tente novamente.", "error");
  }
}

function atualizarControlesPaginacao(container) {
  const estado = estadoPaginacaoProdutos;
  const label = container.querySelector("#label-pagina-produtos");
  const btnAnterior = container.querySelector("#btn-pagina-anterior");
  const btnProxima = container.querySelector("#btn-pagina-proxima");

  if (estado.buscaAtiva) {
    label.textContent = `Busca — página ${estado.buscaPaginaIndex + 1} (até 30 itens)`;
    btnAnterior.disabled = estado.buscaPaginaIndex === 0;
    btnProxima.disabled = !estado.buscaTemMais;
    return;
  }

  label.textContent = `Página ${estado.paginaIndex + 1}`;
  btnAnterior.disabled = estado.paginaIndex === 0;
  btnProxima.disabled = !estado.temMais;
}

function criarPromptImportacaoProdutos(categorias = [], marcas = []) {
  const nomesCategorias = categorias.map(c => c.nome).filter(Boolean);
  const categoriasTexto = nomesCategorias.length
    ? nomesCategorias.map(nome => `- ${nome}`).join("\n")
    : "- Nenhuma categoria cadastrada no momento. Deixe o campo categoria vazio.";
  const nomesMarcas = marcas.map(m => m.nome).filter(Boolean);
  const marcasTexto = nomesMarcas.length
    ? nomesMarcas.map(nome => `- ${nome}`).join("\n")
    : "- Nenhuma marca cadastrada no momento. Deixe o campo marca vazio.";

  return `Crie e entregue um ARQUIVO para download chamado "produtos-importacao.json" para importar produtos no painel da Papelaria Futura.

Não responda com explicações, texto comum, Markdown ou blocos de código. Gere o arquivo .json anexável/baixável; o conteúdo do arquivo deve ser somente JSON válido.

O arquivo deve ter exatamente esta estrutura:
{
  "produtos": [
    {
      "nome": "NOME COMPLETO DO PRODUTO 1 UN",
      "marca": "MARCA OPCIONAL",
      "preco": 29.9,
      "quantidade": 5,
      "categoria": "CATEGORIA EXISTENTE",
      "status": "disponivel",
      "codigo": "PROD-EXEMPLO-001",
      "descricao": "DESCRIÇÃO OPCIONAL",
      "destaques": ["DESTAQUE OPCIONAL 1", "DESTAQUE OPCIONAL 2"],
      "etiquetas": ["ETIQUETA OPCIONAL"],
      "imagem": "https://url-publica-da-imagem-principal.webp",
      "imagens": ["https://url-publica-da-imagem-principal.webp"]
    }
  ]
}

Regras obrigatórias:
- "nome" e "preco" são obrigatórios. Escreva o "nome" INTEIRAMENTE EM LETRAS MAIÚSCULAS, incluindo palavras com acento. Quando o produto for vendido por unidade, informe a quantidade e "UN" no final do nome (exemplo: "CANETA ESFEROGRÁFICA AZUL 1 UN"). Para kits, pacotes, caixas ou conjuntos, informe a quantidade e a unidade correspondente (exemplo: "LÁPIS DE COR 12 UN" ou "PAPEL SULFITE A4 500 FOLHAS"). "preco" deve ser número, sem R$, vírgula ou texto.
- "quantidade" deve ser número inteiro maior ou igual a zero.
- "categoria" precisa ser exatamente uma das categorias já cadastradas abaixo. Não invente, não altere maiúsculas/minúsculas e não crie categoria nova.
- "marca" é opcional, mas, quando preenchida, precisa ser exatamente uma das marcas já cadastradas abaixo. Não invente, não altere maiúsculas/minúsculas e não crie marca nova.
- Todo texto descritivo criado para o produto deve estar EM LETRAS MAIÚSCULAS: "nome", "codigo", "descricao", itens de "destaques" e itens de "etiquetas". As exceções são URLs, os valores técnicos de "status" e as categorias/marcas cadastradas, que devem manter exatamente a grafia registrada no painel.
- "status" pode ser apenas: "disponivel", "esgotado" ou "oculto".
- "imagem" e "imagens" são opcionais, mas devem conter somente URLs públicas HTTPS. Produtos sem foto não aparecem no site público.
- "imagens" deve ser uma lista de URLs; a primeira será usada como capa. Se usar "imagem", repita a mesma URL como primeiro item de "imagens".
- "destaques" e "etiquetas" devem ser listas de textos. Se não houver conteúdo, use [] .
- Não use comentários, reticências, texto fora do JSON, vírgula depois do último campo, base64, arquivo local ou URL privada.
- Gere todos os produtos solicitados dentro da mesma lista "produtos".

Categorias permitidas agora:
${categoriasTexto}

Marcas permitidas agora:
${marcasTexto}`;
}

function normalizarProdutoImportado(item, categoriasValidas) {
  const erros = [];
  const nome = String(item.nome || "").trim().toUpperCase();
  if (!nome) erros.push("nome ausente");

  const preco = Number(item.preco);
  if (!Number.isFinite(preco) || preco < 0) erros.push("preço inválido");

  const categoria = String(item.categoria || "").trim();
  if (categoria && categoriasValidas.length && !categoriasValidas.includes(categoria)) {
    erros.push(`categoria "${categoria}" não existe`);
  }

  if (erros.length) return { ok: false, nome: nome || "(sem nome)", erros };

  const imagens = Array.isArray(item.imagens) ? item.imagens.filter(Boolean)
    : (item.imagem ? [item.imagem] : []);

  return {
    ok: true,
    dados: {
      nome,
      marca: String(item.marca || "").trim(),
      cores: Array.isArray(item.cores)
        ? item.cores.map(c => {
            const imgs = Array.isArray(c?.imagens) ? c.imagens.filter(Boolean) : (c?.imagem ? [String(c.imagem)] : []);
            return { nome: String(c?.nome || "").trim(), hex: String(c?.hex || "#cccccc").trim(), padrao: !!c?.padrao, imagens: imgs, imagem: imgs[0] || "" };
          }).filter(c => c.nome)
        : [],
      preco,
      quantidade: Number.isFinite(Number(item.quantidade)) ? parseInt(item.quantidade, 10) : 0,
      categoria,
      status: ["disponivel", "esgotado", "oculto"].includes(item.status) ? item.status : "disponivel",
      codigo: String(item.codigo || generateCode()).trim(),
      descricao: String(item.descricao || "").trim(),
      destaques: Array.isArray(item.destaques) ? item.destaques.map(String) : [],
      etiquetas: Array.isArray(item.etiquetas) ? item.etiquetas.map(String) : [],
      imagens,
      imagem: imagens[0] || ""
    }
  };
}

async function importarProdutosJson(container, arquivo) {
  const dialog = container.querySelector("#dialog-importar-json");
  const resultado = container.querySelector("#resultado-importacao-json");

  let itens;
  try {
    const texto = await arquivo.text();
    const json = JSON.parse(texto);
    itens = Array.isArray(json) ? json : (Array.isArray(json.produtos) ? json.produtos : null);
    if (!itens) throw new Error("formato");
  } catch {
    toast("Arquivo JSON inválido. Envie uma lista de produtos (array) ou { \"produtos\": [...] }.", "error");
    return;
  }

  if (!itens.length) {
    toast("O arquivo não tem nenhum produto.", "error");
    return;
  }

  const categoriasValidas = cacheCategorias.map(c => c.nome);
  const validos = [];
  const invalidos = [];

  itens.forEach((item, i) => {
    const r = normalizarProdutoImportado(item, categoriasValidas);
    if (r.ok) validos.push(r.dados);
    else invalidos.push({ linha: i + 1, nome: r.nome, erros: r.erros });
  });

  for (const dados of validos) {
    await criarProduto(dados);
  }

  resultado.innerHTML = `
    <p><strong>${validos.length}</strong> produto(s) importado(s) com sucesso.</p>
    ${invalidos.length ? `
      <p><strong>${invalidos.length}</strong> ignorado(s):</p>
      <ul class="import-result__errors">
        ${invalidos.map(e => `<li>#${e.linha} "${escHtml(e.nome)}": ${escHtml(e.erros.join(", "))}</li>`).join("")}
      </ul>` : ""}`;

  dialog.querySelector("#btn-fechar-importacao").onclick = () => { dialog.close(); carregarAbaProdutos(container); };

  dialog.showModal();
  if (validos.length) toast(`${validos.length} produto(s) importado(s).`);
}

/**
 * Depois de editar/excluir um produto não precisamos reler a página inteira
 * (30 documentos): atualizamos a lista que já está na tela. Só relemos quando a
 * mudança poderia alterar a posição do item (nome/preço da ordenação) ou quando
 * a tela depende de um filtro de servidor (Sem fotos). Devolve true se resolveu local.
 */
function atualizarProdutoNaTela(container, produtoAntigo, dadosNovos) {
  const estado = estadoPaginacaoProdutos;
  const tabela = container.querySelector("#tabela-produtos");
  if (!tabela || estado.semFoto || !cacheProdutos.some(p => p.id === produtoAntigo.id)) return false;
  const campoOrdem = estado.ordenarPor === "preco" ? "preco" : "nome";
  if (!estado.buscaAtiva && produtoAntigo[campoOrdem] !== dadosNovos[campoOrdem]) return false;
  // Na busca, nome/marca/categoria/código mudam os termos indexados.
  if (estado.buscaAtiva && ["nome", "marca", "categoria", "codigo"].some(c => produtoAntigo[c] !== dadosNovos[c])) return false;
  cacheProdutos = cacheProdutos.map(p => p.id === produtoAntigo.id ? { ...p, ...dadosNovos } : p);
  renderizarTabelaProdutos(container, cacheProdutos, { busca: estado.buscaAtiva });
  return true;
}

function removerProdutoDaTela(container, id) {
  const restantes = cacheProdutos.filter(p => p.id !== id);
  if (!restantes.length || restantes.length === cacheProdutos.length) return false;
  cacheProdutos = restantes;
  renderizarTabelaProdutos(container, cacheProdutos, { busca: estadoPaginacaoProdutos.buscaAtiva });
  return true;
}

function renderizarTabelaProdutos(container, produtos, { busca = false } = {}) {
  const tbody = container.querySelector("#tabela-produtos tbody");
  const contagem = container.querySelector("#contagem-produtos");
  if (contagem) {
    contagem.textContent = busca
      ? `${produtos.length} resultado(s) encontrado(s)`
      : `${produtos.length} produto(s) nesta página`;
  }

  tbody.innerHTML = produtos.map(p => `
    <tr data-id="${p.id}">
      <td><img class="thumb" src="${imgPos(p.imagem).src || "/assets/images/placeholder.svg"}" style="object-position:${imgPos(p.imagem).pos}" alt=""></td>
      <td>${escHtml(p.nome)}</td>
      <td>${escHtml(p.categoria || "-")}</td>
      <td>${formatBRL(p.preco)}</td>
      <td class="margem-cell">${htmlCelulaMargem(p)}</td>
      <td>${p.quantidade ?? 0}</td>
      <td><span class="status-pill status-${p.status}">${escHtml(p.status)}</span></td>
      <td class="row-actions">
        <button data-action="editar" title="Editar">${icon("pencil")}</button>
        <button data-action="duplicar" title="Duplicar">${icon("copy")}</button>
        <button data-action="excluir" title="Excluir">${icon("trash")}</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="8">
      <div class="empty-state">
        ${icon("gridEmpty", "empty-state__icon")}
        <strong>${busca ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}</strong>
        <p>${busca ? "Tente outro nome, marca, categoria ou código." : "Comece adicionando seu primeiro produto à sua loja."}</p>
        ${busca
          ? `<div class="empty-state__actions">
              <button type="button" class="btn-secondary" id="btn-limpar-busca-vazia">${icon("close")}Limpar busca</button>
              <button type="button" class="btn-secondary" id="btn-preparar-busca-vazia">${icon("search")}Preparar busca de todos</button>
            </div>
            <small class="empty-state__hint">Atualize uma vez para aplicar a busca por palavras em todo o catálogo.</small>`
          : `<button type="button" class="btn-secondary" id="btn-primeiro-produto">${icon("plus")}Adicionar primeiro produto</button>`}
      </div>
    </td></tr>`;

  preencherMargensProdutos(container, produtos);

  tbody.querySelector("#btn-primeiro-produto")?.addEventListener("click", () => abrirFormularioProduto(container));
  tbody.querySelector("#btn-limpar-busca-vazia")?.addEventListener("click", async () => {
    const input = container.querySelector("#busca-admin-produtos");
    if (input) input.value = "";
    container.querySelector("#btn-limpar-busca-produtos").hidden = true;
    await buscarProdutosAdmin(container, "");
  });
  // A ação reconstrói o índice de todos os produtos, permitindo procurar
  // palavras em qualquer posição do nome (ex.: "MINI" em "Grampeador MINI").
  tbody.querySelector("#btn-preparar-busca-vazia")?.addEventListener("click", () => {
    prepararBuscaAntiga(container);
  });

  tbody.querySelectorAll("tr").forEach(tr => {
    const id = tr.dataset.id;
    const produto = produtos.find(p => p.id === id);
    tr.querySelector('[data-action="editar"]')?.addEventListener("click", () => abrirFormularioProduto(container, produto));
    tr.querySelector('[data-action="duplicar"]')?.addEventListener("click", async () => {
      await duplicarProduto(produto);
      toast("Produto duplicado.");
      carregarPaginaProdutos(container, estadoPaginacaoProdutos.paginaIndex);
    });
    tr.querySelector('[data-action="excluir"]')?.addEventListener("click", async () => {
      const ok = await confirmarAcao(`Excluir "${produto.nome}"? Esta ação não pode ser desfeita.`, {
        titulo: "Excluir produto",
        textoConfirmar: "Excluir"
      });
      if (!ok) return;
      await excluirProduto(id);
      cacheCustos.delete(id);
      toast("Produto excluído.");
      // Sem reler a página: tira a linha da lista que já está carregada.
      if (!removerProdutoDaTela(container, id)) carregarPaginaProdutos(container, estadoPaginacaoProdutos.paginaIndex);
    });
  });
}

// Abre um mini-editor para o admin arrastar a imagem dentro de um quadro (proporção 1:1,
// igual à moldura usada nos cards de produto) e escolher qual parte fica visível/centralizada.
// A posição escolhida é gravada como fragmento na própria URL (#pos=x,y), sem mexer no arquivo.
function abrirAjusteEnquadramento(url, onSalvar) {
  const { src, pos: posAtual } = imgPos(url);
  const [xIni, yIni] = posAtual.replace(/%/g, "").split(" ").map(Number);

  const dialog = document.createElement("dialog");
  dialog.className = "modal-dialog modal-ajuste-imagem";
  dialog.innerHTML = `
    <form method="dialog" class="form-cadastro">
      <h3>Ajustar enquadramento</h3>
      <p class="galeria-produto__ajuda">Arraste a imagem para centralizar o que importa. Isso só muda como ela aparece no site, o arquivo continua o mesmo.</p>
      <div class="ajuste-imagem__quadro" id="ajuste-quadro">
        <img id="ajuste-img" src="${src}" style="object-position:${xIni}% ${yIni}%" alt="">
      </div>
      <div class="form-actions">
        <button type="button" data-modal-close-dialog>Cancelar</button>
        <button type="button" class="btn-secondary" id="ajuste-centralizar">Centralizar</button>
        <button type="submit" class="btn-primary">Salvar posição</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);
  dialog.showModal();
  dialog.addEventListener("close", () => dialog.remove());
  dialog.querySelector("[data-modal-close-dialog]").addEventListener("click", () => dialog.close());

  let x = xIni, y = yIni;
  const quadro = dialog.querySelector("#ajuste-quadro");
  const img = dialog.querySelector("#ajuste-img");

  function aplicar() {
    x = Math.min(100, Math.max(0, x));
    y = Math.min(100, Math.max(0, y));
    img.style.objectPosition = `${x}% ${y}%`;
  }

  let arrastando = false, ultimoX = 0, ultimoY = 0;
  function iniciar(clientX, clientY) { arrastando = true; ultimoX = clientX; ultimoY = clientY; }
  function mover(clientX, clientY) {
    if (!arrastando) return;
    const rect = quadro.getBoundingClientRect();
    // arrastar o mouse para a direita "empurra" o enquadramento pra esquerda (sensação natural de arrastar a foto)
    x -= ((clientX - ultimoX) / rect.width) * 100;
    y -= ((clientY - ultimoY) / rect.height) * 100;
    ultimoX = clientX; ultimoY = clientY;
    aplicar();
  }
  function parar() { arrastando = false; }

  quadro.addEventListener("mousedown", (e) => { iniciar(e.clientX, e.clientY); e.preventDefault(); });
  window.addEventListener("mousemove", (e) => mover(e.clientX, e.clientY));
  window.addEventListener("mouseup", parar);
  quadro.addEventListener("touchstart", (e) => { const t = e.touches[0]; iniciar(t.clientX, t.clientY); }, { passive: true });
  quadro.addEventListener("touchmove", (e) => { const t = e.touches[0]; mover(t.clientX, t.clientY); }, { passive: true });
  quadro.addEventListener("touchend", parar);

  dialog.querySelector("#ajuste-centralizar").addEventListener("click", () => { x = 50; y = 50; aplicar(); });

  dialog.querySelector("form").addEventListener("submit", () => {
    const base = src.replace(/#pos=[\d.]+,[\d.]+$/, "");
    onSalvar(`${base}#pos=${x.toFixed(1)},${y.toFixed(1)}`);
    dialog.close();
  });
}

async function abrirFormularioProduto(container, produto = null) {
  const dialog = container.querySelector("#dialog-produto");
  dialog.className = "dialog-form dialog-produto";
  cacheCategorias = await listarCategorias();
  cacheMarcas = (await listarMarcas()).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  // Custos ficam numa coleção só do admin. Se a leitura falhar (ex.: regras ainda
  // não publicadas), o produto continua editável e os custos não são sobrescritos.
  let custosAtuais = null;
  let custosCarregados = true;
  if (produto?.id) {
    try {
      custosAtuais = await obterCustoProduto(produto.id);
    } catch (erro) {
      custosCarregados = false;
      console.warn("Não foi possível carregar os custos do produto:", erro);
    }
  }
  const opcoesCategoria = cacheCategorias.map(c => `<option value="${escHtml(c.nome)}" ${produto?.categoria === c.nome ? "selected" : ""}>${escHtml(c.nome)}</option>`).join("");
  const opcoesMarca = cacheMarcas.map(m => `<option value="${escHtml(m.nome)}" ${produto?.marca === m.nome ? "selected" : ""}>${escHtml(m.nome)}</option>`).join("");
  const opcoesEtiquetas = cacheEtiquetas.map(e => `
    <label class="chip-check">
      <input type="checkbox" value="${escHtml(e.nome)}" ${(produto?.etiquetas || []).includes(e.nome) ? "checked" : ""}> ${escHtml(e.nome)}
    </label>`).join("");

  // estado da galeria de imagens: cada item é { id, url (existente) ou file+previewUrl (novo) }
  const iniciais = Array.isArray(produto?.imagens) && produto.imagens.length
    ? produto.imagens
    : (produto?.imagem ? [produto.imagem] : []);
  let galeria = iniciais.map(url => ({ id: crypto.randomUUID(), url, file: null, previewUrl: null }));
  let arrastando = null;

  // estado das variações de cor: cada item é { id, nome, hex, padrao, imagens: [{id, url, file, previewUrl}] }
  let cores = Array.isArray(produto?.cores)
    ? produto.cores.map(c => ({
        id: crypto.randomUUID(),
        nome: c.nome || "",
        hex: c.hex || "#cccccc",
        padrao: !!c.padrao,
        imagens: (Array.isArray(c.imagens) && c.imagens.length ? c.imagens : (c.imagem ? [c.imagem] : []))
          .filter(Boolean).map(url => ({ id: crypto.randomUUID(), url, file: null, previewUrl: null }))
      }))
    : [];
  if (cores.length && !cores.some(c => c.padrao)) cores[0].padrao = true;

  dialog.innerHTML = `
    <form id="form-produto" class="product-form">      <header class="product-form__head">
        <div class="product-form__title"><span>${icon("box")}</span><div><h2>${produto ? "Editar produto" : "Novo produto"}</h2><p>Preencha as informações do produto para a loja.</p></div></div>
        <button type="button" class="product-form__close" data-modal-close-dialog aria-label="Fechar formulário">${icon("close")}</button>
      </header>
      <div class="product-form__scroll">
      <div class="form-grid">
        <label>Nome<input name="nome" required autocomplete="off" value="${escHtml(produto?.nome || "")}"></label>
        <label>Marca<select name="marca"><option value="">Selecione</option>${opcoesMarca}</select></label>
        <label>Preço de venda (R$)<input name="preco" type="number" step="0.01" required value="${produto?.preco ?? ""}"></label>
        <label>Quantidade<input name="quantidade" type="number" required value="${produto?.quantidade ?? 0}"></label>
        <label>Categoria<select name="categoria"><option value="">Selecione</option>${opcoesCategoria}</select></label>
        <label>Status
          <select name="status">
            <option value="disponivel" ${produto?.status === "disponivel" ? "selected" : ""}>Disponível</option>
            <option value="sem_estoque" ${produto?.status === "sem_estoque" ? "selected" : ""}>Sem estoque</option>
            <option value="oculto" ${produto?.status === "oculto" ? "selected" : ""}>Oculto</option>
          </select>
        </label>
        <label>Código<input name="codigo" autocomplete="off" value="${escHtml(produto?.codigo || generateCode())}"></label>
        <label class="chip-list__visivel" id="label-visivel-sem-foto" title="Por padrão, produto sem nenhuma foto cadastrada fica oculto no site. Marque aqui se quiser exibi-lo mesmo assim.">
          <input type="checkbox" name="visivelSemFoto" ${produto?.visivelSemFoto ? "checked" : ""}> Exibir no site mesmo sem foto
        </label>
      </div>

      <section class="custos-produto" id="custos-produto">
        <h4>Custos e margem de lucro</h4>
        <p class="galeria-produto__ajuda">Só você vê isto no painel: nada aparece no site. Preencha o que se aplica ao produto (por unidade) para calcular o lucro e a margem.</p>
        ${custosCarregados ? "" : `<p class="custos-produto__aviso">Não foi possível carregar os custos deste produto. Confira se as regras do Firestore foram publicadas. Os custos já salvos só serão alterados se você preencher os campos abaixo.</p>`}
        <div class="form-grid">
          <label>Custo do produto (R$)<input name="custo" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0,00" value="${custosAtuais?.custo || ""}"></label>
          <label>Outros gastos (R$)<input name="gastos" type="number" step="0.01" min="0" inputmode="decimal" placeholder="Frete, embalagem..." value="${custosAtuais?.gastos || ""}"></label>
          <label>Impostos (% da venda)<input name="impostoPct" type="number" step="0.01" min="0" max="100" inputmode="decimal" placeholder="0" value="${custosAtuais?.impostoPct || ""}"></label>
          <label>Taxas de pagamento (%)<input name="taxaPct" type="number" step="0.01" min="0" max="100" inputmode="decimal" placeholder="Cartão, comissão..." value="${custosAtuais?.taxaPct || ""}"></label>
        </div>
        <div class="margem-resumo" id="margem-resumo" aria-live="polite"></div>
      </section>

      <div class="cores-produto">
        <h4>Variações de cor (opcional)</h4>
        <p class="galeria-produto__ajuda">Cadastre as cores disponíveis para este produto e as fotos de cada uma. O cliente escolherá a cor na página do produto antes de adicionar ao carrinho. Deixe vazio se o produto não tiver variação de cor — nesse caso, use a galeria de imagens abaixo.</p>
        <div class="cores-produto__lista" id="cores-lista"></div>
        <div class="cores-produto__add">
          <input type="text" id="input-cor-nome" placeholder="Nome da cor (ex: Azul)" autocomplete="off">
          <input type="color" id="input-cor-hex" value="#2e6cf6">
          <button type="button" id="btn-add-cor" class="btn-secondary">${icon("plus")}Adicionar cor</button>
        </div>
      </div>

      <div class="galeria-produto" id="galeria-produto-wrap">
        <h4>Galeria de imagens do produto</h4>
        <p class="galeria-produto__ajuda">A primeira imagem da lista é usada como capa no catálogo. Arraste as miniaturas para reordenar. Você também pode cadastrar imagens específicas para cada variação de cor.</p>
        <div class="galeria-produto__grid" id="galeria-grid"></div>
        <label class="galeria-produto__upload">
          ${icon("plus")}Escolher arquivos
          <input type="file" id="input-galeria" accept="image/*" multiple hidden>
        </label>
      </div>

      <label>Descrição<textarea name="descricao" rows="3">${escHtml(produto?.descricao || "")}</textarea></label>
      <label>Destaques do produto (opcional)
        <textarea name="destaques" rows="3" placeholder="Um por linha, ex:&#10;Material resistente e durável&#10;Zíperes de alta qualidade">${escHtml((produto?.destaques || []).join("\n"))}</textarea>
      </label>
      <p style="font-size:0.78rem;color:var(--cinza-500);margin:-0.5rem 0 0.5rem">Aparece como uma caixinha "Destaques do produto" na página do produto. Um item por linha. Deixe em branco se não quiser essa seção.</p>
      <fieldset class="chip-group"><legend>Etiquetas</legend>${opcoesEtiquetas || "<em>Nenhuma etiqueta cadastrada</em>"}</fieldset>      </div>
      <footer class="form-actions product-form__actions">
        <button type="button" data-modal-close-dialog>Cancelar</button>
        <button type="submit" class="btn-primary">Salvar</button>
      </footer>
    </form>`;

  dialog.showModal();
  dialog.querySelectorAll("[data-modal-close-dialog]").forEach((botao) => botao.addEventListener("click", () => dialog.close()));

  // Margem ao vivo: recalcula a cada digitação em qualquer campo envolvido.
  const formProduto = dialog.querySelector("#form-produto");
  const painelMargem = dialog.querySelector("#margem-resumo");
  const atualizarMargem = () => {
    painelMargem.innerHTML = htmlResumoMargem(calcularMargem({
      preco: formProduto.preco.value,
      quantidade: formProduto.quantidade.value,
      custo: formProduto.custo.value,
      gastos: formProduto.gastos.value,
      impostoPct: formProduto.impostoPct.value,
      taxaPct: formProduto.taxaPct.value
    }));
  };
  ["preco", "quantidade", "custo", "gastos", "impostoPct", "taxaPct"].forEach(nome => {
    formProduto.elements[nome].addEventListener("input", atualizarMargem);
  });
  atualizarMargem();

  const grid = dialog.querySelector("#galeria-grid");

  function renderizarGaleria() {
    grid.innerHTML = galeria.map((item, i) => {
      const { src, pos } = imgPos(item.previewUrl || item.url);
      return `
      <div class="galeria-item" draggable="true" data-id="${item.id}">
        <img src="${src}" style="object-position:${pos}" alt="">
        <button type="button" class="galeria-item__ajustar" data-ajustar="${item.id}" aria-label="Ajustar posição da imagem" title="Ajustar enquadramento">⤡</button>
        <button type="button" class="galeria-item__remover" data-remover="${item.id}" aria-label="Remover imagem">${icon("close")}</button>
        ${i === 0 ? `<span class="galeria-item__principal">Principal</span>` : ""}
      </div>`;
    }).join("");

    grid.querySelectorAll("[data-ajustar]").forEach(btn => {
      btn.addEventListener("click", () => {
        const item = galeria.find(g => g.id === btn.dataset.ajustar);
        if (!item) return;
        abrirAjusteEnquadramento(item.previewUrl || item.url, (novaUrl) => {
          if (item.previewUrl) item.previewUrl = novaUrl; else item.url = novaUrl;
          renderizarGaleria();
        });
      });
    });

    grid.querySelectorAll("[data-remover]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const ok = await confirmarAcao("Remover esta imagem da galeria do produto?", { titulo: "Remover imagem" });
        if (!ok) return;
        const item = galeria.find(g => g.id === btn.dataset.remover);
        if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
        galeria = galeria.filter(g => g.id !== btn.dataset.remover);
        renderizarGaleria();
      });
    });

    grid.querySelectorAll(".galeria-item").forEach(el => {
      el.addEventListener("dragstart", () => { arrastando = el.dataset.id; el.classList.add("is-dragging"); });
      el.addEventListener("dragend", () => el.classList.remove("is-dragging"));
      el.addEventListener("dragover", (e) => e.preventDefault());
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!arrastando || arrastando === el.dataset.id) return;
        const de = galeria.findIndex(g => g.id === arrastando);
        const ate = galeria.findIndex(g => g.id === el.dataset.id);
        const [movido] = galeria.splice(de, 1);
        galeria.splice(ate, 0, movido);
        renderizarGaleria();
      });
    });
  }
  renderizarGaleria();

  const galeriaWrap = dialog.querySelector("#galeria-produto-wrap");
  function atualizarVisibilidadeGaleriaGeral() {
    // Fotos gerais e fotos por cor podem coexistir. Esconder a galeria quando
    // havia cores fazia as fotos escolhidas pelo administrador serem perdidas
    // no salvamento do produto.
    galeriaWrap.hidden = false;
  }

  const coresLista = dialog.querySelector("#cores-lista");
  const inputCorNome = dialog.querySelector("#input-cor-nome");
  const inputCorHex = dialog.querySelector("#input-cor-hex");

  function renderizarImagensCor(c) {
    const grid = coresLista.querySelector(`[data-cor-imagens="${c.id}"]`);
    if (!grid) return;
    grid.innerHTML = `
      <label class="cor-row__upload">
        ${icon("plus")}Escolher arquivos
        <input type="file" accept="image/*" multiple hidden data-foto-input="${c.id}">
      </label>
      ${c.imagens.map((img, i) => {
        const { src, pos } = imgPos(img.previewUrl || img.url);
        return `
      <div class="galeria-item galeria-item--mini" draggable="true" data-img-id="${img.id}">
        <img src="${src}" style="object-position:${pos}" alt="">
        <button type="button" class="galeria-item__ajustar" data-ajustar-img-cor="${c.id}:${img.id}" aria-label="Ajustar posição da imagem" title="Ajustar enquadramento">⤡</button>
        <button type="button" class="galeria-item__remover" data-remover-img-cor="${c.id}:${img.id}" aria-label="Remover imagem">${icon("close")}</button>
        ${i === 0 ? `<span class="galeria-item__principal">Capa</span>` : ""}
      </div>`;
      }).join("")}`;

    grid.querySelectorAll("[data-ajustar-img-cor]").forEach(btn => {
      btn.addEventListener("click", () => {
        const [corId, imgId] = btn.dataset.ajustarImgCor.split(":");
        const cor = cores.find(cc => cc.id === corId);
        const img = cor?.imagens.find(ii => ii.id === imgId);
        if (!img) return;
        abrirAjusteEnquadramento(img.previewUrl || img.url, (novaUrl) => {
          if (img.previewUrl) img.previewUrl = novaUrl; else img.url = novaUrl;
          renderizarImagensCor(cor);
        });
      });
    });

    grid.querySelector("[data-foto-input]").addEventListener("change", (e) => {
      [...e.target.files].forEach(file => {
        c.imagens.push({ id: crypto.randomUUID(), url: null, file, previewUrl: URL.createObjectURL(file) });
      });
      e.target.value = "";
      renderizarImagensCor(c);
    });

    grid.querySelectorAll("[data-remover-img-cor]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const ok = await confirmarAcao("Remover esta imagem da cor?", { titulo: "Remover imagem" });
        if (!ok) return;
        const [, imgId] = btn.dataset.removerImgCor.split(":");
        const img = c.imagens.find(i => i.id === imgId);
        if (img?.previewUrl) URL.revokeObjectURL(img.previewUrl);
        c.imagens = c.imagens.filter(i => i.id !== imgId);
        renderizarImagensCor(c);
      });
    });

    let arrastandoImg = null;
    grid.querySelectorAll(".galeria-item--mini").forEach(el => {
      el.addEventListener("dragstart", () => { arrastandoImg = el.dataset.imgId; el.classList.add("is-dragging"); });
      el.addEventListener("dragend", () => el.classList.remove("is-dragging"));
      el.addEventListener("dragover", (e) => e.preventDefault());
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!arrastandoImg || arrastandoImg === el.dataset.imgId) return;
        const de = c.imagens.findIndex(i => i.id === arrastandoImg);
        const ate = c.imagens.findIndex(i => i.id === el.dataset.imgId);
        const [movido] = c.imagens.splice(de, 1);
        c.imagens.splice(ate, 0, movido);
        renderizarImagensCor(c);
      });
    });
  }

  function renderizarCores() {
    coresLista.innerHTML = cores.map(c => `
      <div class="cor-row" data-id="${c.id}">
        <div class="cor-row__topo">
          <input type="radio" name="cor-padrao" class="cor-row__radio" data-padrao="${c.id}" ${c.padrao ? "checked" : ""} title="Usar como cor padrão do produto">
          <span class="cor-row__bolinha" style="background:${escHtml(c.hex)}"></span>
          <button type="button" class="cor-chip__remover" data-remover-cor="${c.id}" aria-label="Remover cor">${icon("close")}</button>
        </div>
        <label class="cor-row__campo">Nome da cor
          <input type="text" class="cor-row__nome" data-editar-nome="${c.id}" value="${escHtml(c.nome)}" placeholder="Nome da cor">
        </label>
        <label class="cor-row__campo">Código HEX
          <div class="cor-row__hex-wrap">
            <input type="text" class="cor-row__hex-texto" data-editar-hex-texto="${c.id}" value="${escHtml(c.hex).toUpperCase()}" placeholder="#RRGGBB">
            <input type="color" class="cor-row__hex" data-editar-hex="${c.id}" value="${c.hex}">
          </div>
        </label>
        <div class="cor-row__galeria">
          <span class="cor-row__galeria-label">Galeria da cor</span>
          <div class="cor-row__galeria-grid" data-cor-imagens="${c.id}"></div>
        </div>
      </div>`).join("") || `<em style="font-size:0.85rem;color:var(--cinza-500)">Nenhuma cor cadastrada.</em>`;

    cores.forEach(c => renderizarImagensCor(c));

    coresLista.querySelectorAll("[data-padrao]").forEach(radio => {
      radio.addEventListener("change", () => {
        cores.forEach(c => { c.padrao = c.id === radio.dataset.padrao; });
      });
    });
    coresLista.querySelectorAll("[data-editar-nome]").forEach(inp => {
      inp.addEventListener("input", () => {
        const c = cores.find(x => x.id === inp.dataset.editarNome);
        if (c) c.nome = inp.value;
      });
    });
    coresLista.querySelectorAll("[data-editar-hex]").forEach(inp => {
      inp.addEventListener("input", () => {
        const c = cores.find(x => x.id === inp.dataset.editarHex);
        if (c) c.hex = inp.value;
        const linha = inp.closest(".cor-row");
        linha.querySelector(".cor-row__bolinha").style.background = inp.value;
        const texto = linha.querySelector("[data-editar-hex-texto]");
        if (texto) texto.value = inp.value.toUpperCase();
      });
    });
    coresLista.querySelectorAll("[data-editar-hex-texto]").forEach(inp => {
      inp.addEventListener("input", () => {
        const valor = inp.value.trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(valor)) return;
        const c = cores.find(x => x.id === inp.dataset.editarHexTexto);
        if (c) c.hex = valor;
        const linha = inp.closest(".cor-row");
        linha.querySelector(".cor-row__bolinha").style.background = valor;
        const picker = linha.querySelector("[data-editar-hex]");
        if (picker) picker.value = valor;
      });
    });
    coresLista.querySelectorAll("[data-remover-cor]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const ok = await confirmarAcao("Remover esta cor do produto?", { titulo: "Remover cor" });
        if (!ok) return;
        const c = cores.find(x => x.id === btn.dataset.removerCor);
        const eraPadrao = c?.padrao;
        c?.imagens.forEach(img => { if (img.previewUrl) URL.revokeObjectURL(img.previewUrl); });
        cores = cores.filter(c => c.id !== btn.dataset.removerCor);
        if (eraPadrao && cores.length) cores[0].padrao = true;
        renderizarCores();
        atualizarVisibilidadeGaleriaGeral();
      });
    });
  }
  renderizarCores();
  atualizarVisibilidadeGaleriaGeral();

  dialog.querySelector("#btn-add-cor").addEventListener("click", () => {
    const nome = inputCorNome.value.trim();
    if (!nome) { inputCorNome.focus(); return; }
    cores.push({ id: crypto.randomUUID(), nome, hex: inputCorHex.value || "#cccccc", padrao: cores.length === 0, imagens: [] });
    inputCorNome.value = "";
    inputCorHex.value = "#2e6cf6";
    renderizarCores();
    atualizarVisibilidadeGaleriaGeral();
  });

  dialog.querySelector("#input-galeria").addEventListener("change", (e) => {
    [...e.target.files].forEach(file => {
      galeria.push({ id: crypto.randomUUID(), url: null, file, previewUrl: URL.createObjectURL(file) });
    });
    e.target.value = "";
    renderizarGaleria();
  });

  dialog.querySelector("#form-produto").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const btnSalvar = form.querySelector('button[type="submit"]');
    const nomeProduto = (form.nome.value.trim() || "PRODUTO").toUpperCase();

    // Uma falha de rede, de imagem ou do banco não pode fechar o formulário
    // nem deixar o administrador sem ação para tentar novamente.
    btnSalvar.disabled = true;
    try {

    const pendentes = galeria.filter(g => g.file);
    if (pendentes.length) {
      btnSalvar.disabled = true;
      for (let i = 0; i < pendentes.length; i++) {
        btnSalvar.textContent = `Enviando imagem ${i + 1}/${pendentes.length}...`;
        const url = await enviarImagem(pendentes[i].file, `${nomeProduto}-${i + 1}`);
        if (!url) return;
        const posSalva = imgPos(pendentes[i].previewUrl || "").pos;
        pendentes[i].url = posSalva !== "50% 50%" ? `${url}#pos=${posSalva.replace(/%/g, "").replace(" ", ",")}` : url;
        if (pendentes[i].previewUrl) URL.revokeObjectURL(pendentes[i].previewUrl);
      }
    }

    const imagensPendentesCores = cores.flatMap(c => c.imagens.filter(img => img.file).map(img => ({ img, corNome: c.nome })));
    if (imagensPendentesCores.length) {
      btnSalvar.disabled = true;
      for (let i = 0; i < imagensPendentesCores.length; i++) {
        const { img, corNome } = imagensPendentesCores[i];
        btnSalvar.textContent = `Enviando foto ${i + 1}/${imagensPendentesCores.length}...`;
        const url = await enviarImagem(img.file, `${nomeProduto}-${corNome || "cor"}-${i + 1}`);
        if (!url) return;
        const posSalva = imgPos(img.previewUrl || "").pos;
        img.url = posSalva !== "50% 50%" ? `${url}#pos=${posSalva.replace(/%/g, "").replace(" ", ",")}` : url;
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
      }
    }

    const dados = {
      nome: nomeProduto,
      marca: form.marca.value.trim(),
      preco: parseFloat(form.preco.value),
      quantidade: parseInt(form.quantidade.value, 10),
      categoria: form.categoria.value,
      status: form.status.value,
      codigo: form.codigo.value.trim(),
      descricao: form.descricao.value.trim(),
      destaques: form.destaques.value.split("\n").map(l => l.trim()).filter(Boolean),
      etiquetas: [...form.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value),
      imagens: galeria.map(g => g.url).filter(Boolean),
      cores: cores.map(c => {
        const urls = c.imagens.map(img => img.url).filter(Boolean);
        return { nome: c.nome.trim(), hex: c.hex, padrao: !!c.padrao, imagens: urls, imagem: urls[0] || "" };
      }).filter(c => c.nome)
    };
    const corPadrao = dados.cores.find(c => c.padrao) || dados.cores[0];
    dados.imagem = dados.imagens[0] || corPadrao?.imagem || "";

    dados.visivelSemFoto = form.visivelSemFoto.checked;
    // No cadastro, um item sem foto começa oculto por segurança. Na edição,
    // porém, o status escolhido pelo administrador precisa ser respeitado.
    if (!produto && !dados.imagem && !dados.visivelSemFoto) {
      dados.status = "oculto";
    }

    let idSalvo;
    if (produto) {
      await atualizarProduto(produto.id, dados);
      idSalvo = produto.id;
      toast("Produto atualizado.");
    } else {
      const ref = await criarProduto(dados);
      idSalvo = ref?.id;
      toast("Produto cadastrado.");
    }

    // Custos vão para a coleção só do admin. O produto já está salvo; se isto
    // falhar, avisamos sem desfazer o produto.
    try {
      const novos = {
        custo: form.custo.value, gastos: form.gastos.value,
        impostoPct: form.impostoPct.value, taxaPct: form.taxaPct.value
      };
      const n = (v) => Number(v) > 0 ? Math.round(Number(v) * 100) / 100 : 0;
      const preenchido = Object.values(novos).some(v => n(v) > 0);
      const igualAoAtual = ["custo", "gastos", "impostoPct", "taxaPct"]
        .every(c => n(novos[c]) === n(custosAtuais?.[c]));
      // Não grava quando nada mudou, nem quando não deu para ler os custos
      // existentes e o campo está vazio (evita apagar sem querer).
      const deveGravar = idSalvo && !igualAoAtual && (custosCarregados || preenchido);
      if (deveGravar) {
        const salvo = await salvarCustoProduto(idSalvo, novos);
        cacheCustos.set(idSalvo, salvo);
      }
    } catch (erroCusto) {
      console.error("Erro ao salvar custos do produto:", erroCusto);
      toast("Produto salvo, mas não foi possível salvar os custos. Confira se as regras do Firestore foram publicadas.", "error");
    }
    dialog.close();
    // Edição que não muda a posição do item na lista: atualiza a linha na tela
    // (0 leituras). Cadastro novo e mudanças de ordenação releem a lista.
    if (!(produto && atualizarProdutoNaTela(container, produto, dados))) carregarAbaProdutos(container);
    } catch (erro) {
      console.error("Erro ao salvar produto:", erro);
      toast(erro?.message || "Não foi possível salvar o produto. Confira os dados e tente novamente.", "error");
    } finally {
      // Se o modal foi fechado após salvar, não há nada para reativar. Caso
      // contrário, o conteúdo digitado continua intacto para nova tentativa.
      if (dialog.open) {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar";
      }
    }
  });
}

// ---------- CATEGORIAS ----------
async function carregarAbaCategorias(container, pagina = 0) {
  if (!container) return;
  const resultado = await listarCategoriasPagina({ tamanho: 30, cursor: estadoCategorias.cursores[pagina] });
  cacheCategorias = resultado.itens;
  estadoCategorias.pagina = pagina;
  estadoCategorias.temMais = resultado.temMais;
  if (resultado.temMais) estadoCategorias.cursores[pagina + 1] = resultado.cursor;

  container.innerHTML = `
    <div class="admin-panel-head">
      <h1>Categorias</h1>
      <p>Cadastre as categorias da loja, com nome e imagem.</p>
    </div>
    <div class="admin-toolbar">
      <button class="btn-secondary" id="btn-importar-json-categorias">${icon("upload")}Importar JSON</button>
      <input type="file" id="input-importar-json-categorias" accept="application/json,.json" hidden>
      <button class="btn-primary" id="btn-nova-categoria">${icon("plus")}Nova categoria</button>
    </div>
    <ul class="chip-list chip-list--marcas">
      ${cacheCategorias.map(c => `
        <li data-id="${c.id}">
          <img class="thumb" src="${imgPos(c.imagem).src || "/assets/images/placeholder.svg"}" style="object-position:${imgPos(c.imagem).pos}" alt="${escHtml(c.nome)}">
          <span class="chip-list__nome">${escHtml(c.nome)}</span>
          <button data-action="editar" title="Editar">${icon("pencil")}</button>
          <button data-action="excluir" title="Remover">${icon("close")}</button>
        </li>`).join("") || `<li class="chip-list__empty">Nenhuma categoria cadastrada.</li>`}
    </ul>${htmlPaginacaoAdmin("categorias", estadoCategorias)}
    <dialog id="dialog-categoria" class="dialog-form"></dialog>
    <dialog id="dialog-importar-json-categorias" class="dialog-form">
      <h2>Resultado da importação</h2>
      <div id="resultado-importacao-json-categorias" class="import-result"></div>
      <div class="form-actions">
        <button type="button" class="btn-primary" id="btn-fechar-importacao-categorias">Fechar</button>
      </div>
    </dialog>`;

  container.querySelector("#btn-nova-categoria").addEventListener("click", () => abrirFormularioCategoria(container));

  const inputJsonCategorias = container.querySelector("#input-importar-json-categorias");
  container.querySelector("#btn-importar-json-categorias").addEventListener("click", () => inputJsonCategorias.click());
  inputJsonCategorias.addEventListener("change", async () => {
    const arquivo = inputJsonCategorias.files?.[0];
    inputJsonCategorias.value = "";
    if (!arquivo) return;
    await importarCategoriasJson(container, arquivo);
  });

  container.querySelectorAll(".chip-list--marcas li[data-id]").forEach(li => {
    const id = li.dataset.id;
    const categoria = cacheCategorias.find(c => c.id === id);
    li.querySelector('[data-action="editar"]')?.addEventListener("click", () => abrirFormularioCategoria(container, categoria));
    li.querySelector('[data-action="excluir"]')?.addEventListener("click", async () => {
      const ok = await confirmarAcao(`Remover a categoria "${categoria.nome}"? Esta ação não pode ser desfeita.`, {
        titulo: "Remover categoria",
        textoConfirmar: "Remover"
      });
      if (!ok) return;
      await excluirCategoria(id);
      toast("Categoria removida.");
      carregarAbaCategorias(container);
    });
  });
  ligarPaginacaoAdmin(container, "categorias", estadoCategorias, carregarAbaCategorias);
}

async function importarCategoriasJson(container, arquivo) {
  const dialog = container.querySelector("#dialog-importar-json-categorias");
  const resultado = container.querySelector("#resultado-importacao-json-categorias");

  let itens;
  try {
    const texto = await arquivo.text();
    const json = JSON.parse(texto);
    itens = Array.isArray(json) ? json : (Array.isArray(json.categorias) ? json.categorias : null);
    if (!itens) throw new Error("formato");
  } catch {
    toast("Arquivo JSON inválido. Envie uma lista de categorias (array) ou { \"categorias\": [...] }.", "error");
    return;
  }

  if (!itens.length) {
    toast("O arquivo não tem nenhuma categoria.", "error");
    return;
  }

  const nomesExistentes = cacheCategorias.map(c => c.nome.toLowerCase());
  const validos = [];
  const invalidos = [];

  itens.forEach((item, i) => {
    const nome = String(item?.nome || "").trim();
    if (!nome) {
      invalidos.push({ linha: i + 1, nome: "(sem nome)", erros: ["nome ausente"] });
      return;
    }
    if (nomesExistentes.includes(nome.toLowerCase())) {
      invalidos.push({ linha: i + 1, nome, erros: ["categoria já existe"] });
      return;
    }
    nomesExistentes.push(nome.toLowerCase());
    validos.push({ nome, imagem: String(item?.imagem || "").trim() });
  });

  for (const dados of validos) {
    await criarCategoria(dados.nome, "", dados.imagem);
  }

  resultado.innerHTML = `
    <p><strong>${validos.length}</strong> categoria(s) importada(s) com sucesso.</p>
    ${invalidos.length ? `
      <p><strong>${invalidos.length}</strong> ignorada(s):</p>
      <ul class="import-result__errors">
        ${invalidos.map(e => `<li>#${e.linha} "${escHtml(e.nome)}": ${escHtml(e.erros.join(", "))}</li>`).join("")}
      </ul>` : ""}`;

  dialog.querySelector("#btn-fechar-importacao-categorias").onclick = () => { dialog.close(); carregarAbaCategorias(container); };

  dialog.showModal();
  if (validos.length) toast(`${validos.length} categoria(s) importada(s).`);
}

async function abrirFormularioCategoria(container, categoria = null) {
  const dialog = container.querySelector("#dialog-categoria");
  dialog.innerHTML = `
    <form id="form-categoria" class="product-form">
      <h3>${categoria ? "Editar categoria" : "Nova categoria"}</h3>
      <div class="form-grid">
        <label>Nome<input name="nome" required autocomplete="off" value="${escHtml(categoria?.nome || "")}"></label>
        <label>Imagem<input name="imagem" type="file" accept="image/*"></label>
      </div>
      ${categoria?.imagem ? `
        <div class="logo-atual" id="imagem-atual-wrap">
          <img class="thumb" id="imagem-categoria-preview" src="${imgPos(categoria.imagem).src}" style="object-position:${imgPos(categoria.imagem).pos}" alt="">
          <button type="button" id="btn-ajustar-imagem" class="btn-secondary" title="Ajustar enquadramento">⤡ Ajustar posição</button>
          <button type="button" id="btn-remover-imagem" class="btn-remover-logo" title="Apagar imagem">${icon("close")} Apagar imagem</button>
        </div>` : ""}
      <div class="form-actions">
        <button type="button" data-modal-close-dialog>Cancelar</button>
        <button type="submit" class="btn-primary">Salvar</button>
      </div>
    </form>`;

  dialog.showModal();
  dialog.querySelector("[data-modal-close-dialog]").addEventListener("click", () => dialog.close());

  let imagemRemovida = false;
  let imagemAtualUrl = categoria?.imagem || "";
  dialog.querySelector("#btn-remover-imagem")?.addEventListener("click", () => {
    imagemRemovida = true;
    dialog.querySelector("#imagem-atual-wrap").remove();
    toast("Imagem removida. Salve para confirmar.");
  });
  dialog.querySelector("#btn-ajustar-imagem")?.addEventListener("click", () => {
    abrirAjusteEnquadramento(imagemAtualUrl, (novaUrl) => {
      imagemAtualUrl = novaUrl;
      const preview = dialog.querySelector("#imagem-categoria-preview");
      const { src, pos } = imgPos(novaUrl);
      preview.src = src;
      preview.style.objectPosition = pos;
    });
  });

  dialog.querySelector("#form-categoria").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const btnSalvar = form.querySelector('button[type="submit"]');
    const dados = { nome: form.nome.value.trim() };

    const arquivoImagem = form.imagem.files[0];
    if (arquivoImagem) {
      btnSalvar.disabled = true;
      btnSalvar.textContent = "Enviando imagem...";
      const novaImagem = await enviarImagemComoPNG(arquivoImagem, dados.nome || "categoria");
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar";
      if (!novaImagem) return;
      dados.imagem = novaImagem;
    } else if (imagemRemovida) {
      dados.imagem = "";
    } else if (categoria?.imagem) {
      dados.imagem = imagemAtualUrl;
    }

    if (categoria) {
      await atualizarCategoria(categoria.id, dados);
      toast("Categoria atualizada.");
    } else {
      await criarCategoria(dados.nome, "", dados.imagem);
      toast("Categoria cadastrada.");
    }
    dialog.close();
    carregarAbaCategorias(container);
  });
}

// ---------- MARCAS ----------
let cacheMarcas = [];

async function carregarAbaMarcas(container, pagina = 0) {
  if (!container) return;
  const resultado = await listarMarcasPagina({ tamanho: 30, cursor: estadoMarcas.cursores[pagina] });
  cacheMarcas = resultado.itens.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  estadoMarcas.pagina = pagina;
  estadoMarcas.temMais = resultado.temMais;
  if (resultado.temMais) estadoMarcas.cursores[pagina + 1] = resultado.cursor;

  container.innerHTML = `
    <div class="admin-panel-head">
      <h1>Marcas</h1>
      <p>Cadastre as marcas parceiras exibidas na loja, com nome e logo.</p>
    </div>
    <div class="admin-toolbar">
      <button class="btn-secondary" id="btn-importar-json-marcas">${icon("upload")}Importar JSON</button>
      <input type="file" id="input-importar-json-marcas" accept="application/json,.json" hidden>
      <button class="btn-primary" id="btn-nova-marca">${icon("plus")}Nova marca</button>
    </div>
    <ul class="chip-list chip-list--marcas">
      ${cacheMarcas.map(m => `
        <li data-id="${m.id}">
          <img class="thumb" src="${m.logo || "/assets/images/placeholder.svg"}" alt="${escHtml(m.nome)}">
          <span class="chip-list__nome">${escHtml(m.nome)}</span>
          <label class="chip-list__visivel" title="Exibir a logo dessa marca na faixa de marcas parceiras do site">
            <input type="checkbox" data-toggle-visivel="${m.id}" ${m.visivel ? "checked" : ""}> Exibir no site
          </label>
          <button data-action="editar" title="Editar">${icon("pencil")}</button>
          <button data-action="excluir" title="Remover">${icon("close")}</button>
        </li>`).join("") || `<li class="chip-list__empty">Nenhuma marca cadastrada.</li>`}
    </ul>${htmlPaginacaoAdmin("marcas", estadoMarcas)}
    <dialog id="dialog-marca" class="dialog-form"></dialog>
    <dialog id="dialog-importar-json-marcas" class="dialog-form">
      <h2>Resultado da importação</h2>
      <div id="resultado-importacao-json-marcas" class="import-result"></div>
      <div class="form-actions">
        <button type="button" class="btn-primary" id="btn-fechar-importacao-marcas">Fechar</button>
      </div>
    </dialog>`;

  container.querySelector("#btn-nova-marca").addEventListener("click", () => abrirFormularioMarca(container));

  const inputJsonMarcas = container.querySelector("#input-importar-json-marcas");
  container.querySelector("#btn-importar-json-marcas").addEventListener("click", () => inputJsonMarcas.click());
  inputJsonMarcas.addEventListener("change", async () => {
    const arquivo = inputJsonMarcas.files?.[0];
    inputJsonMarcas.value = "";
    if (!arquivo) return;
    await importarMarcasJson(container, arquivo);
  });

  container.querySelectorAll("[data-toggle-visivel]").forEach(chk => {
    chk.addEventListener("change", async () => {
      await atualizarMarca(chk.dataset.toggleVisivel, { visivel: chk.checked });
      const m = cacheMarcas.find(x => x.id === chk.dataset.toggleVisivel);
      if (m) m.visivel = chk.checked;
      toast(chk.checked ? "Marca visível no site." : "Marca ocultada do site.");
    });
  });

  container.querySelectorAll(".chip-list--marcas li[data-id]").forEach(li => {
    const id = li.dataset.id;
    const marca = cacheMarcas.find(m => m.id === id);
    li.querySelector('[data-action="editar"]')?.addEventListener("click", () => abrirFormularioMarca(container, marca));
    li.querySelector('[data-action="excluir"]')?.addEventListener("click", async () => {
      const ok = await confirmarAcao(`Remover a marca "${marca.nome}"? Esta ação não pode ser desfeita.`, {
        titulo: "Remover marca",
        textoConfirmar: "Remover"
      });
      if (!ok) return;
      await excluirMarca(id);
      toast("Marca removida.");
      carregarAbaMarcas(container);
    });
  });
  ligarPaginacaoAdmin(container, "marcas", estadoMarcas, carregarAbaMarcas);
}

async function importarMarcasJson(container, arquivo) {
  const dialog = container.querySelector("#dialog-importar-json-marcas");
  const resultado = container.querySelector("#resultado-importacao-json-marcas");

  let itens;
  try {
    const texto = await arquivo.text();
    const json = JSON.parse(texto);
    itens = Array.isArray(json) ? json : (Array.isArray(json.marcas) ? json.marcas : null);
    if (!itens) throw new Error("formato");
  } catch {
    toast("Arquivo JSON inválido. Envie uma lista de marcas (array) ou { \"marcas\": [...] }.", "error");
    return;
  }

  if (!itens.length) {
    toast("O arquivo não tem nenhuma marca.", "error");
    return;
  }

  const nomesExistentes = cacheMarcas.map(m => m.nome.toLowerCase());
  const validos = [];
  const invalidos = [];

  itens.forEach((item, i) => {
    const nome = String(item?.nome || "").trim();
    if (!nome) {
      invalidos.push({ linha: i + 1, nome: "(sem nome)", erros: ["nome ausente"] });
      return;
    }
    if (nomesExistentes.includes(nome.toLowerCase())) {
      invalidos.push({ linha: i + 1, nome, erros: ["marca já existe"] });
      return;
    }
    nomesExistentes.push(nome.toLowerCase());
    validos.push({ nome, logo: String(item?.logo || "").trim(), visivel: item?.visivel !== false });
  });

  for (const dados of validos) {
    await criarMarca(dados);
  }

  resultado.innerHTML = `
    <p><strong>${validos.length}</strong> marca(s) importada(s) com sucesso.</p>
    ${invalidos.length ? `
      <p><strong>${invalidos.length}</strong> ignorada(s):</p>
      <ul class="import-result__errors">
        ${invalidos.map(e => `<li>#${e.linha} "${escHtml(e.nome)}": ${escHtml(e.erros.join(", "))}</li>`).join("")}
      </ul>` : ""}`;

  dialog.querySelector("#btn-fechar-importacao-marcas").onclick = () => { dialog.close(); carregarAbaMarcas(container); };

  dialog.showModal();
  if (validos.length) toast(`${validos.length} marca(s) importada(s).`);
}

async function abrirFormularioMarca(container, marca = null) {
  const dialog = container.querySelector("#dialog-marca");
  dialog.innerHTML = `
    <form id="form-marca" class="product-form">
      <h3>${marca ? "Editar marca" : "Nova marca"}</h3>
      <div class="form-grid">
        <label>Nome<input name="nome" required autocomplete="off" value="${escHtml(marca?.nome || "")}"></label>
        <label>Logo (imagem)<input name="logo" type="file" accept="image/*"></label>
      </div>
      ${marca?.logo ? `
        <div class="logo-atual" id="logo-atual-wrap">
          <img class="thumb" src="${marca.logo}" alt="">
          <button type="button" id="btn-remover-logo" class="btn-remover-logo" title="Apagar imagem">${icon("close")} Apagar imagem</button>
        </div>` : ""}
      <div class="form-actions">
        <button type="button" data-modal-close-dialog>Cancelar</button>
        <button type="submit" class="btn-primary">Salvar</button>
      </div>
    </form>`;

  dialog.showModal();
  dialog.querySelector("[data-modal-close-dialog]").addEventListener("click", () => dialog.close());

  let logoRemovida = false;
  dialog.querySelector("#btn-remover-logo")?.addEventListener("click", () => {
    logoRemovida = true;
    dialog.querySelector("#logo-atual-wrap").remove();
    toast("Imagem removida. Salve para confirmar.");
  });

  dialog.querySelector("#form-marca").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const btnSalvar = form.querySelector('button[type="submit"]');
    const dados = { nome: form.nome.value.trim(), visivel: marca ? marca.visivel !== false : true };

    const arquivoLogo = form.logo.files[0];
    if (arquivoLogo) {
      btnSalvar.disabled = true;
      btnSalvar.textContent = "Enviando imagem...";
      const novaLogo = await enviarImagemComoPNG(arquivoLogo, dados.nome || "marca");
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar";
      if (!novaLogo) return;
      dados.logo = novaLogo;
    } else if (logoRemovida) {
      dados.logo = "";
    } else if (marca?.logo) {
      dados.logo = marca.logo;
    }

    if (marca) {
      await atualizarMarca(marca.id, dados);
      toast("Marca atualizada.");
    } else {
      await criarMarca(dados);
      toast("Marca cadastrada.");
    }
    dialog.close();
    carregarAbaMarcas(container);
  });
}

// ---------- CLIENTES ----------
let cacheClientes = [];

async function carregarAbaClientes(container, pagina = 0) {
  if (!container) return;
  const resultado = await listarClientesPagina({ tamanho: 30, cursor: estadoClientes.cursores[pagina] });
  cacheClientes = resultado.itens;
  estadoClientes.pagina = pagina;
  estadoClientes.temMais = resultado.temMais;
  if (resultado.temMais) estadoClientes.cursores[pagina + 1] = resultado.cursor;

  container.innerHTML = `
    <div class="admin-panel-head">
      <h1>Clientes</h1>
      <p>Cadastre clientes Pessoa Física e Empresas (PJ).</p>
    </div>
    <div class="admin-toolbar">
      <div class="input-icon">
        ${icon("search")}
        <input type="text" id="busca-admin-clientes" placeholder="Pesquisar clientes..." autocomplete="off">
      </div>
      <button class="btn-primary" id="btn-novo-cliente">${icon("plus")}Novo cliente</button>
    </div>
    <div class="table-wrap"><table class="admin-table" id="tabela-clientes">
      <thead><tr><th></th><th>Nome</th><th>Tipo</th><th>Telefone</th><th>WhatsApp</th><th>Ações</th></tr></thead>
      <tbody></tbody>
    </table></div>
    <p class="table-count" id="contagem-clientes"></p>
    ${htmlPaginacaoAdmin("clientes", estadoClientes)}
    <dialog id="dialog-cliente" class="dialog-form"></dialog>`;

  renderizarTabelaClientes(container, cacheClientes);

  container.querySelector("#busca-admin-clientes").addEventListener("input", (e) => {
    const termo = e.target.value.toLowerCase();
    const filtrados = cacheClientes.filter(c => nomeCliente(c).toLowerCase().includes(termo));
    renderizarTabelaClientes(container, filtrados);
  });

  container.querySelector("#btn-novo-cliente").addEventListener("click", () => abrirFormularioCliente(container));
  ligarPaginacaoAdmin(container, "clientes", estadoClientes, carregarAbaClientes);
}

function nomeCliente(c) {
  return c.tipo === "pj" ? (c.nomeFantasia || c.razaoSocial || "") : (c.nome || "");
}

function renderizarTabelaClientes(container, clientes) {
  const tbody = container.querySelector("#tabela-clientes tbody");
  const contagem = container.querySelector("#contagem-clientes");
  if (contagem) contagem.textContent = `Mostrando ${clientes.length} de ${cacheClientes.length} clientes nesta página`;

  tbody.innerHTML = clientes.map(c => `
    <tr data-id="${c.id}">
      <td>${icon(c.tipo === "pj" ? "briefcase" : "user")}</td>
      <td>${escHtml(nomeCliente(c))}</td>
      <td><span class="status-pill">${c.tipo === "pj" ? "Empresa" : "Pessoa física"}</span></td>
      <td>${escHtml(c.telefone || "-")}</td>
      <td>${escHtml(c.whatsapp || "-")}</td>
      <td class="row-actions">
        <button data-action="editar" title="Editar">${icon("pencil")}</button>
        <button data-action="excluir" title="Excluir">${icon("trash")}</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="6">
      <div class="empty-state">
        ${icon("gridEmpty", "empty-state__icon")}
        <strong>Nenhum cliente cadastrado</strong>
        <p>Comece adicionando seu primeiro cliente.</p>
        <button type="button" class="btn-secondary" id="btn-primeiro-cliente">${icon("plus")}Adicionar primeiro cliente</button>
      </div>
    </td></tr>`;

  tbody.querySelector("#btn-primeiro-cliente")?.addEventListener("click", () => abrirFormularioCliente(container));

  tbody.querySelectorAll("tr").forEach(tr => {
    const id = tr.dataset.id;
    const cliente = clientes.find(c => c.id === id);
    tr.querySelector('[data-action="editar"]')?.addEventListener("click", () => abrirFormularioCliente(container, cliente));
    tr.querySelector('[data-action="excluir"]')?.addEventListener("click", async () => {
      const ok = await confirmarAcao(`Excluir "${nomeCliente(cliente)}"? Esta ação não pode ser desfeita.`, {
        titulo: "Excluir cliente",
        textoConfirmar: "Excluir"
      });
      if (!ok) return;
      await excluirCliente(id);
      toast("Cliente excluído.");
      carregarAbaClientes(container);
    });
  });
}

function camposPF(c) {
  return `
    <div class="form-grid">
      <label>Nome completo *<input name="nome" required autocomplete="off" value="${escHtml(c?.nome || "")}"></label>
      <label>Telefone *<input name="telefone" required autocomplete="off" value="${escHtml(c?.telefone || "")}"></label>
      <label>WhatsApp *<input name="whatsapp" required autocomplete="off" value="${escHtml(c?.whatsapp || "")}"></label>
      <label>CPF<input name="cpf" autocomplete="off" value="${escHtml(c?.cpf || "")}"></label>
      <label>RG<input name="rg" autocomplete="off" value="${escHtml(c?.rg || "")}"></label>
      <label>Data de nascimento<input name="nascimento" type="date" value="${escHtml(c?.nascimento || "")}"></label>
      <label>E-mail<input name="email" type="email" autocomplete="off" value="${escHtml(c?.email || "")}"></label>
      <label>Endereço completo<input name="endereco" autocomplete="off" value="${escHtml(c?.endereco || "")}"></label>
    </div>
    <label>Observações<textarea name="observacoes" rows="3">${escHtml(c?.observacoes || "")}</textarea></label>`;
}

function camposPJ(c) {
  return `
    <div class="form-grid">
      <label>Razão social *<input name="razaoSocial" required autocomplete="off" value="${escHtml(c?.razaoSocial || "")}"></label>
      <label>Nome fantasia *<input name="nomeFantasia" required autocomplete="off" value="${escHtml(c?.nomeFantasia || "")}"></label>
      <label>CNPJ *<input name="cnpj" required autocomplete="off" value="${escHtml(c?.cnpj || "")}"></label>
      <label>Responsável pela empresa *<input name="responsavel" required autocomplete="off" value="${escHtml(c?.responsavel || "")}"></label>
      <label>Telefone *<input name="telefone" required autocomplete="off" value="${escHtml(c?.telefone || "")}"></label>
      <label>WhatsApp *<input name="whatsapp" required autocomplete="off" value="${escHtml(c?.whatsapp || "")}"></label>
      <label>E-mail *<input name="email" type="email" required autocomplete="off" value="${escHtml(c?.email || "")}"></label>
      <label>Endereço completo *<input name="endereco" required autocomplete="off" value="${escHtml(c?.endereco || "")}"></label>
      <label>Inscrição estadual<input name="inscricaoEstadual" autocomplete="off" value="${escHtml(c?.inscricaoEstadual || "")}"></label>
    </div>`;
}

async function abrirFormularioCliente(container, cliente = null) {
  const dialog = container.querySelector("#dialog-cliente");
  const tipoInicial = cliente?.tipo || "pf";

  dialog.innerHTML = `
    <form id="form-cliente" class="product-form">
      <h3>${cliente ? "Editar cliente" : "Novo cliente"}</h3>
      <label>Tipo de cliente *
        <select name="tipo" id="select-tipo-cliente" ${cliente ? "disabled" : ""}>
          <option value="pf" ${tipoInicial === "pf" ? "selected" : ""}>Pessoa Física (PF)</option>
          <option value="pj" ${tipoInicial === "pj" ? "selected" : ""}>Empresa (PJ)</option>
        </select>
      </label>
      <div id="campos-tipo-cliente">${tipoInicial === "pj" ? camposPJ(cliente) : camposPF(cliente)}</div>
      <div class="form-actions">
        <button type="button" data-modal-close-dialog>Cancelar</button>
        <button type="submit" class="btn-primary">Salvar</button>
      </div>
    </form>`;

  dialog.showModal();
  dialog.querySelector("[data-modal-close-dialog]").addEventListener("click", () => dialog.close());

  if (!cliente) {
    dialog.querySelector("#select-tipo-cliente").addEventListener("change", (e) => {
      dialog.querySelector("#campos-tipo-cliente").innerHTML = e.target.value === "pj" ? camposPJ() : camposPF();
    });
  }

  dialog.querySelector("#form-cliente").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const tipo = form.tipo.value;
    const dados = { tipo };

    const campos = tipo === "pj"
      ? ["razaoSocial", "nomeFantasia", "cnpj", "responsavel", "telefone", "whatsapp", "email", "endereco", "inscricaoEstadual"]
      : ["nome", "telefone", "whatsapp", "cpf", "rg", "nascimento", "email", "endereco", "observacoes"];

    campos.forEach(campo => {
      if (form[campo]) dados[campo] = form[campo].value.trim();
    });

    if (cliente) {
      await atualizarCliente(cliente.id, dados);
      toast("Cliente atualizado.");
    } else {
      await criarCliente(dados);
      toast("Cliente cadastrado.");
    }
    dialog.close();
    carregarAbaClientes(container);
  });
}

// ---------- ETIQUETAS ----------
async function carregarAbaEtiquetas(container, pagina = 0) {
  if (!container) return;
  const resultado = await listarEtiquetasPagina({ tamanho: 30, cursor: estadoEtiquetas.cursores[pagina] });
  const etiquetas = resultado.itens;
  estadoEtiquetas.pagina = pagina;
  estadoEtiquetas.temMais = resultado.temMais;
  if (resultado.temMais) estadoEtiquetas.cursores[pagina + 1] = resultado.cursor;
  container.innerHTML = `
    <div class="admin-panel-head">
      <h1>Etiquetas</h1>
      <p>Destaque produtos com etiquetas personalizadas.</p>
    </div>
    <form id="form-etiqueta" class="inline-form">
      <input name="nome" placeholder="Nova etiqueta (ex: Promoção)" required autocomplete="off">
      <button type="submit" class="btn-primary">${icon("plus")}Adicionar</button>
    </form>
    <ul class="chip-list">
      ${etiquetas.map(e => `<li>${escHtml(e.nome)} <button data-id="${e.id}" title="Remover">${icon("close")}</button></li>`).join("") || `<li class="chip-list__empty">Nenhuma etiqueta cadastrada.</li>`}
    </ul>${htmlPaginacaoAdmin("etiquetas", estadoEtiquetas)}`;

  container.querySelector("#form-etiqueta").addEventListener("submit", async (e) => {
    e.preventDefault();
    await criarEtiqueta(e.target.nome.value.trim());
    carregarAbaEtiquetas(container);
  });
  container.querySelectorAll(".chip-list button").forEach(btn =>
    btn.addEventListener("click", async () => {
      const etiqueta = etiquetas.find(item => item.id === btn.dataset.id);
      const ok = await confirmarAcao(`Remover a etiqueta "${etiqueta?.nome || "selecionada"}"? Esta ação não pode ser desfeita.`, {
        titulo: "Remover etiqueta",
        textoConfirmar: "Remover"
      });
      if (!ok) return;
      await excluirEtiqueta(btn.dataset.id);
      toast("Etiqueta removida.");
      carregarAbaEtiquetas(container);
    })
  );
  ligarPaginacaoAdmin(container, "etiquetas", estadoEtiquetas, carregarAbaEtiquetas);
}

// ---------- ESTOQUE ----------
const ESTOQUE_POR_PAGINA = [12, 24, 30];
let estoqueState = { categoria: "", termo: "", porPagina: 12, cursor: null, cursoresAnteriores: [], produtosPagina: [], temMais: false, totalCarregado: 0 };

// Mostra o resultado do cron diário de estoque baixo (roda sozinho todo
// dia às 11h UTC — ver /api/cron-estoque-baixo.js). Só exibição, não
// tem escrita nenhuma aqui: os dados já vêm prontos do Firestore.
async function renderizarAlertaEstoqueBaixo(container) {
  if (!container) return;
  try {
    const alerta = await listarUltimoAlertaEstoque();
    if (!alerta || !alerta.total) {
      container.innerHTML = "";
      return;
    }

    const dataFormatada = alerta.criadoEm?.seconds
      ? new Date(alerta.criadoEm.seconds * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
      : "";

    const itens = (alerta.produtos || [])
      .slice(0, 12)
      .map(p => `<li><span>${escHtml(p.nome || "Produto sem nome")}</span><strong>${Number(p.quantidade) || 0} un.</strong></li>`)
      .join("");
    const restante = (alerta.produtos || []).length - 12;

    container.innerHTML = `
      <div class="alerta-estoque-baixo">
        <div class="alerta-estoque-baixo__head">
          ${icon("bell")}
          <div>
            <strong>${alerta.total} produto${alerta.total > 1 ? "s" : ""} com estoque baixo</strong>
            ${dataFormatada ? `<span class="alerta-estoque-baixo__data">Verificado em ${dataFormatada}</span>` : ""}
          </div>
        </div>
        <ul class="alerta-estoque-baixo__lista">${itens}</ul>
        ${restante > 0 ? `<span class="alerta-estoque-baixo__mais">+ ${restante} produto${restante > 1 ? "s" : ""}</span>` : ""}
      </div>`;
  } catch {
    // Se o alerta não carregar, a aba de Estoque continua funcionando normal.
    container.innerHTML = "";
  }
}

async function carregarAbaEstoque(container) {
  if (!container) return;
  const categorias = await listarCategorias();
  estoqueState = { categoria: "", termo: "", porPagina: 12, cursor: null, cursoresAnteriores: [], produtosPagina: [], temMais: false, totalCarregado: 0 };

  container.innerHTML = `
    <div class="admin-panel-head admin-panel-head--row">
      <div>
        <h1>Estoque</h1>
        <p>Ajuste rapidamente a quantidade de produtos em estoque.</p>
      </div>
      <div class="admin-panel-head__actions">
        <button class="btn-secondary" id="btn-exportar-estoque">${icon("download")}Exportar página</button>
        <button class="btn-secondary" id="btn-atualizar-estoque">${icon("refresh")}Atualizar</button>
      </div>
    </div>

    <div id="alerta-estoque-baixo"></div>

    <div class="estoque-filtros">
      <div class="input-icon input-icon--full">${icon("search")}<input type="text" id="busca-estoque" placeholder="Buscar produto (começa com...)" autocomplete="off"></div>
      <div class="select-icon">${icon("filter")}<select id="filtro-categoria-estoque">
        <option value="">Todas as categorias</option>
        ${categorias.map(c => `<option value="${escHtml(c.nome)}">${escHtml(c.nome)}</option>`).join("")}
      </select></div>
    </div>
    <p class="estoque-busca-nota" id="nota-busca-estoque" hidden>A busca traz produtos cujo nome <strong>começa</strong> com o termo digitado (não busca no meio do nome).</p>

    <div class="table-wrap"><table class="admin-table">
      <thead><tr><th>Produto</th><th>Qtd atual</th><th>Ajuste</th><th>Ações</th></tr></thead>
      <tbody id="tbody-estoque"></tbody>
    </table></div>

    <div class="estoque-paginacao">
      <span id="contagem-estoque"></span>
      <div class="estoque-paginacao__paginas" id="paginas-estoque"></div>
      <div class="select-icon select-icon--sm">
        <select id="por-pagina-estoque">
          ${ESTOQUE_POR_PAGINA.map(n => `<option value="${n}">${n} por página</option>`).join("")}
        </select>
      </div>
    </div>`;

  renderizarAlertaEstoqueBaixo(container.querySelector("#alerta-estoque-baixo"));

  let debounceBusca;
  container.querySelector("#busca-estoque").addEventListener("input", (e) => {
    clearTimeout(debounceBusca);
    debounceBusca = setTimeout(() => {
      estoqueState.termo = e.target.value.trim();
      container.querySelector("#nota-busca-estoque").hidden = !estoqueState.termo;
      resetarPaginacaoEstoque(container);
    }, 300);
  });

  container.querySelector("#filtro-categoria-estoque").addEventListener("change", (e) => {
    estoqueState.categoria = e.target.value;
    resetarPaginacaoEstoque(container);
  });

  container.querySelector("#por-pagina-estoque").addEventListener("change", (e) => {
    estoqueState.porPagina = Number(e.target.value);
    resetarPaginacaoEstoque(container);
  });

  container.querySelector("#btn-atualizar-estoque").addEventListener("click", () => resetarPaginacaoEstoque(container));
  container.querySelector("#btn-exportar-estoque").addEventListener("click", () => exportarEstoqueCsv(estoqueState.produtosPagina));

  await buscarPaginaEstoque(container);
}

function resetarPaginacaoEstoque(container) {
  estoqueState.cursor = null;
  estoqueState.cursoresAnteriores = [];
  buscarPaginaEstoque(container);
}

async function buscarPaginaEstoque(container) {
  const { categoria, termo, porPagina, cursor } = estoqueState;

  let resultado;
  try {
    if (termo) {
      // A busca por prefixo do Firestore não combina com orderBy de outro
      // campo nem com cursor de outra consulta — por isso, ao buscar por
      // nome, ignoramos paginação por cursor e o filtro de categoria (uma
      // limitação real do Firestore, não um bug).
      resultado = await buscarProdutosPorPrefixo(termo, { tamanho: porPagina });
    } else {
      resultado = await listarProdutosPagina({ tamanho: porPagina, cursor, categoria, apenasAtivos: false });
    }
  } catch (erro) {
    console.error("Falha ao buscar produtos para o estoque:", erro);
    const precisaIndice = erro?.message?.includes("requires an index");
    toast(
      precisaIndice
        ? "O índice do Firestore para esse filtro ainda está sendo criado. Aguarde alguns minutos e tente de novo."
        : "Não foi possível carregar os produtos. Tente novamente.",
      "error"
    );
    return;
  }

  estoqueState.produtosPagina = resultado.produtos;
  estoqueState.temMais = resultado.temMais;
  estoqueState.proximoCursor = resultado.cursor;

  renderizarTabelaEstoque(container);
}

function renderizarTabelaEstoque(container) {
  const { produtosPagina, cursoresAnteriores } = estoqueState;

  const tbody = container.querySelector("#tbody-estoque");
  tbody.innerHTML = produtosPagina.map(p => `
    <tr data-id="${p.id}">
      <td class="estoque-produto">
        <img class="thumb" src="${imgPos(p.imagem).src || "/assets/images/placeholder.svg"}" style="object-position:${imgPos(p.imagem).pos}" alt="">
        <span>${escHtml(p.nome)}</span>
      </td>
      <td class="qtd-atual">${p.quantidade ?? 0}</td>
      <td>
        <div class="ajuste-stepper">
          <button type="button" class="ajuste-stepper__btn" data-passo="-1" aria-label="Diminuir">${icon("minus")}</button>
          <input type="number" class="ajuste-input" value="0" inputmode="numeric">
          <button type="button" class="ajuste-stepper__btn" data-passo="1" aria-label="Aumentar">${icon("plus")}</button>
        </div>
      </td>
      <td><button class="btn-primary btn-ajustar">Aplicar</button></td>
    </tr>`).join("") || `<tr><td colspan="4">
      <div class="empty-state">
        ${icon("gridEmpty", "empty-state__icon")}
        <strong>Nenhum produto encontrado</strong>
        <p>Ajuste os filtros de busca ou categoria.</p>
      </div>
    </td></tr>`;

  tbody.querySelectorAll(".ajuste-stepper__btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = btn.parentElement.querySelector(".ajuste-input");
      input.value = (parseInt(input.value, 10) || 0) + Number(btn.dataset.passo);
    });
  });

  tbody.querySelectorAll(".btn-ajustar").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const delta = parseInt(tr.querySelector(".ajuste-input").value, 10);
      if (!delta) return;
      await ajustarEstoque(id, delta, delta > 0 ? "Entrada manual" : "Saída manual");
      toast("Estoque atualizado.");
      buscarPaginaEstoque(container);
    });
  });

  const contagem = container.querySelector("#contagem-estoque");
  if (contagem) {
    const pagina = cursoresAnteriores.length + 1;
    contagem.textContent = produtosPagina.length ? `Página ${pagina} · ${produtosPagina.length} produto(s)` : "Nenhum produto";
  }

  renderizarPaginacaoEstoque(container);
}

function renderizarPaginacaoEstoque(container) {
  const wrap = container.querySelector("#paginas-estoque");
  if (!wrap) return;
  const { cursoresAnteriores, temMais, termo } = estoqueState;
  const pagina = cursoresAnteriores.length + 1;

  wrap.innerHTML = `
    <button data-dir="anterior" ${cursoresAnteriores.length === 0 || termo ? "disabled" : ""} aria-label="Página anterior">${icon("chevronLeft")}</button>
    <span class="estoque-paginacao__atual">Página ${pagina}</span>
    <button data-dir="proxima" ${!temMais || termo ? "disabled" : ""} aria-label="Próxima página">${icon("chevronRight")}</button>`;

  wrap.querySelector('[data-dir="proxima"]').addEventListener("click", () => {
    estoqueState.cursoresAnteriores.push(estoqueState.cursor);
    estoqueState.cursor = estoqueState.proximoCursor;
    buscarPaginaEstoque(container);
  });
  wrap.querySelector('[data-dir="anterior"]').addEventListener("click", () => {
    estoqueState.cursor = estoqueState.cursoresAnteriores.pop() || null;
    buscarPaginaEstoque(container);
  });
}

function exportarEstoqueCsv(produtos) {
  if (!produtos.length) { toast("Nada para exportar.", "error"); return; }
  const linhas = [
    ["Produto", "Categoria", "Quantidade"],
    ...produtos.map(p => [p.nome, p.categoria || "-", p.quantidade ?? 0])
  ];
  const csv = linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `estoque-pagina-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- USUÁRIOS ----------
async function carregarAbaUsuarios(container, pagina = 0) {
  if (!container) return;
  const resultado = await listarUsuariosPagina({ tamanho: 30, cursor: estadoUsuarios.cursores[pagina] });
  const usuarios = resultado.itens;
  estadoUsuarios.pagina = pagina;
  estadoUsuarios.temMais = resultado.temMais;
  if (resultado.temMais) estadoUsuarios.cursores[pagina + 1] = resultado.cursor;
  container.innerHTML = `
    <div class="admin-panel-head">
      <h1>Usuários</h1>
      <p>Veja quem tem acesso à sua loja.</p>
    </div>
    <div class="table-wrap"><table class="admin-table">
      <thead><tr><th>Nome</th><th>E-mail</th><th>Cargos</th></tr></thead>
      <tbody>
        ${usuarios.map(u => `<tr><td>${escHtml(u.nome || "-")}</td><td>${escHtml(u.email || "-")}</td><td>${(u.cargos || []).join(", ")}</td></tr>`).join("") || "<tr><td colspan='3'>Nenhum usuário.</td></tr>"}
      </tbody>
    </table></div>${htmlPaginacaoAdmin("usuarios", estadoUsuarios)}`;
  ligarPaginacaoAdmin(container, "usuarios", estadoUsuarios, carregarAbaUsuarios);
}
