// js/utils/whatsapp.js
// Helpers genéricos e reutilizáveis para montar links e abrir o WhatsApp.
import { STORE_CONFIG } from "../../firebase/firebase-config.js";

/** Saudação automática conforme o horário local do visitante. */
export function saudacao() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** Monta a URL do wa.me já com a mensagem codificada. */
export function linkWhatsApp(mensagem, numero = STORE_CONFIG.whatsapp) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

/** Abre o WhatsApp (nova aba) com a mensagem informada. */
export function abrirWhatsApp(mensagem, numero = STORE_CONFIG.whatsapp) {
  window.open(linkWhatsApp(mensagem, numero), "_blank", "noopener");
}
