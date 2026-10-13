// js/modules/servicos-admin.js
// Aba "Serviços" do painel administrativo. Mesma lógica dos produtos: tabela,
// formulário completo com galeria de fotos (arrastar, reordenar, ajustar
// enquadramento), importação por JSON e prompt para IA — com a diferença de que
// aqui as categorias têm subcategorias (ex.: Estética > Facial).
import { escHtml, formatBRL, toast, confirmarAcao, imgPos, generateCode } from "../utils/utils.js";
import { icon } from "../utils/icons.js";
import {
  listarServicosAdmin, criarServico, atualizarServico, excluirServico, duplicarServico,
  criarCategoriaServico, atualizarCategoriaServico, excluirCategoriaServico,
  finalizarImportacaoServicos, montarArvoreCategorias, resolverNomesServicos,
  ordenarServicos, normalizarTexto
} from "../services/servicos.js";
import { comprimirParaBase64, bytesTotais, LIMITE_FOTOS_DOC_BYTES } from "../services/imagem-base64.js";

const MAX_FOTOS_SERVICO = 6;

let categorias = [];
let servicos = [];
const filtros = { termo: "", categoriaId: "", subId: "", todas: false, recolhida: false };

// helpers injetados pelo dashboard.js (evita import circular)
let ajuda = { abrirAjusteEnquadramento: null, enviarImagem: null };

const ESTILO = `
<style>
  .svc-admin__cats { border: 1px solid var(--cinza-100); border-radius: var(--raio-md); padding: 1rem 1.1rem; margin-bottom: 1.25rem; background: var(--branco); }
  .svc-admin__cats-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
  .svc-admin__cats-head h2 { margin: 0; font-size: 1rem; color: var(--azul-900); }
  .svc-admin__cats-head p { margin: 0.15rem 0 0; font-size: 0.82rem; color: var(--cinza-500); }
  .svc-admin__tree { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.8rem; }
  .svc-cat { border: 1px solid var(--cinza-100); border-radius: var(--raio-sm); background: var(--cinza-050); padding: 0.7rem 0.8rem; display: grid; gap: 0.5rem; align-content: start; }
  .svc-cat__head { display: flex; align-items: center; gap: 0.4rem; }
  .svc-cat__nome { font-weight: 600; color: var(--azul-900); flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .svc-cat__count { font-size: 0.75rem; color: var(--cinza-500); white-space: nowrap; }
  .svc-cat__btn { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: transparent; color: var(--cinza-700); flex-shrink: 0; }
  .svc-cat__btn:hover { background: var(--cinza-100); }
  .svc-cat__btn .icon { width: 14px; height: 14px; }
  .svc-cat__subs { list-style: none; margin: 0; padding: 0 0 0 0.6rem; display: grid; gap: 0.25rem; border-left: 2px solid var(--cinza-200); }
  .svc-cat__subs li { display: flex; align-items: center; gap: 0.3rem; font-size: 0.86rem; color: var(--cinza-700); }
  .svc-cat__subs li span.svc-cat__nome { font-weight: 500; color: var(--cinza-900); }
  .svc-cat__add { align-self: start; font-size: 0.8rem; color: var(--azul-700); background: transparent; padding: 0.15rem 0; display: inline-flex; align-items: center; gap: 0.3rem; }
  .svc-cat__add .icon { width: 13px; height: 13px; }
  .svc-cat__add:hover { text-decoration: underline; }
  .svc-admin__ajuda { font-size: 0.8rem; color: var(--cinza-500); margin: -0.4rem 0 0; }
  .svc-admin__ajuda--grid { grid-column: 1 / -1; }
  .svc-admin__dica { font-weight: 400; color: var(--cinza-500); font-size: 0.78rem; }
  .svc-cat__thumb { width: 46px; height: 30px; object-fit: cover; border-radius: 6px; flex-shrink: 0; border: 1px solid var(--cinza-200); background: var(--branco); }
  .svc-cat__btn[disabled] { opacity: 0.3; cursor: default; }
  .svc-cat__btn[disabled]:hover { background: transparent; }
  .svc-catimg { display: grid; gap: 0.5rem; }
  .svc-catimg__frame { aspect-ratio: 3.4 / 1; border: 1px dashed var(--cinza-300); border-radius: var(--raio-sm); background: var(--cinza-050); overflow: hidden; display: grid; place-items: center; color: var(--cinza-500); font-size: 0.82rem; }
  .svc-catimg__frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .svc-catimg__row { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; }
  .svc-catimg__row label.btn-secondary { cursor: pointer; }
  .svc-catimg__pos { display: grid; gap: 0.25rem; font-size: 0.82rem; color: var(--cinza-700); }
  .svc-catimg__pos input[type=range] { width: 100%; accent-color: var(--azul-700); }
  .svc2 { display: grid; grid-template-columns: minmax(250px, 310px) 1fr; gap: 1rem; align-items: start; margin-bottom: 1rem; }
  .svc2__cats { border: 1px solid var(--cinza-100); border-radius: var(--raio-md); background: var(--branco); padding: 1rem 0.8rem 0.8rem; position: sticky; top: 0; max-height: 72vh; overflow: auto; }
  .svc2__cats > h2 { margin: 0 0 0.7rem 0.4rem; font-size: 1rem; color: var(--azul-900); }
  .svc2-cat { margin-bottom: 0.2rem; }
  .svc2-cat__row { width: 100%; display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.7rem; border-radius: 12px; background: transparent; color: var(--cinza-900); font-size: 0.92rem; text-align: left; cursor: pointer; }
  .svc2-cat__row:hover { background: var(--cinza-050); }
  .svc2-cat.is-ativa > .svc2-cat__row { background: var(--azul-100); color: var(--azul-900); font-weight: 600; }
  .svc2-ico { width: 20px; height: 20px; flex-shrink: 0; color: var(--azul-700); }
  .svc2-cat__thumb { width: 22px; height: 22px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
  .svc2-cat__nome { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .svc2-cat__badge { min-width: 24px; padding: 0.05rem 0.45rem; border-radius: 999px; background: var(--cinza-100); color: var(--cinza-700); font-size: 0.74rem; font-weight: 600; text-align: center; }
  .svc2-cat.is-ativa .svc2-cat__badge { background: rgba(255,255,255,0.7); }
  .svc2-cat__chev { width: 16px; height: 16px; color: var(--cinza-500); transform: rotate(90deg); transition: transform .15s; flex-shrink: 0; }
  .svc2-subs { list-style: none; margin: 0.2rem 0 0.5rem 1.35rem; padding: 0 0 0 0.4rem; display: grid; gap: 0.05rem; }
  .svc2-sub { display: flex; align-items: center; gap: 0.2rem; border-radius: 8px; }
  .svc2-sub:hover { background: var(--cinza-050); }
  .svc2-sub.is-ativa { background: var(--cinza-050); }
  .svc2-sub__btn { flex: 1; min-width: 0; display: flex; align-items: center; gap: 0.6rem; padding: 0.3rem 0.4rem; background: transparent; font-size: 0.85rem; color: var(--cinza-700); text-align: left; cursor: pointer; }
  .svc2-sub__btn::before { content: ""; width: 6px; height: 6px; border-radius: 50%; border: 1.5px solid var(--cinza-300); flex-shrink: 0; }
  .svc2-sub.is-ativa .svc2-sub__btn { color: var(--azul-900); font-weight: 600; }
  .svc2-sub.is-ativa .svc2-sub__btn::before { background: var(--azul-700); border-color: var(--azul-700); }
  .svc2-sub__acoes { display: none; gap: 0; }
  .svc2-sub:hover .svc2-sub__acoes, .svc2-sub:focus-within .svc2-sub__acoes { display: flex; }
  .svc2-mini { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: transparent; color: var(--cinza-700); cursor: pointer; }
  .svc2-mini:hover { background: var(--cinza-100); }
  .svc2-mini[disabled] { opacity: .3; cursor: default; }
  .svc2-mini .icon { width: 13px; height: 13px; }
  .svc2-addsub { margin: 0.2rem 0 0.3rem 1.8rem; font-size: 0.8rem; color: var(--azul-700); background: transparent; display: inline-flex; align-items: center; gap: 0.3rem; cursor: pointer; }
  .svc2-addsub .icon { width: 12px; height: 12px; }
  .svc2-addsub:hover { text-decoration: underline; }
  .svc2__main { border: 1px solid var(--cinza-100); border-radius: var(--raio-md); background: var(--branco); padding: 1rem; min-width: 0; }
  .svc2__head { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
  .svc2__head > .svc2-ico, .svc2__head > .svc2-cat__thumb { width: 34px; height: 34px; }
  .svc2__head-txt { flex: 1; min-width: 160px; }
  .svc2__head-txt h2 { margin: 0; font-size: 1.15rem; color: var(--azul-900); }
  .svc2__head-txt p { margin: 0.1rem 0 0; font-size: 0.82rem; color: var(--cinza-500); }
  .svc2__head-acoes { display: flex; align-items: center; gap: 0.2rem; }
  .svc2__filtros { display: flex; gap: 0.7rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
  .svc2__filtros .select-icon { min-width: 190px; }
  .svc2-lista { display: grid; gap: 0.55rem; }
  .svc2-linha { display: grid; grid-template-columns: 48px minmax(150px, 2.2fr) 0.8fr 0.8fr minmax(120px, 1.6fr) 104px 112px; align-items: center; gap: 0.8rem; padding: 0.6rem 0.8rem; border: 1px solid var(--cinza-100); border-radius: 14px; background: var(--branco); font-size: 0.86rem; color: var(--cinza-700); }
  .svc2-linha:hover { background: var(--cinza-050); }
  .svc2-linha__thumb { width: 44px; height: 44px; border-radius: 12px; background: var(--azul-100); display: grid; place-items: center; overflow: hidden; }
  .svc2-linha__thumb img { width: 100%; height: 100%; object-fit: cover; }
  .svc2-linha__nome strong { display: block; color: var(--cinza-900); font-size: 0.92rem; overflow-wrap: anywhere; }
  .svc2-linha__cat { display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; color: var(--cinza-500); }
  .svc2-linha__cat::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--azul-500); opacity: .55; flex-shrink: 0; }
  .svc2-status { justify-self: start; display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.65rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: #dcfce7; color: #15803d; white-space: nowrap; }
  .svc2-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .svc2-status.is-oculto { background: var(--cinza-100); color: var(--cinza-700); }
  .svc2-linha__acoes { display: flex; gap: 0.35rem; }
  .svc2-acao { width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--cinza-200); background: var(--branco); display: grid; place-items: center; color: var(--cinza-900); cursor: pointer; }
  .svc2-acao:hover { background: var(--cinza-100); }
  .svc2-acao .icon { width: 15px; height: 15px; }
  .svc2-acao--dup { opacity: 0; }
  .svc2-linha:hover .svc2-acao--dup, .svc2-acao--dup:focus-visible { opacity: 1; }
  @media (hover: none) { .svc2-acao--dup { opacity: 1; } .svc2-sub__acoes { display: flex; } }
  .svc2__bar { display: flex; gap: 0.7rem; flex-wrap: wrap; align-items: center; margin-bottom: 1.25rem; }
  .svc2__bar .admin-search { flex: 1; min-width: 220px; }
  @media (max-width: 960px) {
    .svc2 { grid-template-columns: 1fr; }
    .svc2__cats { position: static; max-height: none; }
    .svc2-linha { grid-template-columns: 44px 1fr auto; }
    .svc2-linha > .svc2-linha__extra { display: none; }
  }
</style>`;

