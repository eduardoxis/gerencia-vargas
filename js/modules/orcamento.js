// js/modules/orcamento.js
// Fluxo de "Solicitar Orçamento": modal com 3 opções (produtos já
// escolhidos, falar com atendente, descrever a necessidade) que termina
// sempre redirecionando o cliente para o WhatsApp com uma mensagem pronta.
import { obterItensOrcamento, listaVazia } from "../modules/listaOrcamento.js";
import { saudacao, abrirWhatsApp } from "../utils/whatsapp.js";
import { abrirModal, fecharModal } from "../utils/modal.js";
import { toast, podeExecutar } from "../utils/utils.js";

function montarMensagemProdutos() {
  const itens = obterItensOrcamento();
  let msg = `Olá, ${saudacao()}!\n\nGostaria de solicitar um orçamento dos seguintes produtos:\n\n`;
  itens.forEach(item => {
    const unidade = item.quantidade > 1 ? "unidades" : "unidade";
    msg += `• ${item.nome} - ${item.quantidade} ${unidade}\n`;
  });
  msg += `\nAguardo retorno.\nObrigado!`;
  return msg;
}

function montarMensagemAtendente() {
  return `Olá, ${saudacao()}!\n\nGostaria de solicitar um orçamento.\n\nAinda não escolhi os produtos e gostaria de conversar com um atendente para receber ajuda.\n\nObrigado!`;
}

function montarMensagemDescricao(texto) {
  return `Olá, ${saudacao()}!\n\nGostaria de solicitar um orçamento.\n\nDescrição:\n${texto}\n\nObrigado!`;
}

/** Alterna qual "sub-tela" do modal de orçamento fica visível. */
function mostrarEstado(modal, estado) {
  modal.querySelector("[data-orcamento-opcoes]").hidden = estado !== "opcoes";
  modal.querySelector("[data-orcamento-vazio]").hidden = estado !== "vazio";
  modal.querySelector("[data-orcamento-descrever]").hidden = estado !== "descrever";
}

/** Mostra um loading rápido no botão, abre o WhatsApp e fecha o modal. */
function enviarParaWhatsApp(botao, mensagem, modal) {
  if (!podeExecutar("orcamento-whatsapp", 6, 60_000)) {
    toast("Muitas tentativas em pouco tempo. Aguarde um instante.", "error");
    return;
  }
  const original = botao ? botao.innerHTML : "";
  if (botao) {
    botao.disabled = true;
    botao.classList.add("is-loading");
    botao.innerHTML = `<span class="btn-spinner"></span> Abrindo WhatsApp...`;
  }
  setTimeout(() => {
    try {
      abrirWhatsApp(mensagem);
      toast("Você foi redirecionado para o WhatsApp!", "success");
    } catch {
      toast("Não foi possível abrir o WhatsApp. Tente novamente.", "error");
    } finally {
      if (botao) {
        botao.disabled = false;
        botao.classList.remove("is-loading");
        botao.innerHTML = original;
      }
      fecharModal(modal);
      mostrarEstado(modal, "opcoes");
    }
  }, 500);
}

export function iniciarOrcamento() {
  const modal = document.querySelector("#modal-orcamento");
  if (!modal) return;

  const btnAbrir = document.querySelector("#btn-solicitar-orcamento");
  const textarea = modal.querySelector("#orcamento-texto");

  btnAbrir?.addEventListener("click", () => {
    mostrarEstado(modal, "opcoes");
    abrirModal(modal);
  });

  modal.addEventListener("click", (e) => {
    const opcaoBtn = e.target.closest("[data-orcamento-opcao]");
    if (opcaoBtn) {
      const tipo = opcaoBtn.dataset.orcamentoOpcao;

      if (tipo === "produtos") {
        if (listaVazia()) {
          mostrarEstado(modal, "vazio");
          return;
        }
        enviarParaWhatsApp(opcaoBtn, montarMensagemProdutos(), modal);
      } else if (tipo === "atendente") {
        enviarParaWhatsApp(opcaoBtn, montarMensagemAtendente(), modal);
      } else if (tipo === "descrever") {
        mostrarEstado(modal, "descrever");
        textarea?.focus();
      }
      return;
    }

    if (e.target.closest("[data-orcamento-continuar]")) {
      fecharModal(modal);
      mostrarEstado(modal, "opcoes");
      return;
    }

    if (e.target.closest("[data-orcamento-falar-atendente]")) {
      enviarParaWhatsApp(e.target.closest("button"), montarMensagemAtendente(), modal);
      return;
    }

    if (e.target.closest("[data-orcamento-voltar]")) {
      mostrarEstado(modal, "opcoes");
      return;
    }

    const btnEnviarDescricao = e.target.closest("[data-orcamento-enviar-descricao]");
    if (btnEnviarDescricao) {
      const texto = textarea?.value?.trim();
      if (!texto) {
        toast("Descreva rapidamente o que você precisa antes de enviar.", "error");
        textarea?.focus();
        return;
      }
      enviarParaWhatsApp(btnEnviarDescricao, montarMensagemDescricao(texto), modal);
      if (textarea) textarea.value = "";
    }
  });
}
