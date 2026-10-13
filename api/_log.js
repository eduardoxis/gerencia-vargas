// api/_log.js
// Grava falhas das functions em "logsErros" no Firestore, pra ter algum
// histórico de monitoramento sem precisar de um serviço externo pago.
// Nunca lança erro — se o log falhar, ignora silenciosamente (não pode
// derrubar a resposta original por causa de um log).

import { obterDbAdmin } from "./_firebaseAdmin.js";
import { FieldValue } from "firebase-admin/firestore";

export async function registrarErro(origem, erro, extra = {}) {
  try {
    const db = obterDbAdmin();
    await db.collection("logsErros").add({
      origem,
      mensagem: String(erro?.message || erro || "Erro desconhecido"),
      status: erro?.status || 500,
      extra,
      criadoEm: FieldValue.serverTimestamp()
    });
  } catch {
    // Não deixa o log quebrar a resposta principal.
  }
}
