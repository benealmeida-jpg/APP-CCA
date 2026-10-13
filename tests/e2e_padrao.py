"""Portal do corretor no mesmo padrão do painel: largura toda no computador, Lista | Quadro, faixa de avisos e arrastar arquivo."""
import os, re, sys, subprocess, time, tempfile
from playwright.sync_api import sync_playwright, expect

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8771', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8771/index.html?demo'
erros = []

def foto(pg, nome):
    pg.screenshot(path=os.path.join(SAIDA, f'{nome}.png'), full_page=True)

def sem_rolagem_lateral(pg, onde):
    w = pg.evaluate('[document.documentElement.scrollWidth, window.innerWidth]')
    assert w[0] <= w[1] + 1, f'rolagem lateral em {onde}: {w}'

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
        pg.on('console', lambda m: erros.append(f'console: {m.text}') if m.type == 'error' and 'fonts.googleapis' not in m.text and 'ERR_' not in m.text else None)
        pg.goto(URL)
        pg.fill('#email', 'corretor@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
        expect(pg.get_by_role('heading', name='Meus clientes')).to_be_visible()
        # Mesmo menu e cabeçalho do painel, ocupando a largura toda
        expect(pg.locator('nav.painel-topo .menu-botoes a.ativo')).to_have_text('Meus clientes')
        expect(pg.locator('.pagina-cab.com-foto.foto-corretor')).to_be_visible()
        largura = pg.locator('.painel-corpo').bounding_box()['width']
        assert largura > 1300, f'conteúdo estreito no computador: {largura}'
        assert pg.locator('.nav-inferior').count() == 0
        # 1) Faixa de avisos some depois de ativar
        expect(pg.get_by_role('button', name='Ativar avisos neste computador')).to_be_visible()
        pg.get_by_role('button', name='Ativar avisos neste computador').click()
        expect(pg.locator('.faixa-avisos')).to_have_count(0)
        pg.reload()
        expect(pg.get_by_role('heading', name='Meus clientes')).to_be_visible()
        expect(pg.locator('.faixa-avisos')).to_have_count(0)
        # 2) Lista | Quadro também no portal do corretor
        expect(pg.locator('table.tabela tbody tr')).to_have_count(2)
        pg.get_by_role('button', name='Quadro', exact=True).click()
        expect(pg.locator('.quadro-coluna').first).to_be_visible()
        expect(pg.locator('.quadro-cartao', has_text='Mariana Costa')).to_be_visible()
        foto(pg, 'p1-quadro')
        pg.locator('.quadro-cartao', has_text='Mariana Costa').click()
        expect(pg.get_by_role('heading', name='Mariana Costa')).to_be_visible()
        expect(pg.locator('.painel-cliente', has_text='Conversa com a CCA')).to_be_visible()
        expect(pg.locator('table.tabela tr.selecionado, .quadro-cartao.selecionado')).to_have_count(1)
        expect(pg.locator('.pagina-cab.foto-corretor')).to_be_visible()
        expect(pg.locator('nav.painel-topo .menu-botoes a.ativo')).to_have_text('Meus clientes')
        foto(pg, 'p2-ficha')
        # Documentos: arrastar o arquivo até o documento envia
        pg.get_by_role('link', name='Ver, anexar e substituir documentos').click()
        expect(pg.get_by_role('heading', name=re.compile('Documentos'))).to_be_visible()
        doc = pg.locator('.doc', has_text='Certidão de estado civil').first
        expect(doc).to_be_visible()
        dt = pg.evaluate_handle("""() => { const d = new DataTransfer(); d.items.add(new File([new Uint8Array([137,80,78,71])], 'certidao.png', { type: 'image/png' })); return d; }""")
        doc.dispatch_event('dragover', {'dataTransfer': dt})
        doc.dispatch_event('drop', {'dataTransfer': dt})
        expect(pg.locator('.doc', has_text='Certidão de estado civil').first.get_by_text('Em conferência')).to_be_visible()
        foto(pg, 'p3-docs')
        pg.get_by_role('link', name='Novo cliente').first.click()
        expect(pg.locator('.cadastro .conteudo')).to_be_visible()
        foto(pg, 'p4-cadastro')

        # Celular: mesmo padrão, sem rolagem para o lado
        pg.set_viewport_size({'width': 390, 'height': 844})
        for rota, nome in [('#/clientes', 'lista'), ('#/novo', 'cadastro')]:
            pg.goto(URL + rota); pg.wait_for_timeout(700)
            sem_rolagem_lateral(pg, nome)
            foto(pg, f'p5-cel-{nome}')
        mariana = pg.evaluate("JSON.parse(localStorage.getItem('appcca-demo-v5')).clientes.find(c => c.nome === 'Mariana Costa').id")
        for rota, nome in [(f'#/cliente/{mariana}', 'ficha'), (f'#/cliente/{mariana}/documentos', 'docs')]:
            pg.goto(URL + rota); pg.wait_for_timeout(800)
            sem_rolagem_lateral(pg, nome)
            foto(pg, f'p5-cel-{nome}')
        b.close()
finally:
    srv.terminate()

print('ERROS', erros)
assert not erros, erros
print('OK – portal no padrão do painel')
