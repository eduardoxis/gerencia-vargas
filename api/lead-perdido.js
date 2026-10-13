import { obterDbAdmin } from "./_firebaseAdmin.js";
import { aplicarLimite } from "./_rateLimit.js";
import { registrarErro } from "./_log.js";
import { FieldValue } from "firebase-admin/firestore";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Método não permitido." });
  try {
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "desconhecido").split(",")[0].trim();
    await aplicarLimite(`lead:${ip}`, { maximo: 5, janelaMs: 15 * 60_000 });
    const { produtos, valor, nome = "", telefone = "" } = req.body || {};
    if (!Array.isArray(produtos) || !produtos.length || produtos.length > 30 || !Number.isFinite(Number(valor)) || Number(valor) < 0) {
      return res.status(400).json({ erro: "Dados do lead inválidos." });
    }
    await obterDbAdmin().collection("leadsPerdidos").add({
      produtos: produtos.slice(0, 30).map(p => ({ nome: String(p?.nome || "").slice(0, 160), quantidade: Math.max(1, Number(p?.quantidade) || 1), preco: Math.max(0, Number(p?.preco) || 0) })),
      valor: Number(valor), nome: String(nome).slice(0, 120), telefone: String(telefone).slice(0, 30), status: "lead_perdido", data: FieldValue.serverTimestamp()
    });
    return res.status(201).json({ ok: true });
  } catch (erro) {
    await registrarErro("lead-perdido", erro);
    return res.status(erro.status || 500).json({ erro: erro.message || "Falha ao registrar lead." });
  }
}
