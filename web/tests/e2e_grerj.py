"""Busca de bens (GRERJ): CCA anexa as guias → corretor paga no Bradesco e anexa comprovantes → baixa o requerimento
preenchido → anexa o assinado → CCA marca como enviado ao cartório. Também a declaração de dependente preenchida."""
import os, sys, subprocess, time, tempfile, re
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8812', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
URL = 'http://127.0.0.1:8812/index.html?demo2'
erros = []
def entrar(pg, email):
    pg.goto(URL + '#/entrar'); pg.wait_for_timeout(700)
    if not pg.locator('#email').count():
        pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email'); pg.wait_for_timeout(300)
    pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_selector('.menu-botoes > a', timeout=10000); pg.wait_for_timeout(600)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(**({'executable_path': os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}))
        ctx = b.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True); pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        entrar(pg, 'equipe@demo')
        cid = pg.evaluate("""async () => { const m = await import('./js/api.js'); const cs = await m.api.listarClientes(); return cs.find((c) => c.nome.startsWith('Mariana Costa')).id; }""")
        pg.evaluate(f"location.hash = '#/painel/clientes/{cid}'"); pg.wait_for_timeout(1500)
        bloco = pg.locator('#secao-busca-bens')
        expect(bloco.get_by_text('Nenhuma GRERJ anexada ainda.')).to_be_visible()
        total = int(re.search(r'(\d+) GRERJ', bloco.locator('.damp-cab').inner_text()).group(1))
        for i in range(total):
            pg.fill('#grerj-num', f'20261000{i}'); pg.click('#grerj-salvar'); pg.wait_for_timeout(700)
        assert pg.locator('.grerj-guia').count() == total, pg.locator('.grerj-guia').count()
        expect(bloco.get_by_text('Anexar outra GRERJ')).to_be_visible()
        pg.click('#grerj-liberar'); expect(pg.get_by_text('avisado na conversa', exact=False)).to_be_visible()
        expect(pg.locator('#secao-busca-bens .chip', has_text='Com o')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/grerj_cca.png', full_page=True); pg.locator('#secao-busca-bens').screenshot(path=f'{SAIDA}/grerj_cca_bloco.png')

        # corretor
        entrar(pg, 'corretor@demo')
        pg.evaluate(f"location.hash = '#/cliente/{cid}'"); pg.wait_for_timeout(1600)
        bloco = pg.locator('#secao-busca-bens')
        expect(bloco.get_by_text('Pague SOMENTE no Bradesco')).to_be_visible()
        expect(pg.get_by_text('As ' + str(total) + ' GRERJ da busca de bens', exact=False).first).to_be_visible()
        pdf = os.path.join(SAIDA, 'comprovante.pdf'); open(pdf, 'wb').write(b'%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF')
        for i in range(total):
            with pg.expect_file_chooser() as fc: pg.locator('#secao-busca-bens').get_by_role('button', name='Anexar comprovante').first.click()
            fc.value.set_files(pdf)
            pg.get_by_role('dialog').get_by_role('button', name='Confirmar').click(); pg.wait_for_timeout(900)
        assert pg.locator('.grerj-guia.paga').count() == total
        pg.fill('#greq-rg', '12.345.678-9'); pg.fill('#greq-contato', '(21) 97001-4546')
        with pg.expect_download() as dl: pg.click('#grerj-baixar-req')
        req = os.path.join(SAIDA, 'requerimento.pdf'); dl.value.save_as(req)
        txt = subprocess.run(['pdftotext', '-layout', req, '-'], capture_output=True, text=True).stdout
        assert 'REQUERIMENTO' in txt and '202610000' in txt and '12.345.678-9' in txt and 'Busca Específica de Bens' in txt, txt[:800]
        with pg.expect_file_chooser() as fc: pg.click('#grerj-anexar-req')
        fc.value.set_files(req)
        pg.get_by_role('dialog').get_by_role('button', name='Anexar mesmo assim').click(); pg.wait_for_timeout(900)
        expect(bloco.get_by_text('Anexado em', exact=False)).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/grerj_corretor.png', full_page=True); pg.locator('#secao-busca-bens').screenshot(path=f'{SAIDA}/grerj_corretor_bloco.png')
        # declaração de dependente preenchida (se o cliente tiver)
        pg.set_viewport_size({'width': 390, 'height': 900}); pg.wait_for_timeout(500)
        pg.screenshot(path=f'{SAIDA}/grerj_celular.png', full_page=True); pg.locator('#secao-busca-bens').screenshot(path=f'{SAIDA}/grerj_celular_bloco.png')
        pg.set_viewport_size({'width': 1440, 'height': 1000})

        # CCA envia
        entrar(pg, 'equipe@demo')
        pg.evaluate(f"location.hash = '#/painel/clientes/{cid}'"); pg.wait_for_timeout(1500)
        pg.click('#grerj-enviado'); expect(pg.get_by_text('Marcado como enviado', exact=False)).to_be_visible()
        expect(pg.locator('#secao-busca-bens .chip', has_text='No cartório')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/grerj_enviado.png', full_page=True); pg.locator('#secao-busca-bens').screenshot(path=f'{SAIDA}/grerj_enviado_bloco.png')
    print('ERROS', erros); assert not erros, erros
    print('OK – GRERJ ponta a ponta. Fotos em', SAIDA)
except Exception:
    try: pg.screenshot(path=f'{SAIDA}/falha_{os.path.basename(__file__)}.png', full_page=True); print('erros js:', erros)
    except Exception: pass
    raise
finally:
    srv.terminate()
