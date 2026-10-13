// js/services/firestore.js
import { db } from "../../firebase/firebase-config.js";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, setDoc,
  query, where, orderBy, limit, startAfter, serverTimestamp, increment,
  runTransaction, getCountFromServer, getAggregateFromServer, sum, writeBatch, documentId
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { withLoading } from "../utils/loadingManager.js";
import { sinalizarAtualizacaoPublica } from "./public-sync.js";

// ---------- CACHE COM TTL (reduz leituras repetidas do Firestore) ----------
// Cada página (home, catálogo, produto) importa este módulo de forma
// independente, então sem isso um único visitante navegando por 3 páginas
// já dispara 3 leituras completas de "categorias", 3 de "marcas" etc. Como
// esses dados mudam pouco, cacheamos em sessionStorage por alguns minutos —
// cai drasticamente o consumo de cota do Firestore sem afetar UX (o admin
// sempre invalida o cache ao salvar uma mudança, ver invalidarCache abaixo).
const TTL_PADRAO_MS = 5 * 60 * 1000; // 5 min
const cacheMemoria = new Map();
const requisicoesPendentes = new Map();
const metricasLeitura = { rede: 0, cache: 0, deduplicadas: 0 };

function lerCache(chave) {
  const emMemoria = cacheMemoria.get(chave);
  if (emMemoria && Date.now() <= emMemoria.expiraEm) return emMemoria.valor;
  if (emMemoria) cacheMemoria.delete(chave);

  try {
    const bruto = sessionStorage.getItem(`fcache:${chave}`);
    if (!bruto) return undefined;
    const { valor, expiraEm } = JSON.parse(bruto);
    if (Date.now() > expiraEm) {
      sessionStorage.removeItem(`fcache:${chave}`);
      return undefined;
    }
    cacheMemoria.set(chave, { valor, expiraEm });
    return valor;
  } catch {
    return undefined;
  }
}

function salvarCache(chave, valor, ttlMs = TTL_PADRAO_MS) {
  const expiraEm = Date.now() + ttlMs;
  cacheMemoria.set(chave, { valor, expiraEm });
  try {
    sessionStorage.setItem(`fcache:${chave}`, JSON.stringify({ valor, expiraEm }));
  } catch {
    // sessionStorage cheio/indisponível (modo privado) — segue sem cache.
  }
}

function atualizarCacheLista(chave, atualizar, ttlMs = TTL_PADRAO_MS) {
  const atual = lerCache(chave);
  if (Array.isArray(atual)) salvarCache(chave, atualizar(atual), ttlMs);
}

/**
 * Chame após criar/editar/excluir para a próxima leitura vir atualizada.
 * Remove tanto a chave exata quanto variantes com argumentos (ex:
 * "listarProdutosDestaque:[8]"), já que comCache() sufixa a chave com os
 * argumentos recebidos.
 */
