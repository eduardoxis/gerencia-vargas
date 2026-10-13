// api/_rateLimit.js
// Limite de uso simples, guardado em memória (por instância "quente" da
// function), em vez de Firestore. Antes, CADA chamada gravava/lia um doc
// em "limitesUso" (1 leitura + 1 escrita por requisição, via transação) —
// isso sozinho já consumia cota do Firestore em toda ação de admin, mesmo
// sem nenhuma imagem sendo enviada. Rate limit não precisa sobreviver a um
// "cold start": o pior caso é resetar a contagem ocasionalmente, o que é
// aceitável pra proteção contra abuso — e custa ZERO de cota do Firestore.
//
// Uso: await aplicarLimite(`cloudinary:${uid}`, { maximo: 20, janelaMs: 10 * 60 * 1000 })
// Lança erro com status 429 se o limite for excedido.

const historicoPorChave = new Map(); // chave -> number[] (timestamps)
let ultimaLimpeza = Date.now();

// Evita a Map crescer pra sempre num processo de longa duração: a cada ~5
// min, descarta timestamps velhos e chaves vazias.
function limpezaOcasional() {
  const agora = Date.now();
  if (agora - ultimaLimpeza < 5 * 60 * 1000) return;
  ultimaLimpeza = agora;
  for (const [chave, timestamps] of historicoPorChave) {
    const recentes = timestamps.filter((t) => agora - t < 60 * 60 * 1000);
    if (recentes.length) historicoPorChave.set(chave, recentes);
    else historicoPorChave.delete(chave);
  }
}

export async function aplicarLimite(chave, { maximo, janelaMs }) {
  limpezaOcasional();
  const agora = Date.now();
  const historico = historicoPorChave.get(chave) || [];
  const dentroDaJanela = historico.filter((t) => agora - t < janelaMs);

  if (dentroDaJanela.length >= maximo) {
    const erro = new Error("Muitas requisições em pouco tempo. Aguarde um instante e tente novamente.");
    erro.status = 429;
    throw erro;
  }

  dentroDaJanela.push(agora);
  historicoPorChave.set(chave, dentroDaJanela);
}
