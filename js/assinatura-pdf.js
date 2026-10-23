// Lê as assinaturas digitais de um PDF (gov.br / ICP-Brasil) sem servidor: procura os campos de assinatura
// (/ByteRange + /Contents) e tira o nome de quem assinou do certificado (CN). Regras puras, testáveis.

const latin1 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return s;
};
const hexParaBytes = (hex) => {
  const h = hex.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(h.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
};
const decUtf8 = (b) => { try { return new TextDecoder('utf-8', { fatal: false }).decode(b); } catch { return latin1(b); } };
const decBmp = (b) => { let s = ''; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); return s; };

// Nomes de autoridade certificadora (cadeia do certificado): não são pessoas
const EH_AC = /(^|\b)(AC|CA)(\b|\s)|autoridade|certificadora|\bICP\b|\braiz\b|\broot\b|governo federal|gov\.?br|serpro|certisign|soluti|valid|safeweb|\bRFB\b|secretaria/i;

// CN (2.5.4.3 → 06 03 55 04 03) dentro do PKCS#7 da assinatura
export function nomesDoPkcs7(der) {
  const nomes = [];
  for (let i = 0; i + 7 < der.length; i++) {
    if (der[i] !== 0x06 || der[i + 1] !== 0x03 || der[i + 2] !== 0x55 || der[i + 3] !== 0x04 || der[i + 4] !== 0x03) continue;
    const tag = der[i + 5]; let len = der[i + 6]; let ini = i + 7;
    if (len === 0x81) { len = der[i + 7]; ini = i + 8; } else if (len === 0x82) { len = (der[i + 7] << 8) | der[i + 8]; ini = i + 9; }
    if (len <= 0 || len > 256 || ini + len > der.length) continue;
    const v = der.subarray(ini, ini + len);
    const txt = tag === 0x1e ? decBmp(v) : tag === 0x0c ? decUtf8(v) : latin1(v);
    nomes.push(txt);
  }
  return nomes;
}

// Limpa o CN: "FULANO DE TAL:12345678900" → "FULANO DE TAL"
export const limparCn = (cn) => String(cn || '').replace(/:\d{11,14}$/, '').replace(/\s+/g, ' ').trim();

export function lerAssinaturasPdf(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!(b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)) return { pdf: false, digital: false, nomes: [] }; // não é PDF
  const s = latin1(b);
  const digital = /\/ByteRange\s*\[/.test(s) && /\/(adbe\.pkcs7|ETSI\.CAdES|Type\s*\/Sig\b)/.test(s);
  const brutos = [];
  if (digital) {
    const re = /\/Contents\s*<([0-9A-Fa-f\s]{400,})>/g; let m;
    while ((m = re.exec(s))) brutos.push(...nomesDoPkcs7(hexParaBytes(m[1])));
    const reNome = /\/Name\s*\(([^)]{3,120})\)/g;
    while ((m = reNome.exec(s))) brutos.push(m[1]);
  }
  const vistos = new Set(); const nomes = [];
  for (const n of brutos.map(limparCn)) {
    if (!n || n.length < 5 || !/\s/.test(n) || EH_AC.test(n) || /\d{3}/.test(n)) continue;
    const k = normalizar(n);
    if (!vistos.has(k)) { vistos.add(k); nomes.push(n); }
  }
  return { pdf: true, digital, nomes };
}

// ---------- Comparar com quem precisa assinar ----------
export const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
const PEQUENAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
const partes = (s) => normalizar(s).split(' ').filter((p) => p && !PEQUENAS.has(p));
// Mesmo primeiro e último nome (o certificado às vezes abrevia ou omite nomes do meio)
export function mesmaPessoa(a, b) {
  const x = partes(a); const y = partes(b);
  if (!x.length || !y.length) return false;
  return x[0] === y[0] && x[x.length - 1] === y[y.length - 1];
}
export function conferirAssinantes(esperados = [], nomesLidos = []) {
  const assinaram = []; const faltam = [];
  for (const p of esperados) (nomesLidos.some((n) => mesmaPessoa(n, p.nome)) ? assinaram : faltam).push(p);
  const outros = nomesLidos.filter((n) => !esperados.some((p) => mesmaPessoa(n, p.nome)));
  return { assinaram, faltam, outros };
}