// ---------- ENTRADA ----------
export async function carregarAbaServicos(container, helpers = {}) {
  if (!container) return;
  ajuda = { ...ajuda, ...helpers };
  await recarregarDados();
  desenharPainel(container);
}

async function recarregarDados() {
  const dados = await listarServicosAdmin();
  categorias = dados.categorias;
  servicos = dados.servicos;
}

async function recarregarEDesenhar(container) {
  await recarregarDados();
  desenharPainel(container);
}

// ---------- LISTAGEM ----------
function textoCategoria(s) {
  if (!s.categoriaNome) return "-";
  return s.subcategoriaNome ? `${s.categoriaNome} › ${s.subcategoriaNome}` : s.categoriaNome;
}

function servicosFiltrados() {
  const termo = normalizarTexto(filtros.termo);
  const lista = resolverNomesServicos(servicos, categorias).filter(s => {
    if (filtros.categoriaId && s.categoriaId !== filtros.categoriaId) return false;
    if (filtros.subId && s.subcategoriaId !== filtros.subId) return false;
    if (!termo) return true;
    return normalizarTexto([s.nome, s.categoriaNome, s.subcategoriaNome, s.codigo, s.descricaoCurta].join(" ")).includes(termo);
  });
  return ordenarServicos(lista, categorias).map(s => ({
    ...s,
    categoriaNome: s.categoriaNome, subcategoriaNome: s.subcategoriaNome
  }));
}

function contarServicos(categoriaId, ehSub) {
  return servicos.filter(s => (ehSub ? s.subcategoriaId : s.categoriaId) === categoriaId).length;
}

function irmasOrdenadas(parentId = "") {
  return categorias
    .filter(c => (c.parentId || "") === (parentId || ""))
    .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
}

function botoesOrdem(cat) {
  const irmas = irmasOrdenadas(cat.parentId);
  const i = irmas.findIndex(c => c.id === cat.id);
  return `
    <button type="button" class="svc-cat__btn" data-act="subir-cat" data-id="${cat.id}" title="Mover para cima" ${i <= 0 ? "disabled" : ""}>${icon("chevronLeft")}</button>
    <button type="button" class="svc-cat__btn" data-act="descer-cat" data-id="${cat.id}" title="Mover para baixo" ${i === irmas.length - 1 ? "disabled" : ""}>${icon("chevronRight")}</button>`;
}

async function moverCategoria(container, cat, direcao) {
  const irmas = irmasOrdenadas(cat.parentId);
  const i = irmas.findIndex(c => c.id === cat.id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= irmas.length) return;
  [irmas[i], irmas[j]] = [irmas[j], irmas[i]];
  const mudancas = irmas
    .map((c, idx) => ({ c, nova: idx + 1 }))
    .filter(({ c, nova }) => Number(c.ordem) !== nova);
  try {
    for (let k = 0; k < mudancas.length; k++) {
      const { c, nova } = mudancas[k];
      await atualizarCategoriaServico(c.id, { ordem: nova }, { silencioso: k < mudancas.length - 1 });
    }
    await recarregarEDesenhar(container);
  } catch (erro) { falha("mudar a ordem", erro); }
}

