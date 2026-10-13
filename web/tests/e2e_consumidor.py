"""Consumidor final: convite, vídeo de identidade, conferência pela equipe, cadastro liberado (modo demonstração)."""
import os, sys, subprocess, time, tempfile, re
from playwright.sync_api import sync_playwright, expect

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
VID = os.path.join(SAIDA, 'video.mp4'); open(VID, 'wb').write(b'\x00\x00\x00\x18ftypmp42' + b'0' * 2000)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8796', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8796/index.html?demo'
erros = []

def entrar(pg, email, senha='demo'):
    pg.goto(URL); pg.fill('#email', email); pg.fill('#senha', senha); pg.click('button[type=submit]')
    try: pg.wait_for_selector('.painel', timeout=8000)
    except Exception: pg.screenshot(path=f'{SAIDA}/dbg.png'); print(pg.url, pg.inner_text('body')[:300]); raise
    pg.wait_for_timeout(900)

def IR(pg, h):
    pg.evaluate('h => { location.hash = h }', h); pg.wait_for_timeout(700)

def sair(pg):
    pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click()
    expect(pg.locator('#email')).to_be_visible()

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        pg = b.new_context(viewport={'width': 1280, 'height': 900}).new_page()
        pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
        # equipe gera o convite
        entrar(pg, 'equipe@demo')
        IR(pg, '#/painel/convites')
        pg.get_by_role('button', name='Consumidor final').click()
        pg.fill('#cvl-nome', 'Rafaela Souza'); pg.fill('#cvl-whats', '21988887777')
        pg.screenshot(path=f'{SAIDA}/1-convite-equipe.png', full_page=True)
        pg.get_by_role('button', name='Gerar convite').click()
        expect(pg.get_by_text('Convite gerado')).to_be_visible()
        expect(pg.locator('.zap-balao')).to_contain_text('convite?t=')
        link = pg.locator('.zap-balao').inner_text()
        token = re.search(r'#/convite\?t=([\w\-]+)', link).group(1)
        sair(pg)
        # consumidor abre o convite
        pg.evaluate('t => { location.hash = "#/convite?t=" + t }', token); pg.wait_for_timeout(900)
        expect(pg.get_by_text('Bem-vindo à Andrade Almeida CCA')).to_be_visible()
        pg.fill('#cv-nome', 'Rafaela Souza'); pg.fill('#cv-email', 'rafaela@teste.com'); pg.fill('#cv-senha', 'senhaforte1'); pg.fill('#cv-senha2', 'senhaforte1')
        pg.click('button[type=submit]')
        expect(pg.locator('#cv-cpf')).to_be_visible()
        assert pg.get_by_text('Digite o seu CPF').count() >= 1
        pg.fill('#cv-cpf', '52998224725')
        pg.screenshot(path=f'{SAIDA}/2-convite-cliente.png', full_page=True)
        pg.click('button[type=submit]')
        expect(pg.get_by_role('heading', name='Confirme a sua identidade')).to_be_visible()
        # não consegue pular a verificação
        IR(pg, '#/novo')
        expect(pg.get_by_role('heading', name='Confirme a sua identidade')).to_be_visible()
        assert pg.get_by_role('link', name='Engenharia').count() == 0
        pg.screenshot(path=f'{SAIDA}/3-verificacao.png', full_page=True)
        pg.set_input_files('#verif-arquivo', VID)
        expect(pg.get_by_role('button', name='Enviar vídeo para a CCA')).to_be_disabled()
        pg.check('#verif-aceite')
        expect(pg.get_by_role('button', name='Enviar vídeo para a CCA')).to_be_enabled()
        pg.screenshot(path=f'{SAIDA}/4-video-escolhido.png', full_page=True)
        pg.get_by_role('button', name='Enviar vídeo para a CCA').click()
        expect(pg.get_by_text('A CCA está conferindo')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/5-em-analise.png', full_page=True)
        IR(pg, '#/novo')
        expect(pg.get_by_role('heading', name='Confirme a sua identidade')).to_be_visible()
        sair(pg)
        # equipe recusa, depois aprova
        entrar(pg, 'equipe@demo')
        IR(pg, '#/painel/verificacoes')
        expect(pg.get_by_text('Rafaela Souza').first).to_be_visible()
        pg.get_by_role('button', name='Conferir vídeo').click()
        expect(pg.locator('#verif-detalhe .verif-video, #verif-detalhe .aviso').first).to_be_visible()
        pg.get_by_role('button', name='Recusar vídeo').click()
        expect(pg.get_by_text('Escreva o motivo da recusa.')).to_be_visible()
        pg.fill('#verif-motivo', 'Documento ilegível')
        pg.screenshot(path=f'{SAIDA}/6-equipe-conferindo.png', full_page=True)
        pg.get_by_role('button', name='Recusar vídeo').click()
        expect(pg.get_by_text('Recusada').first).to_be_visible()
        sair(pg)
        entrar(pg, 'rafaela@teste.com', 'senhaforte1')
        expect(pg.get_by_text('Documento ilegível')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/7-recusado.png', full_page=True)
        pg.set_input_files('#verif-arquivo', VID); pg.check('#verif-aceite')
        pg.get_by_role('button', name='Enviar vídeo para a CCA').click()
        expect(pg.get_by_text('A CCA está conferindo')).to_be_visible()
        sair(pg)
        entrar(pg, 'equipe@demo')
        IR(pg, '#/painel/verificacoes')
        pg.get_by_role('button', name='Conferir vídeo').click()
        pg.get_by_role('button', name='Confirmar identidade').click()
        expect(pg.get_by_text('Confirmada').first).to_be_visible()
        sair(pg)
        # liberado: vai direto ao cadastro
        entrar(pg, 'rafaela@teste.com', 'senhaforte1')
        pg.wait_for_timeout(800)
        assert '#/novo' in pg.url, pg.url
        assert pg.input_value('#c-nome') == 'Rafaela Souza' and pg.input_value('#c-cpf') == '529.982.247-25', (pg.input_value('#c-nome'), pg.input_value('#c-cpf'))
        pg.screenshot(path=f'{SAIDA}/8-cadastro-liberado.png', full_page=True)
        # celular
        pg.set_viewport_size({'width': 390, 'height': 800}); pg.wait_for_timeout(500)
        assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rolagem horizontal'
        pg.screenshot(path=f'{SAIDA}/9-celular.png', full_page=True)
        # link de aviso (?ir=) abre a tela certa
        pg.goto(URL + '&ir=verificacao'); pg.wait_for_timeout(600)
        assert '#/verificacao' in pg.url and 'ir=' not in pg.url, pg.url
        pg.goto(URL + '&ir=//evil.com'); pg.wait_for_timeout(400)
        assert 'evil' not in pg.url, pg.url
        b.close()
finally:
    srv.terminate()
assert not erros, erros
print('OK consumidor')
