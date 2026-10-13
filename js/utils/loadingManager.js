// js/utils/loadingManager.js
//
// Sistema centralizado de loading, conectado ao estado real das operações
// assíncronas da aplicação (Firestore, Auth, Cloudinary, etc).
//
// Regras de segurança:
// - Contador nunca fica negativo (Math.max(0, ...)).
// - Cada operação recebe um ID único; se o mesmo ID for finalizado duas
//   vezes (ex: erro + finally), a segunda chamada é ignorada.
// - Toda operação tem um timeout de segurança: se por algum motivo o
//   "fim" nunca for chamado (bug, promise que nunca resolve), ela é
//   forçada a expirar depois de SAFETY_TIMEOUT_MS pra não travar o
//   loading pra sempre.
// - Erros são sempre tratados no finally -> a operação é liberada mesmo
//   quando a Promise rejeita, e o erro continua sendo propagado
//   normalmente pra quem chamou (não escondemos o erro).
// - Delay pra mostrar (SHOW_DELAY_MS) e tempo mínimo visível
//   (MIN_VISIBLE_MS) evitam o efeito de "piscar" em operações muito
//   rápidas, sem usar tempo artificial de loading: o loading real dura o
//   tempo real da operação, só o que muda é o instante em que ele fica
//   visível/escondido na tela.

const SAFETY_TIMEOUT_MS = 20000; // trava de segurança contra operação que nunca finaliza
const SHOW_DELAY_MS = 150;       // só mostra o loading se a operação passar disso
const MIN_VISIBLE_MS = 300;      // uma vez visível, fica pelo menos esse tempo (sem esconder e mostrar de novo instantaneamente)

let seq = 0;
const pendentes = new Map(); // id -> { key, startedAt, timeoutId }
const contadorPorChave = new Map(); // key -> contagem (loadings específicos, ex: "produtos", "salvar-produto")
const listeners = new Set(); // callbacks(state)

let visivel = false;
let showTimer = null;
let hideTimer = null;
let shownAt = 0;

function snapshotState() {
  const chaves = {};
  for (const [k, v] of contadorPorChave) chaves[k] = v;
  return {
    total: pendentes.size,
    ativo: pendentes.size > 0,
    visivel,
    chaves,
  };
}

function notificar() {
  const state = snapshotState();
  for (const cb of listeners) {
    try { cb(state); } catch (e) { console.error("[loadingManager] erro em listener", e); }
  }
}

function atualizarVisibilidade() {
  const deveEstarAtivo = pendentes.size > 0;

  if (deveEstarAtivo && !visivel) {
    // ainda não está visível -> agenda mostrar depois do delay
    if (!showTimer) {
      showTimer = setTimeout(() => {
        showTimer = null;
        if (pendentes.size > 0) {
          visivel = true;
          shownAt = Date.now();
          notificar();
        }
      }, SHOW_DELAY_MS);
    }
  } else if (!deveEstarAtivo) {
    // não há mais nada pendente
    if (showTimer) {
      // nunca chegou a ficar visível (operação foi rápida) -> só cancela
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (visivel) {
      const decorrido = Date.now() - shownAt;
      const faltando = Math.max(0, MIN_VISIBLE_MS - decorrido);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        hideTimer = null;
        // reconfirma que continua tudo finalizado (pode ter entrado
        // uma nova operação nesse meio tempo)
        if (pendentes.size === 0) {
          visivel = false;
          notificar();
        }
      }, faltando);
    } else {
      notificar();
    }
  } else {
    // já está ativo e já está visível (ou aguardando) -> só notifica pra
    // quem quiser saber a contagem/chaves atualizadas
    notificar();
  }
}

/**
 * Marca o início de uma operação assíncrona.
 * @param {string} key - chave lógica da operação (ex: "produtos", "auth", "salvar-produto")
 * @returns {string} id único da operação, usar em end(id)
 */
export function begin(key = "geral", opcoes = {}) {
  const id = `op_${++seq}`;
  const timeoutMs = Number.isFinite(opcoes.timeoutMs) ? opcoes.timeoutMs : SAFETY_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    const mensagem = `[loadingManager] operação "${key}" (${id}) excedeu ${timeoutMs}ms e foi finalizada automaticamente pra não travar o loading.`;
    // Consultas carregadas em segundo plano não devem poluir o console do
    // cliente caso a rede esteja lenta. Escritas e operações críticas seguem
    // emitindo aviso normalmente.
    if (opcoes.silenciosoNoTimeout) console.debug(mensagem);
    else console.warn(mensagem);
    end(id);
  }, timeoutMs);

  pendentes.set(id, { key, startedAt: Date.now(), timeoutId });
  contadorPorChave.set(key, (contadorPorChave.get(key) || 0) + 1);
  atualizarVisibilidade();
  return id;
}

/**
 * Marca o fim de uma operação assíncrona (sucesso OU erro).
 * Chamar duas vezes com o mesmo id é seguro (idempotente).
 */
export function end(id) {
  const info = pendentes.get(id);
  if (!info) return; // já finalizado, ou id inválido -> não faz nada (evita contagem negativa)

  clearTimeout(info.timeoutId);
  pendentes.delete(id);

  const atual = contadorPorChave.get(info.key) || 0;
  const novo = Math.max(0, atual - 1);
  if (novo === 0) contadorPorChave.delete(info.key);
  else contadorPorChave.set(info.key, novo);

  atualizarVisibilidade();
}

/**
 * Envolve uma Promise (ou função async) com begin/end automáticos,
 * garantindo liberação mesmo em caso de erro.
 * @param {string} key
 * @param {() => Promise<any>} fn
 */
export async function withLoading(key, fn, opcoes) {
  const id = begin(key, opcoes);
  try {
    return await fn();
  } finally {
    end(id);
  }
}

/**
 * Para listeners em tempo real (onSnapshot): o loading cobre só o
 * intervalo até a PRIMEIRA resposta do listener chegar (snapshot
 * inicial). Atualizações seguintes do mesmo listener não reacendem o
 * loading global — são "background updates".
 * Retorna uma função pra chamar quando o primeiro snapshot chegar
 * (idempotente: só a primeira chamada tem efeito).
 */
export function beginListener(key = "listener") {
  const id = begin(key);
  let finalizado = false;
  return function finalizarPrimeiroSnapshot() {
    if (finalizado) return;
    finalizado = true;
    end(id);
  };
}

/**
 * Estado específico de uma chave (ex: usado por botões/spinners locais
 * que querem saber "esse produto específico está salvando?").
 */
export function estaCarregando(key) {
  if (!key) return pendentes.size > 0;
  return (contadorPorChave.get(key) || 0) > 0;
}

/**
 * Assina mudanças de estado. Retorna função de "unsubscribe".
 */
export function onLoadingChange(callback) {
  listeners.add(callback);
  // envia o estado atual imediatamente
  callback(snapshotState());
  return () => listeners.delete(callback);
}

/**
 * Reset total — só pra uso em testes/depuração manual no console.
 */
export function _resetLoadingParaDebug() {
  for (const info of pendentes.values()) clearTimeout(info.timeoutId);
  pendentes.clear();
  contadorPorChave.clear();
  if (showTimer) clearTimeout(showTimer);
  if (hideTimer) clearTimeout(hideTimer);
  showTimer = null;
  hideTimer = null;
  visivel = false;
  notificar();
}

if (typeof window !== "undefined") {
  window.__loadingManager = { begin, end, withLoading, beginListener, estaCarregando, onLoadingChange, _resetLoadingParaDebug };
}
