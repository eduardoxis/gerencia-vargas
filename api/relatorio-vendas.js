// api/relatorio-vendas.js
// Calcula métricas de vendas (total, ticket médio, produtos mais vendidos)
// a partir da coleção "pedidos", sob demanda (botão no admin) — nada de
// cron aqui. Aceita ?inicio=AAAA-MM-DD&fim=AAAA-MM-DD (opcional, padrão:
// últimos 30 dias) e ?formato=csv para baixar como planilha.

import { obterDbAdmin } from "./_firebaseAdmin.js";
import { exigirAdmin } from "./_auth.js";
import { aplicarLimite } from "./_rateLimit.js";
import { registrarErro } from "./_log.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ erro: "Método não permitido." });
    return;
  }

  try {
    const uid = await exigirAdmin(req);
    await aplicarLimite(`relatorio:${uid}`, { maximo: 30, janelaMs: 10 * 60 * 1000 });

    const agora = new Date();
    const trintaDiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const inicio = req.query.inicio ? new Date(`${req.query.inicio}T00:00:00`) : trintaDiasAtras;
    const fim = req.query.fim ? new Date(`${req.query.fim}T23:59:59`) : agora;

    const db = obterDbAdmin();
    const snap = await db.collection("pedidos")
      .where("criadoEm", ">=", inicio)
      .where("criadoEm", "<=", fim)
      .select("total", "status", "itens")
      .get();

    const pedidos = snap.docs.map(d => d.data());

    const totalVendido = pedidos.reduce((soma, p) => soma + Number(p.total || 0), 0);
    const quantidadePedidos = pedidos.length;
    const ticketMedio = quantidadePedidos ? totalVendido / quantidadePedidos : 0;

    const porProduto = new Map();
    for (const pedido of pedidos) {
      for (const item of pedido.itens || []) {
        const atual = porProduto.get(item.id) || { nome: item.nome, quantidade: 0, receita: 0 };
        atual.quantidade += Number(item.quantidade || 0);
        atual.receita += Number(item.quantidade || 0) * Number(item.preco || 0);
        porProduto.set(item.id, atual);
      }
    }
    const maisVendidos = [...porProduto.values()]
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 10);

    const porStatus = {};
    for (const pedido of pedidos) {
      const status = pedido.status || "pendente";
      porStatus[status] = (porStatus[status] || 0) + 1;
    }

    const relatorio = {
      periodo: { inicio: inicio.toISOString(), fim: fim.toISOString() },
      totalVendido,
      quantidadePedidos,
      ticketMedio,
      porStatus,
      maisVendidos
    };

    if (req.query.formato === "csv") {
      const linhas = [
        "produto,quantidade,receita",
        ...maisVendidos.map(p => `"${(p.nome || "").replace(/"/g, '""')}",${p.quantidade},${p.receita.toFixed(2)}`)
      ];
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="relatorio-vendas.csv"`);
      res.status(200).send(linhas.join("\n"));
      return;
    }

    res.status(200).json(relatorio);
  } catch (erro) {
    await registrarErro("relatorio-vendas", erro);
    res.status(erro.status || 500).json({ erro: erro.message || "Falha ao gerar relatório." });
  }
}
