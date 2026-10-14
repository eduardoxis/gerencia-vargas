import { sair, ouvirEstadoAuth, ehAdmin } from "./services/auth.js";
import { trocarAba } from "./utils/modal.js";
import { ICONS } from "./utils/icons.js";

const app = document.querySelector("#portal-app");
let iniciado = false;

function painelDaAba(aba) {
  return app?.querySelector(`[data-tab-panel="${aba}"]`);
}

function mostrarCarregamento(aba = "dashboard") {
  const painel = painelDaAba(aba);
  if (!painel || painel.childElementCount) return;
  painel.innerHTML = `<div class="portal-carregando" role="status"><span class="portal-carregando__ponto"></span><div><strong>Carregando conteúdo</strong><p>Buscando as informações desta seção...</p></div></div>`;
}

function mostrarFalha(aba = "dashboard") {
  const painel = painelDaAba(aba);
  if (!painel) return;
  painel.innerHTML = `<div class="portal-load-error"><strong>Não foi possível carregar esta seção.</strong><p>Confira sua conexão e tente novamente.</p><button class="btn-primary" type="button" data-recarregar-painel>Atualizar página</button></div>`;
  painel.querySelector("[data-recarregar-painel]")?.addEventListener("click", () => window.location.reload());
}

function atualizarCabecalho(botao) {
  const titulo = botao.querySelector(".nav-label")?.textContent || botao.textContent.trim();
  document.querySelector("#portal-titulo").textContent = titulo;
}

function preencherIcones() {
  document.querySelectorAll("[data-icon]").forEach(el => {
    const nome = el.dataset.icon;
    if (ICONS[nome]) el.innerHTML = ICONS[nome];
  });
}

async function iniciarConteudo() {
  try {
    const { iniciarPainelAdmin } = await import("./modules/dashboard.js");
    await iniciarPainelAdmin(app);
  } catch (erro) {
    console.error("Falha ao iniciar o painel:", erro);
    mostrarFalha();
  }
}

function ligarNavegacao() {
  app.querySelectorAll("[data-tab-trigger]").forEach(botao => {
    botao.addEventListener("click", () => {
      const aba = botao.dataset.tabTrigger;
      trocarAba(app, aba);
      atualizarCabecalho(botao);
      mostrarCarregamento(aba);
    });
  });
}

async function mostrarPortal(usuario) {
  const nome = usuario.displayName || usuario.email || "";
  app.hidden = false;
  document.querySelector("#portal-usuario").textContent = nome;
  document.querySelector("#portal-usuario-lateral").textContent = nome;
  document.querySelector("#portal-iniciais").textContent = nome.trim().charAt(0).toUpperCase() || "V";

  if (iniciado) return;
  iniciado = true;
  mostrarCarregamento();
  ligarNavegacao();
  await iniciarConteudo();
}

preencherIcones();

ouvirEstadoAuth(async usuario => {
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
    mostrarFalha();
  }
});

document.querySelector("#btn-sair-portal").addEventListener("click", () => sair());
