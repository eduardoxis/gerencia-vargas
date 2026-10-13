import { db } from "../../firebase/firebase-config.js";
import { doc, onSnapshot, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Um único documento é observado pelos visitantes. Isso evita listeners em
// todas as coleções (produtos, categorias, marcas...) e mantém o consumo do
// plano gratuito baixo: só há uma leitura extra quando o painel muda algo.
const VERSAO_PUBLICA = doc(db, "publicacoes", "catalogo");

// Cada gravação neste documento faz TODO visitante conectado ler o documento de
// novo (e recarregar a página). Numa importação de 200 produtos eram 200 avisos.
// Agora o primeiro aviso sai na hora e os seguintes, dentro da janela, viram um
// só aviso no fim dela — a última alteração sempre é sinalizada.
const JANELA_AVISO_MS = 4000;
let ultimoAviso = 0;
let avisoAgendado = null;

function gravarAviso() {
  ultimoAviso = Date.now();
  return setDoc(VERSAO_PUBLICA, { atualizadoEm: serverTimestamp() }, { merge: true });
}

export async function sinalizarAtualizacaoPublica() {
  const espera = ultimoAviso + JANELA_AVISO_MS - Date.now();
  if (espera <= 0 && !avisoAgendado) {
    await gravarAviso();
    return;
  }
  if (!avisoAgendado) {
    avisoAgendado = window.setTimeout(() => {
      avisoAgendado = null;
      gravarAviso().catch((erro) => console.warn("Não foi possível avisar o site sobre a atualização:", erro));
    }, Math.max(espera, 0));
  }
}

export function observarAtualizacaoPublica(aoAtualizar) {
  let primeiraLeitura = true;
  return onSnapshot(VERSAO_PUBLICA, () => {
    // A primeira leitura apenas estabelece a versão atual; não recarrega a
    // página toda vez que alguém entra no site.
    if (primeiraLeitura) {
      primeiraLeitura = false;
      return;
    }
    aoAtualizar();
  }, (erro) => {
    // Caso as regras antigas ainda estejam publicadas, a loja continua
    // funcionando normalmente; apenas a atualização automática fica inativa.
    console.warn("Atualização em tempo real indisponível:", erro.code || erro);
  });
}
