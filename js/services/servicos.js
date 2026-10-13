// js/services/servicos.js
// Serviços do salão (ex.: Estética > Limpeza de pele). Segue a mesma lógica dos
// produtos: leitura pública, escrita só do admin, e um "sinal" de atualização
// pública para o site recarregar quando o painel muda algo.
//
// Coleções:
//   categoriasServico  { nome, parentId ("" = categoria principal), ordem,
//                        descricao, imagem (base64 comprimido), imagemPosY }
//   servicos           { nome, categoriaId, subcategoriaId, ... }
//
// Os serviços guardam apenas os IDs da categoria/subcategoria. Os nomes são
// resolvidos na hora de exibir, então renomear uma categoria no painel já
// atualiza todos os serviços dela.
import { db } from "../../firebase/firebase-config.js";
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp, getCountFromServer
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { withLoading } from "../utils/loadingManager.js";
import { sinalizarAtualizacaoPublica } from "./public-sync.js";

const COL_SERVICOS = "servicos";
const COL_CATEGORIAS = "categoriasServico";

// ---------- CACHE PÚBLICO (sessionStorage, 5 min) ----------
const CHAVE_CACHE = "evv_servicos_publico_v3";
const CHAVE_CACHE_HOME = "evv_servicos_home_v1";
const TTL_MS = 5 * 60 * 1000;
// Dentro deste prazo o cache é usado direto, sem ler o documento de versão.
const TTL_SEM_CONFERIR_MS = 60 * 1000;

function lerCache() {
  try {
    const bruto = sessionStorage.getItem(CHAVE_CACHE);
    if (!bruto) return null;
    const { t, v, ver } = JSON.parse(bruto);
    if (Date.now() - t > TTL_MS) return null;
    return { v, ver, t };
  } catch { return null; }
}
function salvarCache(valor, ver) {
  try { sessionStorage.setItem(CHAVE_CACHE, JSON.stringify({ t: Date.now(), v: valor, ver })); } catch { /* cache é opcional */ }
}

// Versão do catálogo: o painel grava publicacoes/catalogo a cada alteração.
// Se a versão mudou, o cache está velho (ex.: serviço excluído em outra aba).
async function lerVersaoPublica() {
  try {
    const snap = await getDoc(doc(db, "publicacoes", "catalogo"));
    const t = snap.data()?.atualizadoEm;
    return t?.seconds ? `${t.seconds}.${t.nanoseconds || 0}` : "0";
  } catch { return null; }
}
export function invalidarCacheServicos() {
  try {
    sessionStorage.removeItem(CHAVE_CACHE);
    sessionStorage.removeItem(CHAVE_CACHE_HOME);
  } catch { /* ignora */ }
}

async function notificarMudancaPublica() {
  invalidarCacheServicos();
  try {
    await sinalizarAtualizacaoPublica();
  } catch (erro) {
    console.warn("Não foi possível avisar o site sobre a atualização:", erro);
  }
}

