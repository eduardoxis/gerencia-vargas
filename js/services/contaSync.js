// Sincroniza dados pessoais da conta entre dispositivos em tempo real.
import { db } from "../../firebase/firebase-config.js";
import { doc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

let usuarioId = null;
let pararCarrinho = null;
let pararFavoritos = null;

function encerrarListeners() {
  pararCarrinho?.();
  pararFavoritos?.();
  pararCarrinho = null;
  pararFavoritos = null;
}

export function iniciarSincronizacaoConta(uid, { carrinhoLocal, favoritosLocais, aplicarCarrinho, aplicarFavoritos }) {
  encerrarListeners();
  usuarioId = uid || null;
  if (!usuarioId) return;

  const carrinhoRef = doc(db, "carrinhos", usuarioId);
  const favoritosRef = doc(db, "favoritos", usuarioId);

  pararCarrinho = onSnapshot(carrinhoRef, (snap) => {
    if (snap.exists()) aplicarCarrinho(Array.isArray(snap.data().itens) ? snap.data().itens : []);
    else salvarCarrinhoNuvem(carrinhoLocal());
  });
  pararFavoritos = onSnapshot(favoritosRef, (snap) => {
    if (snap.exists()) aplicarFavoritos(Array.isArray(snap.data().itens) ? snap.data().itens : []);
    else salvarFavoritosNuvem(favoritosLocais());
  });
}

export function salvarCarrinhoNuvem(itens) {
  if (!usuarioId) return Promise.resolve();
  return setDoc(doc(db, "carrinhos", usuarioId), { itens, atualizadoEm: serverTimestamp() });
}

export function salvarFavoritosNuvem(itens) {
  if (!usuarioId) return Promise.resolve();
  return setDoc(doc(db, "favoritos", usuarioId), { itens, atualizadoEm: serverTimestamp() });
}
