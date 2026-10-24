"""Carta de cancelamento: CCA marca quem tem crédito em outro CCA → documento pedido por pessoa → corretor baixa a carta
preenchida no papel timbrado."""
import os, sys, subprocess, time, tempfile
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8814', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
URL = 'http://127.0.0.1:8814/index.html?demo2'
erros = []
def entrar(pg, email):
    pg.goto(URL + '#/entrar'); pg.wait_for_timeout(700)
    if not pg.locator('#email').count():
        pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email'); pg.wait_for_timeout(300)
    pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_selector('.menu-botoes > a', timeout=10000); pg.wait_for_timeout(600)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ctx = b.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True); pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        entrar(pg, 'equipe@demo')
        info = pg.evaluate("""async () => { const m = await import('./js/api.js'); const cs = await m.api.listarClientes();
          for (const c of cs.filter((x) => !x.rascunho && x.corretor_id === 'u-corretor')) { const d = await m.api.obterCliente(c.id); if (d.participantes.some((p) => p.conjuge_do_titular)) return { id: c.id, n: d.participantes.length }; }
          const c = cs.find((x) => !x.rascunho && x.corretor_id === 'u-corretor');
          await m.api.salvarParticipantes(c.id, [{ ordem: 2, papel: 'conjuge', conjuge_do_titular: true, nome: 'Carla Nunes', cpf: '52998224725', estado_civil: 'Casado(a)', extras: {} }]);
          return { id: c.id, n: 1 }; }""")
        cid = info['id']; print(info)
        pg.evaluate(f"location.hash = '#/painel/clientes/{cid}'"); pg.wait_for_timeout(1500)
        pg.locator('#secao-barreiras').get_by_role('button', name='Aprovação em outro CCA').click()
        marcados = pg.locator('#secao-barreiras input[type=checkbox]:checked').count(); print('marcados', marcados)
        assert marcados == 2, marcados  # titular + cônjuge (marcado junto)
        pg.click('#barreira-salvar')
        expect(pg.get_by_text('Carta de cancelamento pedida', exact=False).first).to_be_visible()
        pg.wait_for_timeout(1200)
        pg.locator('#secao-barreiras').screenshot(path=f'{SAIDA}/risco_cca.png')

        entrar(pg, 'corretor@demo')
        pg.evaluate(f"location.hash = '#/cliente/{cid}/documentos'"); pg.wait_for_timeout(1500)
        linhas = pg.locator('.doc', has_text='Carta de cancelamento de crédito')
        assert linhas.count() == marcados, (linhas.count(), marcados)
        linha = linhas.first
        linha.get_by_text('Como enviar').click()
        linha.get_by_role('button', name='Preencher a carta').click()
        pg.fill('#cc-rg', '296236441'); pg.fill('#cc-orgao', 'detran rj')
        pg.get_by_role('dialog').screenshot(path=f'{SAIDA}/carta_form.png')
        with pg.expect_download() as dl: pg.get_by_role('button', name='Baixar a carta preenchida').click()
        f = os.path.join(SAIDA, 'carta.pdf'); dl.value.save_as(f)
        t = subprocess.run(['pdftotext', f, '-'], capture_output=True, text=True).stdout
        assert 'Carta de Cancelamento de Crédito' in t and '296236441 DETRAN RJ' in t and 'CAIXA ECONÔMICA FEDERAL' in t, t
        subprocess.run(['pdftoppm', '-r', '60', '-png', f, os.path.join(SAIDA, 'carta')])
        print('baixou', dl.value.suggested_filename)
        pg.keyboard.press('Escape')
        # RG no cadastro: a carta já abre preenchida
        pg.evaluate(f"location.hash = '#/cliente/{cid}/cadastro/1'"); pg.wait_for_timeout(1500)
        pg.fill('#c-rg_numero', '123456789'); pg.fill('#c-rg_orgao', 'dic rj'); pg.locator('#c-rg_orgao').blur()
        assert pg.input_value('#c-rg_orgao') == 'DIC RJ'
        pg.locator('#c-rg_numero').screenshot(path=f'{SAIDA}/cad_rg.png')
        pg.evaluate("window.scrollTo(0, 0)"); pg.screenshot(path=f'{SAIDA}/cad_rg_tela.png')
        pg.get_by_role('button', name='Continuar', exact=True).click(); pg.wait_for_timeout(2500)
        print('erro na tela:', pg.locator('.erro-campo, [role=alert]').all_inner_texts()[:3], pg.url)
        print('salvo:', pg.evaluate(f"(async () => {{ const m = await import('./js/api.js'); const d = await m.api.obterCliente('{cid}'); return [d.cliente.rg_numero, d.cliente.rg_orgao]; }})()"))
        pg.evaluate(f"location.hash = '#/cliente/{cid}/documentos'"); pg.wait_for_timeout(1500)
        linha = pg.locator('.doc', has_text='Carta de cancelamento de crédito').first
        linha.get_by_text('Como enviar').click(); linha.get_by_role('button', name='Preencher a carta').click()
        assert pg.input_value('#cc-rg') == '123456789' and pg.input_value('#cc-orgao') == 'DIC RJ', (pg.input_value('#cc-rg'), pg.input_value('#cc-orgao'))
        pg.get_by_role('dialog').screenshot(path=f'{SAIDA}/carta_form_pronto.png')
    print('ERROS', erros); assert not erros, erros
    print('OK – carta de cancelamento. Fotos em', SAIDA)
finally:
    srv.terminate()
