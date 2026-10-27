"""Foto do perfil: escolher, salvar (aparece no círculo), remover (modo demonstração)."""
import os, sys, subprocess, time, tempfile
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
from PIL import Image
FOTO = os.path.join(SAIDA, 'foto.png'); Image.new('RGB', (600, 400), (200, 120, 60)).save(FOTO)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8797', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
erros = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(**({'executable_path': os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}))
        pg = b.new_context(viewport={'width': 390, 'height': 800}).new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto('http://127.0.0.1:8797/index.html?demo'); pg.fill('#email', 'corretor@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
        pg.wait_for_selector('.painel'); pg.wait_for_timeout(800)
        pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Minha foto').click()
        pg.set_input_files('.foto-caixa input[type=file]', FOTO)
        expect(pg.locator('.foto-previa img')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/1-dialogo.png')
        pg.get_by_role('button', name='Salvar foto').click()
        expect(pg.locator('.usuario-botao img')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/2-topo.png', clip={'x': 0, 'y': 0, 'width': 390, 'height': 130})
        pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Trocar minha foto').click()
        pg.get_by_role('button', name='Remover foto').click()
        expect(pg.locator('.usuario-botao img')).to_have_count(0)
        b.close()
finally:
    srv.terminate()
assert not erros, erros
print('OK foto')
