// js/services/imagem-base64.js
// Comprime uma imagem no navegador e devolve um data URL (base64) pronto para
// salvar direto no Firestore — sem Cloudinary e sem Firebase Storage.
//
// O Firestore limita cada documento a 1 MiB. Por isso a compressão é adaptativa:
// reduz qualidade e, se preciso, a largura, até a imagem caber em `maxBytes`.

const TIPOS_ACEITOS = /^image\/(png|jpe?g|webp|gif|avif|bmp)$/i;
const LIMITE_ARQUIVO_ORIGINAL = 15 * 1024 * 1024; // só evita travar o navegador

function carregarBitmap(file) {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível ler a imagem.")); };
    img.src = url;
  });
}

function desenhar(bitmap, largura) {
  const w = bitmap.width || bitmap.naturalWidth;
  const h = bitmap.height || bitmap.naturalHeight;
  const escala = Math.min(1, largura / w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * escala));
  canvas.height = Math.max(1, Math.round(h * escala));
  const ctx = canvas.getContext("2d");
  // Fundo claro: evita área preta quando a origem é PNG transparente e o destino é JPEG.
  ctx.fillStyle = "#fffdfb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function tamanhoDataUrl(dataUrl) {
  // bytes aproximados do conteúdo base64
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor(base64.length * 0.75);
}

function formatoSuportado(mime) {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  return c.toDataURL(mime).startsWith(`data:${mime}`);
}

/**
 * @param {File|Blob} file
 * @param {{ maxLargura?: number, maxBytes?: number, qualidade?: number }} opcoes
 * @returns {Promise<string>} data URL (image/webp, ou image/jpeg se o navegador não gerar WebP)
 */
export async function comprimirParaBase64(file, { maxLargura = 800, maxBytes = 130 * 1024, qualidade = 0.8 } = {}) {
  if (!file || !TIPOS_ACEITOS.test(file.type || "")) {
    throw new Error("Escolha uma imagem nos formatos JPG, PNG ou WebP.");
  }
  if (file.size > LIMITE_ARQUIVO_ORIGINAL) {
    throw new Error("Imagem muito grande (máx. 15MB). Escolha uma menor.");
  }

  const mime = formatoSuportado("image/webp") ? "image/webp" : "image/jpeg";
  const bitmap = await carregarBitmap(file);

  let largura = maxLargura;
  let q = qualidade;
  let resultado = "";

  for (let tentativa = 0; tentativa < 12; tentativa++) {
    resultado = desenhar(bitmap, largura).toDataURL(mime, q);
    if (tamanhoDataUrl(resultado) <= maxBytes) break;
    if (q > 0.5) q -= 0.1;
    else largura = Math.round(largura * 0.85);
  }
  bitmap.close?.();

  if (tamanhoDataUrl(resultado) > maxBytes * 1.6) {
    throw new Error("Não foi possível reduzir esta imagem o bastante. Tente uma foto menor.");
  }
  return resultado;
}

/** Soma aproximada (em bytes) de uma lista de data URLs / URLs. */
export function bytesTotais(urls = []) {
  return urls.reduce((soma, u) => soma + (typeof u === "string" ? u.length : 0), 0);
}

// Margem de segurança: o documento tem outros campos além das fotos.
export const LIMITE_FOTOS_DOC_BYTES = 880 * 1024;
