import { PDFDocument, StandardFonts, rgb, BlendMode } from '../vendor/pdf-lib.esm.min.js';

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
  pagina.drawSvgPath(caminho, { x, y: A4[1] - topo, color: COR.fundo, borderColor: COR.borda, borderWidth: .55 });
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

// Uniformiza apenas o fundo quase branco conectado à borda. Rótulos claros
// isolados dentro do produto e pixels transparentes não são apagados.
export function uniformizarFundoClaro({ data, width, height }) {
  const visitados = new Uint8Array(width*height);
  const fila = new Uint32Array(width*height);
  let inicio=0, fim=0;
  const adicionar = pixel => {
    if(visitados[pixel])return;
    visitados[pixel]=1;
    const i=pixel*4;
    if(data[i+3]<12 || Math.min(data[i],data[i+1],data[i+2])>=248)fila[fim++]=pixel;
  };
  for(let x=0;x<width;x++){adicionar(x);adicionar((height-1)*width+x);}
  for(let y=0;y<height;y++){adicionar(y*width);adicionar(y*width+width-1);}
  while(inicio<fim) {
    const pixel=fila[inicio++],i=pixel*4,x=pixel%width;
    if(data[i+3]>=12)data[i]=data[i+1]=data[i+2]=255;
    if(x>0)adicionar(pixel-1);
    if(x<width-1)adicionar(pixel+1);
    if(pixel>=width)adicionar(pixel-width);
    if(pixel<width*(height-1))adicionar(pixel+width);
  }
}

// Recorta somente margens claras externas. O produto e sua sombra continuam
// completos; fotos com cenário/coloridas conservam o enquadramento cadastrado.
export function delimitarFoto({ data, width, height }) {
  const claro = indice => data[indice+3] < 12 || Math.min(data[indice],data[indice+1],data[indice+2]) >= 248;
  const passo = Math.max(1,Math.floor(Math.min(width,height)/80));
  let borda = 0, claros = 0;
  for(let x=0;x<width;x+=passo) {
    for(const y of [0,height-1]) { borda++; if(claro((y*width+x)*4))claros++; }
  }
  for(let y=0;y<height;y+=passo) {
    for(const x of [0,width-1]) { borda++; if(claro((y*width+x)*4))claros++; }
  }
  const inteira = { x:0,y:0,width,height };
  if(!borda || claros/borda < .97)return inteira;
  let esquerda=width, direita=-1, cima=height, baixo=-1;
  for(let y=0;y<height;y++) {
    for(let x=0;x<width;x++) {
      if(!claro((y*width+x)*4)) {
        esquerda=Math.min(esquerda,x); direita=Math.max(direita,x);
        cima=Math.min(cima,y); baixo=Math.max(baixo,y);
      }
    }
  }
  if(direita<esquerda || baixo<cima)return inteira;
  const folga=Math.max(8,Math.ceil(Math.max(width,height)*.025));
  esquerda=Math.max(0,esquerda-folga); cima=Math.max(0,cima-folga);
  direita=Math.min(width-1,direita+folga); baixo=Math.min(height-1,baixo+folga);
  return { x:esquerda,y:cima,width:direita-esquerda+1,height:baixo-cima+1 };
}

