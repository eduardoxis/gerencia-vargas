import { PDFDocument, StandardFonts, rgb } from '../vendor/pdf-lib.esm.min.js';

const A4 = [595.2756, 841.8898];
const COR = {
  fundo: rgb(.997, .978, .949), branco: rgb(1, 1, 1), texto: rgb(.13, .10, .09),
  vinho: rgb(.57, .025, .10), discreto: rgb(.52, .37, .31), borda: rgb(.91, .77, .66), rose: rgb(.96, .85, .79)
};
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Não infere categorias por marca ou nome: usa somente o cadastro existente.
export function paginarCatalogo(produtos, categorias = []) {
  const nomes = new Map(categorias.map(c => [String(c.id), String(c.nome || '').trim()]));
  const grupos = new Map();
  for (const produto of produtos) {
    const valor = typeof produto.categoria === 'object' ? produto.categoria?.nome : produto.categoria;
    const categoria = nomes.get(String(valor)) || String(valor || '').trim() || 'Seleção de produtos';
    if (!grupos.has(categoria)) grupos.set(categoria, []);
    grupos.get(categoria).push(produto);
  }
  const paginas = [];
  const ordenados = [...grupos].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  for (const [categoria, itens] of ordenados) {
    const lista = [...itens].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
    for (let i = 0; i < lista.length; i += 6) paginas.push({ categoria, produtos: lista.slice(i, i + 6) });
  }
  return paginas;
}

function textoSeguro(valor, fonte) {
  // Fontes PDF padrão preservam acentos latinos; caracteres fora desse conjunto
  // (por exemplo emojis do cadastro) não podem impedir a geração do documento.
  return [...String(valor ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, ' ')]
    .map(c => { if (c === '\n') return c; try { fonte.encodeText(c); return c; } catch { return ' '; } }).join('');
}

export function quebrarTexto(valor, fonte, tamanho, largura) {
  const linhas = [];
  for (const paragrafo of textoSeguro(valor, fonte).split('\n')) {
    let linha = '';
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      if (fonte.widthOfTextAtSize(palavra, tamanho) > largura) {
        if (linha) { linhas.push(linha); linha = ''; }
        let parte = '';
        for (const letra of palavra) {
          if (parte && fonte.widthOfTextAtSize(parte + letra, tamanho) > largura) { linhas.push(parte); parte = ''; }
          parte += letra;
        }
        linha = parte;
      } else if (linha && fonte.widthOfTextAtSize(linha + ' ' + palavra, tamanho) > largura) {
        linhas.push(linha); linha = palavra;
      } else linha += (linha ? ' ' : '') + palavra;
    }
    if (linha) linhas.push(linha);
  }
  return linhas;
}

function escreverLinhas(pagina, linhas, x, topo, fonte, tamanho, cor, entrelinha = 1.2) {
  linhas.forEach((linha, i) => pagina.drawText(linha, { x, y: A4[1] - topo - tamanho - i * tamanho * entrelinha, font: fonte, size: tamanho, color: cor }));
}

function cardArredondado(pagina, x, topo, largura, altura) {
  const r = 7, w = largura, h = altura;
  const caminho = `M ${r} 0 H ${w-r} Q ${w} 0 ${w} ${r} V ${h-r} Q ${w} ${h} ${w-r} ${h} H ${r} Q 0 ${h} 0 ${h-r} V ${r} Q 0 0 ${r} 0 Z`;
  pagina.drawSvgPath(caminho, { x, y: A4[1] - topo, color: COR.branco, borderColor: COR.borda, borderWidth: .55 });
}

function decoracao(pagina) {
  const [w,h] = A4;
  pagina.drawRectangle({x:0,y:0,width:w,height:h,color:COR.fundo});
  // Folhas vetoriais discretas: ficam nas margens, atrás dos cards.
  for (const lado of [0,1]) {
    for (let i=0;i<5;i++) {
      const x = lado ? w - 14 - i*7 : 4 + i*5;
      const y = lado ? h - 12 - i*16 : 18 + i*17;
      pagina.drawSvgPath('M 0 0 C -22 -3 -25 16 -32 25 C -10 24 3 15 0 0 Z', {x,y,scale: .8,color:COR.rose,opacity:.36});
    }
  }
}

