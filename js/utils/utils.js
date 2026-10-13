// js/utils/utils.js

// Grava um erro do lado do cliente em "logsErros" (Firestore), pro admin
// conseguir ver depois no Dashboard. Import dinâmico pra não criar
// dependência circular com módulos que já importam utils.js.
let logsEnviadosNestaPagina = 0;
export async function registrarErroCliente(origem, erro, extra = {}) {
  try {
    if (logsEnviadosNestaPagina >= 5) return;
    const mensagem = String(erro?.message || erro || "Erro desconhecido");
    let hash = 0;
    for (const caractere of `${origem}:${mensagem}`) hash = ((hash << 5) - hash + caractere.charCodeAt(0)) | 0;
    const chave = `futura:erro:${hash}`;
    const ultimoEnvio = Number(localStorage.getItem(chave)) || 0;
    if (Date.now() - ultimoEnvio < 30 * 60_000) return;
    localStorage.setItem(chave, String(Date.now()));
    logsEnviadosNestaPagina += 1;

    const { db } = await import("../../firebase/firebase-config.js");
    const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js");
    await addDoc(collection(db, "logsErros"), {
      origem,
      mensagem,
      extra,
      criadoEm: serverTimestamp()
    });
  } catch {
    // Se nem o log der certo, não tem o que fazer — não pode travar a UI por isso.
  }
}

