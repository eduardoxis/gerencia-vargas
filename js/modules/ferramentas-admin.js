import {
  gerarBackupAdministrativo, listarLeadsPerdidosPagina, listarPedidosAdminPagina,
  listarProdutosPagina, listarUltimoAlertaEstoque
} from "../services/firestore.js";
import { escHtml, formatBRL, toast } from "../utils/utils.js";
import { icon } from "../utils/icons.js";

function dataDaLoja(valor) {
  const segundos = valor?.seconds;
  return segundos ? new Date(segundos * 1000).toLocaleString("pt-BR") : "Agora";
}

function numeroDaData(valor) {
  return Number(valor?.seconds || 0) * 1000;
}

function baixarArquivo(conteudo, nome, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function serializarParaBackup(valor) {
  if (valor === null || typeof valor !== "object") return valor;
  if (typeof valor.toDate === "function") return { __tipo: "timestamp", valor: valor.toDate().toISOString() };
  if (valor instanceof Date) return { __tipo: "date", valor: valor.toISOString() };
  if (Array.isArray(valor)) return valor.map(serializarParaBackup);
  return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, serializarParaBackup(item)]));
}

async function listarTodosProdutosParaCatalogo(apenasPublicos) {
  const produtos = [];
  let cursor = null;
  let temMais = true;
  while (temMais) {
    const pagina = await listarProdutosPagina({
      tamanho: 100,
      cursor,
      apenasAtivos: apenasPublicos,
      ordenarPor: "nome"
    });
    produtos.push(...pagina.produtos);
    cursor = pagina.cursor;
    temMais = pagina.temMais && pagina.produtos.length > 0;
  }
  return produtos;
}

