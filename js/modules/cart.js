// js/modules/cart.js
import { formatBRL, escHtml, podeExecutar } from "../utils/utils.js";
import { salvarLeadPerdido } from "../services/firestore.js";
import { salvarCarrinhoNuvem } from "../services/contaSync.js";
import { STORE_CONFIG } from "../../firebase/firebase-config.js";

const CART_KEY = "papelaria_carrinho";
const LEAD_KEY = "papelaria_ultimo_lead";
let leadSalvo = false;

function linkProdutoComPreview(produto) {
  if (!produto?.id) return "";
  const imagemDaCor = Array.isArray(produto.cores)
    ? produto.cores.flatMap(cor => Array.isArray(cor?.imagens) ? cor.imagens : [cor?.imagem]).find(Boolean)
    : "";
  const imagem = [produto.imagem, ...(Array.isArray(produto.imagens) ? produto.imagens : []), imagemDaCor]
    .find(valor => typeof valor === "string" && valor.trim() && !valor.startsWith("data:")) || "";
  const dados = new URLSearchParams({
    n: String(produto.nome || "Produto").slice(0, 160),
    d: String(produto.descricaoCurta || produto.descricao || "Confira este produto no Espaço Viviane Vargas.").slice(0, 180)
  });
  if (imagem) dados.set("i", imagem);
  return `${window.location.origin}/p/${encodeURIComponent(produto.id)}?${dados}`;
}

export function obterCarrinho() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function salvarCarrinho(carrinho) {
  localStorage.setItem(CART_KEY, JSON.stringify(carrinho));
  atualizarBadgeCarrinho();
  salvarCarrinhoNuvem(carrinho).catch(() => {});
  leadSalvo = false; // qualquer mudança reabre a possibilidade de novo lead
}

export function aplicarCarrinhoSincronizado(carrinho) {
  localStorage.setItem(CART_KEY, JSON.stringify(Array.isArray(carrinho) ? carrinho : []));
  atualizarBadgeCarrinho();
  window.dispatchEvent(new Event("carrinho-atualizado"));
}

/**
 * Gera a chave única do item no carrinho. Produtos com cor selecionada
 * geram uma chave diferente por cor (ex.: "abc123|Azul"); produtos sem
 * cor mantêm a chave igual ao próprio id, preservando compatibilidade
 * com carrinhos já salvos antes da funcionalidade de cores.
 */
export function chaveItemCarrinho(id, cor = "") {
  return cor ? `${id}|${cor}` : id;
}

export function adicionarAoCarrinho(produto, quantidade = 1, cor = "") {
  const carrinho = obterCarrinho();
  const chave = chaveItemCarrinho(produto.id, cor);
  const existente = carrinho.find(i => (i.chave || i.id) === chave);
  if (existente) {
    existente.quantidade += quantidade;
  } else {
    carrinho.push({
      chave,
      id: produto.id,
      nome: produto.nome,
      marca: produto.marca || "",
      preco: produto.preco,
      imagem: produto.imagem || "",
      cor: cor || "",
      quantidade
    });
  }
  salvarCarrinho(carrinho);
}

export function atualizarQuantidade(chave, quantidade) {
  let carrinho = obterCarrinho();
  if (quantidade <= 0) {
    carrinho = carrinho.filter(i => (i.chave || i.id) !== chave);
  } else {
    const item = carrinho.find(i => (i.chave || i.id) === chave);
    if (item) item.quantidade = quantidade;
  }
  salvarCarrinho(carrinho);
}

export function removerDoCarrinho(chave) {
  const carrinho = obterCarrinho().filter(i => (i.chave || i.id) !== chave);
  salvarCarrinho(carrinho);
}

export function limparCarrinho() {
  salvarCarrinho([]);
}

export function calcularTotais(carrinho = obterCarrinho()) {
  const quantidadeItens = carrinho.reduce((acc, i) => acc + i.quantidade, 0);
  const subtotal = carrinho.reduce((acc, i) => acc + i.quantidade * i.preco, 0);
  return { quantidadeItens, subtotal, total: subtotal };
}

