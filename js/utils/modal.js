// js/utils/modal.js
export function abrirModal(modalEl) {
  modalEl.classList.add("is-open");
  document.body.classList.add("no-scroll");
  document.body.style.overflow = "hidden";
  const focoInicial = modalEl.querySelector("[data-modal-autofocus]") || modalEl;
  focoInicial.focus?.();
}

export function fecharModal(modalEl) {
  if (!modalEl?.classList.contains("is-open")) return;
  modalEl.classList.remove("is-open");
  document.body.classList.remove("no-scroll");
  document.body.style.overflow = "";
  modalEl.dispatchEvent(new CustomEvent("modal:fechado"));
}

export function iniciarModais() {
  document.querySelectorAll("[data-modal-target]").forEach(trigger => {
    trigger.addEventListener("click", () => {
      const modal = document.querySelector(trigger.dataset.modalTarget);
      if (modal) abrirModal(modal);
    });
  });

  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest("[data-modal-close]")) {
        fecharModal(modal);
      }
      const voltarBtn = e.target.closest("[data-modal-back]");
      if (voltarBtn) {
        const alvo = document.querySelector(voltarBtn.dataset.modalBack);
        fecharModal(modal);
        if (alvo) abrirModal(alvo);
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal.is-open").forEach(fecharModal);
    }
  });
}

export function trocarAba(painelEl, abaId) {
  painelEl.querySelectorAll("[data-tab-panel]").forEach(p => {
    p.hidden = p.dataset.tabPanel !== abaId;
  });
  painelEl.querySelectorAll("[data-tab-trigger]").forEach(t => {
    t.classList.toggle("is-active", t.dataset.tabTrigger === abaId);
  });
}
