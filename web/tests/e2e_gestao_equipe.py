"""Gestão, etapa 2: o gestor convida, desliga e reativa corretores da própria imobiliária."""
import os, sys, subprocess, time, re
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = '/tmp/claude-0/-home-claude-app-cca/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos'
os.makedirs(FOTOS, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8819', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
B = 'http://127.0.0.1:8819/index.html?demo&volume'
erros = []
def entrar(pg, email):
    pg.goto(B + '#/entrar'); pg.wait_for_timeout(500)
    if not pg.locator('#email').count():
        pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email')
    pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_timeout(1300)
def sair(pg):
    pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email')
try:
    with sync_playwright() as p:
        b = p.chromium.launch(**({'executable_path': os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}))
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page(); pg.on('pageerror', lambda e: erros.append(str(e)))
        entrar(pg, 'doc@demo')
        pg.goto(B + '#/gestao'); pg.wait_for_timeout(1200)
        expect(pg.get_by_role('heading', name='Equipe da imobiliária')).to_be_visible()
        antes = pg.locator('.gest-equipe .gest-membro').count(); print('equipe antes:', antes)
        # convida
        pg.click('#gestConvidar'); pg.fill('#gest-nome', 'Paulo Henrique Souza'); pg.fill('#gest-whats', '21977776666'); pg.click('#gestGerar')
        expect(pg.get_by_text('Convite gerado. Mande pelo WhatsApp.')).to_be_visible()
        txt = pg.locator('.gest-convite-texto').inner_text(); link = re.search(r'(http\S+)', txt).group(1)
        pg.screenshot(path=f'{FOTOS}/gestao_convite.png', full_page=True)
        assert pg.get_by_text('Convites aguardando').count() == 1
        sair(pg)
        pg.goto(link); pg.wait_for_timeout(700)
        expect(pg.locator('#cv-nome')).to_have_value('Paulo Henrique Souza')
        pg.fill('#cv-email', 'paulo@teste.com'); pg.fill('#cv-senha', 'senha1234'); pg.fill('#cv-senha2', 'senha1234')
        pg.get_by_role('button', name='Criar meu acesso').click(); pg.wait_for_timeout(1200)
        pg.evaluate("location.hash = '#/clientes'"); expect(pg.get_by_role('heading', name='Meus clientes')).to_be_visible()
        assert pg.get_by_role('link', name='Gestão').count() == 0
        # o corretor novo já está na imobiliária do gestor
        sair(pg); entrar(pg, 'doc@demo'); pg.goto(B + '#/gestao'); pg.wait_for_timeout(1200)
        assert pg.locator('.gest-equipe .gest-membro').count() == antes + 1, 'corretor novo não apareceu'
        expect(pg.locator('.gest-equipe').get_by_text('Paulo Henrique Souza')).to_be_visible()
        # desliga um corretor com clientes e passa os clientes
        alvo = pg.locator('.gest-equipe .gest-membro', has=pg.locator('[data-desligar]')).filter(has_text='clientes').first
        nome_alvo = alvo.locator('b').first.inner_text(); print('desligando:', nome_alvo)
        alvo.locator('[data-desligar]').click()
        pg.select_option('#gest-destino', index=1)
        pg.screenshot(path=f'{FOTOS}/gestao_desligar.png', full_page=True)
        pg.click('#gestConfirmarDesligar'); pg.wait_for_timeout(1200)
        linha = pg.locator('.gest-equipe .gest-membro', has_text=nome_alvo)
        expect(linha.get_by_text('Desligado')).to_be_visible()
        expect(linha.locator('[data-reativar]')).to_be_visible()
        # quem foi desligado não entra mais
        email_alvo = pg.evaluate("JSON.parse(localStorage.getItem('appcca-demo-v13')).usuarios.filter(u=>u.ativo===false).map(u=>u.email)")
        print('desligados:', email_alvo); assert email_alvo
        # reativa
        linha.locator('[data-reativar]').click(); pg.wait_for_timeout(900)
        expect(pg.locator('.gest-equipe .gest-membro', has_text=nome_alvo).get_by_text('Ativo')).to_be_visible()
        # celular
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(500)
        assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rolagem lateral'
        pg.locator('.gest-equipe').scroll_into_view_if_needed(); pg.screenshot(path=f'{FOTOS}/gestao_equipe_cel.png')
        # o gestor não consegue convidar imobiliária/equipe pela API
        r = pg.evaluate("""async () => { const m = await import('./js/api.js'); try { await m.api.gerarConvite({ tipo: 'equipe_cca' }); return 'permitiu'; } catch (e) { return e.message; } }""")
        print('equipe_cca:', r); assert 'não pode' in r.lower()
        b.close()
finally:
    srv.terminate()
print('ERROS', erros); assert not erros
print('OK')