export function invalidarCache(chave) {
  for (const k of cacheMemoria.keys()) {
    if (k === chave || k.startsWith(`${chave}:`)) cacheMemoria.delete(k);
  }
  try {
    Object.keys(sessionStorage)
      .filter((k) => k === `fcache:${chave}` || k.startsWith(`fcache:${chave}:`))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch { /* ignora */ }
}

/** Envolve uma função assíncrona de leitura com cache em sessionStorage. */
function comCache(chave, ttlMs, fn) {
  return async (...args) => {
    const chaveCompleta = args.length ? `${chave}:${JSON.stringify(args)}` : chave;
    const emCache = lerCache(chaveCompleta);
    if (emCache !== undefined) {
      metricasLeitura.cache += 1;
      return emCache;
    }

    // Se duas partes da página pedirem o mesmo dado ao mesmo tempo, ambas
    // aguardam a mesma Promise. Sem isso, o cache só era preenchido depois da
    // resposta e as duas consultas idênticas chegavam ao Firestore.
    if (requisicoesPendentes.has(chaveCompleta)) {
      metricasLeitura.deduplicadas += 1;
      return requisicoesPendentes.get(chaveCompleta);
    }

    metricasLeitura.rede += 1;
    const requisicao = Promise.resolve(fn(...args))
      .then((valor) => {
        salvarCache(chaveCompleta, valor, ttlMs);
        return valor;
      })
      .finally(() => requisicoesPendentes.delete(chaveCompleta));
    requisicoesPendentes.set(chaveCompleta, requisicao);
    return requisicao;
  };
}

if (typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(location.hostname)) {
  window.__firestoreCacheDebug = {
    metricas: () => ({ ...metricasLeitura, pendentes: requisicoesPendentes.size, emMemoria: cacheMemoria.size }),
    limpar: () => { cacheMemoria.clear(); requisicoesPendentes.clear(); }
  };
}

// ---------- CAMPOS DERIVADOS (pra filtrar no catálogo sem baixar tudo) ----------
/**
 * Bucket de preço fixo — os mesmos 4 intervalos mostrados no filtro do catálogo.
 * Precisa bater com as opções em pages/catalogo.html (data-grupo="preco").
 */
export function calcularFaixaPreco(preco) {
  const p = Number(preco) || 0;
  if (p <= 5) return "0-5";
  if (p <= 15) return "5-15";
  if (p <= 30) return "15-30";
  return "30-";
}

function calcularDisponivel(status, quantidade) {
  return status !== "sem_estoque" && status !== "oculto" && Number(quantidade) > 0;
}

const STATUS_PUBLICOS = ["disponivel", "sem_estoque", "esgotado"];
const TAMANHO_PAGINA_ADMIN = 30;

/** Página com cursor para coleções administrativas. Traz um item extra para
 * saber se existe próxima página, sem fazer uma consulta count(). */
export async function listarPaginaAdmin(nomeColecao, { tamanho = TAMANHO_PAGINA_ADMIN, cursor = null, ordenarPor = "", direcao = "asc" } = {}) {
  const clausulas = [];
  if (ordenarPor) clausulas.push(orderBy(ordenarPor, direcao));
  clausulas.push(limit(tamanho + 1));
  if (cursor) clausulas.push(startAfter(cursor));
  const snap = await getDocs(query(collection(db, nomeColecao), ...clausulas));
  const docs = snap.docs.slice(0, tamanho);
  return {
    itens: docs.map(item => ({ id: item.id, ...item.data() })),
    cursor: docs.at(-1) || cursor,
    temMais: snap.docs.length > tamanho
  };
}

// Listas do painel usam o mesmo cursor. Não ordenamos por campos opcionais
// aqui porque cadastros antigos podem não ter esses campos e sumiriam da tela.
export const listarCategoriasPagina = (opcoes = {}) => withLoading("listarCategoriasPagina", () => listarPaginaAdmin("categorias", opcoes));
export const listarMarcasPagina = (opcoes = {}) => withLoading("listarMarcasPagina", () => listarPaginaAdmin("marcas", opcoes));
export const listarEtiquetasPagina = (opcoes = {}) => withLoading("listarEtiquetasPagina", () => listarPaginaAdmin("etiquetas", opcoes));
export const listarClientesPagina = (opcoes = {}) => withLoading("listarClientesPagina", () => listarPaginaAdmin("clientes", opcoes));
export const listarUsuariosPagina = (opcoes = {}) => withLoading("listarUsuariosPagina", () => listarPaginaAdmin("usuarios", opcoes));

// Índice leve de busca para o painel. O Firestore não faz pesquisa por texto
// livre; por isso salvamos os prefixos das palavras relevantes do produto.
// Ex.: "Caneta Gel Azul" gera "c", "ca", "can...", "g", "ge", "gel".
// Assim a busca encontra tanto nome quanto marca, categoria e código sem
// baixar a coleção inteira para o navegador.
function normalizarTermoBusca(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    // Pontuação não faz parte de uma palavra de busca. Sem isso,
    // "VICTORIA'S SECRET" era tratado como "victoria's" (com apóstrofo),
    // diferente do token salvo "victoria".
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function criarTokensBusca(dados = {}) {
  const campos = [dados.nome, dados.marca, dados.categoria, dados.codigo];
  const tokens = new Set();
  campos.forEach(campo => {
    const palavras = normalizarTermoBusca(campo).split(/[^a-z0-9]+/).filter(Boolean);
    palavras.forEach(palavra => {
      // O limite evita que um nome excessivamente longo infle o documento.
      const ate = Math.min(palavra.length, 40);
      for (let i = 1; i <= ate; i += 1) tokens.add(palavra.slice(0, i));
    });
  });
  return [...tokens];
}

function produtoCombinaComBusca(produto, termo) {
  const palavras = normalizarTermoBusca(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return true;
  const texto = [produto.nome, produto.marca, produto.categoria, produto.codigo]
    .map(normalizarTermoBusca).join(" ");
  return palavras.every(palavra => texto.split(/[^a-z0-9]+/).some(item => item.startsWith(palavra)));
}

// Produtos podem guardar fotos na capa, na galeria ou nas variações de cor.
// Este teste é usado apenas no filtro administrativo "Sem fotos", evitando
// uma consulta composta que exigiria um índice extra no Firebase.
function produtoTemFotoCadastrada(produto = {}) {
  const temUrl = (valor) => typeof valor === "string" && valor.trim().length > 0;
  return temUrl(produto.imagem) ||
    (Array.isArray(produto.imagens) && produto.imagens.some(temUrl)) ||
    (Array.isArray(produto.cores) && produto.cores.some(cor =>
      temUrl(cor?.imagem) || (Array.isArray(cor?.imagens) && cor.imagens.some(temUrl))));
}

// ---------- PRODUTOS ----------
export function listarProdutos({ apenasAtivos = true } = {}) {
  return withLoading("listarProdutos", async () => {
    const col = collection(db, "produtos");
    // A regra pública do Firestore só permite listar produtos visíveis.
    // A consulta precisa declarar este filtro para o Firestore conseguir
    // provar que um item "oculto" nunca será retornado.
    const snap = await getDocs(apenasAtivos
      ? query(col, where("status", "in", STATUS_PUBLICOS))
      : col);
    let produtos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (apenasAtivos) produtos = produtos.filter(p => p.status !== "oculto");
    return produtos;
  });
}

/**
 * Busca uma "página" de produtos direto do Firestore usando cursor
 * (startAfter), em vez de baixar a coleção inteira. Use isto em vez de
 * listarProdutos() sempre que a tela não precisar de 100% do catálogo
 * de uma vez (home, catálogo público, telas administrativas com lista).
 *
 * @param {Object} opts
 * @param {number} opts.tamanho - quantos produtos trazer nesta página
 * @param {any} opts.cursor - o último doc da página anterior (snap.docs.at(-1)), ou null na primeira página
 * @param {string} opts.categoria - filtro opcional exato de categoria
 * @param {boolean} opts.apenasAtivos - exclui produtos com status "oculto"
 * @returns {Promise<{produtos: object[], cursor: any, temMais: boolean}>}
 */
export function listarProdutosPagina({ tamanho = 20, cursor = null, categoria = "", apenasAtivos = true, semFoto = false, ordenarPor = "nome", direcao = "asc" } = {}) {
  return withLoading("listarProdutosPagina", async () => {
    const col = collection(db, "produtos");
    const clausulas = [orderBy(ordenarPor, direcao)];
    if (categoria) clausulas.unshift(where("categoria", "==", categoria));
    if (apenasAtivos) clausulas.unshift(where("status", "in", STATUS_PUBLICOS));
    // O filtro sem fotos é pouco usado e precisa considerar galeria/cores. A
    // filtragem ocorre no painel para não exigir índice composto no Firebase.
    const tamanhoLeitura = semFoto ? Math.max(50, tamanho + 1) : tamanho + 1;
    const encontrados = [];
    let cursorLeitura = cursor;
    let acabou = false;

    while (!acabou && encontrados.length <= tamanho) {
      const restricoes = [...clausulas, limit(tamanhoLeitura)];
      if (cursorLeitura) restricoes.push(startAfter(cursorLeitura));
      const snap = await getDocs(query(col, ...restricoes));
      if (!snap.docs.length) { acabou = true; break; }

      snap.docs.forEach(docProduto => {
        const produto = { id: docProduto.id, ...docProduto.data() };
        if (!semFoto || !produtoTemFotoCadastrada(produto)) encontrados.push({ docProduto, produto });
      });
      cursorLeitura = snap.docs.at(-1);
      acabou = snap.docs.length < tamanhoLeitura;
      if (!semFoto) break;
    }

    const pagina = encontrados.slice(0, tamanho);
    const temMais = encontrados.length > tamanho || !acabou;
    return {
      produtos: pagina.map(item => item.produto),
      cursor: pagina.at(-1)?.docProduto || cursorLeitura || cursor,
      temMais
    };
  });
}

/**
 * Busca administrativa por nome, marca, categoria e código. Produtos novos
 * usam buscaTokens; o fallback mantém compatibilidade com os cadastros antigos.
 * Não limita por status: o painel também precisa encontrar ocultos e esgotados.
 */
const cacheBuscaAdmin = new Map(); // chave -> { expiraEm, resultado }
const TTL_BUSCA_ADMIN_MS = 60 * 1000;

export function buscarProdutosPorPrefixo(termo, { tamanho = 20, cursor = null, semFoto = false } = {}) {
  // Quem apaga uma letra e digita de novo, ou volta uma página, repete a mesma
  // consulta: respondemos da memória em vez de ler os documentos outra vez.
  const chave = `${normalizarTermoBusca(termo)}|${tamanho}|${semFoto ? 1 : 0}|${cursor?.id || ""}`;
  const guardado = cacheBuscaAdmin.get(chave);
  if (guardado && guardado.expiraEm > Date.now()) return Promise.resolve(guardado.resultado);
  return buscarProdutosPorPrefixoNoServidor(termo, { tamanho, cursor, semFoto }).then((resultado) => {
    if (cacheBuscaAdmin.size > 50) cacheBuscaAdmin.clear();
    cacheBuscaAdmin.set(chave, { expiraEm: Date.now() + TTL_BUSCA_ADMIN_MS, resultado });
    return resultado;
  });
}

function buscarProdutosPorPrefixoNoServidor(termo, { tamanho = 20, cursor = null, semFoto = false } = {}) {
  return withLoading("buscarProdutosPorPrefixo", async () => {
    const termoOriginal = String(termo || "").trim();
    const termoLimpo = normalizarTermoBusca(termoOriginal);
    if (!termoLimpo) return { produtos: [], cursor: null, temMais: false };

    const primeiraPalavra = termoLimpo.split(/\s+/)[0];
    const col = collection(db, "produtos");

    // Código é uma identificação exata: tentamos este caminho primeiro para
    // devolver o produto certo com o menor número de documentos lidos.
    const porCodigo = cursor ? null : await getDocs(query(
      col, where("codigo", "==", termoOriginal), limit(1)
    ));
    const encontradosPorCodigo = (porCodigo?.docs || [])
      .map(docProduto => ({ id: docProduto.id, ...docProduto.data() }))
      .filter(produto => normalizarTermoBusca(produto.codigo) === termoLimpo)
      .filter(produto => !semFoto || !produtoTemFotoCadastrada(produto));
    if (encontradosPorCodigo.length) {
      return { produtos: encontradosPorCodigo.slice(0, tamanho), cursor: null, temMais: false };
    }

    // Caminho rápido para produtos novos e para os antigos já preparados.
    // O filtro final permite digitar mais de uma palavra sem novas leituras.
    const clausulasIndexados = [
      where("buscaTokens", "array-contains", primeiraPalavra),
      limit(tamanho + 1)
    ];
    if (cursor) clausulasIndexados.splice(1, 0, startAfter(cursor));
    const indexados = await getDocs(query(col, ...clausulasIndexados));
    const docsIndexados = indexados.docs.slice(0, tamanho);
    const encontradosIndexados = indexados.docs
      .map(docProduto => ({ id: docProduto.id, ...docProduto.data() }))
      .filter(produto => produtoCombinaComBusca(produto, termoLimpo))
      .filter(produto => !semFoto || !produtoTemFotoCadastrada(produto))
      .slice(0, tamanho);

    if (encontradosIndexados.length || cursor) {
      const produtos = encontradosIndexados
        .sort((a, b) => COLATOR_NOMES.compare(String(a.nome), String(b.nome)))
      return {
        produtos,
        cursor: docsIndexados.at(-1) || cursor,
        temMais: indexados.docs.length > tamanho
      };
    }

    // Compatibilidade temporária: produtos cadastrados antes do índice ainda
    // respondem se o termo estiver no início do nome. O botão "Preparar busca"
    // do painel converte todos os antigos para a busca completa uma única vez.
    const variantes = [...new Set([
      termoLimpo,
      termoLimpo.toLowerCase(),
      termoLimpo.toUpperCase(),
      termoLimpo.charAt(0).toUpperCase() + termoLimpo.slice(1).toLowerCase()
    ])];
    const resultados = await Promise.all(variantes.map(inicio => getDocs(query(
      col,
      orderBy("nome"),
      where("nome", ">=", inicio),
      where("nome", "<=", inicio + "\uf8ff"),
      limit(tamanho)
    ))));
    const porId = new Map();
    resultados.flatMap(snap => snap.docs).forEach(docProduto => {
      porId.set(docProduto.id, { id: docProduto.id, ...docProduto.data() });
    });
    const produtos = [...porId.values()]
      .filter(produto => !semFoto || !produtoTemFotoCadastrada(produto))
      .sort((a, b) => COLATOR_NOMES.compare(String(a.nome), String(b.nome)))
      .slice(0, tamanho);
    return {
      produtos,
      cursor: null,
      temMais: resultados.some(snap => snap.docs.length === tamanho)
    };
  });
}

/**
 * Reconstrói o índice de busca de todo o catálogo. É uma ação manual do
 * administrador, usada quando a lógica de pesquisa é aprimorada para que
 * produtos antigos e novos usem exatamente os mesmos termos.
 */
export function migrarIndiceBuscaProdutos(onProgresso) {
  return withLoading("migrarIndiceBuscaProdutos", async () => {
    const { writeBatch } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js");
    const snap = await getDocs(collection(db, "produtos"));
    const pendentes = snap.docs;
    const TAMANHO_LOTE = 400;
    let feitos = 0;
    for (let inicio = 0; inicio < pendentes.length; inicio += TAMANHO_LOTE) {
      const lote = pendentes.slice(inicio, inicio + TAMANHO_LOTE);
      const batch = writeBatch(db);
      lote.forEach(docProduto => batch.update(docProduto.ref, {
        buscaTokens: criarTokensBusca(docProduto.data())
      }));
      await batch.commit();
      feitos += lote.length;
      onProgresso?.(feitos, pendentes.length);
    }
    cacheBuscaAdmin.clear();
    return { total: pendentes.length };
  });
}

/**
 * Migração única: preenche faixaPreco/disponivel nos produtos que ainda não
 * têm esses campos (todo o catálogo importado antes dessa mudança). Depois
 * de rodada uma vez, criarProduto/atualizarProduto/ajustarEstoque mantêm os
 * dois campos sempre em dia sozinhos — não precisa rodar de novo.
 * Feito em lotes de 400 gravações (limite do writeBatch é 500) pra não
 * estourar limite de escrita/dia do plano gratuito de uma vez só.
 */
export function migrarCamposFiltroCatalogo(onProgresso) {
  return withLoading("migrarCamposFiltroCatalogo", async () => {
    const { writeBatch } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js");
    const snap = await getDocs(collection(db, "produtos"));
    const pendentes = snap.docs.filter(d => {
      const dados = d.data();
      return dados.faixaPreco === undefined || dados.disponivel === undefined;
    });

    const TAMANHO_LOTE = 400;
    let feitos = 0;
    for (let i = 0; i < pendentes.length; i += TAMANHO_LOTE) {
      const lote = pendentes.slice(i, i + TAMANHO_LOTE);
      const batch = writeBatch(db);
      lote.forEach(d => {
        const dados = d.data();
        batch.update(d.ref, {
          faixaPreco: calcularFaixaPreco(dados.preco),
          disponivel: calcularDisponivel(dados.status, dados.quantidade)
        });
      });
      await batch.commit();
      feitos += lote.length;
      onProgresso?.(feitos, pendentes.length);
    }
    return { total: pendentes.length };
  });
}

function produtoTemImagemPublica(produto = {}) {
  const temUrl = (url) => typeof url === "string" && url.trim().length > 0;
  return temUrl(produto.imagem)
    || (Array.isArray(produto.imagens) && produto.imagens.some(temUrl))
    || (Array.isArray(produto.cores) && produto.cores.some(cor =>
      temUrl(cor?.imagem) || (Array.isArray(cor?.imagens) && cor.imagens.some(temUrl))
    ));
}

function dataCriacaoProduto(produto) {
  return produto?.criadoEm?.seconds || 0;
}

/** Últimos N produtos cadastrados — usado na home ("Recentes"), sem baixar a coleção inteira. */
export const listarProdutosRecentes = comCache("listarProdutosRecentes:v3", 3 * 60 * 1000, (tamanho = 8) =>
  withLoading("listarProdutosRecentes", async () => {
    const col = collection(db, "produtos");
    const base = [where("status", "in", STATUS_PUBLICOS), orderBy("criadoEm", "desc")];

    // Alguns produtos mais novos podem ainda não ter foto, e a vitrine não pode
    // ficar vazia por causa deles. Antes líamos 40 documentos sempre; agora lemos
    // só alguns a mais que o necessário e buscamos outro lote apenas se faltar.
    const recentes = [];
    let ultimo = null;
    let lote = tamanho + 4;
    for (let rodada = 0; rodada < 3 && recentes.length < tamanho; rodada += 1) {
      const snap = await getDocs(query(col, ...base, ...(ultimo ? [startAfter(ultimo)] : []), limit(lote)));
      recentes.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(produtoTemImagemPublica));
      if (snap.docs.length < lote) break; // acabaram os produtos com data
      ultimo = snap.docs.at(-1);
      // Próximo lote proporcional ao que ainda falta, não um bloco fixo grande.
      lote = Math.max((tamanho - recentes.length) * 2 + 2, 8);
    }
    if (recentes.length >= tamanho) return recentes.slice(0, tamanho);

    // Cadastros antigos podem não ter criadoEm e, por isso, não entram em
    // uma consulta ordenada por data. Como alternativa, completa a seção
    // com produtos públicos que tenham foto, mantendo a ordenação disponível.
    const fallback = await getDocs(query(
      col,
      where("status", "in", STATUS_PUBLICOS),
      limit(Math.max(tamanho * 3, 24))
    ));
    const porId = new Map([...recentes, ...fallback.docs.map(d => ({ id: d.id, ...d.data() }))]
      .filter(produtoTemImagemPublica)
      .map(produto => [produto.id, produto]));
    return [...porId.values()]
      .sort((a, b) => dataCriacaoProduto(b) - dataCriacaoProduto(a))
      .slice(0, tamanho);
  })
);

/** Primeira página da home ("Produtos"), com cache. Antes era lida do servidor a cada visita. */
export const listarProdutosVitrine = comCache("listarProdutosVitrine", 3 * 60 * 1000, (tamanho = 8) =>
  listarProdutosPagina({ tamanho }).then(({ produtos }) => produtos)
);

const ETIQUETAS_DESTAQUE = ["Mais Vendido", "Promoção"];

/** Lê somente produtos que TÊM a etiqueta (um índice composto status + etiquetas atende). */
async function buscarDestaquesPorEtiqueta(tamanho) {
  const col = collection(db, "produtos");
  const snaps = await Promise.all(ETIQUETAS_DESTAQUE.map(etiqueta => getDocs(query(
    col,
    where("status", "in", STATUS_PUBLICOS),
    where("etiquetas", "array-contains", etiqueta),
    limit(tamanho)
  ))));
  const porId = new Map();
  snaps.forEach(snap => snap.docs.forEach(d => porId.set(d.id, { id: d.id, ...d.data() })));
  return [...porId.values()].filter(p => p.status !== "oculto").slice(0, tamanho);
}

/** Caminho antigo (sem índice novo): lê alguns produtos e filtra a etiqueta no navegador. */
async function buscarDestaquesLegado(tamanho) {
  const snap = await getDocs(query(
    collection(db, "produtos"),
    where("status", "in", STATUS_PUBLICOS),
    limit(Math.max(tamanho + 16, 24))
  ));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(p => Array.isArray(p.etiquetas) && p.etiquetas.some(etiqueta => ETIQUETAS_DESTAQUE.includes(etiqueta)))
    .slice(0, tamanho);
}

/** Produtos com etiqueta "Mais Vendido" ou "Promoção" — usado na home ("Destaques"). */
export const listarProdutosDestaque = comCache("listarProdutosDestaque", 3 * 60 * 1000, (tamanho = 8) =>
  withLoading("listarProdutosDestaque", async () => {
    // A leitura pública sempre é limitada a produtos visíveis. Filtramos as
    // etiquetas no navegador para não combinar dois filtros disjuntivos
    // (array-contains-any + in), combinação que o Firestore não aceita.
    let produtos;
    try {
      produtos = await buscarDestaquesPorEtiqueta(tamanho);
    } catch (erro) {
      // Índice composto ainda não publicado (ou consulta recusada): volta ao
      // caminho antigo, que funciona sem índice novo.
      if (!["failed-precondition", "invalid-argument"].includes(erro?.code)) throw erro;
      produtos = await buscarDestaquesLegado(tamanho);
    }
    if (produtos.length) return produtos;

    try {
      const recentes = await listarProdutosRecentes(tamanho);
      if (recentes.length) return recentes;
    } catch { /* segue pro fallback final abaixo */ }

    // Último fallback: se nada tiver etiqueta de destaque nem campo
    // criadoEm válido pra ordenar (ex: produtos importados em lote sem
    // esse campo), pega qualquer produto ativo em vez de mostrar vazio.
    const snapTodos = await getDocs(query(
      collection(db, "produtos"),
      where("status", "in", STATUS_PUBLICOS),
      limit(tamanho + 4)
    ));
    return snapTodos.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.status !== "oculto").slice(0, tamanho);
  }, {
    // Destaques são carregados ao aproximar a seção da tela. Em rede lenta,
    // damos mais tempo à leitura sem travar a navegação ou exibir um alerta
    // técnico ao visitante.
    timeoutMs: 45000,
    silenciosoNoTimeout: true
  })
);

/** Produtos de uma categoria (até um teto razoável) — usado no filtro rápido da home. */
export const listarProdutosPorCategoria = comCache("listarProdutosPorCategoria", 2 * 60 * 1000, (categoria, tamanho = 60) =>
  withLoading("listarProdutosPorCategoria", async () => {
    if (!categoria) return [];
    const snap = await getDocs(query(
      collection(db, "produtos"),
      where("categoria", "==", categoria),
      where("status", "in", STATUS_PUBLICOS),
      limit(tamanho)
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  })
);

export const obterProduto = comCache("obterProduto", 2 * 60 * 1000, (id) =>
  withLoading("obterProduto", async () => {
    const ref = doc(db, "produtos", id);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  })
);

function invalidarCacheVitrinesHome() {
  invalidarCache("listarProdutosDestaque");
  invalidarCache("listarProdutosRecentes:v3");
  invalidarCache("listarProdutosVitrine");
  invalidarCache("listarProdutosPorCategoria");
  invalidarCache("obterProduto");
  invalidarCache("catalogoBase");
  invalidarCache("contarCatalogoServidor");
  cacheBuscaAdmin.clear();
  // O resumo do painel (contagens e rankings) NÃO é invalidado a cada edição:
  // ele vence sozinho em 5 min e é refeito ao criar/excluir produto ou ajustar estoque.
}

/**
 * Chamado em visitantes quando o painel altera o catálogo. Limpa apenas
 * dados públicos derivados para a próxima renderização vir do servidor,
 * sem afetar carrinho, sessão ou dados privados da conta.
 */
export function invalidarCachePublico() {
  [
    "listarProdutosDestaque", "listarProdutosRecentes:v3", "listarProdutosVitrine", "listarProdutosPorCategoria",
    "listarProdutosPagina", "catalogoBase", "contarCatalogoServidor", "obterProduto",
    "listarCategorias", "listarMarcas", "listarEtiquetas"
  ].forEach(invalidarCache);
}
async function notificarMudancaPublica() {
  // A alteração principal já foi salva; se a regra nova ainda não tiver sido
  // publicada, não desfazemos um CRUD bem-sucedido por causa da notificação.
  try {
    await sinalizarAtualizacaoPublica();
  } catch (erro) {
    console.warn("Não foi possível avisar o site sobre a atualização:", erro);
  }
}

export function criarProduto(dados) {
  return withLoading("criarProduto", async () => {
    const resultado = await addDoc(collection(db, "produtos"), {
      ...dados,
      buscaTokens: criarTokensBusca(dados),
      faixaPreco: calcularFaixaPreco(dados.preco),
      disponivel: calcularDisponivel(dados.status, dados.quantidade),
      visualizacoes: 0,
      compartilhamentos: 0,
      criadoEm: serverTimestamp()
    });
    invalidarCacheVitrinesHome();
    invalidarCache("resumoDashboard");
    await notificarMudancaPublica();
    return resultado;
  });
}

/**
 * IMPORTANTE: sempre que preco, status ou quantidade mudam, os campos
 * faixaPreco/disponivel precisam ser recalculados junto — são eles que
 * o catálogo público usa pra filtrar sem baixar os 10k+ produtos.
 * Por isso lemos o doc atual antes de gravar (transação), em vez de
 * confiar só no que veio em `dados`.
 */
export function atualizarProduto(id, dados) {
  return withLoading("atualizarProduto", async () => {
    const ref = doc(db, "produtos", id);
    const precisaRecalcular = "preco" in dados || "status" in dados || "quantidade" in dados;
    const precisaAtualizarBusca = ["nome", "marca", "categoria", "codigo"].some(campo => campo in dados);
    if (!precisaRecalcular && !precisaAtualizarBusca) {
      const resultado = await updateDoc(ref, dados);
      invalidarCacheVitrinesHome();
      await notificarMudancaPublica();
      return resultado;
    }

    const resultado = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const atual = snap.exists() ? snap.data() : {};
      const preco = "preco" in dados ? dados.preco : atual.preco;
      const status = "status" in dados ? dados.status : atual.status;
      const quantidade = "quantidade" in dados ? dados.quantidade : atual.quantidade;
      tx.update(ref, {
        ...dados,
        ...(precisaRecalcular ? {
          faixaPreco: calcularFaixaPreco(preco),
          disponivel: calcularDisponivel(status, quantidade)
        } : {}),
        ...(precisaAtualizarBusca ? {
          buscaTokens: criarTokensBusca({ ...atual, ...dados })
        } : {})
      });
    });
    invalidarCacheVitrinesHome();
    await notificarMudancaPublica();
    return resultado;
  });
}

export function excluirProduto(id) {
  return withLoading("excluirProduto", async () => {
    const resultado = await deleteDoc(doc(db, "produtos", id));
    // Os custos ficam em outra coleção; sem o produto eles não servem mais.
    try { await excluirCustoProduto(id); } catch (erro) { console.warn("Não foi possível apagar os custos do produto:", erro); }
    invalidarCacheVitrinesHome();
    invalidarCache("resumoDashboard");
    await notificarMudancaPublica();
    return resultado;
  });
}

export function duplicarProduto(produto) {
  return withLoading("duplicarProduto", async () => {
    const { id, ...resto } = produto;
    const novo = await criarProduto({ ...resto, nome: `${resto.nome} (cópia)` });
    // A cópia leva os mesmos custos do original (a margem continua calculável).
    try {
      const custos = await obterCustoProduto(id);
      if (custos) await salvarCustoProduto(novo.id, custos);
    } catch (erro) {
      console.warn("Produto duplicado, mas os custos não foram copiados:", erro);
    }
    return novo;
  });
}

// ---------- CUSTOS DO PRODUTO (somente admin) ----------
// Custo, gastos, impostos e taxas NÃO ficam no documento do produto: a coleção
// "produtos" é pública (qualquer visitante lê). Eles ficam em "custosProdutos",
// cujo documento tem o mesmo ID do produto e só o admin lê/escreve (ver
// firebase/firestore.rules).
const COL_CUSTOS = "custosProdutos";

function numeroDeCusto(valor, maximo = Infinity) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 100) / 100, maximo) : 0;
}

