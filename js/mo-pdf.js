// Preenche um modelo oficial da Caixa (PDF preparado por ferramentas/preparar_modelos.py) no próprio navegador.
// O texto entra numa camada por cima do modelo, numa "atualização incremental" do PDF: o modelo da Caixa fica intacto.

// Larguras da fonte Helvetica (WinAnsi, códigos 32 a 255), em milésimos do tamanho da fonte
const LARG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 350,
  556, 350, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 350, 611, 350, 350, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 350, 500, 667,
  278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500];

// Padrão dos sistemas da Caixa: tudo em caixa alta, sem acento (º e ª ficam)
export function textoCaixa(v) {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^\x20-\x7EºªÇ]/g, ' ').replace(/\s+/g, ' ').trim();
}

const codigo = (ch) => { const c = ch.charCodeAt(0); return c >= 32 && c <= 255 ? c : 32; };
export function larguraTexto(texto, tam) {
  let s = 0;
  for (const ch of String(texto)) s += LARG[codigo(ch) - 32] || 556;
  return (s * tam) / 1000;
}

// Quebra um texto em linhas que cabem na largura
export function quebrarLinhas(texto, tam, largura) {
  const linhas = [];
  for (const par of String(texto).split(/\n/)) {
    let atual = '';
    for (const p of par.split(/\s+/).filter(Boolean)) {
      const teste = atual ? `${atual} ${p}` : p;
      if (atual && larguraTexto(teste, tam) > largura) { linhas.push(atual); atual = p; } else atual = teste;
    }
    linhas.push(atual);
  }
  return linhas;
}

// String PDF: ( ) e \ escapados; acima de 127 em octal (WinAnsi)
function stringPdf(t) {
  let s = '(';
  for (const ch of String(t)) {
    const c = codigo(ch);
    if (ch === '(' || ch === ')' || ch === '\\') s += `\\${ch}`;
    else if (c > 126) s += `\\${c.toString(8).padStart(3, '0')}`;
    else s += ch;
  }
  return `${s})`;
}
const num = (n) => (Math.round(n * 100) / 100).toString();

// Comandos de desenho de cada página
export function camadas(modelo, valores) {
  const porPagina = modelo.paginas.map(() => []);
  for (const c of modelo.campos) {
    const bruto = valores[c.n] ?? valores[String(c.n)];
    if (bruto == null || String(bruto).trim() === '' || c.tipo === 'fora') continue;
    const ops = porPagina[c.pagina];
    if (c.tipo === 'marca') { ops.push(`BT /FCCA ${num(c.tam)} Tf ${num(c.x + 1)} ${num(c.y)} Td (X) Tj ET`); continue; }
    if (c.tipo === 'longo') {
      const tam = Math.min(c.tam, 10);
      const linhas = quebrarLinhas(String(bruto).trim(), tam, c.largura).slice(0, c.linhas || 6);
      linhas.forEach((l, i) => ops.push(`BT /FCCA ${num(tam)} Tf ${num(c.x)} ${num(c.y - i * tam * 1.3)} Td ${stringPdf(l)} Tj ET`));
      continue;
    }
    const texto = textoCaixa(bruto);
    let tam = Math.min(c.tam, 10);
    while (tam > 6 && larguraTexto(texto, tam) > c.largura) tam -= 0.5;
    ops.push(`BT /FCCA ${num(tam)} Tf ${num(c.x)} ${num(c.y)} Td ${stringPdf(texto)} Tj ET`);
  }
  return porPagina.map((ops) => (ops.length ? `q 0 0 0 rg\n${ops.join('\n')}\nQ` : ''));
}

const ascii = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);

// Últimos dados do PDF: onde está a tabela xref (o modelo pode ter mudado; lemos do próprio arquivo)
function ultimoStartxref(bytes) {
  const fim = String.fromCharCode(...bytes.subarray(Math.max(0, bytes.length - 64)));
  const m = /startxref\s+(\d+)/.exec(fim);
  return m ? Number(m[1]) : null;
}

// Devolve o PDF preenchido (Uint8Array)
export function preencherPdf(base, modelo, valores) {
  const bytes = base instanceof Uint8Array ? base : new Uint8Array(base);
  const prev = ultimoStartxref(bytes) ?? modelo.startxref;
  const partes = [bytes];
  let pos = bytes.length;
  if (bytes[bytes.length - 1] !== 0x0a) { partes.push(ascii('\n')); pos += 1; }
  const entradas = [];
  camadas(modelo, valores).forEach((conteudo, i) => {
    const [obj, ger] = modelo.paginas[i].camada;
    const corpo = ascii(conteudo || '% vazio');
    const cab = ascii(`${obj} ${ger} obj\n<< /Length ${corpo.length} >>\nstream\n`);
    const fim = ascii('\nendstream\nendobj\n');
    entradas.push([obj, ger, pos]);
    partes.push(cab, corpo, fim);
    pos += cab.length + corpo.length + fim.length;
  });
  let xref = 'xref\n';
  for (const [obj, ger, off] of entradas.sort((a, b) => a[0] - b[0])) xref += `${obj} 1\n${String(off).padStart(10, '0')} ${String(ger).padStart(5, '0')} n \n`;
  const id = modelo.id ? ` /ID [<${modelo.id[0]}> <${modelo.id[1]}>]` : '';
  xref += `trailer\n<< /Size ${modelo.tamanho} /Root ${modelo.raiz[0]} ${modelo.raiz[1]} R /Prev ${prev}${id} >>\nstartxref\n${pos}\n%%EOF\n`;
  partes.push(ascii(xref));
  const total = partes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of partes) { out.set(p, o); o += p.length; }
  return out;
}
