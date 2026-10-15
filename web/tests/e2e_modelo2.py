"""Modelo 2 (?demo2): caminhos por perfil, fluxograma das etapas e acesso opcional do cliente. O ?demo atual não muda."""
import os, sys, subprocess, time, re
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = '/tmp/claude-0/-home-claude-app-cca/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos'
os.makedirs(FOTOS, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8821', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
B = 'http://127.0.0.1:8821/index.html?demo2&volume'
erros = []
def entrar(pg, email):
    pg.goto(B + '#/entrar'); pg.wait_for_timeout(600)
    if not pg.locator('#email').count():
        pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email')
    pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_timeout(1200)
    try: pg.wait_for_selector('.menu-botoes > a', timeout=12000); pg.wait_for_timeout(400)
    except Exception: pass
def menu(pg): return [t.strip().split('\n')[0] for t in pg.locator('.menu-botoes > a').all_inner_texts() if t.strip() != 'Sair']
def ir(pg, hash): pg.evaluate(f"location.hash = '{hash}'"); pg.wait_for_timeout(1300)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page(); pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(B); pg.wait_for_timeout(800)
        expect(pg.get_by_text('Modelo 2 (demonstração)', exact=False).first).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/m2_login.png')
        # CCA: 5 grupos e abas
        entrar(pg, 'equipe@demo'); print('CCA:', menu(pg))
        assert menu(pg) == ['Início', 'Processos', 'Parceiros', 'Resultados', 'Administração'], menu(pg)
        expect(pg.get_by_role('heading', name='Sua vez')).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/m2_cca_inicio.png', full_page=True)
        ir(pg, '#/painel/clientes')
        abas = pg.locator('.abas-grupo a').all_inner_texts(); print('abas Processos:', abas); assert len(abas) >= 5
        pg.locator('table tbody tr').first.click(); pg.wait_for_timeout(1200)
        expect(pg.locator('#fluxograma')).to_be_visible()
        print('etapas no fluxo:', pg.locator('#fluxograma .fluxo-no').count()); assert pg.locator('#fluxograma .fluxo-no').count() == 12
        pg.screenshot(path=f'{FOTOS}/m2_cca_cliente.png', full_page=True)
        ir(pg, '#/painel/imobiliarias'); assert 'Corretores' in ' '.join(pg.locator('.abas-grupo a').all_inner_texts())
        # Gestor: Gestão + chave do acesso dos clientes
        entrar(pg, 'doc@demo'); print('Gestor:', menu(pg)); assert menu(pg) == ['Início', 'Gestão', 'Clientes', 'Novo cliente', 'Mais'], menu(pg)
        ir(pg, '#/gestao'); expect(pg.locator('#chaveAcessoCliente')).to_be_visible()
        assert pg.locator('#chaveAcessoCliente').get_attribute('aria-checked') == 'true'
        pg.screenshot(path=f'{FOTOS}/m2_gestor_gestao.png', full_page=True)
        # Documentação: sem Gestão
        entrar(pg, 'documentacao@demo'); print('Documentação:', menu(pg)); assert menu(pg) == ['Início', 'Clientes', 'Novo cliente', 'Mais'], menu(pg)
        ir(pg, '#/gestao'); assert '#/inicio' in pg.url, pg.url
        # Corretor da imobiliária: cliente com fluxograma e convite ao cliente
        entrar(pg, 'corretor@demo'); print('Corretor:', menu(pg)); assert menu(pg) == ['Início', 'Meus clientes', 'Novo cliente', 'Mais'], menu(pg)
        expect(pg.get_by_role('heading', name='Sua vez')).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/m2_corretor_inicio.png', full_page=True)
        ir(pg, '#/clientes'); pg.locator('table tbody tr').filter(has_not_text='Rascunho').first.click(); pg.wait_for_timeout(1300)
        expect(pg.locator('#fluxograma')).to_be_visible(); expect(pg.locator('#acesso-cliente')).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/m2_corretor_cliente.png', full_page=True)
        link = None
        if pg.locator('#darAcessoCliente').count():
            pg.click('#darAcessoCliente'); pg.wait_for_timeout(800)
            link = re.search(r'(http\S+)', pg.locator('#acesso-cliente .gest-convite-texto').inner_text()).group(1); print('convite cliente ok')
        # Corretor independente: liga o próprio acesso em Mais
        entrar(pg, 'pedro@demo'); ir(pg, '#/mais')
        expect(pg.locator('#chaveAcessoCliente')).to_be_visible(); assert pg.locator('#chaveAcessoCliente').get_attribute('aria-checked') == 'false'
        pg.click('#chaveAcessoCliente'); pg.wait_for_timeout(1000)
        assert pg.locator('#chaveAcessoCliente').get_attribute('aria-checked') == 'true'
        pg.screenshot(path=f'{FOTOS}/m2_independente_mais.png', full_page=True)
        # Cliente final: só Meu financiamento
        entrar(pg, 'cliente@demo'); print('Cliente:', menu(pg)); assert menu(pg) == ['Meu financiamento'], menu(pg)
        expect(pg.locator('#fluxograma')).to_be_visible()
        ir(pg, '#/painel/clientes'); assert '#/meu' in pg.url, pg.url
        pg.screenshot(path=f'{FOTOS}/m2_cliente.png', full_page=True)
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(500)
        assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rolagem lateral no celular'
        pg.screenshot(path=f'{FOTOS}/m2_cliente_cel.png', full_page=True)
        pg.set_viewport_size({'width': 1440, 'height': 900})
        # gestor desliga: cliente não entra mais
        entrar(pg, 'doc@demo'); ir(pg, '#/gestao'); pg.click('#chaveAcessoCliente'); pg.wait_for_timeout(1000)
        entrar(pg, 'cliente@demo'); expect(pg.get_by_text('O acompanhamento pelo portal está desligado', exact=False)).to_be_visible()
        # convite novo de cliente aceito (liga de novo antes)
        entrar(pg, 'doc@demo'); ir(pg, '#/gestao'); pg.click('#chaveAcessoCliente'); pg.wait_for_timeout(1000)
        if link:
            pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email')
            pg.goto(link); pg.wait_for_timeout(800)
            pg.fill('#cv-email', 'novocliente@teste.com'); pg.fill('#cv-whats', '21977771111') if pg.locator('#cv-whats').count() else None
            pg.fill('#cv-senha', 'senha1234'); pg.fill('#cv-senha2', 'senha1234')
            pg.get_by_role('button', name='Criar meu acesso').click(); pg.wait_for_timeout(1500)
            print('após convite:', pg.url, menu(pg)); assert menu(pg) == ['Meu financiamento']
        # o ?demo atual continua igual
        pg.goto('http://127.0.0.1:8821/index.html?demo#/entrar'); pg.wait_for_timeout(700)
        if not pg.locator('#email').count():
            pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email')
        pg.fill('#email', 'equipe@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_timeout(1500)
        print('demo atual:', len(menu(pg)), 'itens'); assert len(menu(pg)) > 10
        b.close()
finally:
    srv.terminate()
print('ERROS', erros); assert not erros
print('OK')