/** Custos de um produto ({ custo, gastos, impostoPct, taxaPct }) ou null se não houver. */
export async function obterCustoProduto(id) {
  if (!id) return null;
  const snap = await getDoc(doc(db, COL_CUSTOS, id));
  return snap.exists() ? snap.data() : null;
}

/** Custos de vários produtos de uma vez: Map(idProduto -> custos). Produtos sem custo ficam fora do Map. */
export async function listarCustosProdutos(ids = []) {
  const unicos = [...new Set((ids || []).filter(Boolean))];
  const mapa = new Map();
  // O operador "in" aceita no máximo 30 valores por consulta.
  for (let i = 0; i < unicos.length; i += 30) {
    const lote = unicos.slice(i, i + 30);
    const snap = await getDocs(query(collection(db, COL_CUSTOS), where(documentId(), "in", lote)));
    snap.forEach((d) => mapa.set(d.id, d.data()));
  }
  return mapa;
}

/** Grava os custos de um produto. Se tudo vier vazio/zero, apaga o registro. Devolve o que foi salvo (ou null). */
export async function salvarCustoProduto(id, dados = {}) {
  if (!id) throw new Error("Produto inválido para salvar os custos.");
  const limpo = {
    custo: numeroDeCusto(dados.custo),
    gastos: numeroDeCusto(dados.gastos),
    impostoPct: numeroDeCusto(dados.impostoPct, 100),
    taxaPct: numeroDeCusto(dados.taxaPct, 100)
  };
  const ref = doc(db, COL_CUSTOS, id);
  if (Object.values(limpo).every((v) => !v)) {
    await deleteDoc(ref);
    return null;
  }
  await setDoc(ref, { ...limpo, atualizadoEm: serverTimestamp() });
  return limpo;
}