async function obterImagem(url, limite = 25000) {
  const endereco = new URL(url, globalThis.location?.href || 'https://localhost/');
  if (!['https:', 'http:', 'data:', 'blob:'].includes(endereco.protocol)) throw Error('Formato de endereço de imagem não permitido.');
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), limite);
  try {
    const resposta = await fetch(endereco.href, { signal: controlador.signal, cache: 'no-cache' });
    if (!resposta.ok) throw Error('Não foi possível carregar uma imagem (HTTP ' + resposta.status + ').');
    const blob = await resposta.blob();
    if (/image\/(png|jpeg)/i.test(blob.type)) return { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: /png/i.test(blob.type) ? 'png' : 'jpg' };
    // Fotos WebP/AVIF e SVG do cadastro são convertidas sem alterar a proporção.
    const bitmap = await createImageBitmap(blob);
    try {
      const escala = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width*escala)); canvas.height = Math.max(1, Math.round(bitmap.height*escala));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const convertido = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',.94));
      if (!convertido) throw Error('Não foi possível converter uma foto.');
      return { bytes: new Uint8Array(await convertido.arrayBuffer()), tipo:'jpg' };
    } finally { bitmap.close(); }
  } finally { clearTimeout(timer); }
}

function imagemPrincipal(produto) {
  const candidata = [produto.imagem, ...(Array.isArray(produto.imagens) ? produto.imagens : [])]
    .find(valor => typeof valor === 'string' && valor.trim());
  return candidata?.trim() || '';
}

function medirCard(produto, serif, sans, largura) {
  const nome = produto.nome || 'Produto sem nome';
  const descricao = String(produto.descricao || '').trim();
  let tamanhoNome=12, tamanhoDescricao=10.2, linhasNome, linhasDescricao, alturaTexto;
  do {
    linhasNome=quebrarTexto(nome,serif,tamanhoNome,largura);
    linhasDescricao=quebrarTexto(descricao,sans,tamanhoDescricao,largura);
    alturaTexto=linhasNome.length*tamanhoNome*1.14+(linhasDescricao.length ? 7+linhasDescricao.length*tamanhoDescricao*1.2:0);
    if(alturaTexto<=133) break;
    tamanhoNome-=.5; tamanhoDescricao-=.35;
  } while(tamanhoNome>=8.5 && tamanhoDescricao>=7.5);
  if(alturaTexto>174)throw Error('O texto de "'+nome+'" é muito longo para um card legível. Reduza a descrição no cadastro.');
  return { tamanhoNome, tamanhoDescricao, linhasNome, linhasDescricao, alturaTexto };
}

