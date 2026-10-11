"""Casos extras: operação sem vendedor pula a tela Vendedor; vendedor PF casado pede cônjuge e certidão de casamento."""
import os, re, sys, subprocess, time, tempfile
from playwright.sync_api import sync_playwright, expect

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8766', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8766/index.html?demo'
erros = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        pg = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(URL)
        pg.fill('#email', 'corretor@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
        expect(pg.get_by_role('heading', name='Meus clientes')).to_be_visible()

        # 1) Mariana: vendedor PF passa a ser casado
        mariana = pg.evaluate("JSON.parse(localStorage.getItem('appcca-demo-v4')).clientes.find(c => c.nome === 'Mariana Costa').id")
        pg.goto(f'{URL}#/cliente/{mariana}/cadastro/5')
        expect(pg.get_by_role('heading', name='Vendedor', exact=True)).to_be_visible()
        assert pg.input_value('#v-nome') == 'Antônio Ferreira'
        pg.locator('fieldset', has_text='Estado civil do vendedor').get_by_role('button', name='Casado(a)').click()
        expect(pg.get_by_text('Cônjuge também é vendedor:')).to_be_visible()
        pg.click('text=Continuar')
        expect(pg.get_by_text('Digite o nome completo do cônjuge do vendedor.')).to_be_visible()
        pg.fill('#v-conjuge_nome', 'Beatriz Ferreira'); pg.fill('#v-conjuge_cpf', '52998224725')
        pg.screenshot(path=os.path.join(SAIDA, 'x1-vendedor-pf-casado.png'), full_page=True)
        pg.click('text=Continuar')
        expect(pg.get_by_role('heading', name='Documentos')).to_be_visible()
        pg.get_by_role('tab', name=re.compile('^Vendedor')).click()
        expect(pg.get_by_text('Certidão de casamento', exact=True)).to_be_visible()
        expect(pg.get_by_text('Cônjuge do vendedor: identidade', exact=False)).to_be_visible()
        expect(pg.get_by_text('Certidão de nascimento', exact=True)).to_have_count(0)
        pg.screenshot(path=os.path.join(SAIDA, 'x2-docs-vendedor-pf.png'), full_page=True)

        # 2) Construção em terreno próprio: sem tela Vendedor (6 etapas)
        pg.goto(f'{URL}#/cliente/{mariana}/cadastro/3')
        pg.get_by_role('button', name='Construção em Terreno Próprio').click()
        pg.locator('fieldset', has_text='3 anos ou mais').get_by_role('button', name='Não').click()
        pg.click('text=Continuar')
        expect(pg.get_by_role('heading', name='Imóvel', exact=True)).to_be_visible()
        expect(pg.get_by_text('Etapa 4 de 6', exact=False)).to_be_visible()
        expect(pg.get_by_role('button', name='Leilão')).to_have_count(0)
        pg.select_option('#imovel-uf', 'RJ'); pg.select_option('#imovel-municipio', 'Maricá')
        pg.get_by_role('button', name='Urbana').click()
        pg.locator('fieldset', has_text='região metropolitana').get_by_role('button', name='Sim').click()
        pg.fill('#valor-imovel', '20000000')
        pg.click('text=Continuar')
        expect(pg.get_by_role('heading', name='Documentos')).to_be_visible()
        expect(pg.get_by_text('Etapa 5 de 6', exact=False)).to_be_visible()
        expect(pg.get_by_role('tab', name=re.compile('^Vendedor'))).to_have_count(0)
        pg.get_by_role('link', name='Voltar').click()
        expect(pg.get_by_role('heading', name='Imóvel', exact=True)).to_be_visible()
        b.close()
    assert not erros, erros
    print('OK – casos extras')
finally:
    srv.terminate()