async function obterImagem(url, limite = 25000, { produto = false } = {}) {
  const endereco = new URL(url, globalThis.location?.href || 'https://localhost/');
  if (!['https:', 'http:', 'data:', 'blob:'].includes(endereco.protocol)) throw Error('Formato de endereço de imagem não permitido.');
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), limite);
  try {
    const resposta = await fetch(endereco.href, { signal: controlador.signal, cache: 'no-cache' });
    if (!resposta.ok) throw Error('Não foi possível carregar uma imagem (HTTP ' + resposta.status + ').');
    const blob = await resposta.blob();
    // A capa PNG é incorporada sem processamento e permanece idêntica ao original.
    if (!produto && /image\/(png|jpeg)/i.test(blob.type)) return { bytes: new Uint8Array(await blob.arrayBuffer()), tipo: /png/i.test(blob.type) ? 'png' : 'jpg' };
    const bitmap = await createImageBitmap(blob);
    try {
      // Preserva a resolução nativa das fotos comuns; limita apenas arquivos muito
      // grandes para evitar esgotar a memória do celular durante a exportação.
      const escala = Math.min(1, 2600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width*escala)); canvas.height = Math.max(1, Math.round(bitmap.height*escala));
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
      ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      let final = canvas;
      if(produto) {
        const pixels = ctx.getImageData(0,0,canvas.width,canvas.height);
        uniformizarFundoClaro(pixels); ctx.putImageData(pixels,0,0);
        const area = delimitarFoto(pixels);
        if(area.width!==canvas.width || area.height!==canvas.height) {
          final = document.createElement('canvas'); final.width=area.width; final.height=area.height;
          final.getContext('2d').drawImage(canvas,area.x,area.y,area.width,area.height,0,0,area.width,area.height);
        }
      }
      // PNG evita uma nova compressão JPEG e conserva os detalhes da embalagem.
      const convertido = await new Promise(resolve => final.toBlob(resolve,'image/png'));
      if (!convertido) throw Error('Não foi possível preparar uma foto.');
      return { bytes: new Uint8Array(await convertido.arrayBuffer()), tipo:'png' };
    } finally { bitmap.close(); }
  } finally { clearTimeout(timer); }
}

function imagemPrincipal(produto) {
  const candidata = [produto.imagem, ...(Array.isArray(produto.imagens) ? produto.imagens : [])]
    .find(valor => typeof valor === 'string' && valor.trim());
  return candidata?.trim() || '';
}

function medirCard(produto, serif, largura) {
  const nome = produto.nome || 'Produto sem nome';
  let tamanhoNome = 12;
  let linhasNome = quebrarTexto(nome, serif, tamanhoNome, largura);
  let alturaTexto = linhasNome.length * tamanhoNome * 1.14;
  while (alturaTexto > 133 && tamanhoNome > 8.5) {
    tamanhoNome -= .5;
    linhasNome = quebrarTexto(nome, serif, tamanhoNome, largura);
    alturaTexto = linhasNome.length * tamanhoNome * 1.14;
  }
  if (alturaTexto > 174) throw Error('O nome de "' + nome + '" é muito longo para um card legível. Reduza o nome no cadastro.');
  return { tamanhoNome, linhasNome, alturaTexto };
}
export async function gerarCatalogoPDF(produtos, categorias = [], { progresso = () => {} } = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle('Catálogo de Produtos - Espaço Viviane Vargas'); doc.setAuthor('Espaço Viviane Vargas');
  doc.setSubject('Catálogo de produtos'); doc.setLanguage('pt-BR');
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const paginas = paginarCatalogo(produtos,categorias);
  const capa = await obterImagem(new URL('../../assets/catalogo/capa-oficial.png?v=20261026',import.meta.url).href);
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
      try { foto = await obterImagem(url,25000,{produto:true}); }
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
    const medidas = grupo.produtos.map(produto => medirCard(produto,serif,largura-24));
    for (let i=0;i<grupo.produtos.length;i++) {
      const produto = grupo.produtos[i], x = margem+(i%3)*(largura+gap), y = topo+Math.floor(i/3)*(altura+gap);
      cardArredondado(pagina,x,y,largura,altura);
      const interna = largura-24;
      const { tamanhoNome, linhasNome } = medidas[i];
      const inicioLinha = Math.floor(i/3)*3;
      const maiorTexto = Math.max(...medidas.slice(inicioLinha,inicioLinha+3).map(m=>m.alturaTexto));
      // Todos os cards da mesma linha têm a área da foto e o nome alinhados.
      const alturaFoto = Math.min(238,altura-64-maiorTexto);
      const foto = imagens.get(imagemPrincipal(produto));
      if(foto) {
        const escala = Math.min((largura-24)/foto.width,(alturaFoto-12)/foto.height);
        const w=foto.width*escala,h=foto.height*escala;
        pagina.drawImage(foto,{x:x+(largura-w)/2,y:A4[1]-(y+10+(alturaFoto-h)/2)-h,width:w,height:h,blendMode:BlendMode.Multiply});
      } else escreverLinhas(pagina,['Sem imagem cadastrada'],x+12,y+alturaFoto/2,sans,8,COR.discreto);
      const nomeTopo=y+alturaFoto+16;
      escreverLinhas(pagina,linhasNome,x+12,nomeTopo,serif,tamanhoNome,COR.texto,1.14);
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
