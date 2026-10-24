"""Barreiras iniciais: restrição e sem QV encerram; outro CCA pede a carta de cancelamento (corretor baixa e anexa;
gerente cancela e a CCA segue); liberado segue."""
import os, sys, subprocess, time, tempfile
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8815', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
URL = 'http://127.0.0.1:8815/index.html?demo2'
erros = []
def entrar(pg, email):
    pg.goto(URL + '#/entrar'); pg.wait_for_timeout(700)
    if not pg.locator('#email').count():
        pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email'); pg.wait_for_timeout(300)
    pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_selector('.menu-botoes > a', timeout=10000); pg.wait_for_timeout(600)
def abrir(pg, cid): pg.evaluate(f"location.hash = '#/painel/clientes/{cid}'"); pg.wait_for_timeout(1500)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ctx = b.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True); pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        entrar(pg, 'equipe@demo')
        ids = pg.evaluate("""async () => { const m = await import('./js/api.js'); const todos = (await m.api.listarClientes()).filter((x) => !x.rascunho && x.status !== 'credito_liberado');
          const meus = todos.filter((x) => x.corretor_id === 'u-corretor'); const outro = todos.find((x) => x.corretor_id !== 'u-corretor');
          return [meus[0].id, meus[1].id, outro.id]; }""")
        assert len(ids) == 3, ids
        a, bb, c = ids
        # 1) restrição → encerra
        abrir(pg, a)
        sec = pg.locator('#secao-barreiras')
        sec.get_by_role('button', name='Cliente com restrição').click()
        pg.fill('#barreira-obs', 'Restrição no SPC')
        sec.screenshot(path=f'{SAIDA}/barreira_restricao.png')
        pg.click('#barreira-salvar'); pg.get_by_role('dialog').get_by_role('button', name='Sim').click()
        expect(pg.get_by_text('Processo encerrado: cliente com restrição', exact=False)).to_be_visible()
        pg.wait_for_timeout(1200)
        expect(pg.locator('#secao-barreiras .chip', has_text='Cliente com restrição')).to_be_visible()
        st = pg.evaluate(f"(async () => {{ const m = await import('./js/api.js'); return (await m.api.obterCliente('{a}')).cliente.status; }})()")
        assert st == 'processo_encerrado', st
        pg.locator('#secao-barreiras').screenshot(path=f'{SAIDA}/barreira_encerrado.png')
        # 2) liberado
        abrir(pg, c)
        pg.locator('#secao-barreiras').get_by_role('button', name='Sem barreiras').click(); pg.click('#barreira-salvar')
        expect(pg.get_by_text('Sem barreiras: segue', exact=False)).to_be_visible()
        # 3) outro CCA
        abrir(pg, bb)
        pg.locator('#secao-barreiras').get_by_role('button', name='Aprovação em outro CCA').click()
        pg.locator('#secao-barreiras').screenshot(path=f'{SAIDA}/barreira_outro_cca.png')
        pg.click('#barreira-salvar'); expect(pg.get_by_text('Carta de cancelamento pedida', exact=False).first).to_be_visible()
        pg.wait_for_timeout(1200)
        expect(pg.locator('#barreira-cancelada')).to_be_visible()

        # corretor: card com a carta; fluxograma do encerrado
        entrar(pg, 'corretor@demo')
        pg.evaluate(f"location.hash = '#/cliente/{bb}'"); pg.wait_for_timeout(1600)
        card = pg.locator('#secao-outro-cca')
        expect(card.get_by_text('Falta a carta assinada')).to_be_visible()
        card.get_by_role('button', name='Carta preenchida').first.click()
        pg.fill('#cc-rg', '12345678'); pg.fill('#cc-orgao', 'DETRAN RJ')
        with pg.expect_download() as dl: pg.get_by_role('button', name='Baixar a carta preenchida').click()
        f = os.path.join(SAIDA, 'carta_b.pdf'); dl.value.save_as(f)
        pg.keyboard.press('Escape')
        card.screenshot(path=f'{SAIDA}/corretor_outro_cca.png')
        card.get_by_role('link', name='Anexar assinada').first.click(); pg.wait_for_timeout(1500)
        linha = pg.locator('.doc', has_text='Carta de cancelamento de crédito').first
        with pg.expect_file_chooser() as fc: linha.get_by_role('button', name='Anexar').click()
        fc.value.set_files(f); pg.wait_for_timeout(1200)
        pg.evaluate(f"location.hash = '#/cliente/{a}'"); pg.wait_for_timeout(1600)
        pg.screenshot(path=f'{SAIDA}/corretor_encerrado.png', full_page=True)
        expect(pg.get_by_text('Processo encerrado', exact=False).first).to_be_visible()

        # CCA: gerente cancelou → segue
        entrar(pg, 'equipe@demo'); abrir(pg, bb)
        pg.click('#barreira-cancelada')
        if pg.get_by_role('dialog').count(): pg.get_by_role('dialog').get_by_role('button', name='Sim').click()
        expect(pg.get_by_text('Aprovação anterior cancelada na Caixa em', exact=False)).to_be_visible()
        pg.locator('#secao-barreiras').screenshot(path=f'{SAIDA}/barreira_cancelada.png')
    print('ERROS', erros); assert not erros, erros
    print('OK – barreiras iniciais. Fotos em', SAIDA)
except Exception:
    try: pg.screenshot(path=f'{SAIDA}/falha_{os.path.basename(__file__)}.png', full_page=True); print('erros js:', erros)
    except Exception: pass
    raise
finally:
    srv.terminate()