export function escHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Extrai a posição de enquadramento salva na própria URL da imagem (ex: "...jpg#pos=30,70").
// Guardamos isso no fragmento (#) da URL porque o fragmento nunca é enviado ao servidor,
// então não interfere no carregamento da imagem nem exige mudar o formato salvo no Firestore.
export function imgPos(url = "", largura = 720) {
  const original = String(url || "");
  const m = original.match(/#pos=([\d.]+),([\d.]+)$/);
  let src = original.replace(/#pos=[\d.]+,[\d.]+$/, "");

  // O Cloudinary redimensiona e escolhe o formato mais leve na borda. O
  // Firestore continua guardando só a URL original, sem criar variantes.
  if (/^https:\/\/res\.cloudinary\.com\//.test(src) && src.includes("/image/upload/")) {
    const larguraSegura = Math.max(64, Math.min(1600, Math.round(Number(largura) || 720)));
    src = src.replace("/image/upload/", `/image/upload/f_auto,q_auto:eco,c_limit,w_${larguraSegura}/`);
  }

  return { src, pos: m ? `${m[1]}% ${m[2]}%` : "50% 50%" };
}

const FORMATADOR_BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(value = 0) {
  return FORMATADOR_BRL.format(Number(value) || 0);
}

export function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("pt-BR");
}

export function slugify(text = "") {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

export function generateCode(prefix = "PROD") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function toast(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Limitador simples de ações no cliente (ex.: evitar múltiplos cliques em
 * "Finalizar pedido" ou tentativas repetidas de login). Isto é apenas uma
 * camada de UX — a proteção real contra abuso/spam deve vir do Firebase
 * App Check e das Firestore Security Rules (veja SECURITY.md).
 * @param {string} chave identificador único da ação (ex.: "login", "finalizar-pedido")
 * @param {number} limite quantidade máxima de execuções permitidas
 * @param {number} janelaMs período em milissegundos para o limite
 * @returns {boolean} true se a ação pode ser executada agora
 */
export function mascararCPF(valor) {
  return valor.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function mascararCNPJ(valor) {
  return valor.replace(/\D/g, "").slice(0, 14)
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function mascararTelefone(valor) {
  const numeros = valor.replace(/\D/g, "").slice(0, 11);
  if (numeros.length <= 10) {
    return numeros
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return numeros
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

export function pareceEmail(valor = "") {
  return /\S+@\S+\.\S+/.test(valor);
}

export function podeExecutar(chave, limite = 5, janelaMs = 60_000) {
  const agora = Date.now();
  const registro = JSON.parse(sessionStorage.getItem(`ratelimit_${chave}`) || "[]")
    .filter(t => agora - t < janelaMs);

  if (registro.length >= limite) return false;

  registro.push(agora);
  sessionStorage.setItem(`ratelimit_${chave}`, JSON.stringify(registro));
  return true;
}

/**
 * Igual a podeExecutar(), mas persiste em localStorage (sobrevive a fechar
 * a aba/navegador). Usado para limitar por e-mail ações sensíveis como
 * pedidos de redefinição de senha, dificultando spam mesmo reabrindo o site.
 */
export function podeExecutarPersistente(chave, limite = 5, janelaMs = 60 * 60_000) {
  const agora = Date.now();
  const registro = JSON.parse(localStorage.getItem(`ratelimit_${chave}`) || "[]")
    .filter(t => agora - t < janelaMs);

  if (registro.length >= limite) return false;

  registro.push(agora);
  localStorage.setItem(`ratelimit_${chave}`, JSON.stringify(registro));
  return true;
}

/**
 * Comprime uma imagem (File) e retorna uma string Base64 (JPEG) já reduzida,
 * para caber com folga dentro do limite de 1MB por documento do Firestore.
 * @param {File} file
 * @param {number} maxWidth
 * @param {number} quality 0..1
 * @returns {Promise<string>} data URL base64
 */
/**
 * Converte uma imagem (File) para WebP no navegador, redimensionando pela
 * largura máxima e aplicando compressão de qualidade. Retorna um Blob.
 * Usado antes do upload para o serviço externo de hospedagem de imagens
 * (nunca salvamos base64 no Firestore nem usamos Firebase Storage).
 */
export function converterParaWebP(file, maxWidth = 800, qualidade = 0.8) {
  return converterParaFormato(file, "image/webp", maxWidth, qualidade);
}

/**
 * Mesma lógica de converterParaWebP, mas gera PNG — usado para imagens de
 * categoria/marca, que costumam ser logos com fundo transparente e ficam
 * melhor em PNG do que recomprimidas em WebP com perdas.
 */
export function converterParaPNG(file, maxWidth = 500) {
  return converterParaFormato(file, "image/png", maxWidth, 1);
}

/**
 * Padroniza qualquer foto de produto para a proporção fixa 411x732 (retrato),
 * "encaixando" a imagem inteira (sem cortar nada) centralizada num fundo
 * branco. Assim, seja a foto quadrada, paisagem ou já retrato, o arquivo
 * final sempre sai com as mesmas proporções — os cards do site nunca ficam
 * com tamanhos diferentes por causa da imagem original.
 */
export function converterParaProporcaoPadrao(file, mime = "image/webp", qualidade = 0.85) {
  const RAZAO_W = 411, RAZAO_H = 732;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // canvas final em resolução 2x pra ficar nítido em telas retina
        const canvas = document.createElement("canvas");
        canvas.width = RAZAO_W * 2;
        canvas.height = RAZAO_H * 2;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const escala = Math.min(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * escala, h = img.height * escala;
        const x = (canvas.width - w) / 2, y = (canvas.height - h) / 2;
        ctx.drawImage(img, x, y, w, h);

        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error(`Falha ao gerar ${mime}`))),
          mime,
          qualidade
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function converterParaFormato(file, mime, maxWidth, qualidade) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error(`Falha ao gerar ${mime}`))),
          mime,
          qualidade
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Pede confirmação através de um modal (não usa o confirm() nativo do
 * navegador). Retorna uma Promise<boolean> resolvida conforme a escolha.
 */
export function confirmarAcao(mensagem, { titulo = "Confirmar ação", textoConfirmar = "Remover", textoCancelar = "Cancelar" } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "dialog-form dialog-confirm";
    dialog.innerHTML = `
      <div class="confirm-box">
        <h3>${escHtml(titulo)}</h3>
        <p>${escHtml(mensagem)}</p>
        <div class="form-actions">
          <button type="button" data-confirm-nao>${escHtml(textoCancelar)}</button>
          <button type="button" class="btn-primary btn-perigo" data-confirm-sim>${escHtml(textoConfirmar)}</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.showModal();

    const finalizar = (resultado) => {
      dialog.close();
      dialog.remove();
      resolve(resultado);
    };
    dialog.querySelector("[data-confirm-sim]").addEventListener("click", () => finalizar(true));
    dialog.querySelector("[data-confirm-nao]").addEventListener("click", () => finalizar(false));
    dialog.addEventListener("cancel", () => finalizar(false));
  });
}

export function compressImageToBase64(file, maxWidth = 800, quality = 0.7, format = "jpeg") {
  // Mantida apenas para compatibilidade com dados antigos que ainda tenham
  // imagens em base64 no Firestore (ver migrarImagensAntigas em cloudinary.js).
  // Novos uploads NÃO devem usar esta função — usar converterParaWebP().
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const mime = format === "png" ? "image/png" : "image/jpeg";
        resolve(canvas.toDataURL(mime, quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
