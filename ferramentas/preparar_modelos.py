"""Ferramenta interna (roda fora do app): prepara os modelos oficiais da Caixa (MO em Word) para o
preenchimento automático no navegador.

Para cada modelo:
  1. Zera todos os campos do formulário Word (nenhum dado de cliente fica no modelo) e dá a cada campo
     uma largura em branco adequada ao conteúdo (ex.: nome completo).
  2. Gera o PDF "limpo" (o modelo) e um PDF "marcado", com um traço colorido no início de cada campo,
     só para descobrir a posição exata de cada campo na página.
  3. Prepara o PDF limpo para receber o texto no navegador: uma camada vazia por página e a fonte Helvetica.
  4. Grava web/modelos/<CODIGO>.pdf e web/js/mo-oficiais.js (lista de campos, posições e rótulos).

Uso: python3 preparar_modelos.py <pasta com os .doc/.docx> <pasta web do app>
"""
import json, re, subprocess, sys, zipfile, shutil, tempfile
from pathlib import Path

import pdfplumber, pikepdf

ESP = ' '  # espaço "en" (o branco padrão dos campos do Word)

# chave: de onde vem o valor (ver dadosMo no app); tipo: texto | marca | longo | fora (a agência preenche)
def T(chave, rotulo, w, **k): return dict(chave=chave, rotulo=rotulo, w=w, tipo=k.pop('tipo', 'texto'), **k)
def M(rotulo, padrao='', chave=None): return dict(chave=chave, rotulo=rotulo, w=2, tipo='marca', padrao=padrao)
def F(rotulo, w=2): return dict(chave=None, rotulo=rotulo, w=w, tipo='fora')

def participantes(nome_w, cpf_w, ate=4):
    out = []
    for i in range(1, ate + 1):
        out += [T(f'p{i}_nome', f'{i}º comprador(a): nome', nome_w), T(f'p{i}_cpf', f'{i}º comprador(a): CPF', cpf_w)]
    return out

MODELOS = {
    'MO30844': dict(arquivo='MO30844.docx', tabela_em_linha=True, titulo='Autorização da forma de pagamento, tarifa de avaliação e declarações (SCR)', campos=[
        T('titular_nome', 'Cliente (nome)', 34), T('titular_cpf', 'CPF do cliente', 16),
        T('agencia', 'Agência Caixa', 8), T('conta', 'Conta Caixa', 18),
        M('Autorizo o débito da parcela na conta', 'X'), M('Cancelar o débito da parcela na conta'),
        M('Receber o boleto pelo WhatsApp'), T('telefone_boleto', 'Telefone do WhatsApp (boleto)', 16),
        M('Débito da tarifa de avaliação na conta', 'X'),
        T('local_data', 'Local e data', 44),
        *participantes(30, 15)]),
    'MO30825': dict(arquivo='MO30825005.doc', titulo='Proposta de Seguro Habitacional (MIP e DFI)', campos=[
        *participantes(40, 15),
        *[M(f'{i}º proponente: desconheço possuir as doenças') for i in range(1, 5)],
        *[M(f'{i}º proponente: declaro possuir uma ou mais doenças') for i in range(1, 5)],
        T('local_data', 'Local e data', 44),
        *participantes(34, 15)]),
    'MO30693': dict(arquivo='MO30693008.doc', titulo='Autorização ou cancelamento do débito dos encargos e da tarifa de avaliação', campos=[
        T('titular_nome', 'Nome completo', 40), T('titular_cpf', 'CPF', 15), T('contrato_numero', 'Número do contrato', 18),
        M('Débito da tarifa de avaliação na conta', 'X'), M('Débito da prestação na conta', 'X'),
        T('agencia', 'Agência (débito)', 6), T('conta', 'Conta (débito)', 16),
        M('Débito até a liquidação do contrato', 'X'), M('Débito por um período'),
        T('periodo_de_dia', 'Período: de (dia)', 2), T('periodo_de_mes', 'Período: de (mês)', 2), T('periodo_de_ano', 'Período: de (ano)', 4),
        T('periodo_ate_dia', 'Período: até (dia)', 2), T('periodo_ate_mes', 'Período: até (mês)', 2), T('periodo_ate_ano', 'Período: até (ano)', 4),
        M('Cancelar o débito do encargo mensal'), T('agencia_cancelar', 'Agência (cancelar)', 6), T('conta_cancelar', 'Conta (cancelar)', 16),
        M('Boleto enviado para o telefone'), T('telefone_boleto', 'Telefone (boleto)', 14),
        M('Boleto enviado para o endereço'), M('Não quero o boleto impresso'),
        T('local', 'Local', 22), T('dia', 'Dia', 2), T('mes_extenso', 'Mês', 10), T('ano', 'Ano', 4),
        *participantes(34, 15, ate=2)]),
    'MO30679': dict(arquivo='MO30679007.doc', titulo='Solicitação de consulta pelo CCA e ateste da inviabilidade de validação da renda pelo FGTS', campos=[
        M('Unidade Lotérica'), M('Correspondente CAIXA AQUI', 'X'),
        T('cca_codigo', 'Cód. UL/CCA', 8), T('cca_agencia_codigo', 'Cód. agência vinculada', 6), T('cca_agencia_nome', 'Nome da agência', 18),
        M('Consulta jurídica'), M('PEP – Pessoa Exposta Politicamente'), M('Restrição cadastral dos compradores'),
        M('Restrição cadastral dos vendedores'), M('SICOW – impedidos de operar com a Caixa'),
        M('FGTS: inexistência do extrato'), M('FGTS: extrato sem depósitos ou zerado'), M('FGTS: sem depósito no mês da contratação'),
        T('descricao_consulta', 'Descrição da consulta (motivo e item do MO43000)', 10, tipo='longo', largura=470, linhas=7),
        T('contrato_numero', 'Número do contrato (SIOPI/CIWEB)', 20), T('titular_cpf', 'CPF/CNPJ da parte consultada', 20),
        T('local', 'Local', 22), T('dia', 'Dia', 2), T('mes_extenso', 'Mês', 10), T('ano', 'Ano', 4),
        F('Parecer da agência: autoriza'), F('Parecer da agência: não autoriza'), F('Parecer da agência: atesta a inviabilidade'),
        F('Nome do empregado', 2), F('Matrícula do empregado', 2), F('Função do empregado', 2)]),
}


