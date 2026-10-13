"""Fase 5: menu do usuário, atalhos (? e G+letra), cliente ao lado no tablet (modo demonstração)."""
import os, sys, subprocess, time, tempfile
from playwright.sync_api import sync_playwright, expect

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8792', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8792/index.html?demo'
erros = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        pg = b.new_context(viewport={'width': 1024, 'height': 768}).new_page()
        pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
        pg.goto(URL); pg.fill('#email', 'corretor@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
        expect(pg.get_by_role('heading', name='Meus clientes')).to_be_visible()
        # tablet: abrir cliente mostra a lista e o painel lado a lado
        pg.locator('.tabela tbody tr[tabindex]').first.click()
        expect(pg.locator('.painel-cliente')).to_be_visible()
        a = pg.locator('.painel-colunas > .principal').bounding_box(); c = pg.locator('.painel-cliente').bounding_box()
        assert c['x'] > a['x'] + 200 and abs(c['y'] - a['y']) < 200, (a, c)
        pg.screenshot(path=f'{SAIDA}/tablet.png')
        # menu do usuário
        pg.click('.usuario-botao')
        expect(pg.get_by_role('menuitem', name='Sair')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/menu.png')
        pg.keyboard.press('Escape')
        expect(pg.get_by_role('menuitem', name='Sair')).to_be_hidden()
        # atalhos
        pg.keyboard.press('Shift+?')
        expect(pg.get_by_role('dialog', name='Atalhos de teclado')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/atalhos.png')
        pg.keyboard.press('Escape')
        pg.keyboard.press('g'); pg.keyboard.press('n')
        expect(pg).to_have_url(__import__('re').compile(r'#/novo'))
        pg.keyboard.press('g'); pg.keyboard.press('c')
        expect(pg).to_have_url(__import__('re').compile(r'#/clientes$'))
        b.close()
finally:
    srv.terminate()
print('ERROS', erros)
print('OK – fase 5' if not erros else 'FALHOU')
