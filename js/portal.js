import { entrar, sair, ouvirEstadoAuth, ehAdmin } from "./services/auth.js";
import { iniciarPainelAdmin } from "./modules/dashboard.js";
import { trocarAba } from "./utils/modal.js";
import { ICONS } from "./utils/icons.js";
const app = document.querySelector("#portal-app"), login = document.querySelector("#portal-login"), form = document.querySelector("#form-acesso"), erro = document.querySelector("#erro-acesso");
let iniciado = false;
document.querySelectorAll("[data-icon]").forEach(el => { const nome = el.dataset.icon; if (ICONS[nome]) el.innerHTML = ICONS[nome]; });
function mostrarAcesso(mensagem = "") { app.hidden = true; login.hidden = false; erro.textContent = mensagem; }
async function mostrarPortal(usuario) { login.hidden = true; app.hidden = false; document.querySelector("#portal-usuario").textContent = usuario.displayName || usuario.email || ""; if (!iniciado) { iniciado = true; await iniciarPainelAdmin(app); } }
ouvirEstadoAuth(async usuario => { if (!usuario) return mostrarAcesso(); if (!ehAdmin()) { await sair(); return mostrarAcesso("Esta conta não possui acesso a este ambiente."); } await mostrarPortal(usuario); });
form.addEventListener("submit", async e => { e.preventDefault(); erro.textContent = ""; const botao = form.querySelector("button"); botao.disabled = true; try { await entrar(form.email.value.trim(), form.senha.value, true); } catch (x) { erro.textContent = x.message || "Não foi possível entrar."; } finally { botao.disabled = false; } });
app.querySelectorAll("[data-tab-trigger]").forEach(botao => botao.addEventListener("click", () => { trocarAba(app, botao.dataset.tabTrigger); document.querySelector("#portal-titulo").textContent = botao.textContent.trim(); }));
document.querySelector("#btn-sair-portal").addEventListener("click", () => sair());