export function excluirCustoProduto(id) {
  return deleteDoc(doc(db, COL_CUSTOS, id));
}

export function incrementarVisualizacao(id) {
  // Uma visualização por produto/dispositivo a cada 6 horas evita que
  // recarregamentos e navegação de ida/volta virem escritas de analytics.
  const chave = `futura:view:${id}`;
  try {
    const ultima = Number(localStorage.getItem(chave)) || 0;
    if (Date.now() - ultima < 6 * 60 * 60 * 1000) return Promise.resolve();
    localStorage.setItem(chave, String(Date.now()));
  } catch { /* segue sem persistência quando o storage não está disponível */ }
  return updateDoc(doc(db, "produtos", id), { visualizacoes: increment(1) });
}

export function incrementarCompartilhamento(id) {
  return updateDoc(doc(db, "produtos", id), { compartilhamentos: increment(1) });
}

export function ajustarEstoque(id, delta, motivo = "") {
  return withLoading("ajustarEstoque", async () => {
    const ref = doc(db, "produtos", id);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const atual = snap.data() || {};
      const novaQuantidade = (Number(atual.quantidade) || 0) + delta;
      tx.update(ref, {
        quantidade: novaQuantidade,
        disponivel: calcularDisponivel(atual.status, novaQuantidade)
      });
    });
    await addDoc(collection(db, "historicoEstoque"), {
      produtoId: id,
      delta,
      motivo,
      data: serverTimestamp()
    });
    invalidarCache("resumoDashboard");
    invalidarCache("catalogoBase");
    invalidarCache("obterProduto");
    invalidarCache("listarHistoricoEstoque");
    cacheBuscaAdmin.clear();
    await notificarMudancaPublica();
  });
}

