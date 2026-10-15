"""Gestão da imobiliária: painel do gestor (somente leitura)."""
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = '/tmp/claude-0/-home-claude-app-cca/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos'
os.makedirs(FOTOS, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8817', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
URL = 'http://127.0.0.1:8817/index.html?demo&volume'
erros = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        pg = ctx.new_page(); pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(URL); pg.wait_for_timeout(900)
        pg.fill('#email', 'doc@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_timeout(1500)
        pg.get_by_role('link', name='Gestão').first.click(); pg.wait_for_timeout(1500)
        expect(pg.get_by_role('heading', name='Corretores', exact=True)).to_be_visible()
        expect(pg.get_by_text('Processos parados')).to_be_visible()
        expect(pg.get_by_text('Disputa entre os corretores')).to_be_visible()
        n = pg.locator('.gest-corretor').count(); print('corretores:', n); assert n >= 2
        pg.screenshot(path=f'{FOTOS}/gestao_pc.png', full_page=True)
        # filtra por um corretor
        antes = pg.locator('.gest-kpis .ini-kpi-valor').all_inner_texts()
        pg.locator('.gest-corretor').first.click(); pg.wait_for_timeout(500)
        depois = pg.locator('.gest-kpis .ini-kpi-valor').all_inner_texts()
        print('kpis:', antes, '->', depois)
        assert pg.locator('.gest-corretor.ativo').count() == 1
        # conversa só leitura
        if pg.locator('.gest-conversa-linha').count():
            pg.locator('.gest-conversa-linha').first.click(); pg.wait_for_timeout(500)
            expect(pg.get_by_text('Somente leitura').first).to_be_visible()
            assert pg.locator('.gest-conversa textarea, .gest-conversa input').count() == 0
        pg.screenshot(path=f'{FOTOS}/gestao_filtrada.png', full_page=True)
        # celular
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(600)
        assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rolagem lateral no celular'
        pg.screenshot(path=f'{FOTOS}/gestao_cel.png', full_page=True)
        # corretor comum não tem o menu
        pg.set_viewport_size({'width': 1440, 'height': 900})
        pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email')
        pg.fill('#email', 'corretor@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_timeout(1500)
        assert pg.get_by_role('link', name='Gestão').count() == 0
        pg.goto(URL + '#/gestao'); pg.wait_for_timeout(1200)
        assert 'gestao' not in pg.url, pg.url
        b.close()
finally:
    srv.terminate()
print('ERROS', erros); assert not erros
print('OK')
