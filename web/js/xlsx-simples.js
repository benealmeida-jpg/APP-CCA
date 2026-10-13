// Gera um arquivo Excel (.xlsx) no próprio navegador, sem bibliotecas externas.
// planilhas: [{ nome, colunas: [{ titulo, largura?, tipo?: 'texto' | 'numero' | 'data' | 'percentual' | 'dias' }], linhas: [[...]] }]
// Valores: texto, número, Date ou string ISO (tipo 'data'), null/'' = vazio.

const enc = new TextEncoder();

// ---------- ZIP (sem compressão) ----------
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zip(arquivos) {
  const partes = []; const central = []; let pos = 0;
  const agora = new Date();
  const hora = ((agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1)) & 0xFFFF;
  const dia = (((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate()) & 0xFFFF;
  for (const { nome, dados } of arquivos) {
    const n = enc.encode(nome);
    const crc = crc32(dados);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034B50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
    loc.setUint16(10, hora, true); loc.setUint16(12, dia, true); loc.setUint32(14, crc, true);
    loc.setUint32(18, dados.length, true); loc.setUint32(22, dados.length, true); loc.setUint16(26, n.length, true); loc.setUint16(28, 0, true);
    partes.push(new Uint8Array(loc.buffer), n, dados);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014B50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
    cen.setUint16(12, hora, true); cen.setUint16(14, dia, true); cen.setUint32(16, crc, true);
    cen.setUint32(20, dados.length, true); cen.setUint32(24, dados.length, true); cen.setUint16(28, n.length, true);
    cen.setUint32(42, pos, true);
    central.push(new Uint8Array(cen.buffer), n);
    pos += 30 + n.length + dados.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054B50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true);
  return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------- Planilha ----------
const xml = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function letra(i) { let s = ''; i += 1; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
// Data do Excel: dias desde 30/12/1899 (horário local)
function serialData(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 864e5;
}
// Estilos: 0 normal, 1 cabeçalho (negrito, fundo), 2 data, 3 percentual, 4 número com 1 casa, 5 título
const ESTILO = { texto: 0, numero: 0, data: 2, percentual: 3, dias: 4 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2C4B5D"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function celula(ref, v, tipo, estilo) {
  if (v === null || v === undefined || v === '') return '';
  if (tipo === 'data') {
    const n = serialData(v);
    return n === null ? '' : `<c r="${ref}" s="${estilo ?? ESTILO.data}"><v>${n}</v></c>`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${estilo || ESTILO[tipo] ? ` s="${estilo ?? ESTILO[tipo]}"` : ''}><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${estilo ? ` s="${estilo}"` : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}

function planilhaXml({ colunas, linhas, titulo }) {
  const r = [];
  let n = 1;
  if (titulo) { r.push(`<row r="${n}">${celula(`A${n}`, titulo, 'texto', 5)}</row>`); n += 2; }
  const linhaCab = n;
  r.push(`<row r="${n}">${colunas.map((c, i) => celula(`${letra(i)}${n}`, c.titulo, 'texto', 1)).join('')}</row>`);
  n++;
  for (const l of linhas) {
    r.push(`<row r="${n}">${colunas.map((c, i) => celula(`${letra(i)}${n}`, l[i], c.tipo || 'texto')).join('')}</row>`);
    n++;
  }
  const cols = colunas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura || Math.min(48, Math.max(10, String(c.titulo).length + 4))}" customWidth="1"/>`).join('');
  const ultima = `${letra(colunas.length - 1)}${Math.max(linhaCab, n - 1)}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${linhaCab}" topLeftCell="A${linhaCab + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${r.join('')}</sheetData>
${linhas.length ? `<autoFilter ref="A${linhaCab}:${ultima}"/>` : ''}
</worksheet>`;
}

// Nome de aba: até 31 letras, sem : \ / ? * [ ]
const nomeAba = (s, i) => (String(s || `Planilha ${i + 1}`).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || `Planilha ${i + 1}`);

export function gerarXlsx(planilhas) {
  const nomes = planilhas.map((p, i) => nomeAba(p.nome, i));
  const arquivos = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${planilhas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${nomes.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
${planilhas.some((p) => p.linhas.length) ? `<definedNames>${planilhas.map((p, i) => p.linhas.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(nomes[i]).replace(/'/g, "''")}'!$A$${p.titulo ? 3 : 1}:$${letra(p.colunas.length - 1)}$${(p.titulo ? 3 : 1) + p.linhas.length}</definedName>` : '').join('')}</definedNames>` : ''}
</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${planilhas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${planilhas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`],
    ['xl/styles.xml', STYLES],
    ...planilhas.map((p, i) => [`xl/worksheets/sheet${i + 1}.xml`, planilhaXml(p)]),
  ];
  return zip(arquivos.map(([nome, conteudo]) => ({ nome, dados: enc.encode(conteudo) })));
}

export function baixarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