/**
 * Página do catálogo público com filtros combinados aplicados NO SERVIDOR
 * (categoria, marca, faixaPreco, disponibilidade) — não baixa a coleção
 * inteira mesmo com vários filtros ativos ao mesmo tempo.
 *
 * Limitação que continua de pé: a busca por texto (`termoBusca`) é só
 * "começa com" (prefixo), não full-text — pra busca de verdade dentro do
 * nome (ex.: achar "Caderno Duplo" digitando "duplo") seria necessário um
 * serviço externo (Algolia/Typesense), que é a decisão que ainda está em
 * aberto com você.
 *
 * Na primeira vez que uma combinação de filtro + ordenação nova for usada,
 * o Firestore pode devolver um erro pedindo pra criar um índice composto —
 * é só clicar no link do erro (aparece no console do navegador) uma vez;
 * depois disso a combinação fica rápida pra sempre.
 */
/**
 * Traz do Firestore só o conjunto restrito por, no máximo, UM campo de
 * igualdade (categoria OU marca) + status != oculto — essa é a única
 * combinação que usa índice composto, e já temos os dois criados
 * (categoria+status e marca+status). Todo filtro adicional (a outra marca,
 * faixa de preço, disponibilidade, busca por nome) e toda ordenação
 * acontecem aqui no navegador depois. Isso evita ficar pedindo um índice
 * novo pra cada combinação de filtros que o cliente escolher.
 */