def campos_xml(xml):
    return list(re.finditer(r'<w:fldChar w:fldCharType="begin"[^>]*>(?:(?!<w:fldChar w:fldCharType="begin").)*?<w:fldChar w:fldCharType="end"[^>]*/>', xml, re.S))


def trocar_resultado(trecho, texto, cor=None):
    i = trecho.find('w:fldCharType="separate"')
    if i < 0: raise SystemExit('campo sem resultado')
    j = trecho.find('</w:r>', i) + len('</w:r>')
    fim = trecho.find('w:fldCharType="end"')
    k = max(trecho.rfind('<w:r>', 0, fim), trecho.rfind('<w:r ', 0, fim))
    meio = trecho[j:k]
    rpr = re.search(r'<w:rPr>.*?</w:rPr>', meio, re.S) or re.search(r'<w:rPr>.*?</w:rPr>', trecho, re.S)
    rpr = rpr.group(0) if rpr else '<w:rPr></w:rPr>'
    rpr = re.sub(r'<w:vanish/>|<w:color [^>]*/>', '', rpr)
    if cor: rpr = rpr.replace('<w:rPr>', f'<w:rPr><w:color w:val="{cor}"/>', 1)
    return trecho[:j] + f'<w:r>{rpr}<w:t xml:space="preserve">{texto}</w:t></w:r>' + trecho[k:]


def gravar_docx(entrada, saida, xml):
    with zipfile.ZipFile(entrada) as zi, zipfile.ZipFile(saida, 'w', zipfile.ZIP_DEFLATED) as zo:
        for it in zi.infolist():
            if it.filename.startswith('customXml/') and it.filename.endswith('.xml') and 'item' in it.filename:
                zo.writestr(it, zi.read(it.filename))
            elif it.filename == 'word/document.xml':
                zo.writestr(it, xml)
            elif it.filename == 'docProps/core.xml':
                zo.writestr(it, re.sub(r'(<dc:creator>|<cp:lastModifiedBy>)[^<]*', r'\1', zi.read(it.filename).decode()))
            else:
                zo.writestr(it, zi.read(it.filename))


def converter(arquivos, destino, formato):
    destino.mkdir(parents=True, exist_ok=True)
    subprocess.run(['soffice', '--headless', '--convert-to', formato, '--outdir', str(destino), *map(str, arquivos)],
                   check=True, capture_output=True, timeout=300)