export async function gerarCatalogoPDF(produtos, categorias = [], { progresso = () => {} } = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle('Catálogo de Produtos - Espaço Viviane Vargas'); doc.setAuthor('Espaço Viviane Vargas');
  doc.setSubject('Catálogo de produtos'); doc.setLanguage('pt-BR');
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const paginas = paginarCatalogo(produtos,categorias);
  const capa = await obterImagem(new URL('../../assets/catalogo/capa-oficial.png',import.meta.url).href);
  const arte = await doc.embedPng(capa.bytes);
  const primeira = doc.addPage(A4);
  // Contain: a imagem original inteira, sem corte ou distorção, em A4.
  primeira.drawRectangle({x:0,y:0,width:A4[0],height:A4[1],color:COR.fundo});
  const escalaCapa = Math.min(A4[0]/arte.width,A4[1]/arte.height);
  primeira.drawImage(arte,{x:(A4[0]-arte.width*escalaCapa)/2,y:(A4[1]-arte.height*escalaCapa)/2,width:arte.width*escalaCapa,height:arte.height*escalaCapa});
  const imagens = new Map();
  const urls = [...new Set(produtos.map(imagemPrincipal).filter(Boolean))];
  let proxima = 0, prontas = 0;
  // Quatro downloads por vez, com timeout e sem gerar silenciosamente fotos ausentes.
  await Promise.all(Array.from({length: Math.min(4,urls.length)}, async()=>{
    while(proxima < urls.length) {
      const url = urls[proxima++];
      let foto;
      try { foto = await obterImagem(url); }
      catch { throw Error('Uma foto cadastrada não carregou. Confira as imagens e tente gerar o catálogo novamente.'); }
      imagens.set(url, await (foto.tipo==='png' ? doc.embedPng(foto.bytes) : doc.embedJpg(foto.bytes)));
      progresso(++prontas,urls.length);
    }
  }));
  const margem = 30, gap = 9, largura = (A4[0]-margem*2-gap*2)/3, topo = 115, altura = 326;
  for (let indice=0; indice<paginas.length; indice++) {
    const grupo = paginas[indice];
    const pagina = doc.addPage(A4); decoracao(pagina);
    let tamanhoTitulo = 32;
    let titulo = quebrarTexto(grupo.categoria,serif,tamanhoTitulo,A4[0]-margem*2);
    while ((titulo.length>2 || titulo.length*tamanhoTitulo*1.05>65) && tamanhoTitulo>15) {
      tamanhoTitulo-=1; titulo=quebrarTexto(grupo.categoria,serif,tamanhoTitulo,A4[0]-margem*2);
    }
    if(titulo.length*tamanhoTitulo*1.05>65) throw Error('O nome de uma categoria é longo demais para o cabeçalho do catálogo.');
    escreverLinhas(pagina,titulo,margem,23,serif,tamanhoTitulo,COR.texto,1.05);
    escreverLinhas(pagina,['CATÁLOGO DE PRODUTOS'],margem,91,sans,8,COR.vinho);
    pagina.drawLine({start:{x:margem,y:A4[1]-108},end:{x:margem+42,y:A4[1]-108},thickness:1,color:COR.vinho});
    const medidas = grupo.produtos.map(produto => medirCard(produto,serif,sans,largura-24));
    for (let i=0;i<grupo.produtos.length;i++) {
      const produto = grupo.produtos[i], x = margem+(i%3)*(largura+gap), y = topo+Math.floor(i/3)*(altura+gap);
      cardArredondado(pagina,x,y,largura,altura);
      const interna = largura-24;
      const { tamanhoNome, tamanhoDescricao, linhasNome, linhasDescricao } = medidas[i];
      const inicioLinha = Math.floor(i/3)*3;
      const maiorTexto = Math.max(...medidas.slice(inicioLinha,inicioLinha+3).map(m=>m.alturaTexto));
      // Todos os cards da mesma linha têm a área da foto e o nome alinhados.
      const alturaFoto = Math.min(208,altura-64-maiorTexto);
      const foto = imagens.get(imagemPrincipal(produto));
      if(foto) {
        const escala = Math.min((largura-24)/foto.width,(alturaFoto-12)/foto.height);
        const w=foto.width*escala,h=foto.height*escala;
        pagina.drawImage(foto,{x:x+(largura-w)/2,y:A4[1]-(y+10+(alturaFoto-h)/2)-h,width:w,height:h});
      } else escreverLinhas(pagina,['Sem imagem cadastrada'],x+12,y+alturaFoto/2,sans,8,COR.discreto);
      const nomeTopo=y+alturaFoto+16;
      escreverLinhas(pagina,linhasNome,x+12,nomeTopo,serif,tamanhoNome,COR.texto,1.14);
      escreverLinhas(pagina,linhasDescricao,x+12,nomeTopo+linhasNome.length*tamanhoNome*1.14+7,sans,tamanhoDescricao,COR.discreto);
      const valor = produto.preco;
      const preco = valor!==null && valor!=='' && Number.isFinite(Number(valor)) && Number(valor)>=0 ? moeda.format(Number(valor)) : 'Consulte a loja';
      let tamanhoPreco = 20;
      while(serif.widthOfTextAtSize(preco,tamanhoPreco)>interna)tamanhoPreco-=.5;
      escreverLinhas(pagina,[preco],x+12,y+altura-34,serif,tamanhoPreco,COR.vinho);
    }
    escreverLinhas(pagina,['Espaço Viviane Vargas  |  Catálogo de Produtos'],margem,813,sans,8,COR.discreto);
    const numero = `Página ${indice+2} de ${paginas.length+1}`;
    escreverLinhas(pagina,[numero],A4[0]-margem-sans.widthOfTextAtSize(numero,8),813,sans,8,COR.discreto);
  }
  return { bytes: await doc.save(), totalProdutos: produtos.length, totalPaginas: paginas.length+1 };
}