function htmlCatalogoParaImpressao(produtos) {
  const itens = produtos.map(produto => {
    const imagem = String(produto.imagem || produto.imagens?.[0] || "").trim();
    const imagemHtml = imagem
      ? `<img src="${escHtml(imagem)}" alt="${escHtml(produto.nome || "Produto")}">`
      : `<div class="sem-imagem">Sem imagem</div>`;
    return `<article class="produto">
      <div class="foto">${imagemHtml}</div>
      <h2>${escHtml(produto.nome || "Produto sem nome")}</h2>
      ${produto.marca ? `<p class="marca">${escHtml(produto.marca)}</p>` : ""}
      <strong>${escHtml(formatBRL(produto.preco))}</strong>
    </article>`;
  }).join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Catálogo - Espaço Viviane Vargas</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing:border-box; } body { font-family:Arial,sans-serif; color:#2d1c18; margin:0; }
    header { border-bottom:2px solid #7d1117; margin-bottom:18px; padding-bottom:10px; }
    h1 { margin:0; color:#7d1117; font-size:24px; } header p { margin:5px 0 0; color:#755d55; font-size:12px; }
    .grade { display:grid; grid-template-columns:repeat(3,1fr); gap:13px; }
    .produto { break-inside:avoid; border:1px solid #e8ded9; border-radius:8px; overflow:hidden; padding:9px; }
    .foto { height:155px; display:grid; place-items:center; background:#faf7f5; } .foto img { max-width:100%; max-height:100%; object-fit:contain; }
    .sem-imagem { color:#927d74; font-size:12px; } h2 { font-size:12px; line-height:1.35; margin:9px 0 4px; } .marca { color:#806b62; font-size:10px; margin:0 0 6px; } strong { color:#7d1117; font-size:13px; }
    footer { margin-top:18px; color:#806b62; font-size:10px; text-align:center; }
  </style></head><body><header><h1>Espaço Viviane Vargas</h1><p>Catálogo de produtos · gerado em ${new Date().toLocaleDateString("pt-BR")}</p></header><main class="grade">${itens || "<p>Nenhum produto encontrado.</p>"}</main><footer>Preços sujeitos a alteração. Consulte a loja para confirmar disponibilidade.</footer></body></html>`;
}

export function carregarAbaCatalogoPdf(container) {
  if (!container) return;
  container.innerHTML = `<div class="admin-panel-head"><h1>Catálogo em PDF</h1><p>Gere uma versão pronta para imprimir ou salvar como PDF pelo navegador.</p></div>
    <section class="ferramenta-card">
      <span class="ferramenta-card__icone ferramenta-card__icone--vinho">${icon("printer")}</span>
      <div><h2>Gerar catálogo</h2><p>O catálogo inclui foto, nome, marca e preço de cada produto. Uma nova janela será aberta para você escolher <strong>Salvar como PDF</strong>.</p>
      <label class="ferramenta-select">Produtos incluídos<select id="catalogo-pdf-tipo"><option value="publicos">Somente produtos visíveis no site</option><option value="todos">Todos os produtos, incluindo ocultos</option></select></label></div>
      <button type="button" class="btn-primary ferramenta-card__acao" id="btn-gerar-catalogo-pdf">${icon("printer")}Gerar catálogo</button>
    </section>`;

  container.querySelector("#btn-gerar-catalogo-pdf")?.addEventListener("click", async (evento) => {
    const botao = evento.currentTarget;
    const apenasPublicos = container.querySelector("#catalogo-pdf-tipo")?.value !== "todos";
    const janela = window.open("", "_blank");
    if (!janela) { toast("Permita pop-ups para gerar o catálogo.", "error"); return; }
    janela.document.write("<p style='font-family:Arial;padding:24px'>Preparando catálogo...</p>");
    botao.disabled = true;
    try {
      const produtos = await listarTodosProdutosParaCatalogo(apenasPublicos);
      janela.document.open();
      janela.document.write(htmlCatalogoParaImpressao(produtos));
      janela.document.close();
      janela.focus();
      janela.onload = () => janela.print();
      toast(`Catálogo preparado com ${produtos.length} produto(s).`);
    } catch (erro) {
      janela.close();
      console.error("Falha ao gerar catálogo em PDF:", erro);
      toast("Não foi possível gerar o catálogo.", "error");
    } finally {
      botao.disabled = false;
    }
  });
}

export function carregarAbaBackup(container) {
  if (!container) return;
  container.innerHTML = `<div class="admin-panel-head"><h1>Backup</h1><p>Baixe uma cópia dos dados administrativos da loja em formato JSON.</p></div>
    <section class="ferramenta-card">
      <span class="ferramenta-card__icone ferramenta-card__icone--azul">${icon("download")}</span>
      <div><h2>Backup dos dados da loja</h2><p>Inclui catálogo, serviços, categorias, marcas, etiquetas, custos, clientes, pedidos, endereços, histórico, contatos, alertas e perfis do Firestore.</p><p class="ferramenta-aviso">O arquivo pode conter dados de clientes. Guarde-o em local seguro. Contas do Firebase Authentication e arquivos do Storage não fazem parte deste backup.</p></div>
      <button type="button" class="btn-primary ferramenta-card__acao" id="btn-baixar-backup">${icon("download")}Baixar backup</button>
    </section>`;

  container.querySelector("#btn-baixar-backup")?.addEventListener("click", async (evento) => {
    const botao = evento.currentTarget;
    botao.disabled = true;
    botao.textContent = "Gerando backup...";
    try {
      const backup = await gerarBackupAdministrativo();
      const arquivo = `backup-gerencia-vargas-${new Date().toISOString().slice(0, 10)}.json`;
      baixarArquivo(JSON.stringify(serializarParaBackup(backup), null, 2), arquivo, "application/json;charset=utf-8");
      toast("Backup baixado com sucesso.");
    } catch (erro) {
      console.error("Falha ao gerar backup:", erro);
      toast("Não foi possível gerar o backup completo.", "error");
    } finally {
      botao.disabled = false;
      botao.innerHTML = `${icon("download")}Baixar backup`;
    }
  });
}

function abrirAba(root, aba) {
  root?.querySelector(`[data-tab-trigger="${aba}"]`)?.click();
}

export async function carregarAbaNotificacoes(container, root) {
  if (!container) return;
  container.innerHTML = `<div class="admin-panel-head"><h1>Central de notificações</h1><p>Pedidos, contatos e estoque que precisam de atenção.</p></div><div class="ferramenta-carregando">Atualizando notificações...</div>`;
  const [{ itens: pedidos }, { itens: leads }, alertaEstoque] = await Promise.all([
    listarPedidosAdminPagina({ tamanho: 30 }),
    listarLeadsPerdidosPagina({ tamanho: 30 }),
    listarUltimoAlertaEstoque()
  ]);

  const notificacoes = [
    ...pedidos.filter(pedido => pedido.status === "pendente").map(pedido => ({
      tipo: "pedido", data: pedido.criadoEm, titulo: "Novo pedido aguardando atendimento",
      descricao: `${pedido.nomeCliente || "Cliente"} · ${formatBRL(pedido.total)}`, aba: "pedidos"
    })),
    ...leads.filter(lead => lead.status !== "recuperado").map(lead => ({
      tipo: "contato", data: lead.data, titulo: "Contato pendente de recuperação",
      descricao: `${lead.nome || "Cliente"} · ${formatBRL(lead.valor)}`, aba: "leads"
    })),
    ...(alertaEstoque?.total ? [{
      tipo: "estoque", data: alertaEstoque.criadoEm, titulo: "Estoque baixo precisa de reposição",
      descricao: `${alertaEstoque.total} produto(s) com quantidade baixa`, aba: "estoque"
    }] : [])
  ].sort((a, b) => numeroDaData(b.data) - numeroDaData(a.data));

  container.innerHTML = `<div class="admin-panel-head ferramenta-cabecalho"><div><h1>Central de notificações</h1><p>${notificacoes.length ? `${notificacoes.length} item(ns) precisam da sua atenção.` : "Nenhuma pendência encontrada agora."}</p></div><button type="button" class="btn-secondary" id="btn-atualizar-notificacoes">${icon("refresh")}Atualizar</button></div>
    <section class="notificacoes-lista">${notificacoes.map(item => `<article class="notificacao notificacao--${item.tipo}"><span class="notificacao__icone">${icon(item.tipo === "pedido" ? "shoppingBag" : item.tipo === "estoque" ? "archive" : "messageSquare")}</span><div><h2>${escHtml(item.titulo)}</h2><p>${escHtml(item.descricao)}</p><small>${dataDaLoja(item.data)}</small></div><button type="button" class="btn-secondary" data-abrir-notificacao="${item.aba}">Abrir</button></article>`).join("") || `<div class="empty-state">${icon("inboxEmpty")}<strong>Tudo em dia</strong><span>Não há pedidos pendentes, contatos a recuperar ou alertas de estoque.</span></div>`}</section>`;

  container.querySelector("#btn-atualizar-notificacoes")?.addEventListener("click", () => carregarAbaNotificacoes(container, root));
  container.querySelectorAll("[data-abrir-notificacao]").forEach(botao => botao.addEventListener("click", () => abrirAba(root, botao.dataset.abrirNotificacao)));
}
