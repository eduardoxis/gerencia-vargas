import { entrar, ouvirEstadoAuth, ehAdmin, sair } from "./services/auth.js";
import { ICONS } from "./utils/icons.js";

const form = document.querySelector("#form-acesso");
const erro = document.querySelector("#erro-acesso");
let enviando = false;

document.querySelectorAll("[data-icon]").forEach(el => {
  const nome = el.dataset.icon;
  if (ICONS[nome]) el.innerHTML = ICONS[nome];
});

if (new URLSearchParams(window.location.search).get("erro") === "acesso") {
  erro.textContent = "Esta conta não possui acesso a este ambiente.";
}

ouvirEstadoAuth(async usuario => {
  if (!usuario) return;
  if (!ehAdmin()) {
    await sair("/login.html?erro=acesso");
    return;
  }
  window.location.replace("/");
});

form.addEventListener("submit", async evento => {
  evento.preventDefault();
  erro.textContent = "";
  const botao = form.querySelector("button[type=submit]");
  enviando = true;
  botao.disabled = true;
  try {
    await entrar(form.email.value.trim(), form.senha.value, form.manterLogin.checked);
  } catch (causa) {
    erro.textContent = causa.message || "Não foi possível entrar.";
    enviando = false;
    botao.disabled = false;
  }
});
