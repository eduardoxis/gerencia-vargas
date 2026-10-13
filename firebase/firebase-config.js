// firebase/firebase-config.js
// Substitua pelos dados do SEU projeto Firebase (Configurações do projeto > Config do SDK)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCyArltCydqFPwNLvlUEkREuV8PdzAt5kc",
  authDomain: "espaco-viviane-vargas.firebaseapp.com",
  projectId: "espaco-viviane-vargas",
  storageBucket: "espaco-viviane-vargas.firebasestorage.app",
  messagingSenderId: "738486287061",
  appId: "1:738486287061:web:a513926f08f786760f405c"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// API atual do Firestore: mantém dados entre recarregamentos e sincroniza
// o cache entre abas, sem usar a função legada que gerava aviso no console.
export const db = typeof window !== "undefined"
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    })
  : getFirestore(app);

// Configurações gerais da loja — edite aqui
export const STORE_CONFIG = {
  nome: "Espaço Viviane Vargas",
  whatsapp: "5561995072128", // DDI+DDD+numero, sem espaços/símbolos
  endereco: "R. Benjamin Roriz - St. Aeroporto, Luziânia - GO, 72800-380",
  email: "vivianefvargas@hotmail.com",
  instagram: "https://www.instagram.com/vivianefvargas/"
};