// ---------- HELPERS ----------
export function normalizarTexto(txt = "") {
  return String(txt).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function ordenarCategorias(lista) {
  return [...lista].sort((a, b) =>
    (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
}

/** Monta a árvore: [{...principal, filhas: [...]}] já ordenada. */
export function montarArvoreCategorias(categorias = []) {
  const principais = ordenarCategorias(categorias.filter(c => !c.parentId));
  return principais.map(p => ({
    ...p,
    filhas: ordenarCategorias(categorias.filter(c => c.parentId === p.id))
  }));
}

/** Acrescenta categoriaNome/subcategoriaNome em cada serviço. */
export function resolverNomesServicos(servicos = [], categorias = []) {
  const porId = new Map(categorias.map(c => [c.id, c]));
  return servicos.map(s => ({
    ...s,
    categoriaNome: porId.get(s.categoriaId)?.nome || "",
    subcategoriaNome: porId.get(s.subcategoriaId)?.nome || ""
  }));
}

/** Ordena como o site exibe: categoria, subcategoria, ordem e nome. */
export function ordenarServicos(servicos = [], categorias = []) {
  const ordemCat = new Map(categorias.map(c => [c.id, Number(c.ordem) || 0]));
  return [...servicos].sort((a, b) =>
    (ordemCat.get(a.categoriaId) ?? 1e12) - (ordemCat.get(b.categoriaId) ?? 1e12) ||
    (ordemCat.get(a.subcategoriaId) ?? -1) - (ordemCat.get(b.subcategoriaId) ?? -1) ||
    (Number(a.ordem) || 0) - (Number(b.ordem) || 0) ||
    String(a.nome).localeCompare(String(b.nome), "pt-BR"));
}

export function servicoTemImagem(servico = {}) {
  const tem = (u) => typeof u === "string" && u.trim().length > 0;
  return tem(servico.imagem) || (Array.isArray(servico.imagens) && servico.imagens.some(tem));
}

// ---------- LEITURA PÚBLICA ----------
/** Categorias + serviços visíveis ao público (status "disponivel"). */
export async function listarServicosPublico() {
  const emCache = lerCache();
  // Cache recente: nem a conferência de versão (1 leitura) é necessária.
  if (emCache && Date.now() - emCache.t < TTL_SEM_CONFERIR_MS) return emCache.v;

  const versao = await lerVersaoPublica();
  if (emCache && (versao === null || emCache.ver === versao)) return emCache.v;

  return withLoading("listarServicosPublico", async () => {
    const [snapCats, snapServ] = await Promise.all([
      getDocs(collection(db, COL_CATEGORIAS)),
      getDocs(query(collection(db, COL_SERVICOS), where("status", "==", "disponivel")))
    ]);
    const categorias = snapCats.docs.map(d => ({ id: d.id, ...d.data() }));
    const servicos = snapServ.docs.map(d => {
      const dados = d.data();
      // serverTimestamp não vai para o JSON do cache; guardamos só os segundos.
      return { id: d.id, ...dados, criadoEm: dados.criadoEm?.seconds || 0 };
    });
    const resultado = { categorias, servicos };
    salvarCache(resultado, versao);
    return resultado;
  });
}

/**
 * Categorias para os cards da home: as primeiras `max` categorias principais que
 * têm serviço disponível. Em vez de baixar TODOS os serviços só para saber isso,
 * lê as categorias e conta os serviços de cada uma (1 leitura por contagem).
 * Se a lista completa já estiver em cache (página de serviços visitada), usa ela.
 */
export async function listarCategoriasHomeServicos(max = 4) {
  const completo = lerCache();
  if (completo) {
    const { categorias = [], servicos = [] } = completo.v || {};
    return montarArvoreCategorias(categorias)
      .map(c => ({ ...c, total: servicos.filter(s => s.categoriaId === c.id).length }))
      .filter(c => c.total > 0)
      .slice(0, max);
  }

  try {
    const bruto = sessionStorage.getItem(CHAVE_CACHE_HOME);
    if (bruto) {
      const { t, v } = JSON.parse(bruto);
      if (Date.now() - t < TTL_MS && Array.isArray(v)) return v;
    }
  } catch { /* cache é opcional */ }

  const resultado = await withLoading("listarCategoriasHomeServicos", async () => {
    const snapCats = await getDocs(collection(db, COL_CATEGORIAS));
    const principais = montarArvoreCategorias(snapCats.docs.map(d => ({ id: d.id, ...d.data() })));
    const encontradas = [];
    // Confere em blocos do tamanho do que falta: normalmente 1 bloco (4 contagens).
    for (let i = 0; i < principais.length && encontradas.length < max; i += max) {
      const bloco = principais.slice(i, i + max);
      const totais = await Promise.all(bloco.map(c => getCountFromServer(query(
        collection(db, COL_SERVICOS),
        where("categoriaId", "==", c.id),
        where("status", "==", "disponivel")
      )).then(r => r.data().count)));
      bloco.forEach((c, idx) => { if (totais[idx] > 0) encontradas.push({ ...c, total: totais[idx] }); });
    }
    return encontradas.slice(0, max);
  });
  try { sessionStorage.setItem(CHAVE_CACHE_HOME, JSON.stringify({ t: Date.now(), v: resultado })); } catch { /* ignora */ }
  return resultado;
}

/** Um serviço público + a lista (para os relacionados). Retorna null se não existir/oculto. */
export async function obterServicoPublico(id) {
  const { categorias, servicos } = await listarServicosPublico();
  const doCache = servicos.find(s => s.id === id);
  if (doCache) return { servico: doCache, categorias, servicos };

  // Fora do cache (ex.: criado agora há pouco). A regra do Firestore bloqueia ocultos.
  try {
    const snap = await getDoc(doc(db, COL_SERVICOS, id));
    if (!snap.exists() || snap.data().status !== "disponivel") return null;
    return { servico: { id: snap.id, ...snap.data(), criadoEm: snap.data().criadoEm?.seconds || 0 }, categorias, servicos };
  } catch {
    return null;
  }
}

// ---------- LEITURA ADMIN (sem cache, inclui ocultos) ----------
export function listarServicosAdmin() {
  return withLoading("listarServicosAdmin", async () => {
    const [snapCats, snapServ] = await Promise.all([
      getDocs(collection(db, COL_CATEGORIAS)),
      getDocs(collection(db, COL_SERVICOS))
    ]);
    return {
      categorias: snapCats.docs.map(d => ({ id: d.id, ...d.data() })),
      servicos: snapServ.docs.map(d => ({ id: d.id, ...d.data() }))
    };
  });
}

// ---------- CATEGORIAS ----------
export function criarCategoriaServico({ nome, parentId = "", ordem = Date.now(), descricao = "", imagem = "", imagemPosY = 50 }, { silencioso = false } = {}) {
  return withLoading("criarCategoriaServico", async () => {
    const ref = await addDoc(collection(db, COL_CATEGORIAS), {
      nome: String(nome).trim(),
      parentId: parentId || "",
      ordem: Number(ordem) || Date.now(),
      descricao: String(descricao || "").trim(),
      imagem: imagem || "",
      imagemPosY: Number.isFinite(Number(imagemPosY)) ? Number(imagemPosY) : 50,
      criadoEm: serverTimestamp()
    });
    if (!silencioso) await notificarMudancaPublica();
    return ref.id;
  });
}

export function atualizarCategoriaServico(id, dados, { silencioso = false } = {}) {
  return withLoading("atualizarCategoriaServico", async () => {
    await updateDoc(doc(db, COL_CATEGORIAS, id), dados);
    if (!silencioso) await notificarMudancaPublica();
  });
}

export function excluirCategoriaServico(id) {
  return withLoading("excluirCategoriaServico", async () => {
    await deleteDoc(doc(db, COL_CATEGORIAS, id));
    await notificarMudancaPublica();
  });
}

// ---------- SERVIÇOS ----------
export function criarServico(dados, { silencioso = false } = {}) {
  return withLoading("criarServico", async () => {
    const ref = await addDoc(collection(db, COL_SERVICOS), {
      ...dados,
      ordem: Number(dados.ordem) || Date.now(),
      criadoEm: serverTimestamp()
    });
    if (!silencioso) await notificarMudancaPublica();
    return ref.id;
  });
}

export function atualizarServico(id, dados, { silencioso = false } = {}) {
  return withLoading("atualizarServico", async () => {
    await updateDoc(doc(db, COL_SERVICOS, id), dados);
    if (!silencioso) await notificarMudancaPublica();
  });
}

export function excluirServico(id) {
  return withLoading("excluirServico", async () => {
    await deleteDoc(doc(db, COL_SERVICOS, id));
    await notificarMudancaPublica();
  });
}

export function duplicarServico(servico) {
  const { id, criadoEm, ...resto } = servico;
  return criarServico({ ...resto, nome: `${resto.nome} (cópia)`, ordem: Date.now() });
}

/** Chamado uma única vez ao final de uma importação em lote. */
export async function finalizarImportacaoServicos() {
  await notificarMudancaPublica();
}
