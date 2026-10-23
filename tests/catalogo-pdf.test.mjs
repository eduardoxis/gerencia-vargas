import test from 'node:test';
import assert from 'node:assert/strict';
import { paginarCatalogo, quebrarTexto } from '../js/modules/catalogo-pdf.js';

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

