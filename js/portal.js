import { sair, ouvirEstadoAuth, ehAdmin } from "./services/auth.js";
import { iniciarPainelAdmin } from "./modules/dashboard.js";
import { trocarAba } from "./utils/modal.js";
import { ICONS } from "./utils/icons.js";
const app = document.querySelector("#portal-app");
let iniciado = false;
document.querySelectorAll("[data-icon]").forEach(el => { const nome = el.dataset.icon; if (ICONS[nome]) el.innerHTML = ICONS[nome]; });
async function mostrarPortal(usuario) { const nome = usuario.displayName || usuario.email || ""; app.hidden = false; document.querySelector("#portal-usuario").textContent = nome; document.querySelector("#portal-usuario-lateral").textContent = nome; document.querySelector("#portal-iniciais").textContent = nome.trim().charAt(0).toUpperCase() || "V"; if (!iniciado) { iniciado = true; await iniciarPainelAdmin(app); } }
ouvirEstadoAuth(async usuario => { if (!usuario) { window.location.replace("/login.html"); return; } if (!ehAdmin()) { await sair("/login.html?erro=acesso"); return; } await mostrarPortal(usuario); });
app.querySelectorAll("[data-tab-trigger]").forEach(botao => botao.addEventListener("click", () => { trocarAba(app, botao.dataset.tabTrigger); document.querySelector("#portal-titulo").textContent = botao.textContent.trim(); }));
document.querySelector("#btn-sair-portal").addEventListener("click", () => sair());
