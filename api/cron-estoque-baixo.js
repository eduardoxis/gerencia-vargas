// api/cron-estoque-baixo.js
// Rodado automaticamente pelo Vercel Cron (ver vercel.json, todo dia às
// 11h UTC). Varre os produtos ativos com estoque baixo (quantidade <= 3
// por padrão) e grava um alerta em "alertasEstoque" no Firestore, pra
// aparecer no painel admin sem precisar de e-mail/SMS pago.
//
// Protegido pelo header que a própria Vercel envia em toda chamada de
// cron (Authorization: Bearer $CRON_SECRET) — configure a variável de
// ambiente CRON_SECRET no projeto (Vercel → Settings → Environment
// Variables) com qualquer valor aleatório. Sem isso, ninguém de fora
// consegue disparar essa rota manualmente.

import { obterDbAdmin } from "./_firebaseAdmin.js";
import { registrarErro } from "./_log.js";

const LIMITE_ESTOQUE_BAIXO = 3;

export default async function handler(req, res) {
  const segredoEsperado = process.env.CRON_SECRET;
  const cabecalho = req.headers.authorization || "";
  if (segredoEsperado && cabecalho !== `Bearer ${segredoEsperado}`) {
    res.status(401).json({ erro: "Não autorizado." });
    return;
  }

  try {
    const db = obterDbAdmin();
    const snap = await db.collection("produtos")
      .where("status", "==", "disponivel")
      .where("quantidade", "<=", LIMITE_ESTOQUE_BAIXO)
      .select("nome", "quantidade")
      .get();

    const produtosBaixos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => Number(p.quantidade) >= 0);

    if (produtosBaixos.length) {
      // ID determinístico: uma repetição do cron no mesmo dia atualiza o
      // alerta em vez de criar documentos duplicados.
      const idDia = new Date().toISOString().slice(0, 10);
      await db.collection("alertasEstoque").doc(idDia).set({
        criadoEm: new Date(),
        limite: LIMITE_ESTOQUE_BAIXO,
        total: produtosBaixos.length,
        produtos: produtosBaixos.map(p => ({
          id: p.id,
          nome: p.nome || "",
          quantidade: Number(p.quantidade) || 0
        }))
      }, { merge: true });
    }

    res.status(200).json({ ok: true, alertas: produtosBaixos.length });
  } catch (erro) {
    await registrarErro("cron-estoque-baixo", erro);
    res.status(erro.status || 500).json({ erro: erro.message || "Falha ao checar estoque baixo." });
  }
}