export function atualizarBadgeCarrinho() {
  const badge = document.querySelector("[data-cart-badge]");
  if (!badge) return;
  const { quantidadeItens } = calcularTotais();
  badge.textContent = quantidadeItens;
  badge.style.display = quantidadeItens > 0 ? "flex" : "none";
}

export function montarMensagemWhatsApp(nomeCliente = "") {
  const carrinho = obterCarrinho();
  const { total } = calcularTotais(carrinho);
  let msg = "Olá!\nTenho interesse nestes produtos:\n\n";
  carrinho.forEach(item => {
    const corStr = item.cor ? ` (Cor: ${item.cor})` : "";
    msg += `${item.nome}${corStr}\nQuantidade: ${item.quantidade}\nValor: ${formatBRL(item.preco * item.quantidade)}\n\n`;
  });
  msg += `------------------\nTotal: ${formatBRL(total)}\n\n`;
  if (nomeCliente) msg += `Meu nome é: ${nomeCliente}\n\n`;
  msg += "Gostaria de mais informações.";
  return msg;
}

export function finalizarPedidoWhatsApp(nomeCliente = "") {
  const mensagem = montarMensagemWhatsApp(nomeCliente);
  const url = `https://wa.me/${STORE_CONFIG.whatsapp}?text=${encodeURIComponent(mensagem)}`;
  limparCarrinho();
  window.open(url, "_blank");
}

/**
 * Contato rápido sobre UM único produto, sem passar pelo carrinho —
 * útil no card do catálogo ou na página do produto quando o cliente
 * quer perguntar sobre um item específico na hora, sem montar um pedido.
 * @param {{nome:string, marca?:string, id:string}} produto
 */
export function falarSobreProduto(produto) {
  const marcaStr = produto.marca ? ` [${produto.marca}]` : "";
  const endereco = linkProdutoComPreview(produto);
  const link = endereco ? `\n🔗 Link do produto: ${endereco}` : "";
  const mensagem = `Olá!\nTenho interesse neste produto:\n*${produto.nome}*${marcaStr}${link}\n\nPoderia me passar mais informações?`;
  const url = `https://wa.me/${STORE_CONFIG.whatsapp}?text=${encodeURIComponent(mensagem)}`;
  window.open(url, "_blank");
}

/**
 * Chame isto quando o usuário sair da página com itens no carrinho e
 * sem finalizar (ex.: evento beforeunload/visibilitychange), passando
 * opcionalmente nome/telefone se o usuário os informou em algum campo.
 */
export async function registrarLeadPerdidoSeNecessario({ nome = "", telefone = "" } = {}) {
  const carrinho = obterCarrinho();
  if (leadSalvo || carrinho.length === 0) return;
  const assinatura = carrinho.map(i => `${i.chave || i.id}:${i.quantidade}`).sort().join("|");
  try {
    const ultimo = JSON.parse(localStorage.getItem(LEAD_KEY) || "null");
    if (ultimo?.assinatura === assinatura && Date.now() < ultimo.expiraEm) return;
  } catch { /* storage indisponível/corrompido: segue normalmente */ }
  if (!podeExecutar("lead-perdido", 3, 5 * 60_000)) return;
  const { total } = calcularTotais(carrinho);
  leadSalvo = true;
  try {
    localStorage.setItem(LEAD_KEY, JSON.stringify({ assinatura, expiraEm: Date.now() + 30 * 60_000 }));
  } catch { /* segue sem deduplicação persistente */ }
  try {
    await salvarLeadPerdido({
      nome,
      telefone,
      produtos: carrinho.map(i => ({ nome: i.nome, quantidade: i.quantidade, preco: i.preco })),
      valor: total
    });
  } catch (erro) {
    leadSalvo = false;
    try { localStorage.removeItem(LEAD_KEY); } catch { /* ignora */ }
    throw erro;
  }
}
