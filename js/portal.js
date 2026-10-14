import { sair, ouvirEstadoAuth, ehAdmin } from "./services/auth.js";
import { trocarAba } from "./utils/modal.js";
import { ICONS } from "./utils/icons.js";

const app = document.querySelector("#portal-app");
let iniciado = false;

function mostrarCarregamentoInicial() {
  const painel = app?.querySelector("#painel-dashboard");
  if (!painel || painel.childElementCount) return;

  painel.innerHTML = `
    <div class="portal-carregando" role="status">
      <span class="portal-carregando__ponto"></span>
      <div>
        <strong>Preparando sua visão geral</strong>
        <p>Carregando as informações da loja...</p>
      </div>
    </div>`;
}

function mostrarFalhaInicial() {
  const painel = app?.querySelector("#painel-dashboard");
  if (!painel) return;

  painel.innerHTML = `
    <div class="portal-load-error portal-load-error--dashboard">
      <strong>Não foi possível carregar a visão geral agora.</strong>
      <p>Confira sua conexão e atualize a página. As demais seções continuam disponíveis no menu lateral.</p>
      <button class="btn-primary" type="button" data-abrir-produtos>Ver produtos</button>
    </div>`;

  painel.querySelector("[data-abrir-produtos]")?.addEventListener("click", () => {
    app.querySelector('[data-tab-trigger="produtos"]')?.click();
  });
}

mostrarCarregamentoInicial();

document.querySelectorAll("[data-icon]").forEach((el) => {
  const nome = el.dataset.icon;
  if (ICONS[nome]) el.innerHTML = ICONS[nome];
});

async function mostrarPortal(usuario) {
  const nome = usuario.displayName || usuario.email || "";

  app.hidden = false;
  document.querySelector("#portal-usuario").textContent = nome;
  document.querySelector("#portal-usuario-lateral").textContent = nome;
  document.querySelector("#portal-iniciais").textContent =
    nome.trim().charAt(0).toUpperCase() || "V";

  if (iniciado) return;
  iniciado = true;

  try {
    const { iniciarPainelAdmin } = await import("./modules/dashboard.js");
    await iniciarPainelAdmin(app);
  } catch (erro) {
    console.error("Falha ao iniciar o painel:", erro);
    mostrarFalhaInicial();
  }
}

ouvirEstadoAuth(async (usuario) => {
  if (!usuario) {
    window.location.replace("/login.html");
    return;
  }

  if (!ehAdmin()) {
    await sair("/login.html?erro=acesso");
    return;
  }

  try {
    await mostrarPortal(usuario);
  } catch (erro) {
    console.error("Falha ao exibir o painel:", erro);
    app.hidden = false;
    mostrarFalhaInicial();
  }
});

app.querySelectorAll("[data-tab-trigger]").forEach((botao) => {
  botao.addEventListener("click", () => {
    trocarAba(app, botao.dataset.tabTrigger);
    document.querySelector("#portal-titulo").textContent = botao.textContent.trim();
  });
});

document.querySelector("#btn-sair-portal").addEventListener("click", () => sair());