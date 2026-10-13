// js/services/cloudinary.js
import { withLoading } from "../utils/loadingManager.js";
// Upload de imagens para o Cloudinary usando upload ASSINADO: o navegador
// pede uma assinatura pra nossa própria function (/api/cloudinary-signature,
// que exige login de admin) e só então envia a imagem direto pro Cloudinary.
// A API secret nunca existe no navegador — fica só no servidor.
const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024; // 5MB
const TIPOS_PERMITIDOS = ["image/webp", "image/png", "image/jpeg"];

/**
 * Envia um Blob (já convertido para WebP/PNG) para o Cloudinary via upload
 * assinado e retorna a URL pública e segura (https) da imagem hospedada.
 */
export function enviarImagemParaCloudinary(blob, nomeArquivo = "produto") {
  return withLoading("enviarImagemParaCloudinary", async () => {
    if (blob.size > TAMANHO_MAXIMO_BYTES) {
      throw new Error("Imagem maior que 5MB — reduza o tamanho antes de enviar.");
    }
    if (!TIPOS_PERMITIDOS.includes(blob.type)) {
      throw new Error("Tipo de imagem não permitido.");
    }

    const { auth } = await import("../../firebase/firebase-config.js");
    if (!auth.currentUser) throw new Error("Faça login como admin para enviar imagens.");

    const pedirAssinatura = async (forcarRenovacao = false) => {
      const idToken = await auth.currentUser?.getIdToken(forcarRenovacao);
      if (!idToken) throw new Error("Não foi possível validar sua sessão de administrador.");
      return fetch("/api/cloudinary-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ tamanho: blob.size, tipo: blob.type })
      });
    };

    let assinaturaResp = await pedirAssinatura();
    if (assinaturaResp.status === 401) {
      // Um token pode ter expirado entre a leitura e a chamada. Em vez de
      // expulsar o administrador, renovamos o token e repetimos uma vez.
      assinaturaResp = await pedirAssinatura(true);
    }
    if (assinaturaResp.status === 401) {
      throw new Error("Não foi possível validar sua sessão agora. Recarregue a página e tente novamente.");
    }
    if (!assinaturaResp.ok) {
      const erro = await assinaturaResp.json().catch(() => null);
      throw new Error(erro?.erro || "Falha ao autorizar upload de imagem.");
    }
    const { signature, timestamp, apiKey, cloudName, folder } = await assinaturaResp.json();

    const extensao = blob.type === "image/png" ? "png" : "webp";
    const form = new FormData();
    form.append("file", blob, `${nomeArquivo}.${extensao}`);
    form.append("api_key", apiKey);
    form.append("timestamp", timestamp);
    form.append("signature", signature);
    form.append("folder", folder);

    const resp = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: "POST", body: form }
    );

    if (!resp.ok) {
      const erro = await resp.json().catch(() => null);
      throw new Error(erro?.error?.message || "Falha ao enviar imagem para o Cloudinary.");
    }

    const dados = await resp.json();
    return dados.secure_url;
  });
}

/**
 * Migração de dados antigos: produtos/categorias/marcas que ainda tenham
 * imagem em base64 (arquitetura anterior, salva direto no Firestore) são
 * convertidas para WebP e reenviadas ao Cloudinary; o documento passa a
 * guardar só a URL pública, igual aos uploads novos.
 */
export function migrarImagensAntigas(onProgresso) {
  return withLoading("migrarImagensAntigas", async () => {
    const {
      listarProdutos, atualizarProduto,
      listarCategorias, atualizarCategoria,
      listarMarcas, atualizarMarca
    } = await import("./firestore.js");

    const alvos = [];
    (await listarProdutos({ apenasAtivos: false })).forEach(p => {
      if (p.imagem?.startsWith("data:image")) {
        alvos.push({ tipo: "produto", id: p.id, campo: "imagem", valor: p.imagem, nome: p.nome, atualizar: atualizarProduto });
      }
    });
    (await listarCategorias()).forEach(c => {
      if (c.imagem?.startsWith("data:image")) {
        alvos.push({ tipo: "categoria", id: c.id, campo: "imagem", valor: c.imagem, nome: c.nome, atualizar: atualizarCategoria });
      }
    });
    (await listarMarcas()).forEach(m => {
      if (m.logo?.startsWith("data:image")) {
        alvos.push({ tipo: "marca", id: m.id, campo: "logo", valor: m.logo, nome: m.nome, atualizar: atualizarMarca });
      }
    });

    let feitos = 0;
    let erros = 0;
    for (const alvo of alvos) {
      try {
        const blobOriginal = await (await fetch(alvo.valor)).blob();
        const usarPNG = alvo.tipo === "categoria" || alvo.tipo === "marca";
        const convertido = usarPNG
          ? await converterBlobParaFormato(blobOriginal, "image/png", 500, 1)
          : await converterBlobParaFormato(blobOriginal, "image/webp", 800, 0.8);
        const url = await enviarImagemParaCloudinary(convertido, alvo.nome || alvo.tipo);
        await alvo.atualizar(alvo.id, { [alvo.campo]: url });
      } catch (erro) {
        erros++;
        console.error(`Falha ao migrar ${alvo.tipo} "${alvo.nome}": ${erro?.message || erro}`);
      }
      feitos++;
      onProgresso?.(feitos, alvos.length);
    }
    return { total: alvos.length, erros };
  });
}

function converterBlobParaFormato(blob, mime, maxWidth, qualidade) {
  return new Promise((resolve, reject) => {
    createImageBitmap(blob).then((bitmap) => {
      const scale = Math.min(1, maxWidth / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(`Falha ao converter para ${mime}`))), mime, qualidade);
    }).catch(reject);
  });
}
