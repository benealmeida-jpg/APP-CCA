"""Página inicial (ADM e corretor): carrega, seletores funcionam, sem rolagem lateral."""
import os, sys, subprocess, time, tempfile
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8803', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
erros = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        for email, rota in (('equipe@demo', '#/painel/inicio'), ('corretor@demo', '#/inicio')):
            for w in (1440, 390):
                pg = b.new_context(viewport={'width': w, 'height': 900}).new_page()
                pg.on('pageerror', lambda e: erros.append(str(e)))
                pg.goto('http://127.0.0.1:8803/index.html?demo&volume'); pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
                pg.wait_for_selector('.ini-grade')
                assert rota in pg.url, pg.url
                expect(pg.get_by_role('heading', name='Prazos e validades')).to_be_visible()
                assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), f'rolagem lateral {email} {w}'
                antes = pg.locator('.ini-kpi-valor').first.inner_text()
                pg.get_by_role('button', name='Este ano').click()
                pg.wait_for_timeout(300)
                assert pg.get_by_role('button', name='Este ano').get_attribute('aria-pressed') == 'true'
                pg.get_by_label('Mostrar').select_option('abertos'); pg.wait_for_timeout(300)
                expect(pg.locator('.ini-barra')).to_have_count(6)
                if email.startswith('equipe'):
                    pg.get_by_label('Agrupar por').select_option('corretor'); pg.wait_for_timeout(300)
                    expect(pg.locator('.ini-hbarras').last).to_be_visible()
                pg.get_by_role('link', name='Ver todas as engenharias').click(); pg.wait_for_timeout(500)
                assert 'engenharia' in pg.url
                pg.context.close()
        b.close()
finally:
    srv.terminate()
assert not erros, erros
print('OK inicio')
