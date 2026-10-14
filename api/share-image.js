import { obterDbAdmin } from "./_firebaseAdmin.js";
import { obterImagemDoItem } from "./_sharePreview.js";

const CONFIGURACOES = {
  produto: { colecao: "produtos", permitido: item => item.status !== "oculto" },
  servico: { colecao: "servicos", permitido: item => item.status === "disponivel" }
};

function lerImagemBase64(url) {
  const encontrada = String(url || "").match(/^data:(image\/(?:avif|gif|jpe?g|png|webp));base64,([a-z0-9+/=]+)$/i);
  if (!encontrada) return null;
  const dados = Buffer.from(encontrada[2], "base64");
  return dados.length && dados.length <= 2 * 1024 * 1024
    ? { mime: encontrada[1].toLowerCase(), dados }
    : null;
}

export default async function handler(req, res) {
  const tipo = String(req.query?.tipo || "");
  const id = String(req.query?.id || "");
  const configuracao = CONFIGURACOES[tipo];
  if (!configuracao || !id) return res.status(400).send("Imagem inválida.");

  try {
    const documento = await obterDbAdmin().collection(configuracao.colecao).doc(id).get();
    const item = documento.exists ? documento.data() : null;
    if (!item || !configuracao.permitido(item)) return res.status(404).send("Imagem não encontrada.");

    const imagem = obterImagemDoItem(item);
    const base64 = lerImagemBase64(imagem);
    if (base64) {
      res.setHeader("Content-Type", base64.mime);
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
      return res.status(200).send(base64.dados);
    }
    if (/^https?:\/\//i.test(imagem)) return res.redirect(302, imagem);
    return res.status(404).send("Imagem não encontrada.");
  } catch (erro) {
    console.error("Erro ao buscar imagem de compartilhamento:", erro);
    return res.status(500).send("Não foi possível carregar a imagem.");
  }
}