// ---------- ÍCONES DAS CATEGORIAS ----------
const svgIcone = (d) => `<svg class="svc2-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONES_CATEGORIA = [
  [/estet|massag|spa|relax/, svgIcone('<path d="M12 5c1.8 2 2.6 4.2 2.6 6.4 0 2.2-1 4-2.6 5.6-1.6-1.6-2.6-3.4-2.6-5.6C9.4 9.2 10.2 7 12 5z"/><path d="M9.6 14.2C7 14.2 4.8 12.8 3.5 10.5c2.8-.3 5 .5 6.4 2"/><path d="M14.4 14.2c2.6 0 4.8-1.4 6.1-3.7-2.8-.3-5 .5-6.4 2"/><path d="M4.5 16.5c2.4 2 5 3 7.5 3s5.1-1 7.5-3"/>')],
  [/cabel|corte|escova/, svgIcone('<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5 20 18M8 15.5 20 6"/>')],
  [/unha|manicure|pedicure/, svgIcone('<rect x="8" y="11" width="8" height="10" rx="2"/><path d="M10 11V7h4v4M11 7V3h2v4"/>')],
  [/depila|cera|laser/, svgIcone('<path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11z"/>')],
  [/saude|bem.?estar|terapia/, svgIcone('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>')],
  [/sobrancel|design|cilios/, svgIcone('<path d="M3 13c3-5 11-7 18-3"/><path d="M4 16c3-3 9-4.5 15-2.5"/>')],
  [/maquia|make|beleza/, svgIcone('<path d="M20 4 11 13"/><path d="M11 13c-2.5-.5-4.5 1-4.5 3.2 0 1.5-.8 2.6-2.5 3.3 3.5 1.3 8.5 1 9.5-2.5.5-1.5.2-3-.5-4z"/>')]
];
function iconeCategoria(cat) {
  const nome = normalizarTexto(cat?.nome || "");
  const achou = ICONES_CATEGORIA.find(([re]) => re.test(nome));
  if (achou) return achou[1];
  if (cat?.imagem) return `<img class="svc2-cat__thumb" src="${cat.imagem}" alt="">`;
  return icon("grid", "svc2-ico");
}

function categoriaSelecionada() {
  return categorias.find(c => c.id === filtros.categoriaId && !c.parentId) || null;
}

function desenharPainel(container) {
  const arvore = montarArvoreCategorias(categorias);
  if (filtros.categoriaId && !arvore.some(c => c.id === filtros.categoriaId)) { filtros.categoriaId = ""; filtros.subId = ""; }
  if (!filtros.categoriaId && arvore.length && !filtros.todas) filtros.categoriaId = arvore[0].id;
  const opcoesFiltro = arvore.map(c => `<option value="${c.id}" ${filtros.categoriaId === c.id ? "selected" : ""}>${escHtml(c.nome)}</option>`).join("");

  container.innerHTML = `${ESTILO}
    <div class="admin-panel-head">
      <h1>Serviços</h1>
      <p>Cadastre os serviços do salão, organizados em categorias e subcategorias, com fotos e explicação do que cada um faz.</p>
    </div>

    <div class="svc2">
      <aside class="svc2__cats" aria-label="Categorias de serviços">
        <h2>Categorias de serviços</h2>
        <div id="svc2-arvore"></div>
      </aside>
      <section class="svc2__main">
        <header class="svc2__head" id="svc2-head"></header>
        <div class="svc2__filtros">
          <form class="admin-search" id="form-busca-interna-servicos" role="search" style="flex:1;min-width:200px">
            <div class="input-icon">${icon("search")}<input type="search" id="busca-interna-servicos" placeholder="Buscar serviço..." autocomplete="off" value="${escHtml(filtros.termo)}"></div>
          </form>
          <div class="select-icon">${icon("filter")}<select id="filtro-sub-servicos" aria-label="Filtrar por subcategoria"></select></div>
        </div>
        <div class="svc2-lista" id="svc2-lista"></div>
        <div class="table-pagination"><p class="table-count" id="contagem-servicos"></p></div>
      </section>
    </div>

    <div class="svc2__bar">
      <form class="admin-search" id="form-busca-admin-servicos" role="search">
        <div class="input-icon">${icon("search")}<input type="search" id="busca-admin-servicos" placeholder="Pesquisar serviços..." autocomplete="off" value="${escHtml(filtros.termo)}"></div>
      </form>
      <div class="select-icon">
        ${icon("sort")}
        <select id="filtro-admin-servicos-categoria" aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>${opcoesFiltro}
        </select>
      </div>
      <button class="btn-secondary" id="btn-prompt-importacao-servicos">${icon("clipboardList")}Prompt para IA</button>
      <button class="btn-secondary" id="btn-importar-json-servicos">${icon("upload")}Importar JSON</button>
      <input type="file" id="input-importar-json-servicos" accept="application/json,.json" hidden>
      <button class="btn-primary" id="btn-novo-servico">${icon("plus")}Novo serviço</button>
    </div>

    <dialog id="dialog-servico" class="dialog-form"></dialog>
    <dialog id="dialog-categoria-servico" class="dialog-form"></dialog>
    <dialog id="dialog-importar-json-servicos" class="dialog-form">
      <h2>Resultado da importação</h2>
      <div id="resultado-importacao-json-servicos" class="import-result"></div>
      <div class="form-actions">
        <button type="button" class="btn-primary" id="btn-fechar-importacao-servicos">Fechar</button>
      </div>
    </dialog>
    <dialog id="dialog-prompt-importacao-servicos" class="dialog-form dialog-prompt-importacao">
      <div class="prompt-importacao__head">
        <div><h2>Prompt para criar JSON de serviços com IA</h2><p>Copie, cole na IA e depois importe o arquivo gerado.</p></div>
        <button type="button" class="prompt-importacao__close" id="btn-fechar-prompt-servicos" aria-label="Fechar">${icon("close")}</button>
      </div>
      <textarea id="texto-prompt-servicos" class="prompt-importacao__texto" readonly spellcheck="false"></textarea>
      <div class="form-actions">
        <button type="button" class="btn-primary" id="btn-copiar-prompt-servicos">${icon("copy")}Copiar prompt</button>
      </div>
    </dialog>`;

  renderizarArvore(container);
  renderizarTabela(container);
  ligarEventos(container);
}

function renderizarArvore(container) {
  const arvore = montarArvoreCategorias(categorias);
  const alvo = container.querySelector("#svc2-arvore");
  if (!arvore.length) {
    alvo.innerHTML = `<p style="margin:0.4rem;font-size:0.86rem;color:var(--cinza-500)">Nenhuma categoria ainda. Crie uma pelo botão "Nova categoria".</p>`;
    return;
  }
  alvo.innerHTML = arvore.map(c => {
    const ativa = c.id === filtros.categoriaId;
    const aberta = ativa && !filtros.recolhida;
    return `
    <div class="svc2-cat ${ativa ? "is-ativa" : ""} ${aberta ? "is-aberta" : ""}" data-cat="${c.id}">
      <button type="button" class="svc2-cat__row" data-act="sel-cat" data-id="${c.id}" aria-expanded="${aberta}">
        ${iconeCategoria(c)}
        <span class="svc2-cat__nome">${escHtml(c.nome)}</span>
        <span class="svc2-cat__badge">${contarServicos(c.id, false)}</span>
        ${icon("chevronRight", "svc2-cat__chev")}
      </button>
      ${aberta ? `
        <ul class="svc2-subs">${c.filhas.map(f => `
          <li class="svc2-sub ${filtros.subId === f.id ? "is-ativa" : ""}">
            <button type="button" class="svc2-sub__btn" data-act="sel-sub" data-id="${f.id}">${escHtml(f.nome)}</button>
            <span class="svc2-sub__acoes">
              ${botoesOrdemMini(f)}
              <button type="button" class="svc2-mini" data-act="editar-cat" data-id="${f.id}" title="Editar subcategoria">${icon("pencil")}</button>
              <button type="button" class="svc2-mini" data-act="excluir-cat" data-id="${f.id}" title="Excluir subcategoria">${icon("trash")}</button>
            </span>
          </li>`).join("")}</ul>
        <button type="button" class="svc2-addsub" data-act="nova-sub" data-id="${c.id}">${icon("plus")}Subcategoria</button>` : ""}
    </div>`;
  }).join("");
}

function botoesOrdemMini(cat) {
  const irmas = irmasOrdenadas(cat.parentId);
  const i = irmas.findIndex(c => c.id === cat.id);
  return `
    <button type="button" class="svc2-mini" data-act="subir-cat" data-id="${cat.id}" title="Mover para cima" ${i <= 0 ? "disabled" : ""}>${icon("chevronLeft")}</button>
    <button type="button" class="svc2-mini" data-act="descer-cat" data-id="${cat.id}" title="Mover para baixo" ${i === irmas.length - 1 ? "disabled" : ""}>${icon("chevronRight")}</button>`;
}

function renderizarCabecalho(container) {
  const cat = categoriaSelecionada();
  const total = cat ? contarServicos(cat.id, false) : servicos.length;
  const head = container.querySelector("#svc2-head");
  head.innerHTML = `
    ${cat ? iconeCategoria(cat) : icon("grid", "svc2-ico")}
    <div class="svc2__head-txt">
      <h2>${cat ? escHtml(cat.nome) : "Todos os serviços"}</h2>
      <p>${total} serviço${total === 1 ? "" : "s"} cadastrado${total === 1 ? "" : "s"}</p>
    </div>
    <div class="svc2__head-acoes">
      ${cat ? `${botoesOrdemMini(cat)}
        <button type="button" class="svc2-mini" data-act="editar-cat" data-id="${cat.id}" title="Editar categoria">${icon("pencil")}</button>
        <button type="button" class="svc2-mini" data-act="excluir-cat" data-id="${cat.id}" title="Excluir categoria">${icon("trash")}</button>` : ""}
    </div>
    <button type="button" class="btn-primary" id="btn-nova-categoria-servico">${icon("plus")}Nova categoria</button>`;
  head.querySelector("#btn-nova-categoria-servico").addEventListener("click", () => abrirFormularioCategoria(container));

  const sel = container.querySelector("#filtro-sub-servicos");
  const filhas = cat ? irmasOrdenadas(cat.id) : [];
  sel.innerHTML = `<option value="">Todos os serviços</option>` +
    filhas.map(f => `<option value="${f.id}" ${filtros.subId === f.id ? "selected" : ""}>${escHtml(f.nome)}</option>`).join("");
  sel.disabled = !filhas.length;
}

function renderizarTabela(container) {
  renderizarCabecalho(container);
  const alvo = container.querySelector("#svc2-lista");
  const lista = servicosFiltrados();
  container.querySelector("#contagem-servicos").textContent = `${lista.length} serviço(s)`;
  const catPorId = new Map(categorias.map(c => [c.id, c]));

  alvo.innerHTML = lista.map(s => {
    const img = imgPos(s.imagem);
    const cat = catPorId.get(s.categoriaId);
    const subDiferente = s.subcategoriaNome && normalizarTexto(s.subcategoriaNome) !== normalizarTexto(s.nome);
    const rotuloCat = s.categoriaNome ? (subDiferente ? `${s.categoriaNome} › ${s.subcategoriaNome}` : s.categoriaNome) : "Sem categoria";
    const oculto = s.status === "oculto";
    return `
    <article class="svc2-linha" data-id="${s.id}">
      <div class="svc2-linha__thumb">${img.src ? `<img src="${img.src}" style="object-position:${img.pos}" alt="">` : iconeCategoria(cat)}</div>
      <div class="svc2-linha__nome"><strong>${escHtml(s.nome)}</strong><span class="svc2-linha__cat">${escHtml(rotuloCat)}</span></div>
      <div class="svc2-linha__extra">${Number(s.preco) > 0 ? formatBRL(s.preco) : "Sob consulta"}</div>
      <div class="svc2-linha__extra">${escHtml(s.duracao || "-")}</div>
      <div class="svc2-linha__extra">${escHtml(s.sessoes || "")}</div>
      <span class="svc2-status ${oculto ? "is-oculto" : ""}">${oculto ? "Oculto" : "Disponível"}</span>
      <div class="svc2-linha__acoes">
        <button type="button" class="svc2-acao svc2-acao--dup" data-action="duplicar" title="Duplicar">${icon("copy")}</button>
        <button type="button" class="svc2-acao" data-action="editar" title="Editar">${icon("pencil")}</button>
        <button type="button" class="svc2-acao" data-action="excluir" title="Excluir">${icon("trash")}</button>
      </div>
    </article>`;
  }).join("") || `
      <div class="empty-state">
        ${icon("gridEmpty", "empty-state__icon")}
        <strong>${filtros.termo || filtros.subId ? "Nenhum serviço encontrado" : "Nenhum serviço cadastrado"}</strong>
        <p>${filtros.termo || filtros.subId ? "Tente outro nome ou subcategoria." : "Adicione o primeiro serviço do salão ou importe um arquivo JSON."}</p>
        ${filtros.termo || filtros.subId ? "" : `<button type="button" class="btn-secondary" id="btn-primeiro-servico">${icon("plus")}Adicionar primeiro serviço</button>`}
      </div>`;

  alvo.querySelector("#btn-primeiro-servico")?.addEventListener("click", () => abrirFormularioServico(container));

  alvo.querySelectorAll(".svc2-linha[data-id]").forEach(tr => {
    const servico = servicos.find(s => s.id === tr.dataset.id);
    if (!servico) return;
    tr.querySelector('[data-action="editar"]').addEventListener("click", () => abrirFormularioServico(container, servico));
    tr.querySelector('[data-action="duplicar"]').addEventListener("click", async () => {
      try {
        await duplicarServico(servico);
        toast("Serviço duplicado.");
        await recarregarEDesenhar(container);
      } catch (erro) { falha("duplicar o serviço", erro); }
    });
    tr.querySelector('[data-action="excluir"]').addEventListener("click", async () => {
      const ok = await confirmarAcao(`Excluir "${servico.nome}"? Esta ação não pode ser desfeita.`, {
        titulo: "Excluir serviço", textoConfirmar: "Excluir"
      });
      if (!ok) return;
      try {
        await excluirServico(servico.id);
        toast("Serviço excluído.");
        await recarregarEDesenhar(container);
      } catch (erro) { falha("excluir o serviço", erro); }
    });
  });
}

function falha(acao, erro) {
  console.error(`[servicos] erro ao ${acao}:`, erro);
  toast(erro?.message || `Não foi possível ${acao}.`, "error");
}

function atualizarVisao(container) {
  renderizarArvore(container);
  renderizarTabela(container);
  const selBaixo = container.querySelector("#filtro-admin-servicos-categoria");
  if (selBaixo) selBaixo.value = filtros.categoriaId;
}

function ligarEventos(container) {
  const buscaBaixo = container.querySelector("#busca-admin-servicos");
  const buscaInterna = container.querySelector("#busca-interna-servicos");
  container.querySelector("#form-busca-admin-servicos").addEventListener("submit", (e) => e.preventDefault());
  container.querySelector("#form-busca-interna-servicos").addEventListener("submit", (e) => e.preventDefault());
  const aoBuscar = (origem, outra) => () => {
    filtros.termo = origem.value;
    outra.value = origem.value;
    renderizarTabela(container);
  };
  buscaBaixo.addEventListener("input", aoBuscar(buscaBaixo, buscaInterna));
  buscaInterna.addEventListener("input", aoBuscar(buscaInterna, buscaBaixo));

  container.querySelector("#filtro-admin-servicos-categoria").addEventListener("change", (e) => {
    filtros.categoriaId = e.target.value;
    filtros.todas = !e.target.value;
    filtros.subId = "";
    filtros.recolhida = false;
    atualizarVisao(container);
  });
  container.querySelector("#filtro-sub-servicos").addEventListener("change", (e) => {
    filtros.subId = e.target.value;
    renderizarArvore(container);
    renderizarTabela(container);
  });

  container.querySelector("#btn-novo-servico").addEventListener("click", () => abrirFormularioServico(container));

  // categorias e cabeçalho (selecionar / editar / excluir / nova subcategoria / ordem)
  const aoClicarCategoria = async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    if (act === "sel-cat") {
      if (filtros.categoriaId === btn.dataset.id) filtros.recolhida = !filtros.recolhida;
      else { filtros.categoriaId = btn.dataset.id; filtros.todas = false; filtros.recolhida = false; }
      filtros.subId = "";
      return atualizarVisao(container);
    }
    if (act === "sel-sub") {
      filtros.subId = filtros.subId === btn.dataset.id ? "" : btn.dataset.id;
      renderizarArvore(container);
      return renderizarTabela(container);
    }
    const cat = categorias.find(c => c.id === btn.dataset.id);
    if (!cat) return;
    if (act === "editar-cat") return abrirFormularioCategoria(container, cat);
    if (act === "nova-sub") return abrirFormularioCategoria(container, null, cat.id);
    if (act === "excluir-cat") return excluirCategoria(container, cat);
    if (act === "subir-cat") return moverCategoria(container, cat, -1);
    if (act === "descer-cat") return moverCategoria(container, cat, 1);
  };
  container.querySelector("#svc2-arvore").addEventListener("click", aoClicarCategoria);
  container.querySelector("#svc2-head").addEventListener("click", aoClicarCategoria);

  // importação
  const inputJson = container.querySelector("#input-importar-json-servicos");
  container.querySelector("#btn-importar-json-servicos").addEventListener("click", () => inputJson.click());
  inputJson.addEventListener("change", async () => {
    const arquivo = inputJson.files?.[0];
    inputJson.value = "";
    if (!arquivo) return;
    await importarServicosJson(container, arquivo);
  });

  // prompt para IA
  const dialogPrompt = container.querySelector("#dialog-prompt-importacao-servicos");
  const textoPrompt = container.querySelector("#texto-prompt-servicos");
  container.querySelector("#btn-prompt-importacao-servicos").addEventListener("click", () => {
    textoPrompt.value = criarPromptImportacaoServicos();
    dialogPrompt.showModal();
  });
  container.querySelector("#btn-fechar-prompt-servicos").addEventListener("click", () => dialogPrompt.close());
  container.querySelector("#btn-copiar-prompt-servicos").addEventListener("click", async () => {
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

// ---------- CATEGORIAS ----------
async function excluirCategoria(container, cat) {
  const filhas = categorias.filter(c => c.parentId === cat.id);
  if (filhas.length) {
    toast("Esta categoria tem subcategorias. Exclua ou mova as subcategorias primeiro.", "error");
    return;
  }
  const usados = servicos.filter(s => s.categoriaId === cat.id || s.subcategoriaId === cat.id).length;
  if (usados) {
    toast(`Há ${usados} serviço(s) nesta categoria. Mude a categoria deles ou exclua-os antes.`, "error");
    return;
  }
  const ok = await confirmarAcao(`Excluir "${cat.nome}"? Esta ação não pode ser desfeita.`, {
    titulo: cat.parentId ? "Excluir subcategoria" : "Excluir categoria", textoConfirmar: "Excluir"
  });
  if (!ok) return;
  try {
    await excluirCategoriaServico(cat.id);
    toast("Categoria excluída.");
    await recarregarEDesenhar(container);
  } catch (erro) { falha("excluir a categoria", erro); }
}

function abrirFormularioCategoria(container, categoria = null, parentIdInicial = "") {
  const dialog = container.querySelector("#dialog-categoria-servico");
  const principais = categorias.filter(c => !c.parentId && c.id !== categoria?.id);
  const temFilhas = categoria && categorias.some(c => c.parentId === categoria.id);
  const parentAtual = categoria ? (categoria.parentId || "") : parentIdInicial;

  let imagemAtual = categoria?.imagem || "";
  let posY = Number.isFinite(Number(categoria?.imagemPosY)) ? Number(categoria.imagemPosY) : 50;

  dialog.innerHTML = `
    <form id="form-categoria-servico" class="product-form">
      <h3>${categoria ? "Editar categoria" : (parentIdInicial ? "Nova subcategoria" : "Nova categoria")}</h3>
      <div class="form-grid">
        <label>Nome<input name="nome" required autocomplete="off" value="${escHtml(categoria?.nome || "")}" placeholder="Ex.: Estética"></label>
        <label>Dentro de
          <select name="parentId" ${temFilhas ? "disabled" : ""}>
            <option value="">Nenhuma (categoria principal)</option>
            ${principais.map(c => `<option value="${c.id}" ${parentAtual === c.id ? "selected" : ""}>${escHtml(c.nome)}</option>`).join("")}
          </select>
        </label>
      </div>
      ${temFilhas ? `<p class="svc-admin__ajuda">Esta categoria tem subcategorias, por isso continua como categoria principal.</p>` : ""}
      <label>Descrição curta (aparece no card)
        <textarea name="descricao" rows="2" maxlength="110" placeholder="Ex.: Cuidados e tratamentos para realçar sua beleza.">${escHtml(categoria?.descricao || "")}</textarea>
      </label>
      <div class="svc-catimg">
        <strong style="font-size:0.9rem">Foto do card</strong>
        <div class="svc-catimg__frame" id="cat-img-frame"></div>
        <div class="svc-catimg__row">
          <label class="btn-secondary">${icon("plus")}<span id="cat-img-rotulo">Escolher foto</span>
            <input type="file" id="cat-img-input" accept="image/*" hidden>
          </label>
          <button type="button" class="svc-cat__add" id="cat-img-remover" hidden>Remover foto</button>
        </div>
        <label class="svc-catimg__pos" id="cat-img-pos-wrap" hidden>Enquadramento vertical
          <input type="range" id="cat-img-pos" min="0" max="100" value="${posY}">
        </label>
        <p class="svc-admin__ajuda" style="margin:0">A foto é comprimida automaticamente e salva no próprio banco. O card mostra uma faixa horizontal, então prefira fotos largas.</p>
      </div>
      <div class="form-actions">
        <button type="button" data-fechar>Cancelar</button>
        <button type="submit" class="btn-primary">Salvar</button>
      </div>
    </form>`;
  dialog.showModal();
  dialog.querySelector("[data-fechar]").addEventListener("click", () => dialog.close());

  const frame = dialog.querySelector("#cat-img-frame");
  const wrapPos = dialog.querySelector("#cat-img-pos-wrap");
  const btnRemover = dialog.querySelector("#cat-img-remover");
  const rotulo = dialog.querySelector("#cat-img-rotulo");
  function desenharImagem() {
    if (imagemAtual) {
      frame.innerHTML = `<img src="${imagemAtual}" alt="" style="object-position:50% ${posY}%">`;
    } else {
      frame.textContent = "Sem foto";
    }
    wrapPos.hidden = !imagemAtual;
    btnRemover.hidden = !imagemAtual;
    rotulo.textContent = imagemAtual ? "Trocar foto" : "Escolher foto";
  }
  desenharImagem();

  dialog.querySelector("#cat-img-pos").addEventListener("input", (e) => {
    posY = Number(e.target.value);
    const img = frame.querySelector("img");
    if (img) img.style.objectPosition = `50% ${posY}%`;
  });
  btnRemover.addEventListener("click", () => { imagemAtual = ""; posY = 50; dialog.querySelector("#cat-img-pos").value = 50; desenharImagem(); });
  dialog.querySelector("#cat-img-input").addEventListener("change", async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    try {
      imagemAtual = await comprimirParaBase64(arquivo, { maxLargura: 900, maxBytes: 110 * 1024 });
      desenharImagem();
    } catch (erro) { falha("processar a foto", erro); }
  });

  dialog.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    const nome = form.nome.value.trim();
    const parentId = temFilhas ? "" : form.parentId.value;
    if (!nome) return;

    const duplicada = categorias.some(c =>
      c.id !== categoria?.id && (c.parentId || "") === parentId && normalizarTexto(c.nome) === normalizarTexto(nome));
    if (duplicada) { toast("Já existe uma categoria com esse nome aí.", "error"); return; }

    const dados = {
      nome,
      parentId,
      descricao: form.descricao.value.trim(),
      imagem: imagemAtual,
      imagemPosY: posY
    };

    btn.disabled = true;
    try {
      if (categoria) await atualizarCategoriaServico(categoria.id, dados);
      else await criarCategoriaServico(dados);
      toast("Categoria salva.");
      dialog.close();
      await recarregarEDesenhar(container);
    } catch (erro) {
      falha("salvar a categoria", erro);
      btn.disabled = false;
    }
  });
}

// ---------- FORMULÁRIO DO SERVIÇO ----------
async function abrirFormularioServico(container, servico = null) {
  const dialog = container.querySelector("#dialog-servico");
  dialog.className = "dialog-form dialog-produto";
  const arvore = montarArvoreCategorias(categorias);

  const opcoesCategoria = arvore.map(c =>
    `<option value="${c.id}" ${servico?.categoriaId === c.id ? "selected" : ""}>${escHtml(c.nome)}</option>`).join("");

  // galeria: cada item é { id, url (existente) ou file+previewUrl (novo) }
  const iniciais = Array.isArray(servico?.imagens) && servico.imagens.length
    ? servico.imagens : (servico?.imagem ? [servico.imagem] : []);
  let galeria = iniciais.map(url => ({ id: crypto.randomUUID(), url, file: null, previewUrl: null }));
  let arrastando = null;

  const linhas = (v) => escHtml((Array.isArray(v) ? v : []).join("\n"));

  dialog.innerHTML = `
    <form id="form-servico" class="product-form">
      <header class="product-form__head">
        <div class="product-form__title"><span>${icon("calendar")}</span><div><h2>${servico ? "Editar serviço" : "Novo serviço"}</h2><p>Preencha as informações do serviço para o site.</p></div></div>
        <button type="button" class="product-form__close" data-modal-close-dialog aria-label="Fechar formulário">${icon("close")}</button>
      </header>
      <div class="product-form__scroll">
        <div class="form-grid">
          <label>Nome do serviço<input name="nome" required autocomplete="off" value="${escHtml(servico?.nome || "")}" placeholder="Ex.: Limpeza de pele"></label>
          <label>Código<input name="codigo" autocomplete="off" value="${escHtml(servico?.codigo || generateCode("SERV"))}"></label>
          <label>Categoria<select name="categoriaId"><option value="">Selecione</option>${opcoesCategoria}</select></label>
          <label>Subcategoria<select name="subcategoriaId"></select></label>
          <label>Duração<input name="duracao" autocomplete="off" value="${escHtml(servico?.duracao || "")}" placeholder="Ex.: 60 min"></label>
          <label>Preço a partir de (R$)<input name="preco" type="number" step="0.01" min="0" value="${Number(servico?.preco) > 0 ? servico.preco : ""}" placeholder="Vazio = sob consulta"></label>
          <label>Status
            <select name="status">
              <option value="disponivel" ${servico?.status !== "oculto" ? "selected" : ""}>Disponível (aparece no site)</option>
              <option value="oculto" ${servico?.status === "oculto" ? "selected" : ""}>Oculto (não aparece no site)</option>
            </select>
          </label>
          <label>Sessões / frequência recomendada<input name="sessoes" autocomplete="off" value="${escHtml(servico?.sessoes || "")}" placeholder="Ex.: 1 sessão a cada 30 dias"></label>
        </div>

        <div class="galeria-produto" id="galeria-servico-wrap">
          <h4>Fotos do serviço</h4>
          <p class="galeria-produto__ajuda">A primeira foto da lista é a capa no site. As fotos são comprimidas automaticamente (até ${MAX_FOTOS_SERVICO}). Arraste as miniaturas para reordenar e use ⤡ para ajustar o enquadramento.</p>
          <div class="galeria-produto__grid" id="galeria-grid-servico"></div>
          <label class="galeria-produto__upload">
            ${icon("plus")}Escolher arquivos
            <input type="file" id="input-galeria-servico" accept="image/*" multiple hidden>
          </label>
        </div>

        <label>Descrição curta (aparece no card)
          <textarea name="descricaoCurta" rows="2" maxlength="180" placeholder="Uma frase que resume o serviço. Ex.: Remove impurezas e renova a pele do rosto.">${escHtml(servico?.descricaoCurta || "")}</textarea>
        </label>
        <label>O que é este serviço?
          <textarea name="descricao" rows="4" placeholder="Explique o que é o procedimento e o que ele faz pela cliente.">${escHtml(servico?.descricao || "")}</textarea>
        </label>
        <label>Como funciona (passo a passo) <span class="svc-admin__dica">— um passo por linha</span>
          <textarea name="comoFunciona" rows="4" placeholder="Avaliação da pele&#10;Higienização&#10;Extração&#10;Máscara e finalização">${linhas(servico?.comoFunciona)}</textarea>
        </label>
        <label>Benefícios <span class="svc-admin__dica">— um por linha</span>
          <textarea name="beneficios" rows="3" placeholder="Pele mais limpa e uniforme&#10;Previne cravos e acne">${linhas(servico?.beneficios)}</textarea>
        </label>
        <label>Indicado para <span class="svc-admin__dica">— um por linha</span>
          <textarea name="indicadoPara" rows="3" placeholder="Pele oleosa ou com cravos&#10;Quem busca manutenção mensal">${linhas(servico?.indicadoPara)}</textarea>
        </label>
        <label>Cuidados e contraindicações
          <textarea name="cuidados" rows="3" placeholder="Evitar sol por 48h após o procedimento. Não indicado para gestantes sem liberação médica.">${escHtml(servico?.cuidados || "")}</textarea>
        </label>
      </div>
      <footer class="form-actions product-form__actions">
        <button type="button" data-modal-close-dialog>Cancelar</button>
        <button type="submit" class="btn-primary">Salvar</button>
      </footer>
    </form>`;

  dialog.showModal();
  dialog.querySelectorAll("[data-modal-close-dialog]").forEach(b => b.addEventListener("click", () => dialog.close()));

  const form = dialog.querySelector("#form-servico");

  // subcategorias dependem da categoria escolhida
  const selCat = form.categoriaId;
  const selSub = form.subcategoriaId;
  function preencherSubcategorias(subSelecionada = "") {
    const filhas = categorias
      .filter(c => c.parentId === selCat.value)
      .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0));
    selSub.innerHTML = `<option value="">${filhas.length ? "Nenhuma" : "Sem subcategorias"}</option>` +
      filhas.map(f => `<option value="${f.id}" ${subSelecionada === f.id ? "selected" : ""}>${escHtml(f.nome)}</option>`).join("");
    selSub.disabled = !filhas.length;
  }
  preencherSubcategorias(servico?.subcategoriaId || "");
  selCat.addEventListener("change", () => preencherSubcategorias(""));

  // ----- galeria -----
  const grid = dialog.querySelector("#galeria-grid-servico");
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

    grid.querySelectorAll("[data-ajustar]").forEach(btn => btn.addEventListener("click", () => {
      const item = galeria.find(g => g.id === btn.dataset.ajustar);
      if (!item || !ajuda.abrirAjusteEnquadramento) return;
      ajuda.abrirAjusteEnquadramento(item.previewUrl || item.url, (novaUrl) => {
        if (item.previewUrl) item.previewUrl = novaUrl; else item.url = novaUrl;
        renderizarGaleria();
      });
    }));

    grid.querySelectorAll("[data-remover]").forEach(btn => btn.addEventListener("click", async () => {
      const ok = await confirmarAcao("Remover esta foto do serviço?", { titulo: "Remover imagem" });
      if (!ok) return;
      const item = galeria.find(g => g.id === btn.dataset.remover);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      galeria = galeria.filter(g => g.id !== btn.dataset.remover);
      renderizarGaleria();
    }));

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

  dialog.querySelector("#input-galeria-servico").addEventListener("change", (e) => {
    [...e.target.files].forEach(file => {
      galeria.push({ id: crypto.randomUUID(), url: null, file, previewUrl: URL.createObjectURL(file) });
    });
    e.target.value = "";
    renderizarGaleria();
  });

  // ----- salvar -----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btnSalvar = form.querySelector('button[type="submit"]');
    const nome = form.nome.value.trim();
    if (!nome) return;
    btnSalvar.disabled = true;

    try {
      if (galeria.length > MAX_FOTOS_SERVICO) {
        throw new Error(`Use no máximo ${MAX_FOTOS_SERVICO} fotos por serviço.`);
      }
      const pendentes = galeria.filter(g => g.file);
      for (let i = 0; i < pendentes.length; i++) {
        btnSalvar.textContent = `Comprimindo foto ${i + 1}/${pendentes.length}...`;
        const url = await comprimirParaBase64(pendentes[i].file, { maxLargura: 800, maxBytes: 120 * 1024 });
        const posSalva = imgPos(pendentes[i].previewUrl || "").pos;
        pendentes[i].url = posSalva !== "50% 50%" ? `${url}#pos=${posSalva.replace(/%/g, "").replace(" ", ",")}` : url;
        if (pendentes[i].previewUrl) URL.revokeObjectURL(pendentes[i].previewUrl);
        pendentes[i].file = null;
        pendentes[i].previewUrl = null;
      }

      const precoNum = parseFloat(form.preco.value);
      const imagens = galeria.map(g => g.url).filter(Boolean);
      if (bytesTotais(imagens) > LIMITE_FOTOS_DOC_BYTES) {
        throw new Error("As fotos juntas passam do limite do banco de dados. Remova alguma foto.");
      }
      const dados = {
        nome,
        codigo: form.codigo.value.trim() || generateCode("SERV"),
        categoriaId: form.categoriaId.value,
        subcategoriaId: form.categoriaId.value ? form.subcategoriaId.value : "",
        duracao: form.duracao.value.trim(),
        preco: Number.isFinite(precoNum) && precoNum > 0 ? precoNum : 0,
        status: form.status.value === "oculto" ? "oculto" : "disponivel",
        sessoes: form.sessoes.value.trim(),
        descricaoCurta: form.descricaoCurta.value.trim(),
        descricao: form.descricao.value.trim(),
        comoFunciona: paraLista(form.comoFunciona.value),
        beneficios: paraLista(form.beneficios.value),
        indicadoPara: paraLista(form.indicadoPara.value),
        cuidados: form.cuidados.value.trim(),
        imagens,
        imagem: imagens[0] || ""
      };

      if (servico) {
        await atualizarServico(servico.id, dados);
        toast("Serviço atualizado.");
      } else {
        await criarServico(dados);
        toast("Serviço cadastrado.");
      }
      dialog.close();
      await recarregarEDesenhar(container);
    } catch (erro) {
      falha("salvar o serviço", erro);
    } finally {
      if (dialog.open) {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar";
      }
    }
  });
}

