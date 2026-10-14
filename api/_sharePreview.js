import { obterDbAdmin } from "./_firebaseAdmin.js";

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const textoMeta = (value, limite, fallback = "") => String(value || fallback)
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, limite);

export function obterImagemDoItem(item) {
  const imagemDaCor = Array.isArray(item.cores)
    ? item.cores.flatMap(cor => Array.isArray(cor?.imagens) ? cor.imagens : [cor?.imagem]).find(Boolean)
    : "";
  return [item.imagem, ...(Array.isArray(item.imagens) ? item.imagens : []), imagemDaCor]
    .find(valor => typeof valor === "string" && valor.trim()) || "";
}

function obterImagem(item, origin, fallback, imagemPorId) {
  const imagem = obterImagemDoItem(item);
  if (!imagem) return `${origin}${fallback}`;
  if (imagem.startsWith("data:")) return imagemPorId;
  if (/^https?:\/\//i.test(imagem)) return imagem;
  return `${origin}/${imagem.replace(/^\//, "")}`;
}

function itemDoLink(req) {
  const nome = typeof req.query?.n === "string" ? req.query.n.trim().slice(0, 160) : "";
  const descricao = typeof req.query?.d === "string" ? req.query.d.trim().slice(0, 180) : "";
  const imagem = typeof req.query?.i === "string" ? req.query.i.trim().slice(0, 2_000) : "";
  return nome || descricao || imagem ? { nome, descricao, imagem } : null;
}

function enviarPreview({ res, item, origin, id, rotaDestino, rotaCompartilhavel, nomeSite, fallbackImagem, tipoImagem }) {
  const tituloOriginal = textoMeta(item.nome, 160, nomeSite);
  const descricaoOriginal = textoMeta(item.descricaoCurta || item.descricao, 160, "Entre em contato para saber mais.");
  const titulo = escapeHtml(tituloOriginal);
  const descricao = escapeHtml(descricaoOriginal);
  const imagemPorId = tipoImagem === "produto"
    ? `${origin}/api/img/${encodeURIComponent(id)}`
    : `${origin}/api/img/${encodeURIComponent(id)}?tipo=${encodeURIComponent(tipoImagem)}`;
  const imagem = obterImagem(item, origin, fallbackImagem, imagemPorId);
  const urlCompartilhavel = `${origin}${rotaCompartilhavel}/${encodeURIComponent(id)}`;
  const destino = `${origin}${rotaDestino}?id=${encodeURIComponent(id)}`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
  return res.status(200).send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${titulo} — ${escapeHtml(nomeSite)}</title>
<meta name="description" content="${descricao}">
<meta property="og:type" content="product">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${descricao}">
<meta property="og:image" content="${escapeHtml(imagem)}">
<meta property="og:image:secure_url" content="${escapeHtml(imagem)}">
<meta property="og:image:alt" content="${titulo}">
<meta property="og:url" content="${escapeHtml(urlCompartilhavel)}">
<meta property="og:site_name" content="${escapeHtml(nomeSite)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${titulo}">
<meta name="twitter:description" content="${descricao}">
<meta name="twitter:image" content="${escapeHtml(imagem)}">
</head><body><p>Abrindo <a href="${escapeHtml(destino)}">${titulo}</a>...</p><script>location.replace(${JSON.stringify(destino)});</script></body></html>`);
}

export function criarPreview({ colecao, rotaDestino, rotaCompartilhavel, nomeSite, fallbackImagem, tipoImagem, validar }) {
  return async function handler(req, res) {
    const id = String(req.query?.id || "");
    const protocolo = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
    const origin = `${protocolo}://${req.headers.host}`;
    const destino = `${origin}${rotaDestino}?id=${encodeURIComponent(id)}`;
    const dadosDoLink = itemDoLink(req);

    try {
      const documento = id ? await obterDbAdmin().collection(colecao).doc(id).get() : null;
      const item = documento?.exists ? documento.data() : null;
      if (item && validar(item)) {
        return enviarPreview({ res, item, origin, id, rotaDestino, rotaCompartilhavel, nomeSite, fallbackImagem, tipoImagem });
      }
      if (dadosDoLink) {
        return enviarPreview({ res, item: dadosDoLink, origin, id, rotaDestino, rotaCompartilhavel, nomeSite, fallbackImagem, tipoImagem });
      }
      return res.redirect(302, rotaDestino.replace(/\.html$/, ".html"));
    } catch (erro) {
      console.error("Erro ao gerar prévia de compartilhamento:", erro);
      if (dadosDoLink) {
        return enviarPreview({ res, item: dadosDoLink, origin, id, rotaDestino, rotaCompartilhavel, nomeSite, fallbackImagem, tipoImagem });
      }
      return res.redirect(302, destino);
    }
  };
}