const buscarConjuntoRestritoCacheado = comCache("catalogoBase", 5 * 60 * 1000, async (categoria, marcasOrdenadas) => {
  const col = collection(db, "produtos");
  const clausulas = [where("status", "in", STATUS_PUBLICOS)];

  if (categoria) clausulas.push(where("categoria", "==", categoria));
  else if (marcasOrdenadas.length === 1) clausulas.push(where("marca", "==", marcasOrdenadas[0]));
  else if (marcasOrdenadas.length > 1 && marcasOrdenadas.length <= 10) clausulas.push(where("marca", "in", marcasOrdenadas));

  const snap = await getDocs(query(col, ...clausulas));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
});

function buscarConjuntoRestrito({ categoria, marcas }) {
  return buscarConjuntoRestritoCacheado(categoria, [...marcas].sort());
}

function aplicarFiltrosClientSide(produtos, { categoria, marcas, faixasPreco, disponibilidade, termo }) {
  let lista = produtos;
  const conjuntoMarcas = marcas.length ? new Set(marcas) : null;
  const conjuntoFaixas = faixasPreco.length ? new Set(faixasPreco) : null;
  if (categoria) lista = lista.filter(p => p.categoria === categoria);
  if (conjuntoMarcas) lista = lista.filter(p => conjuntoMarcas.has(p.marca));
  if (conjuntoFaixas) lista = lista.filter(p => conjuntoFaixas.has(p.faixaPreco));
  if (disponibilidade === "em_estoque") lista = lista.filter(p => p.disponivel === true);
  else if (disponibilidade === "sem_estoque") lista = lista.filter(p => p.disponivel === false);
  if (termo) {
    const termoNormalizado = normalizarTexto(termo);
    lista = lista.filter(p => nomeNormalizado(p).includes(termoNormalizado));
  }
  return lista;
}

function ordenarProdutos(produtos, ordenar) {
  const lista = [...produtos];
  if (ordenar === "preco_asc") lista.sort((a, b) => (Number(a.preco) || 0) - (Number(b.preco) || 0));
  else if (ordenar === "preco_desc") lista.sort((a, b) => (Number(b.preco) || 0) - (Number(a.preco) || 0));
  else if (ordenar === "recentes") lista.sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
  else lista.sort((a, b) => COLATOR_NOMES.compare(String(a.nome), String(b.nome)));
  return lista;
}

const COLATOR_NOMES = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
const cacheNomesNormalizados = new WeakMap();

/**
 * Remove acentos e caixa pra comparar texto de forma tolerante
 * (ex: "cabo" bate com "Cabo USB 3.1" e "café" bate com "CAFE").
 */