function paraLista(valor) {
  if (Array.isArray(valor)) return valor.map(v => String(v).trim()).filter(Boolean);
  return String(valor || "").split("\n").map(l => l.trim()).filter(Boolean);
}

// ---------- IMPORTAÇÃO JSON ----------
function criarPromptImportacaoServicos() {
  const arvore = montarArvoreCategorias(categorias);
  const existentes = arvore.length
    ? arvore.map(c => `- ${c.nome}`).join("\n")
    : "- Nenhuma categoria cadastrada ainda.";

  return `Crie e entregue um ARQUIVO para download chamado "servicos-importacao.json" para importar SERVIÇOS no painel do Espaço Viviane Vargas (estética e salão de beleza).

Não responda com explicações, texto comum, Markdown ou blocos de código. Gere o arquivo .json anexável/baixável; o conteúdo do arquivo deve ser somente JSON válido.

REGRA PRINCIPAL: o arquivo deve criar APENAS serviços. NÃO crie, invente nem sugira categorias novas. Use somente as categorias que já existem no painel (lista no final). NÃO use subcategorias: o campo "subcategoria" não existe neste arquivo. Só crie categorias/subcategorias se eu pedir isso de forma explícita nesta conversa (veja a seção "Somente se eu pedir categorias novas").

O arquivo deve ter exatamente esta estrutura:
{
  "servicos": [
    {
      "nome": "Limpeza de pele",
      "categoria": "Estética",
      "descricaoCurta": "Frase curta que aparece no card do serviço.",
      "descricao": "Explicação do que é o serviço e o que ele faz pela cliente.",
      "comoFunciona": ["Avaliação da pele", "Higienização", "Extração", "Máscara e finalização"],
      "beneficios": ["Pele mais limpa", "Previne cravos"],
      "indicadoPara": ["Pele oleosa", "Manutenção mensal"],
      "cuidados": "Evitar sol por 48h após o procedimento.",
      "duracao": "60 min",
      "sessoes": "1 sessão a cada 30 dias",
      "status": "disponivel",
      "codigo": "SERV-LIMPEZA-001",
      "imagens": ["https://url-publica-da-imagem.webp"]
    }
  ]
}

Regras obrigatórias:
- Só "nome" é obrigatório em cada serviço. Todos os outros campos são opcionais; omita o que não souber.
- "categoria" deve ser EXATAMENTE como aparece na lista de categorias já cadastradas (mesma grafia).
- NUNCA use "subcategoria". Todo serviço fica direto na categoria, sem subcategoria.
- Se nenhuma categoria existente servir para o serviço, omita "categoria". Nunca invente um nome que não está na lista: serviços com categoria inexistente são rejeitados na importação.
- "descricaoCurta": uma frase de até 180 caracteres. "descricao": explique de forma clara e simples o que o serviço é e o que ele faz.
- "comoFunciona", "beneficios" e "indicadoPara" são listas de textos curtos. "cuidados" é um texto.
- "preco": NÃO invente preço e não use valor de exemplo. Omita o campo "preco" em todos os serviços (ficam "sob consulta" e eu defino o valor depois no painel). Só inclua "preco" se eu informar o valor de um serviço específico; nesse caso é número puro (sem R$, vírgula ou texto).
- "status": omita (o padrão é "disponivel"); use "oculto" só se eu pedir.
- "imagens" é opcional e só aceita URLs públicas HTTPS. Sem foto, o serviço aparece no site com imagem padrão.
- Não use comentários, reticências, texto fora do JSON, vírgula depois do último campo, base64, arquivo local ou URL privada.

Somente se eu pedir categorias novas (caso contrário, ignore esta seção):
- Se eu pedir explicitamente para criar categorias e/ou subcategorias, acrescente no topo do JSON o campo "criarCategorias": true e use "categoria" (e "subcategoria", só se eu pedir subcategorias) nos serviços com os nomes novos que eu pedi. Crie somente as que eu pedi, nenhuma além delas.
- Sem esse pedido explícito, NÃO inclua "criarCategorias" e NÃO use nomes que não estejam na lista abaixo.

Categorias já cadastradas no painel agora:
${existentes}`;
}