def cor_do_campo(n): return f'{n:02X}0B{(255 - n):02X}'


def posicoes(pdf_marcado, total):
    achados = {}
    with pdfplumber.open(pdf_marcado) as pdf:
        for p, pg in enumerate(pdf.pages):
            for ch in pg.chars:
                if ch['text'] != 'x': continue
                cor = ch.get('non_stroking_color')
                if not cor or len(cor) != 3: continue
                r, g, b = (round(c * 255) for c in cor)
                if g != 0x0B or r + b != 255: continue
                a, _, _, d, e, f = ch['matrix']
                achados[r] = dict(pagina=p, x=round(e, 2), y=round(f, 2), tam=round(ch['size'], 2))
    faltam = [n for n in range(1, total + 1) if n not in achados]
    if faltam: raise SystemExit(f'{pdf_marcado}: campos sem posição {faltam}')
    return achados


def palavras(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        return [[(w['text'], round(w['x0'], 1), round(w['top'], 1)) for w in pg.extract_words()] for pg in pdf.pages]


def comparar_layout(limpo, marcado):
    a, b = palavras(limpo), palavras(marcado)
    if len(a) != len(b): raise SystemExit(f'{limpo}: número de páginas diferente ({len(a)} x {len(b)})')
    pior = 0
    for pa, pb in zip(a, b):
        mb = {}
        for t, x, y in pb: mb.setdefault(t.replace('x', ''), []).append((x, y))
        for t, x, y in pa:
            cands = mb.get(t)
            if not cands: continue
            d = min(abs(x - cx) + abs(y - cy) for cx, cy in cands)
            pior = max(pior, d if d < 40 else 0)
    return pior


def preparar_pdf(limpo, saida):
    with pikepdf.open(limpo) as pdf:
        fonte = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1,
                                                     BaseFont=pikepdf.Name.Helvetica, Encoding=pikepdf.Name.WinAnsiEncoding))
        for page in pdf.pages:
            camada = pdf.make_indirect(pikepdf.Stream(pdf, b'% camada CCA\n'))
            atual = page.obj.get('/Contents')
            lista = list(atual) if isinstance(atual, pikepdf.Array) else ([atual] if atual is not None else [])
            page.obj.Contents = pikepdf.Array([*lista, camada])
            res = page.obj.get('/Resources')
            if res is None:
                page.obj.Resources = res = pikepdf.Dictionary()
            fontes = res.get('/Font')
            if fontes is None:
                res.Font = fontes = pikepdf.Dictionary()
            fontes.FCCA = fonte
        if '/Info' in pdf.trailer: del pdf.trailer['/Info']
        if '/Metadata' in pdf.Root: del pdf.Root['/Metadata']
        pdf.save(saida, object_stream_mode=pikepdf.ObjectStreamMode.disable, compress_streams=True, linearize=False,
                 deterministic_id=True)
    dados = Path(saida).read_bytes()
    if b'\nxref' not in dados and b'\rxref' not in dados: raise SystemExit('PDF sem tabela xref clássica')
    startxref = int(re.findall(rb'startxref\s+(\d+)', dados)[-1])
    with pikepdf.open(saida) as pdf:
        paginas = []
        for page in pdf.pages:
            camada = page.obj.Contents[len(page.obj.Contents) - 1]
            mb = [float(v) for v in page.obj.MediaBox]
            paginas.append(dict(camada=list(camada.objgen), altura=mb[3]))
        raiz = list(pdf.Root.objgen)
        tamanho = int(pdf.trailer.Size)
        ident = [bytes(x).hex() for x in pdf.trailer.ID] if '/ID' in pdf.trailer else None
    return dict(paginas=paginas, raiz=raiz, tamanho=tamanho, startxref=startxref, id=ident)


