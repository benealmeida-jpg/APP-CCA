// Gera um PDF A4 simples (texto em Helvetica) no próprio navegador, sem bibliotecas.
// Usado para documentos que o app preenche: requerimento da GRERJ e declaração de dependente.
import { larguraTexto, quebrarLinhas, stringPdf } from './mo-pdf.js';

const A4 = { w: 595.28, h: 841.89 };
// Caracteres fora do WinAnsi viram equivalentes simples
const limpar = (t) => String(t ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/\t/g, ' ');

// blocos: { texto, tam = 11, negrito, alinhar: 'esq'|'centro'|'dir'|'just', antes = 0, depois = 6, recuo = 0, linha: true (linha horizontal) }
export function gerarPdfTexto(blocos, { margem = 56, titulo = 'Documento' } = {}) {
  const largura = A4.w - 2 * margem;
  const paginas = [[]];
  let y = A4.h - margem;
  const novaPagina = () => { paginas.push([]); y = A4.h - margem; };
  for (const b of blocos) {
    const tam = b.tam || 11; const lh = tam * 1.35;
    y -= b.antes || 0;
    if (b.linha) {
      if (y < margem + 20) novaPagina();
      paginas[paginas.length - 1].push(`0.6 w ${num(margem + (b.recuo || 0))} ${num(y)} m ${num(margem + (b.ate || largura))} ${num(y)} l S`);
      y -= b.depois ?? 8; continue;
    }
    const fonte = b.negrito ? 'F2' : 'F1';
    const larg = largura - (b.recuo || 0);
    const linhas = quebrarLinhas(limpar(b.texto), tam, larg);
    linhas.forEach((ln, i) => {
      if (y - lh < margem) novaPagina();
      y -= lh;
      const w = larguraTexto(ln, tam);
      let x = margem + (b.recuo || 0);
      if (b.alinhar === 'centro') x = margem + (largura - w) / 2;
      else if (b.alinhar === 'dir') x = margem + largura - w;
      const ultima = i === linhas.length - 1;
      const espacos = (ln.match(/ /g) || []).length;
      const tw = b.alinhar === 'just' && !ultima && espacos ? (larg - w) / espacos : 0;
      paginas[paginas.length - 1].push(`BT /${fonte} ${tam} Tf ${tw ? `${num(tw)} Tw ` : '0 Tw '}${num(x)} ${num(y)} Td ${stringPdf(ln)} Tj ET`);
    });
    y -= b.depois ?? 6;
  }
  return montar(paginas, titulo);
}
const num = (n) => (Math.round(n * 100) / 100).toString();

function montar(paginas, titulo) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const catalogo = add(''); const raiz = add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const cmds of paginas) {
    const corpo = cmds.join('\n');
    const cont = add(`<< /Length ${corpo.length} >>\nstream\n${corpo}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${raiz} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cont} 0 R >>`));
  }
  objs[catalogo - 1] = `<< /Type /Catalog /Pages ${raiz} 0 R >>`;
  objs[raiz - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${stringPdf(limpar(titulo))} /Producer (Portal do Corretor - Andrade Almeida CCA) >>`);
  let saida = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const pos = [];
  objs.forEach((o, i) => { pos.push(saida.length); saida += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = saida.length;
  saida += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  saida += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(saida.length);
  for (let i = 0; i < saida.length; i++) bytes[i] = saida.charCodeAt(i) & 0xff;
  return bytes;
}
