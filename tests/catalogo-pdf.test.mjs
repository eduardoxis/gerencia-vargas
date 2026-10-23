import test from 'node:test';
import assert from 'node:assert/strict';
import { paginarCatalogo, quebrarTexto, delimitarFoto, uniformizarFundoClaro } from '../js/modules/catalogo-pdf.js';

const fonte = { encodeText: valor => valor, widthOfTextAtSize: (valor,tamanho) => valor.length*tamanho/2 };

test('35 produtos: seis páginas de produtos sem perda, repetição ou mutação',()=>{
 const produtos=Array.from({length:35},(_,i)=>({id:String(i),nome:`Produto ${i}`,categoria:'Perfumes'}));
 const original=JSON.stringify(produtos);
 const paginas=paginarCatalogo(produtos);
 assert.deepEqual(paginas.map(p=>p.produtos.length),[6,6,6,6,6,5]);
 assert.equal(new Set(paginas.flatMap(p=>p.produtos.map(x=>x.id))).size,35);
 assert.equal(JSON.stringify(produtos),original);
});

test('troca de categoria inicia página com seus produtos; IDs viram nomes',()=>{
 const categorias=[{id:'a',nome:'Body Splash & Hidratantes'},{id:'b',nome:'Bolsas'}];
 const paginas=paginarCatalogo([{nome:'X',categoria:'b'},{nome:'Y',categoria:'a'},{nome:'Z',categoria:''}],categorias);
 assert.deepEqual(paginas.map(p=>p.categoria),['Body Splash & Hidratantes','Bolsas','Seleção de produtos']);
 assert.ok(paginas.every(p=>p.produtos.length===1));
});

test('catálogo vazio e página incompleta não criam produtos',()=>{
 assert.deepEqual(paginarCatalogo([]),[]);
 assert.equal(paginarCatalogo([{nome:'Único'}])[0].produtos.length,1);
});

test('quebra nomes longos e palavras sem espaços sem perder texto',()=>{
 const texto='Produto muito longo COMPOSTOSEMESPACOSGRANDE';
 const linhas=quebrarTexto(texto,fonte,10,50);
 assert.ok(linhas.every(l=>fonte.widthOfTextAtSize(l,10)<=50));
 assert.equal(linhas.join('').replaceAll(' ',''),texto.replaceAll(' ',''));
 assert.deepEqual(quebrarTexto('Hidratação\nCorporal',fonte,10,100),['Hidratação','Corporal']);
});


test('margens brancas são reduzidas com folga; detalhes brancos internos são preservados',()=>{
 const width=200,height=200,data=new Uint8ClampedArray(width*height*4).fill(255);
 for(let y=50;y<=150;y++)for(let x=70;x<=130;x++) {
  if(x===70||x===130||y===50||y===150) {
   const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=20;
  }
 }
 const area=delimitarFoto({data,width,height});
 assert.deepEqual(area,{x:62,y:42,width:77,height:117});
 assert.equal(data[(100*width+100)*4],255);
});

test('foto com cenário colorido conserva o enquadramento completo',()=>{
 const width=100,height=100,data=new Uint8ClampedArray(width*height*4);
 for(let i=0;i<data.length;i+=4){data[i]=140;data[i+1]=100;data[i+2]=80;data[i+3]=255;}
 assert.deepEqual(delimitarFoto({data,width,height}),{x:0,y:0,width,height});
});

test('foto clara sem objeto detectável não é cortada',()=>{
 const width=60,height=80,data=new Uint8ClampedArray(width*height*4).fill(255);
 assert.deepEqual(delimitarFoto({data,width,height}),{x:0,y:0,width,height});
});

test('pixels transparentes não ampliam a área do produto',()=>{
 const width=100,height=100,data=new Uint8ClampedArray(width*height*4);
 for(let y=40;y<=60;y++)for(let x=40;x<=60;x++) {
  const i=(y*width+x)*4;data[i+3]=255;
 }
 assert.deepEqual(delimitarFoto({data,width,height}),{x:32,y:32,width:37,height:37});
});
test('integra fundo claro externo sem apagar rótulo branco cercado pelo produto',()=>{
 const width=50,height=50,data=new Uint8ClampedArray(width*height*4);
 for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=250;data[i+3]=255;}
 for(let y=10;y<=40;y++)for(let x=10;x<=40;x++) {
  if(x===10||x===40||y===10||y===40){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=20;}
 }
 uniformizarFundoClaro({data,width,height});
 assert.equal(data[0],255);
 assert.equal(data[(25*width+25)*4],250);
 assert.equal(data[(10*width+25)*4],20);
 assert.equal(data[(25*width+25)*4+3],255);
});