function paraListaImport(v) {
  if (Array.isArray(v)) return v.map(x => String(x ?? "").trim()).filter(Boolean);
  if (typeof v === "string") return v.split("\n").map(l => l.trim()).filter(Boolean);
  return [];
}

function normalizarServicoImportado(item) {
  const bruto = typeof item === "string" ? { nome: item } : (item && typeof item === "object" ? item : {});
  const nome = String(bruto.nome || "").trim();
  if (!nome) return { ok: false, nome: "(sem nome)", erros: ["nome ausente"] };

  const precoNum = Number(String(bruto.preco ?? "").replace(",", "."));
  const imagens = (Array.isArray(bruto.imagens) ? bruto.imagens : (bruto.imagem ? [bruto.imagem] : []))
    .map(u => String(u || "").trim()).filter(u => /^https:\/\//i.test(u));

  return {
    ok: true,
    dados: {
      nome,
      codigo: String(bruto.codigo || "").trim() || generateCode("SERV"),
      duracao: String(bruto.duracao || "").trim(),
      preco: Number.isFinite(precoNum) && precoNum > 0 ? precoNum : 0,
      status: bruto.status === "oculto" ? "oculto" : "disponivel",
      sessoes: String(bruto.sessoes || "").trim(),
      descricaoCurta: String(bruto.descricaoCurta || "").trim().slice(0, 180),
      descricao: String(bruto.descricao || "").trim(),
      comoFunciona: paraListaImport(bruto.comoFunciona),
      beneficios: paraListaImport(bruto.beneficios),
      indicadoPara: paraListaImport(bruto.indicadoPara),
      cuidados: Array.isArray(bruto.cuidados) ? bruto.cuidados.map(String).join("\n") : String(bruto.cuidados || "").trim(),
      imagens,
      imagem: imagens[0] || ""
    }
  };
}

/** Converte qualquer formato aceito em: { categorias: [{nome, subs:[nome]}], servicos: [{categoria, subcategoria, item}], permitirCriar } — categorias novas só são criadas se o JSON trouxer "criarCategorias": true. */
function lerEstruturaImportada(json) {
  const cats = [];
  const itens = [];
  let permitirCriar = false;
  let listaCats = [];
  let listaServicos = [];

  if (Array.isArray(json)) {
    const pareceCategoria = json.some(i => i && typeof i === "object" && (Array.isArray(i.servicos) || Array.isArray(i.subcategorias)));
    if (pareceCategoria) listaCats = json; else listaServicos = json;
  } else if (json && typeof json === "object") {
    listaCats = Array.isArray(json.categorias) ? json.categorias : [];
    listaServicos = Array.isArray(json.servicos) ? json.servicos : [];
    permitirCriar = json.criarCategorias === true;
  } else {
    return null;
  }

  for (const cat of listaCats) {
    const nomeCat = String(typeof cat === "string" ? cat : cat?.nome || "").trim();
    if (!nomeCat) continue;
    const entrada = { nome: nomeCat, subs: [] };
    cats.push(entrada);
    if (typeof cat === "string") continue;

    for (const sub of (Array.isArray(cat.subcategorias) ? cat.subcategorias : [])) {
      const nomeSub = String(typeof sub === "string" ? sub : sub?.nome || "").trim();
      if (!nomeSub) continue;
      entrada.subs.push(nomeSub);
      if (typeof sub === "object") {
        for (const s of (Array.isArray(sub.servicos) ? sub.servicos : [])) {
          itens.push({ categoria: nomeCat, subcategoria: nomeSub, item: s });
        }
      }
    }
    for (const s of (Array.isArray(cat.servicos) ? cat.servicos : [])) {
      const nomeSub = typeof s === "object" ? String(s?.subcategoria || "").trim() : "";
      if (nomeSub && !entrada.subs.some(x => normalizarTexto(x) === normalizarTexto(nomeSub))) entrada.subs.push(nomeSub);
      itens.push({ categoria: nomeCat, subcategoria: nomeSub, item: s });
    }
  }

  for (const s of listaServicos) {
    const obj = typeof s === "object" && s ? s : {};
    itens.push({
      categoria: String(obj.categoria || "").trim(),
      subcategoria: String(obj.subcategoria || "").trim(),
      item: s
    });
  }
  return { categorias: cats, servicos: itens, permitirCriar };
}

async function importarServicosJson(container, arquivo) {
  const dialog = container.querySelector("#dialog-importar-json-servicos");
  const resultado = container.querySelector("#resultado-importacao-json-servicos");

  let estrutura;
  try {
    estrutura = lerEstruturaImportada(JSON.parse(await arquivo.text()));
    if (!estrutura) throw new Error("formato");
  } catch {
    toast("Arquivo JSON inválido. Use o formato { \"servicos\": [...] } gerado pelo botão Prompt para IA.", "error");
    return;
  }
  if (!estrutura.categorias.length && !estrutura.servicos.length) {
    toast("O arquivo não tem nenhuma categoria ou serviço.", "error");
    return;
  }

  const criadasCats = [];
  const invalidos = [];
  let importados = 0;
  let atualizados = 0;
  let ordem = Date.now();

  // Busca categoria por nome (ignora maiúsculas/acentos). Só cria se o JSON
  // pediu explicitamente ("criarCategorias": true); senão devolve null.
  async function garantirCategoria(nome, parentId = "") {
    const achada = categorias.find(c => (c.parentId || "") === parentId && normalizarTexto(c.nome) === normalizarTexto(nome));
    if (achada) return achada.id;
    if (!estrutura.permitirCriar) return null;
    const id = await criarCategoriaServico({ nome, parentId, ordem: ordem++ }, { silencioso: true });
    categorias.push({ id, nome, parentId, ordem });
    criadasCats.push(parentId ? `${categorias.find(c => c.id === parentId)?.nome} › ${nome}` : nome);
    return id;
  }

  try {
    if (estrutura.permitirCriar) {
      for (const cat of estrutura.categorias) {
        const idCat = await garantirCategoria(cat.nome);
        for (const sub of cat.subs) await garantirCategoria(sub, idCat);
      }
    }

    for (let i = 0; i < estrutura.servicos.length; i++) {
      const { categoria, subcategoria, item } = estrutura.servicos[i];
      const r = normalizarServicoImportado(item);
      if (!r.ok) { invalidos.push({ linha: i + 1, nome: r.nome, erros: r.erros }); continue; }

      let categoriaId = "";
      let subcategoriaId = "";
      if (categoria) {
        categoriaId = await garantirCategoria(categoria);
        if (!categoriaId) { invalidos.push({ linha: i + 1, nome: r.dados.nome, erros: [`a categoria "${categoria}" não existe no painel (categorias não são criadas automaticamente)`] }); continue; }
        if (subcategoria && estrutura.permitirCriar) {
          subcategoriaId = await garantirCategoria(subcategoria, categoriaId);
          if (!subcategoriaId) { invalidos.push({ linha: i + 1, nome: r.dados.nome, erros: [`a subcategoria "${subcategoria}" não existe em "${categoria}"`] }); continue; }
        }
      }

      const existenteNaCategoria = servicos.find(s =>
        normalizarTexto(s.nome) === normalizarTexto(r.dados.nome) &&
        (s.categoriaId || "") === categoriaId && (s.subcategoriaId || "") === subcategoriaId);
      // Arquivos antigos podiam criar serviços sem categoria. Ao importar o
      // mesmo nome em uma categoria válida, move esse registro em vez de criar
      // outro igual ou deixá-lo invisível na categoria escolhida.
      const existenteSemCategoria = categoriaId && !subcategoriaId
        ? servicos.find(s => normalizarTexto(s.nome) === normalizarTexto(r.dados.nome) &&
          !(s.categoriaId || "") && !(s.subcategoriaId || ""))
        : null;
      const existente = existenteNaCategoria || existenteSemCategoria;

      const dados = { ...r.dados, categoriaId, subcategoriaId, ordem: ordem++ };
      // Reimportar o mesmo arquivo deve corrigir o cadastro existente, e não
      // escondê-lo atrás de uma mensagem de duplicidade.
      if (existente) {
        await atualizarServico(existente.id, dados, { silencioso: true });
        Object.assign(existente, dados);
        atualizados++;
        continue;
      }
      const id = await criarServico(dados, { silencioso: true });
      servicos.push({ id, ...dados });
      importados++;
    }
  } catch (erro) {
    falha("concluir a importação", erro);
  } finally {
    await finalizarImportacaoServicos();
  }

  resultado.innerHTML = `
    <p><strong>${importados}</strong> serviço(s) importado(s) com sucesso.</p>
    ${atualizados ? `<p><strong>${atualizados}</strong> serviço(s) existente(s) atualizado(s) e deixado(s) como disponível(is).</p>` : ""}
    ${criadasCats.length ? `<p><strong>${criadasCats.length}</strong> categoria(s)/subcategoria(s) criada(s): ${criadasCats.map(escHtml).join(", ")}.</p>` : ""}
    ${invalidos.length ? `
      <p><strong>${invalidos.length}</strong> ignorado(s):</p>
      <ul class="import-result__errors">
        ${invalidos.map(e => `<li>#${e.linha} "${escHtml(e.nome)}": ${escHtml(e.erros.join(", "))}</li>`).join("")}
      </ul>` : ""}`;

  dialog.querySelector("#btn-fechar-importacao-servicos").onclick = async () => {
    dialog.close();
    await recarregarEDesenhar(container);
  };
  dialog.showModal();
  if (importados) toast(`${importados} serviço(s) importado(s).`);
}
