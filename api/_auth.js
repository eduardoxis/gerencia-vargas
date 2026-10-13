// api/_auth.js
// Verifica o ID token do Firebase enviado no header Authorization e confirma
// que o usuário tem cargo "admin". Lança erro (com .status) se não estiver
// autenticado ou não for admin — use dentro de um try/catch.
//
// A checagem de cargo é cacheada em memória (por instância "quente" da
// function) por 60s: evita 1 leitura no Firestore a cada chamada de API
// quando o admin faz várias ações seguidas (ex: subir várias imagens),
// sem abrir mão de reverificar com frequência.

import { getAuth } from "firebase-admin/auth";
import { obterDbAdmin } from "./_firebaseAdmin.js";

const TTL_CACHE_CARGO_MS = 60 * 1000;
const cacheCargo = new Map(); // uid -> { ehAdmin, expiraEm }

export async function exigirAdmin(req) {
  const cabecalho = req.headers.authorization || "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  if (!token) {
    const erro = new Error("Não autenticado.");
    erro.status = 401;
    throw erro;
  }

  let decodificado;
  try {
    decodificado = await getAuth().verifyIdToken(token);
  } catch (causa) {
    // Loga o motivo real (ex: auth/argument-error, "incorrect aud" = projeto
    // do Firebase Admin diferente do projeto do site) nos logs da Vercel.
    console.error("[_auth] verifyIdToken falhou:", causa?.code, causa?.message);
    const erro = new Error("Sessão inválida ou expirada.");
    erro.status = 401;
    throw erro;
  }

  const uid = decodificado.uid;
  const emCache = cacheCargo.get(uid);
  let ehAdmin;

  if (emCache && Date.now() < emCache.expiraEm) {
    ehAdmin = emCache.ehAdmin;
  } else {
    const db = obterDbAdmin();
    const snap = await db.collection("usuarios").doc(uid).get();
    const cargos = snap.exists ? snap.data()?.cargos || [] : [];
    ehAdmin = cargos.includes("admin");
    cacheCargo.set(uid, { ehAdmin, expiraEm: Date.now() + TTL_CACHE_CARGO_MS });
  }

  if (!ehAdmin) {
    const erro = new Error("Acesso restrito a administradores.");
    erro.status = 403;
    throw erro;
  }

  return uid;
}
