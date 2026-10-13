import { criarPreview } from "../_sharePreview.js";

export default criarPreview({
  colecao: "produtos",
  rotaDestino: "/pages/produto.html",
  rotaCompartilhavel: "/p",
  nomeSite: "Espaço Viviane Vargas",
  fallbackImagem: "/assets/images/hero-produtos.jpg",
  tipoImagem: "produto",
  validar: produto => produto.status !== "oculto"
});
