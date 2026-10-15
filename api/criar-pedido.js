// Cria o registro de pedido com preço e disponibilidade calculados no servidor.
// O navegador só informa os IDs e as quantidades desejadas; nunca define o total.
import { FieldValue } from "firebase-admin/firestore";
import { obterDbAdmin } from "./_firebaseAdmin.js";
import { exigirUsuario } from "./_auth.js";
import { aplicarLimite } from "./_rateLimit.js";
import { registrarErro } from "./_log.js";

const texto = (valor, limite) => String(valor || "").trim().slice(0, limite);
const precoSeguro = (valor) => Math.round(Number(valor || 0) * 100) / 100;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ erro: "Método não permitido." });

  try {
    const uid = await exigirUsuario(req);
    await aplicarLimite(`pedido:${uid}`, { maximo: 10, janelaMs: 10 * 60_000 });

    const recebidos = Array.isArray(req.body?.itens) ? req.body.itens : [];
    if (!recebidos.length || recebidos.length > 30) {
      return res.status(400).json({ erro: "Informe entre 1 e 30 itens para o pedido." });
    }

    const itensPorId = new Map();
    for (const item of recebidos) {
      const id = texto(item?.id, 120);
      const quantidade = Number(item?.quantidade);
      if (!id || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 99) {
        return res.status(400).json({ erro: "Um item do pedido é inválido." });
      }
      const anterior = itensPorId.get(id);
      itensPorId.set(id, {
        quantidade: (anterior?.quantidade || 0) + quantidade,
        cor: texto(item?.cor, 80)
      });
    }
    if ([...itensPorId.values()].some((item) => item.quantidade > 99)) {
      return res.status(400).json({ erro: "A quantidade máxima por produto é 99." });
    }

    const db = obterDbAdmin();
    const pedidoRef = db.collection("pedidos").doc();
    const itens = await db.runTransaction(async (tx) => {
      const produtos = await Promise.all([...itensPorId.keys()].map((id) => tx.get(db.collection("produtos").doc(id))));
      return produtos.map((snap) => {
        const pedido = itensPorId.get(snap.id);
        const produto = snap.exists ? snap.data() : null;
        const disponivel = produto && produto.status !== "oculto" && produto.status !== "sem_estoque"
          && produto.status !== "esgotado" && Number(produto.quantidade || 0) >= pedido.quantidade;
        if (!disponivel) {
          const erro = new Error(`O produto ${texto(produto?.nome, 120) || "selecionado"} não está disponível na quantidade pedida.`);
          erro.status = 409;
          throw erro;
        }
        return {
          id: snap.id,
          nome: texto(produto.nome, 180),
          quantidade: pedido.quantidade,
          preco: precoSeguro(produto.preco),
          cor: pedido.cor
        };
      });
    });

    const total = precoSeguro(itens.reduce((soma, item) => soma + item.preco * item.quantidade, 0));
    await pedidoRef.set({
      usuarioId: uid,
      nomeCliente: texto(req.body?.nomeCliente, 120),
      itens,
      total,
      status: "pendente",
      origem: "catalogo",
      criadoEm: FieldValue.serverTimestamp()
    });
    return res.status(201).json({ ok: true, id: pedidoRef.id, total });
  } catch (erro) {
    await registrarErro("criar-pedido", erro);
    return res.status(erro.status || 500).json({ erro: erro.message || "Não foi possível registrar o pedido." });
  }
}