def main(entrada, web):
    entrada, web = Path(entrada), Path(web)
    tmp = Path(tempfile.mkdtemp(prefix='mo_'))
    (tmp / 'base').mkdir()
    # .doc / .dot -> .docx
    for cod, m in MODELOS.items():
        src = entrada / m['arquivo']
        if src.suffix == '.docx':
            shutil.copy(src, tmp / 'base' / f'{cod}.docx')
        else:
            shutil.copy(src, tmp / 'base' / f'{cod}.doc')
    docs = [p for p in (tmp / 'base').iterdir() if p.suffix == '.doc']
    if docs: converter(docs, tmp / 'base', 'docx')
    saida_js = {}
    (web / 'modelos').mkdir(exist_ok=True)
    for cod, m in MODELOS.items():
        base = tmp / 'base' / f'{cod}.docx'
        xml = zipfile.ZipFile(base).read('word/document.xml').decode('utf-8')
        if m.get('tabela_em_linha'):  # tabela "flutuante" presa ao texto: no LibreOffice ela empurra o texto ao lado; deixa na linha
            xml = re.sub(r'<w:tblpPr [^>]*w:vertAnchor="text"[^>]*/>', '', xml)
        cs = campos_xml(xml)
        if len(cs) != len(m['campos']): raise SystemExit(f'{cod}: {len(cs)} campos no Word, {len(m["campos"])} na lista')
        limpo_xml, marc_xml, pos = [], [], 0
        for n, (mt, c) in enumerate(zip(cs, m['campos']), 1):
            branco = ESP * c['w']
            limpo_xml += [xml[pos:mt.start()], trocar_resultado(mt.group(0), branco)]
            marc_xml += [xml[pos:mt.start()], trocar_resultado(mt.group(0), 'x' + ESP * (c['w'] - 1), cor_do_campo(n))]
            pos = mt.end()
        limpo_xml.append(xml[pos:]); marc_xml.append(xml[pos:])
        (tmp / 'limpo').mkdir(exist_ok=True); (tmp / 'marcado').mkdir(exist_ok=True)
        gravar_docx(base, tmp / 'limpo' / f'{cod}.docx', ''.join(limpo_xml))
        gravar_docx(base, tmp / 'marcado' / f'{cod}.docx', ''.join(marc_xml))
    converter(sorted((tmp / 'limpo').glob('*.docx')), tmp / 'limpo', 'pdf')
    converter(sorted((tmp / 'marcado').glob('*.docx')), tmp / 'marcado', 'pdf')
    for cod, m in MODELOS.items():
        limpo, marcado = tmp / 'limpo' / f'{cod}.pdf', tmp / 'marcado' / f'{cod}.pdf'
        desvio = comparar_layout(limpo, marcado)
        pos = posicoes(marcado, len(m['campos']))
        info = preparar_pdf(limpo, web / 'modelos' / f'{cod}.pdf')
        campos = []
        for n, c in enumerate(m['campos'], 1):
            p = pos[n]
            item = dict(n=n, chave=c['chave'], rotulo=c['rotulo'], tipo=c['tipo'], pagina=p['pagina'], x=p['x'], y=p['y'], tam=p['tam'],
                        largura=c.get('largura') or round(c['w'] * p['tam'] * 0.5 - 1, 1))
            if c.get('padrao'): item['padrao'] = c['padrao']
            if c.get('linhas'): item['linhas'] = c['linhas']
            campos.append(item)
        saida_js[cod] = dict(codigo=cod, titulo=m['titulo'], arquivo=f'modelos/{cod}.pdf', **info, campos=campos)
        print(f'{cod}: {len(campos)} campos, {len(info["paginas"])} páginas, desvio de layout {desvio}')
    js = ('// Gerado por ferramentas/preparar_modelos.py — não editar à mão.\n'
          '// Modelos oficiais da Caixa (MO) prontos para o preenchimento automático: posição de cada campo no PDF do modelo.\n'
          f'export const MO_OFICIAIS = {'{\n' + ',\n'.join(f' {json.dumps(k)}: ' + json.dumps(v, ensure_ascii=False, separators=(',', ':')) for k, v in saida_js.items()) + '\n}'};\n')
    (web / 'js' / 'mo-oficiais.js').write_text(js, encoding='utf-8')
    shutil.rmtree(tmp)
    preparar_damp(entrada, web)


def preparar_damp(entrada, web):
    """DAMP 29300 offline (página da própria Caixa): só embute o logotipo, para abrir sozinha dentro do app."""
    import base64
    pasta = next(entrada.glob('MO29300*.html'), None)
    if not pasta: return
    html_path = next(pasta.glob('*.html'))
    html = html_path.read_text(encoding='utf-8')
    logo = pasta / 'logocaixagrayscale.png'
    if logo.exists():
        html = html.replace('src="logocaixagrayscale.png"', 'src="data:image/png;base64,' + base64.b64encode(logo.read_bytes()).decode() + '"')
    (web / 'modelos' / 'DAMP29300.html').write_text(html, encoding='utf-8')
    print('DAMP29300: página oficial da Caixa copiada', len(html))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
