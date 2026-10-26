import {
  gerarBackupAdministrativo, listarLeadsPerdidosPagina, listarPedidosAdminPagina,
  listarProdutosPagina, listarUltimoAlertaEstoque, listarCategorias, invalidarCache
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

export function carregarAbaCatalogoPdf(container) {
  if (!container) return;
  container.innerHTML = `<div class="admin-panel-head"><h1>Catálogo em PDF</h1><p>Gere o catálogo oficial com capa e páginas de produtos em A4.</p></div>
    <section class="ferramenta-card">
      <span class="ferramenta-card__icone ferramenta-card__icone--vinho">${icon("printer")}</span>
      <div><h2>Gerar catálogo</h2><p>Inclui a capa oficial, fotos inteiras, nomes e preços atuais, organizados por categoria. O PDF será aberto em uma nova janela para baixar ou imprimir.</p>
      <label class="ferramenta-select">Produtos incluídos<select id="catalogo-pdf-tipo"><option value="publicos">Somente produtos visíveis no site</option><option value="todos">Todos os produtos, incluindo ocultos</option></select></label></div>
      <button type="button" class="btn-primary ferramenta-card__acao" id="btn-gerar-catalogo-pdf">${icon("printer")}Gerar catálogo</button>
    </section>`;

  container.querySelector("#btn-gerar-catalogo-pdf")?.addEventListener("click", async (evento) => {
    const botao = evento.currentTarget;
    if (botao.disabled) return;
    const apenasPublicos = container.querySelector("#catalogo-pdf-tipo")?.value !== "todos";
    const janela = window.open("", "_blank");
    if (!janela) { toast("Permita pop-ups para gerar o catálogo.", "error"); return; }
    janela.opener = null;
    janela.document.write("<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>Preparando catálogo</title></head><body style='font-family:Arial;padding:24px;background:#fffaf3;color:#705443'><p role='status'>Buscando os produtos atuais...</p></body></html>");
    janela.document.close();
    botao.disabled = true;
    botao.textContent = "Preparando catálogo...";
    const informar = mensagem => {
      if (janela.closed) throw new Error("A janela do catálogo foi fechada. Gere novamente quando desejar.");
      const status = janela.document.querySelector('[role="status"]');
      if (status) status.textContent = mensagem;
    };
    try {
      invalidarCache("listarCategorias");
      const [produtos, categorias, { gerarCatalogoPDF }] = await Promise.all([
        listarTodosProdutosParaCatalogo(apenasPublicos), listarCategorias(),
        import("./catalogo-pdf.js?v=20261026-capa-textos")
      ]);
      informar("Preparando a capa e as fotos dos produtos...");
      const resultado = await gerarCatalogoPDF(produtos, categorias, {
        progresso: (atual, total) => informar(`Carregando fotos: ${atual} de ${total}...`)
      });
      informar("Abrindo o PDF...");
      const url = URL.createObjectURL(new Blob([resultado.bytes], { type: "application/pdf" }));
      try { janela.location.replace(url); }
      catch (erro) { URL.revokeObjectURL(url); throw erro; }
      // A janela precisa continuar acessando o arquivo enquanto o visualizador abre.
      window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
      toast(`Catálogo aberto com ${resultado.totalProdutos} produto(s) e ${resultado.totalPaginas} página(s). Use baixar ou imprimir no PDF.`);
    } catch (erro) {
      if (!janela.closed) janela.close();
      console.error("Falha ao gerar catálogo em PDF:", erro);
      toast(erro.message || "Não foi possível gerar o catálogo. Tente novamente.", "error");
    } finally {
      botao.disabled = false;
      botao.innerHTML = `${icon("printer")}Gerar catálogo`;
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
