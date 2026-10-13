// api/_firebaseAdmin.js
// Inicializa o Firebase Admin SDK uma única vez (reaproveitado entre chamadas
// da mesma function "quente"). Usa uma conta de serviço — tem acesso total
// ao Firestore, ignorando as Security Rules — por isso essas credenciais só
// podem existir aqui no backend, nunca no frontend.
//
// Variáveis de ambiente necessárias (configure em Vercel → Settings →
// Environment Variables, nos 3 ambientes: Production, Preview, Development):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY
//
// Como conseguir esses valores:
//   1. Console do Firebase → ⚙️ Configurações do projeto → Contas de serviço
//   2. Clique em "Gerar nova chave privada" — baixa um .json
//   3. Copie project_id → FIREBASE_PROJECT_ID
//      Copie client_email → FIREBASE_CLIENT_EMAIL
//      Copie private_key → FIREBASE_PRIVATE_KEY (cole com as quebras de linha
//      como "\n" mesmo — o código abaixo converte de volta)
//   4. NUNCA suba esse .json baixado pro GitHub.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function normalizarChavePrivada(valor) {
  return String(valor || "")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\n/g, "\n");
}

function obterApp() {
  if (getApps().length) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // A Vercel pode preservar quebras reais, receber "\\n" literal ou incluir
  // aspas ao colar o campo private_key do JSON. Todos os formatos viram PEM.
  const privateKey = normalizarChavePrivada(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Faltam variáveis de ambiente do Firebase Admin (FIREBASE_PROJECT_ID, " +
      "FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY). Configure em Vercel → " +
      "Settings → Environment Variables e faça um novo deploy."
    );
  }

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export function obterDbAdmin() {
  return getFirestore(obterApp());
}
