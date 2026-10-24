"""Guarda dos documentos (LGPD): Configurações mostra prazo e espaço; cliente com arquivos apagados mostra o aviso."""
import os, sys, subprocess, time, tempfile
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8816', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
URL = 'http://127.0.0.1:8816/index.html?demo2'
erros = []
def entrar(pg, email):
    pg.goto(URL + '#/entrar'); pg.wait_for_timeout(700)
    if not pg.locator('#email').count():
        pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email'); pg.wait_for_timeout(300)
    pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_selector('.menu-botoes > a', timeout=10000); pg.wait_for_timeout(600)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ctx = b.new_context(viewport={'width': 1440, 'height': 1000}); pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        entrar(pg, 'equipe@demo')
        pg.evaluate("location.hash = '#/painel/config'"); pg.wait_for_selector('#secao-guarda', timeout=10000)
        sec = pg.locator('#secao-guarda')
        expect(sec).to_contain_text('Guarda dos documentos')
        expect(pg.locator('#gd-anos_guarda_documentos')).to_have_value('5')
        expect(sec).to_contain_text('Em uso:')
        pg.fill('#gd-limite_armazenamento_gb', '100'); sec.get_by_role('button', name='Salvar').nth(1).click(); pg.wait_for_timeout(800)
        expect(pg.get_by_text('Salvo.').first).to_be_visible()
        expect(sec).to_contain_text('(0% do plano)')
        sec.screenshot(path=f'{SAIDA}/guarda_config.png')
        # cliente com arquivos apagados
        cid = pg.evaluate("""async () => { const m = await import('./js/api.js'); const c = (await m.api.listarClientes()).find((x) => !x.rascunho && x.corretor_id === 'u-corretor'); return c.id; }""")
        pg.evaluate(f"""() => {{ const k = 'appcca-demo2-v4'; const d = JSON.parse(localStorage.getItem(k)); d.clientes.find((c) => c.id === '{cid}').documentos_apagados_em = '2031-03-10T12:00:00Z'; localStorage.setItem(k, JSON.stringify(d)); }}""")
        pg.reload(); pg.wait_for_timeout(1500)
        pg.evaluate(f"location.hash = '#/painel/clientes/{cid}'"); pg.wait_for_timeout(1500)
        av = pg.locator('.aviso-apagados').first
        expect(av).to_contain_text('Arquivos apagados em 10/03/2031')
        av.screenshot(path=f'{SAIDA}/guarda_aviso_cca.png')
        entrar(pg, 'corretor@demo')
        pg.evaluate(f"location.hash = '#/cliente/{cid}'"); pg.wait_for_timeout(1500)
        expect(pg.locator('.aviso-apagados').first).to_contain_text('prazo de guarda')
        pg.locator('.aviso-apagados').first.screenshot(path=f'{SAIDA}/guarda_aviso_corretor.png')
        b.close()
    assert not erros, erros
    print('OK guarda dos documentos')
finally:
    srv.terminate()
