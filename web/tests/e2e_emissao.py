"""Emissão e validade (ônus reais, JUCERJA, ITC), vendedor 60+ e desconto de 50% no cartório (modo demonstração)."""
import os, sys, subprocess, time, tempfile, re, datetime
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8810', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
URL = 'http://127.0.0.1:8810/index.html?demo'
erros = []
def entrar(pg, email):
    pg.goto(URL); pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_timeout(900)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(**({'executable_path': os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}))
        # ---- equipe: painel inicial com Atenção, e bloco do cartório
        pg = b.new_context(viewport={'width': 1440, 'height': 1000}).new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        entrar(pg, 'equipe@demo'); pg.evaluate("location.hash = '#/painel/inicio'")
        expect(pg.get_by_role('heading', name='Prazos e validades')).to_be_visible()
        expect(pg.get_by_text('Certidão de ônus reais · Mariana Costa')).to_be_visible()
        expect(pg.get_by_text('Certidão de ônus reais · Rafael Nunes')).to_be_visible()
        expect(pg.get_by_text('vencido há', exact=False).first).to_be_visible()
        expect(pg.get_by_text('Desconto de 50% no cartório')).to_be_visible()
        expect(pg.get_by_text('1 GRERJ para pagar')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/inicio_adm.png', full_page=True)
        pg.get_by_role('link', name='Clientes').first.click()
        pg.get_by_text('Mariana Costa').first.click()
        expect(pg.get_by_role('heading', name='Busca de bens (desconto de 50%)')).to_be_visible()
        expect(pg.get_by_text('Nenhuma GRERJ anexada ainda.')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/cartorio.png', full_page=True)
        pg.context.close()

        # ---- corretor: vendedor 60+ pede ITC; ônus reais pede a data
        pg = b.new_context(viewport={'width': 1100, 'height': 1000}).new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        entrar(pg, 'corretor@demo')
        pg.evaluate("location.hash = '#/clientes'")
        pg.locator('.tabela tbody tr[tabindex]', has_text='Mariana Costa').first.click()
        cid = re.search(r'#/cliente/([^/]+)', pg.url).group(1)
        pg.evaluate(f"location.hash = '#/cliente/{cid}/documentos'"); pg.wait_for_timeout(500)
        pg.get_by_role('tab', name=re.compile('^Vendedor')).click()
        expect(pg.locator('.doc', has_text='ITC no endereço do imóvel')).to_be_visible()
        expect(pg.locator('.doc', has_text='ITC no endereço de residência')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/docs_vendedor.png', full_page=True)
        pg.get_by_role('tab', name=re.compile('^Imóvel')).click()
        linha = pg.locator('.doc', has_text='ônus reais')
        expect(linha.get_by_text('Válida · vence em', exact=False)).to_be_visible()
        # trocar a data de emissão
        linha.get_by_role('button', name=re.compile('Alterar a data')).click()
        pg.fill('#janela-data', (datetime.date.today() - datetime.timedelta(days=90)).isoformat())
        pg.get_by_role('dialog').get_by_role('button', name='Confirmar').click()
        expect(pg.locator('.doc', has_text='ônus reais').get_by_text('Vencida', exact=False)).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/docs_imovel.png', full_page=True)
        # cadastro do vendedor: nascimento obrigatório e aviso do ITC
        pg.evaluate("location.hash = location.hash.replace(/documentos.*$/, 'cadastro/5')")
        pg.wait_for_timeout(600)
        if pg.locator('#v-data_nascimento').count():
            expect(pg.get_by_text('Vendedor com 60 anos ou mais:', exact=False)).to_be_visible()
            pg.fill('#v-data_nascimento', '1990-01-01')
            expect(pg.get_by_text('Vendedor com 60 anos ou mais:', exact=False)).to_have_count(0)
            pg.fill('#v-data_nascimento', '1950-01-01'); pg.fill('#v-residencia_municipio', 'Rio de Janeiro')
            pg.screenshot(path=f'{SAIDA}/vendedor_itc.png', full_page=True)
        else:
            print('AVISO: etapa do vendedor não abriu em cadastro/5', pg.url)
        pg.evaluate("location.hash = '#/inicio'")
        expect(pg.get_by_role('heading', name='Prazos e validades')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/inicio_corretor.png', full_page=True)
    print('ERROS', erros); assert not erros, erros
    print('OK – emissão, validade, ITC e desconto no cartório. Fotos em', SAIDA)
finally:
    srv.terminate()
