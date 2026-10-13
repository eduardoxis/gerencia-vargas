import { criarPreview } from "../_sharePreview.js";

export default criarPreview({
  colecao: "servicos",
  rotaDestino: "/pages/servico.html",
  rotaCompartilhavel: "/s",
  nomeSite: "Espaço Viviane Vargas",
  fallbackImagem: "/assets/images/hero-produtos.jpg",
  tipoImagem: "servico",
  validar: servico => servico.status === "disponivel"
});
