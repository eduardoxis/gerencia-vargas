// api/cloudinary-signature.js
// Gera uma assinatura de upload do Cloudinary no servidor. O navegador nunca
// vê o API secret — só recebe uma assinatura válida por poucos minutos
// (timestamp) para os parâmetros exatos que ele vai enviar.
//
// Variáveis de ambiente necessárias (Vercel → Settings → Environment Variables):
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET
//
// Como conseguir: painel do Cloudinary → Dashboard → copie "Cloud name",
// "API Key" e "API Secret" (clique em "reveal" pra ver o secret).

import crypto from "node:crypto";
import { exigirAdmin } from "./_auth.js";
import { aplicarLimite } from "./_rateLimit.js";
import { registrarErro } from "./_log.js";

const PASTA = "papelaria-futura";
const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024; // 5MB
const TIPOS_PERMITIDOS = ["image/webp", "image/png", "image/jpeg"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ erro: "Método não permitido." });
    return;
  }

  try {
    const uid = await exigirAdmin(req);
    await aplicarLimite(`cloudinary:${uid}`, { maximo: 20, janelaMs: 10 * 60 * 1000 });

    const { tamanho, tipo } = req.body || {};
    if (typeof tamanho === "number" && tamanho > TAMANHO_MAXIMO_BYTES) {
      res.status(400).json({ erro: "Arquivo maior que 5MB." });
      return;
    }
    if (tipo && !TIPOS_PERMITIDOS.includes(tipo)) {
      res.status(400).json({ erro: "Tipo de arquivo não permitido." });
      return;
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error("Cloudinary não configurado no servidor (variáveis de ambiente ausentes).");
    }

    const timestamp = Math.round(Date.now() / 1000);
    const paramsParaAssinar = `folder=${PASTA}&timestamp=${timestamp}`;
    const signature = crypto
      .createHash("sha1")
      .update(paramsParaAssinar + apiSecret)
      .digest("hex");

    res.status(200).json({ signature, timestamp, apiKey, cloudName, folder: PASTA });
  } catch (erro) {
    console.error("[cloudinary-signature]", erro?.status, erro?.message, erro);
    await registrarErro("cloudinary-signature", erro);
    res.status(erro.status || 500).json({ erro: erro.message || "Falha ao gerar assinatura." });
  }
}