function normalizarTexto(txt) {
  return String(txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function nomeNormalizado(produto) {
  if (!produto || typeof produto !== "object") return "";
  if (!cacheNomesNormalizados.has(produto)) cacheNomesNormalizados.set(produto, normalizarTexto(produto.nome));
  return cacheNomesNormalizados.get(produto);
}

async function buscarPaginaCatalogoServidor({ tamanho, cursor, categoria, marcas, faixasPreco, disponibilidade, ordenar }) {
  const col = collection(db, "produtos");
  const filtros = [where("status", "in", STATUS_PUBLICOS)];
  if (categoria) filtros.push(where("categoria", "==", categoria));
  if (marcas.length === 1) filtros.push(where("marca", "==", marcas[0]));
  // Valores únicos podem ser filtrados no servidor. Seleções múltiplas
  // continuam no caminho compatível abaixo, pois o Firestore não permite
  // duas cláusulas "in" na mesma consulta.
  if (faixasPreco.length === 1) filtros.push(where("faixaPreco", "==", faixasPreco[0]));
  if (disponibilidade === "em_estoque") filtros.push(where("disponivel", "==", true));
  if (disponibilidade === "sem_estoque") filtros.push(where("disponivel", "==", false));

  const campoOrdem = ordenar === "preco_asc" || ordenar === "preco_desc"
    ? "preco"
    : ordenar === "recentes" ? "criadoEm" : "nome";
  const direcao = ordenar === "preco_desc" || ordenar === "recentes" ? "desc" : "asc";
  const clausulas = [...filtros, orderBy(campoOrdem, direcao), limit(tamanho + 1)];
  if (cursor) clausulas.push(startAfter(cursor));

  const [snap, total] = await Promise.all([
    getDocs(query(col, ...clausulas)),
    contarCatalogoServidor(categoria, marcas[0] || "", faixasPreco[0] || "", disponibilidade)
  ]);
  const docs = snap.docs.slice(0, tamanho);
  return {
    produtos: docs.map(d => ({ id: d.id, ...d.data() })),
    cursor: docs.at(-1) || cursor,
    temMais: snap.docs.length > tamanho,
    total
  };
}

const contarCatalogoServidor = comCache("contarCatalogoServidor", 5 * 60 * 1000, async (categoria, marca, faixaPreco = "", disponibilidade = "") => {
  const filtros = [where("status", "in", STATUS_PUBLICOS)];
  if (categoria) filtros.push(where("categoria", "==", categoria));
  if (marca) filtros.push(where("marca", "==", marca));
  if (faixaPreco) filtros.push(where("faixaPreco", "==", faixaPreco));
  if (disponibilidade === "em_estoque") filtros.push(where("disponivel", "==", true));
  if (disponibilidade === "sem_estoque") filtros.push(where("disponivel", "==", false));
  const snap = await getCountFromServer(query(collection(db, "produtos"), ...filtros));
  return snap.data().count;
});

export function buscarProdutosCatalogo({
  tamanho = 24,
  cursor = null,
  categoria = "",
  marcas = [],
  faixasPreco = [],
  disponibilidade = "", // "em_estoque" | "sem_estoque" | ""
  termoBusca = "",
  ordenar = "nome" // "nome" | "preco_asc" | "preco_desc" | "recentes"
} = {}) {
  return withLoading("buscarProdutosCatalogo", async () => {
    // O caminho comum (sem busca textual nem filtros que exigem pós-processamento)
    // traz somente uma página do Firestore. Filtros complexos reutilizam um
    // conjunto-base cacheado por dois minutos, em vez de reler tudo a cada clique.
    const podePaginarNoServidor = !termoBusca.trim() && marcas.length <= 1 && faixasPreco.length <= 1;
    if (podePaginarNoServidor) {
      try {
        return await buscarPaginaCatalogoServidor({ tamanho, cursor, categoria, marcas, faixasPreco, disponibilidade, ordenar });
      } catch (erro) {
        // Um índice composto pode ainda estar em criação ou não ter sido
        // publicado no Firebase. Nesse caso o catálogo continua acessível
        // usando a consulta simples e ordenação no navegador.
        if (erro?.code !== "failed-precondition") throw erro;
        cursor = null;
      }
    }

    const brutos = await buscarConjuntoRestrito({ categoria, marcas });
    const filtrados = aplicarFiltrosClientSide(brutos, {
      categoria, marcas, faixasPreco, disponibilidade, termo: termoBusca.trim()
    });
    const ordenados = ordenarProdutos(filtrados, ordenar);

    // Cursor virou um offset numérico (não doc snapshot) já que a
    // paginação agora é feita em memória, sobre a lista já filtrada.
    const offset = typeof cursor === "number" ? cursor : 0;
    const pagina = ordenados.slice(offset, offset + tamanho);
    const temMais = offset + tamanho < ordenados.length;

    // total já sai de graça daqui (mesma lista filtrada, antes de paginar) —
    // evita repetir buscarConjuntoRestrito só pra contar (era 2x a mesma
    // leitura completa da coleção a cada render, quando não há filtro de
    // categoria/marca ativo).
    return { produtos: pagina, cursor: temMais ? offset + tamanho : null, temMais, total: ordenados.length };
  });
}

// ---------- CATEGORIAS ----------
// Muda pouco (só quando o admin mexe no painel) — cache mais longo (10 min)
// e invalidado explicitamente nas funções de escrita logo abaixo.
export const listarCategorias = comCache("listarCategorias", 10 * 60 * 1000, () =>
  withLoading("listarCategorias", async () => {
    const snap = await getDocs(collection(db, "categorias"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  })
);
export function criarCategoria(nome, emoji = "", imagem = "") {
  return withLoading("criarCategoria", async () => {
    const resultado = await addDoc(collection(db, "categorias"), { nome, emoji, imagem });
    atualizarCacheLista("listarCategorias", lista => [...lista, { id: resultado.id, nome, emoji, imagem }], 10 * 60 * 1000);
    invalidarCache("resumoDashboard");
    await notificarMudancaPublica();
    return resultado;
  });
}
export function atualizarCategoria(id, dados) {
  return withLoading("atualizarCategoria", async () => {
    const resultado = await updateDoc(doc(db, "categorias", id), dados);
    atualizarCacheLista("listarCategorias", lista => lista.map(item => item.id === id ? { ...item, ...dados } : item), 10 * 60 * 1000);
    await notificarMudancaPublica();
    return resultado;
  });
}
export function excluirCategoria(id) {
  return withLoading("excluirCategoria", async () => {
    const resultado = await deleteDoc(doc(db, "categorias", id));
    atualizarCacheLista("listarCategorias", lista => lista.filter(item => item.id !== id), 10 * 60 * 1000);
    invalidarCache("resumoDashboard");
    await notificarMudancaPublica();
    return resultado;
  });
}

// ---------- MARCAS ----------
export const listarMarcas = comCache("listarMarcas", 10 * 60 * 1000, () =>
  withLoading("listarMarcas", async () => {
    const snap = await getDocs(collection(db, "marcas"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  })
);
export function criarMarca(dados) {
  return withLoading("criarMarca", async () => {
    const item = { ordem: Date.now(), ...dados };
    const resultado = await addDoc(collection(db, "marcas"), item);
    atualizarCacheLista("listarMarcas", lista => [...lista, { id: resultado.id, ...item }], 10 * 60 * 1000);
    await notificarMudancaPublica();
    return resultado;
  });
}
export function atualizarMarca(id, dados) {
  return withLoading("atualizarMarca", async () => {
    const resultado = await updateDoc(doc(db, "marcas", id), dados);
    atualizarCacheLista("listarMarcas", lista => lista.map(item => item.id === id ? { ...item, ...dados } : item), 10 * 60 * 1000);
    await notificarMudancaPublica();
    return resultado;
  });
}
export function excluirMarca(id) {
  return withLoading("excluirMarca", async () => {
    const resultado = await deleteDoc(doc(db, "marcas", id));
    atualizarCacheLista("listarMarcas", lista => lista.filter(item => item.id !== id), 10 * 60 * 1000);
    await notificarMudancaPublica();
    return resultado;
  });
}

// ---------- CLIENTES ----------
// Igual categorias/marcas/etiquetas: cache de 10 min em vez de baixar a
// coleção inteira toda vez que o admin entra na aba Clientes (antes disso
// não tinha cache nenhum aqui — era refetch completo a cada troca de aba).
export const listarClientes = comCache("listarClientes", 10 * 60 * 1000, () =>
  withLoading("listarClientes", async () => {
    const snap = await getDocs(collection(db, "clientes"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  })
);
export function criarCliente(dados) {
  return withLoading("criarCliente", async () => {
    const resultado = await addDoc(collection(db, "clientes"), { ...dados, criadoEm: serverTimestamp() });
    invalidarCache("listarClientes");
    return resultado;
  });
}
export function atualizarCliente(id, dados) {
  return withLoading("atualizarCliente", async () => {
    const resultado = await updateDoc(doc(db, "clientes", id), dados);
    invalidarCache("listarClientes");
    return resultado;
  });
}
export function excluirCliente(id) {
  return withLoading("excluirCliente", async () => {
    const resultado = await deleteDoc(doc(db, "clientes", id));
    invalidarCache("listarClientes");
    return resultado;
  });
}

// ---------- ETIQUETAS ----------
export const listarEtiquetas = comCache("listarEtiquetas", 10 * 60 * 1000, () =>
  withLoading("listarEtiquetas", async () => {
    const snap = await getDocs(collection(db, "etiquetas"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  })
);
export function criarEtiqueta(nome) {
  return withLoading("criarEtiqueta", async () => {
    const resultado = await addDoc(collection(db, "etiquetas"), { nome });
    atualizarCacheLista("listarEtiquetas", lista => [...lista, { id: resultado.id, nome }], 10 * 60 * 1000);
    await notificarMudancaPublica();
    return resultado;
  });
}
export function excluirEtiqueta(id) {
  return withLoading("excluirEtiqueta", async () => {
    const resultado = await deleteDoc(doc(db, "etiquetas", id));
    atualizarCacheLista("listarEtiquetas", lista => lista.filter(item => item.id !== id), 10 * 60 * 1000);
    await notificarMudancaPublica();
    return resultado;
  });
}

// ---------- LEADS PERDIDOS ----------
export function salvarLeadPerdido(lead) {
  return withLoading("salvarLeadPerdido", async () => {
    const resp = await fetch("/api/lead-perdido", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).erro || "Falha ao registrar lead.");
    return resp.json();
  });
}
export const listarLeadsPerdidos = comCache("listarLeadsPerdidos", 60 * 1000, () =>
  withLoading("listarLeadsPerdidos", async () => {
    const snap = await getDocs(query(collection(db, "leadsPerdidos"), orderBy("data", "desc"), limit(200)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  })
);

export function listarLeadsPerdidosPagina(opcoes = {}) {
  return withLoading("listarLeadsPerdidosPagina", () =>
    listarPaginaAdmin("leadsPerdidos", { ...opcoes, ordenarPor: "data", direcao: "desc" })
  );
}
export function marcarLeadRecuperado(id) {
  return withLoading("marcarLeadRecuperado", async () => {
    const resultado = await updateDoc(doc(db, "leadsPerdidos", id), { status: "recuperado" });
    atualizarCacheLista("listarLeadsPerdidos", lista => lista.map(item => item.id === id ? { ...item, status: "recuperado" } : item), 60 * 1000);
    return resultado;
  });
}

// ---------- PEDIDOS ----------
export function criarPedido(dados) {
  return withLoading("criarPedido", async () => {
    const resultado = await addDoc(collection(db, "pedidos"), { ...dados, status: "pendente", criadoEm: serverTimestamp() });
    invalidarCache("listarPedidosUsuario");
    invalidarCache("listarPedidosAdmin");
    return resultado;
  });
}
export const listarPedidosUsuario = comCache("listarPedidosUsuario", 60 * 1000, (usuarioId) =>
  withLoading("listarPedidosUsuario", async () => {
    const snap = await getDocs(query(
      collection(db, "pedidos"),
      where("usuarioId", "==", usuarioId),
      orderBy("criadoEm", "desc"),
      limit(50)
    ));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  })
);
export const listarPedidosAdmin = comCache("listarPedidosAdmin", 45 * 1000, () =>
  withLoading("listarPedidosAdmin", async () => {
    const snap = await getDocs(query(collection(db, "pedidos"), orderBy("criadoEm", "desc"), limit(100)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  })
);

export function listarPedidosAdminPagina(opcoes = {}) {
  return withLoading("listarPedidosAdminPagina", () =>
    listarPaginaAdmin("pedidos", { ...opcoes, ordenarPor: "criadoEm", direcao: "desc" })
  );
}
export function excluirPedido(id) {
  return withLoading("excluirPedido", async () => {
    const resultado = await deleteDoc(doc(db, "pedidos", id));
    invalidarCache("listarPedidosUsuario");
    invalidarCache("listarPedidosAdmin");
    return resultado;
  });
}

/** Exclui pedidos da própria conta em lotes seguros para o Firestore. */
export function excluirPedidos(ids = []) {
  return withLoading("excluirPedidos", async () => {
    const unicos = [...new Set(ids.filter(Boolean))];
    for (let inicio = 0; inicio < unicos.length; inicio += 400) {
      const lote = writeBatch(db);
      unicos.slice(inicio, inicio + 400).forEach((id) => lote.delete(doc(db, "pedidos", id)));
      await lote.commit();
    }
    invalidarCache("listarPedidosUsuario");
    invalidarCache("listarPedidosAdmin");
    return { total: unicos.length };
  });
}
export function atualizarStatusPedido(id, status) {
  return withLoading("atualizarStatusPedido", async () => {
    const resultado = await updateDoc(doc(db, "pedidos", id), { status });
    atualizarCacheLista("listarPedidosAdmin", lista => lista.map(item => item.id === id ? { ...item, status } : item), 45 * 1000);
    invalidarCache("listarPedidosUsuario");
    return resultado;
  });
}

export const listarHistoricoEstoque = comCache("listarHistoricoEstoque", 60 * 1000, () =>
  withLoading("listarHistoricoEstoque", async () => {
    const snap = await getDocs(query(collection(db, "historicoEstoque"), orderBy("data", "desc"), limit(100)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  })
);

export function listarHistoricoEstoquePagina(opcoes = {}) {
  return withLoading("listarHistoricoEstoquePagina", () =>
    listarPaginaAdmin("historicoEstoque", { ...opcoes, ordenarPor: "data", direcao: "desc" })
  );
}

// ---------- ENDEREÇOS ----------
export const listarEnderecos = comCache("listarEnderecos", 5 * 60 * 1000, (usuarioId) =>
  withLoading("listarEnderecos", async () => {
    const snap = await getDocs(query(collection(db, "enderecos"), where("usuarioId", "==", usuarioId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  })
);
export function criarEndereco(usuarioId, dados) {
  return withLoading("criarEndereco", async () => {
    const resultado = await addDoc(collection(db, "enderecos"), { ...dados, usuarioId, criadoEm: serverTimestamp() });
    invalidarCache("listarEnderecos");
    return resultado;
  });
}
export function atualizarEndereco(id, dados) {
  return withLoading("atualizarEndereco", async () => {
    const resultado = await updateDoc(doc(db, "enderecos", id), { ...dados, atualizadoEm: serverTimestamp() });
    invalidarCache("listarEnderecos");
    return resultado;
  });
}
export function excluirEndereco(id) {
  return withLoading("excluirEndereco", async () => {
    const resultado = await deleteDoc(doc(db, "enderecos", id));
    invalidarCache("listarEnderecos");
    return resultado;
  });
}

// ---------- PERFIL (preferências / configurações) ----------
export function atualizarPerfilUsuario(uid, dados) {
  return withLoading("atualizarPerfilUsuario", async () => {
    return setDoc(doc(db, "usuarios", uid), dados, { merge: true });
  });
}

// ---------- USUÁRIOS ----------
export function obterPerfilUsuario(uid) {
  return withLoading("obterPerfilUsuario", async () => {
    const ref = doc(db, "usuarios", uid);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  });
}
export function listarUsuarios() {
  return withLoading("listarUsuarios", async () => {
    const snap = await getDocs(collection(db, "usuarios"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });
}

// ---------- ALERTAS DE ESTOQUE BAIXO (gerados pelo cron diário) ----------
export function listarUltimoAlertaEstoque() {
  return withLoading("listarUltimoAlertaEstoque", async () => {
    const snap = await getDocs(query(
      collection(db, "alertasEstoque"),
      orderBy("criadoEm", "desc"),
      limit(1)
    ));
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  });
}

// ---------- RESUMO DO DASHBOARD ----------
// Agregações e listas limitadas substituem a leitura integral de produtos,
// categorias e usuários que acontecia toda vez que o painel era aberto.
export const obterResumoDashboard = comCache("resumoDashboard", 5 * 60 * 1000, () =>
  withLoading("obterResumoDashboard", async () => {
    const produtosRef = collection(db, "produtos");
    const [
      contagemProdutos,
      estoque,
      contagemSemEstoque,
      contagemCategorias,
      contagemUsuarios,
      vistosSnap,
      compartilhadosSnap
    ] = await Promise.all([
      getCountFromServer(produtosRef),
      getAggregateFromServer(produtosRef, { total: sum("quantidade") }),
      getCountFromServer(query(produtosRef, where("quantidade", "<=", 0))),
      getCountFromServer(collection(db, "categorias")),
      getCountFromServer(collection(db, "usuarios")),
      getDocs(query(produtosRef, orderBy("visualizacoes", "desc"), limit(5))),
      getDocs(query(produtosRef, orderBy("compartilhamentos", "desc"), limit(5)))
    ]);

    return {
      totalProdutos: contagemProdutos.data().count,
      totalEstoque: Number(estoque.data().total) || 0,
      semEstoque: contagemSemEstoque.data().count,
      totalCategorias: contagemCategorias.data().count,
      totalUsuarios: contagemUsuarios.data().count,
      maisVistos: vistosSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      maisCompartilhados: compartilhadosSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    };
  })
);
