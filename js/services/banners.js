import { db } from "../../firebase/firebase-config.js";
import { collection, doc, addDoc, deleteDoc, getDocs, orderBy, query, setDoc, updateDoc, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { comprimirParaBase64 } from "./imagem-base64.js";
const refBanners = collection(db, "banners"), refConfig = doc(db, "configuracoes", "banners");
export const CONFIG_PADRAO_CARROSSEL = { reproducaoAutomatica:true, intervaloMs:5000, transicaoMs:500, efeito:"fade", mostrarSetas:true, mostrarIndicadores:true, permitirSwipe:true };
export async function enviarImagemBanner(file, aoProgresso=()=>{}) { if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 8*1024*1024) throw new Error("Use JPG, PNG ou WebP de até 8 MB."); aoProgresso(20); const r=await comprimirParaBase64(file,{maxLargura:1280,maxBytes:280*1024}); aoProgresso(100); return r; }
export async function listarBannersAdmin(){const r=await getDocs(query(refBanners,orderBy("ordem","asc")));return r.docs.map(d=>({id:d.id,...d.data()}));}
export async function salvarBanner(d){const r={nome:String(d.nome||"").trim(),titulo:String(d.titulo||"").trim(),descricao:String(d.descricao||"").trim(),ordem:Math.max(1,Number(d.ordem)||1),ativo:d.ativo!==false,imagemDesktop:d.imagemDesktop||"",imagemMobile:d.imagemMobile||"",atualizadoEm:serverTimestamp()};if(!r.nome||!r.imagemDesktop)throw new Error("Informe o nome e selecione a imagem desktop.");if(d.id){await updateDoc(doc(db,"banners",d.id),r);return d.id;}return (await addDoc(refBanners,{...r,criadoEm:serverTimestamp()})).id;}
export const excluirBanner=b=>deleteDoc(doc(db,"banners",b.id));
export async function salvarOrdemBanners(lista){const l=writeBatch(db);lista.forEach((b,i)=>l.update(doc(db,"banners",b.id),{ordem:i+1,atualizadoEm:serverTimestamp()}));await l.commit();}
export async function salvarConfiguracaoBanners(c){await setDoc(refConfig,{...CONFIG_PADRAO_CARROSSEL,...c,intervaloMs:Math.max(2000,Number(c.intervaloMs)||5000),transicaoMs:Math.max(150,Number(c.transicaoMs)||500),atualizadoEm:serverTimestamp()},{merge:true});}
