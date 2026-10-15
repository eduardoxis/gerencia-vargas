import { buscarProdutosPorPrefixo, listarClientesPagina, listarCustosProdutos, listarLeadsPerdidosPagina, listarPedidosAdminPagina, listarProdutosPagina } from "../services/firestore.js";
import { escHtml, formatBRL } from "../utils/utils.js";
import { calcularMargem, formatarPct } from "../utils/margem.js";
import { icon } from "../utils/icons.js";

const texto = valor => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const temFoto = p => Boolean(String(p.imagem || "").trim() || p.imagens?.some(Boolean) || p.cores?.some(c => c?.imagem || c?.imagens?.some(Boolean)));

async function todosProdutos() {
  const lista = []; let cursor = null; let temMais = true;
  while (temMais) {
    const pagina = await listarProdutosPagina({ tamanho: 100, cursor, apenasAtivos: false, ordenarPor: "nome" });
    lista.push(...pagina.produtos); cursor = pagina.cursor; temMais = pagina.temMais && pagina.produtos.length > 0;
  }
  return lista;
}

export async function carregarAbaAnalises(container) {
  if (!container) return;
  container.innerHTML = `<div class="admin-panel-head"><h1>Análises do catálogo</h1><p>Lucro, itens sem foto e pendências de organização.</p></div><div class="ferramenta-carregando">Analisando catálogo...</div>`;
  const produtos = await todosProdutos();
  const custos = await listarCustosProdutos(produtos.map(p => p.id));
  const lucro = produtos.map(p => ({ produto:p, margem: custos.has(p.id) ? calcularMargem({ ...custos.get(p.id), preco:p.preco, quantidade:p.quantidade }) : null })).filter(item => item.margem);
  const semFoto = produtos.filter(p => !temFoto(p));
  const semCategoria = produtos.filter(p => !String(p.categoria || "").trim());
  const semMarca = produtos.filter(p => !String(p.marca || "").trim());
  const lucroPotencial = lucro.reduce((s, item) => s + item.margem.lucroEstoque, 0);
  const tabelaLucro = lucro.sort((a,b) => b.margem.lucroEstoque - a.margem.lucroEstoque).slice(0, 30).map(({produto,margem}) => `<tr><td>${escHtml(produto.nome || "Produto")}</td><td>${formatBRL(produto.preco)}</td><td>${formatarPct(margem.margemPct)}</td><td>${formatBRL(margem.lucro)}</td><td>${formatBRL(margem.lucroEstoque)}</td></tr>`).join("") || `<tr><td colspan="5">Cadastre os custos dos produtos para ver o relatório.</td></tr>`;
  const pendencias = (lista, rotulo, aba) => `<article class="analise-pendencia"><strong>${lista.length}</strong><div><h2>${rotulo}</h2><p>${lista.slice(0,3).map(p => escHtml(p.nome || "Produto")).join(", ") || "Nenhum item"}${lista.length > 3 ? "…" : ""}</p></div><button class="btn-secondary" data-abrir-analise="${aba}">Abrir</button></article>`;
  container.innerHTML = `<div class="admin-panel-head"><h1>Análises do catálogo</h1><p>Use estes dados para corrigir o catálogo e acompanhar a rentabilidade.</p></div>
  <section class="analise-resumo"><article><span>${produtos.length}</span><small>Produtos analisados</small></article><article><span>${formatBRL(lucroPotencial)}</span><small>Lucro potencial em estoque</small></article><article><span>${lucro.length}</span><small>Produtos com custo cadastrado</small></article></section>
  <section class="analise-pendencias">${pendencias(semFoto,"Produtos sem foto","produtos")}${pendencias(semCategoria,"Produtos sem categoria","produtos")}${pendencias(semMarca,"Produtos sem marca","produtos")}</section>
  <section class="table-wrap"><table class="admin-table"><thead><tr><th>Produto</th><th>Preço</th><th>Margem</th><th>Lucro/un.</th><th>Lucro no estoque</th></tr></thead><tbody>${tabelaLucro}</tbody></table></section>`;
  container.querySelectorAll("[data-abrir-analise]").forEach(btn => btn.addEventListener("click", () => container.closest("#portal-app")?.querySelector(`[data-tab-trigger="${btn.dataset.abrirAnalise}"]`)?.click()));
}

export function iniciarBuscaGlobal(root) {
  const form = root?.querySelector("#form-busca-global");
  const input = root?.querySelector("#busca-global");
  const painel = root?.querySelector("#resultados-busca-global");
  if (!form || !input || !painel || form.dataset.pronto) return;
  form.dataset.pronto = "1";
  let espera;
  const pesquisar = async () => {
    const termo = input.value.trim(); if (termo.length < 2) { painel.hidden = true; return; }
    painel.hidden = false; painel.textContent = "Buscando...";
    try {
      const [produtos, clientes, pedidos, contatos] = await Promise.all([buscarProdutosPorPrefixo(termo,{tamanho:6}), listarClientesPagina({tamanho:30}), listarPedidosAdminPagina({tamanho:30}), listarLeadsPerdidosPagina({tamanho:30})]);
      const t = texto(termo); const itens = [
        ...produtos.produtos.map(p => ({aba:"produtos", tipo:"Produto", nome:p.nome})),
        ...clientes.itens.filter(x => texto(`${x.nome} ${x.email} ${x.telefone}`).includes(t)).map(x => ({aba:"clientes",tipo:"Cliente",nome:x.nome || x.email})),
        ...pedidos.itens.filter(x => texto(`${x.nomeCliente} ${x.usuarioId}`).includes(t)).map(x => ({aba:"pedidos",tipo:"Pedido",nome:x.nomeCliente || "Cliente"})),
        ...contatos.itens.filter(x => texto(`${x.nome} ${x.telefone}`).includes(t)).map(x => ({aba:"leads",tipo:"Contato",nome:x.nome || "Não informado"}))
      ].slice(0,12);
      painel.innerHTML = itens.length ? itens.map(x => `<button type="button" data-aba-global="${x.aba}"><small>${x.tipo}</small><strong>${escHtml(x.nome || "Sem nome")}</strong></button>`).join("") : "<span>Nenhum resultado recente encontrado.</span>";
      painel.querySelectorAll("[data-aba-global]").forEach(btn => btn.addEventListener("click", () => { root.querySelector(`[data-tab-trigger="${btn.dataset.abaGlobal}"]`)?.click(); painel.hidden=true; input.value=""; }));
    } catch { painel.textContent = "Não foi possível pesquisar agora."; }
  };
  input.addEventListener("input", () => { clearTimeout(espera); espera=setTimeout(pesquisar,300); });
  form.addEventListener("submit", e => { e.preventDefault(); pesquisar(); });
}
