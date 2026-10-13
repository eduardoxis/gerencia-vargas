import { obterDbAdmin } from "../_firebaseAdmin.js";
import { obterImagemDoItem } from "../_sharePreview.js";

const FALLBACK = "/assets/images/hero-produtos.jpg";
const FONTES = {
  produto: { colecao: "produtos", permitido: item => item.status !== "oculto" },
  servico: { colecao: "servicos", permitido: item => item.status === "disponivel" }
};

function imagemBase64(valor) {
  const resultado = String(valor || "").match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,([a-z0-9+/=]+)$/i);
  if (!resultado) return null;
  const bytes = Buffer.from(resultado[2], "base64");
  return bytes.length > 0 && bytes.length <= 2 * 1024 * 1024
    ? { tipo: resultado[1].toLowerCase(), bytes }
    : null;
}

function origemDaRequisicao(req) {
  const protocolo = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  return `${protocolo}://${req.headers.host}`;
}

export default async function handler(req, res) {
  const id = String(req.query?.id || "");
  const tipo = String(req.query?.tipo || "produto");
  const fonte = FONTES[tipo];
  const origin = origemDaRequisicao(req);

  if (!fonte || !id) return res.redirect(302, `${origin}${FALLBACK}`);

  try {
    const documento = await obterDbAdmin().collection(fonte.colecao).doc(id).get();
    const item = documento.exists ? documento.data() : null;
    if (!item || !fonte.permitido(item)) return res.redirect(302, `${origin}${FALLBACK}`);

    const imagem = obterImagemDoItem(item);
    const base64 = imagemBase64(imagem);
    if (base64) {
      res.setHeader("Content-Type", base64.tipo);
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600");
      return res.status(200).send(base64.bytes);
    }
    if (/^https?:\/\//i.test(imagem)) return res.redirect(302, imagem);
    if (imagem) return res.redirect(302, `${origin}/${imagem.replace(/^\//, "")}`);
  } catch (erro) {
    console.error("Erro ao buscar imagem do produto para compartilhamento:", erro);
  }

  return res.redirect(302, `${origin}${FALLBACK}`);
}
