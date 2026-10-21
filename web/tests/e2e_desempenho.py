"""Campanhas e desempenho, menu Mais sem Clientes/Sair, CTPS do comprador e "Como enviar" (celular)."""
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = os.environ.get('FOTOS', '/tmp/fotos'); os.makedirs(FOTOS, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8841', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
B = 'http://127.0.0.1:8841/index.html?demo2&volume'
erros = []
def entrar(pg, email):
    pg.goto(B + '#/entrar'); pg.wait_for_timeout(700)
    if not pg.locator('#email').count():
        pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email')
    pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_selector('.menu-botoes > a', timeout=8000); pg.wait_for_timeout(600)
def ir(pg, h): pg.evaluate(f"location.hash = '{h}'"); pg.wait_for_timeout(1500)
def sem_rolagem(pg): assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rolagem lateral'
try:
    with sync_playwright() as p:
        nav = p.chromium.launch()
        pg = nav.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg.on('pageerror', lambda e: erros.append(str(e)))
        for email, nome in [('corretor@demo', 'corretor'), ('ceo@demo', 'ceo'), ('gestor@demo', 'gestor')]:
            entrar(pg, email)
            assert pg.locator('.menu-botoes > a.sair, .menu-botoes .sair').count() == 0, 'Sair ainda na barra'
            ir(pg, '#/mais')
            textos = pg.locator('.mais-cartao b').all_inner_texts()
            assert not any(t in ('Clientes', 'Meus clientes') for t in textos), textos
            pg.locator('.mais-cartao', has_text='Campanhas e desempenho').click(); pg.wait_for_timeout(1800)
            assert '#/desempenho' in pg.url, pg.url
            assert pg.locator('h1', has_text='Campanhas e desempenho').count(), 'sem título'
            assert pg.locator('svg.dsp-rosca').count() >= 1
            assert pg.locator('svg.dsp-linhas').count() == 1 or pg.locator('.dsp-evolucao .ini-vazio').count() == 1
            sem_rolagem(pg)
            pg.screenshot(path=f'{FOTOS}/desempenho_{nome}.png', full_page=True)
            pg.locator('.dsp-controle button', has_text='Contratos assinados').click(); pg.wait_for_timeout(300)
        # CTPS no cadastro
        entrar(pg, 'corretor@demo'); ir(pg, '#/novo')
        pg.fill('#t-cpf', '123.456.789-09') if pg.locator('#t-cpf').count() else None
        ids = pg.evaluate("[...document.querySelectorAll('input[id$=ctps_numero]')].map(e => e.id)")
        assert ids, 'sem campo CTPS'
        pre = ids[0][:-len('ctps_numero')]
        cpf_id = pre + 'cpf'
        pg.fill('#' + cpf_id, '12345678909'); pg.click('#' + pre + 'ctps_cpf'); pg.wait_for_timeout(200)
        assert pg.input_value('#' + pre + 'ctps_numero') == '1234567' and pg.input_value('#' + pre + 'ctps_serie') == '8909'
        pg.locator('#' + pre + 'ctps_numero').scroll_into_view_if_needed(); pg.screenshot(path=f'{FOTOS}/ctps_campos.png')
        sem_rolagem(pg)
        # Como enviar: procura um cliente com carteira de trabalho pendente
        achou = False
        for i in range(12):
            ir(pg, '#/clientes')
            links = pg.evaluate("[...document.querySelectorAll('a[href^=\"#/cliente/\"]')].map(a => a.getAttribute('href').split('/')[2])")
            for cid in dict.fromkeys(links):
                ir(pg, f'#/cliente/{cid}/documentos')
                det = pg.locator('details.doc-orient')
                if det.count():
                    det.first.locator('summary').click(); pg.wait_for_timeout(200); det.first.scroll_into_view_if_needed()
                    pg.screenshot(path=f'{FOTOS}/como_enviar.png'); achou = True; break
            break
        print('como enviar encontrado:', achou)
        nav.close()
finally:
    srv.terminate()
assert not erros, erros
print('ok')
