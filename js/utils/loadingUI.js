// js/utils/loadingUI.js
//
// Loading global central em pontos, ligado ao estado real do loadingManager.
// Não cria elementos duplicados quando importado por páginas diferentes.

import { onLoadingChange } from "./loadingManager.js";

const OVERLAY_ID = "loading-global-overlay";

function garantirEstilos() {
  if (document.getElementById("loading-global-style")) return;
  const style = document.createElement("style");
  style.id = "loading-global-style";
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, .9);
      backdrop-filter: blur(2px);
      pointer-events: none;
      visibility: hidden;
      opacity: 0;
      transition: opacity .18s ease, visibility 0s linear .18s;
    }
    #${OVERLAY_ID}.ativo {
      visibility: visible;
      opacity: 1;
      transition-delay: 0s;
    }
    #${OVERLAY_ID} .loading-global-spinner {
      position: relative;
      width: 64px;
      height: 64px;
      animation: loadingGlobalDotsRotate .9s steps(10, end) infinite;
    }
    #${OVERLAY_ID} .loading-global-spinner span {
      position: absolute;
      top: 3px;
      left: 50%;
      width: 11px;
      height: 11px;
      margin-left: -5.5px;
      border-radius: 50%;
      transform-origin: 5.5px 29px;
    }
    #${OVERLAY_ID} .loading-global-spinner span:nth-child(1)  { transform: rotate(0deg) scale(1);      background: #505050; }
    #${OVERLAY_ID} .loading-global-spinner span:nth-child(2)  { transform: rotate(36deg) scale(.96);  background: #5f5f5f; }
    #${OVERLAY_ID} .loading-global-spinner span:nth-child(3)  { transform: rotate(72deg) scale(.9);   background: #767676; }
    #${OVERLAY_ID} .loading-global-spinner span:nth-child(4)  { transform: rotate(108deg) scale(.82); background: #919191; }
    #${OVERLAY_ID} .loading-global-spinner span:nth-child(5)  { transform: rotate(144deg) scale(.74); background: #adadad; }
    #${OVERLAY_ID} .loading-global-spinner span:nth-child(6)  { transform: rotate(180deg) scale(.68); background: #c7c7c7; }
    #${OVERLAY_ID} .loading-global-spinner span:nth-child(7)  { transform: rotate(216deg) scale(.62); background: #dedede; }
    #${OVERLAY_ID} .loading-global-spinner span:nth-child(8)  { transform: rotate(252deg) scale(.68); background: #c9c9c9; }
    #${OVERLAY_ID} .loading-global-spinner span:nth-child(9)  { transform: rotate(288deg) scale(.78); background: #a5a5a5; }
    #${OVERLAY_ID} .loading-global-spinner span:nth-child(10) { transform: rotate(324deg) scale(.9);  background: #747474; }
    @keyframes loadingGlobalDotsRotate {
      to { transform: rotate(360deg); }
    }

    @media (prefers-reduced-motion: reduce) {
      #${OVERLAY_ID} .loading-global-spinner { animation-duration: 1.8s; }
    }
  `;
  document.head.appendChild(style);
}

function garantirElementos() {
  garantirEstilos();

  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `<div class="loading-global-spinner" role="status" aria-label="Carregando">${Array.from({ length: 10 }, () => "<span></span>").join("")}</div>`;
    document.body.appendChild(overlay);
  }

  return overlay;
}

function definirVisibilidade(overlay, visivel) {
  overlay.classList.toggle("ativo", visivel);
  overlay.setAttribute("aria-hidden", String(!visivel));
}

let iniciado = false;

/** Liga o indicador central ao loading real da aplicação. */
export function iniciarLoadingGlobal() {
  if (iniciado) return;
  iniciado = true;

  const start = () => {
    const overlay = garantirElementos();
    onLoadingChange((state) => definirVisibilidade(overlay, state.visivel));
  };

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}

/** Mostra o mesmo indicador em uma operação bloqueante explícita. */
export function mostrarBloqueio() {
  const overlay = garantirElementos();
  definirVisibilidade(overlay, true);
  return () => definirVisibilidade(overlay, false);
}
