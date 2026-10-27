"""Modelo 2 (?demo2): CEO/Gestor/Corretor na imobiliária, níveis da CCA, fluxograma, conversa interna, mural, comissões,
perfil secundário do nível 1 e acesso opcional do cliente. O ?demo atual não muda."""
import os, sys, subprocess, time, re
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = '/tmp/claude-0/-home-claude-app-cca/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos'
os.makedirs(FOTOS, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8821', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
B = 'http://127.0.0.1:8821/index.html?demo2&volume'
erros = []
def sair(pg):
    pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email')
def entrar(pg, email):
    for tentativa in range(3):
        pg.goto(B + '#/entrar'); pg.wait_for_timeout(700)
        if pg.locator('#voltarPrincipal').count(): pg.click('#voltarPrincipal'); pg.wait_for_timeout(1500); continue
        if not pg.locator('#email').count(): sair(pg); pg.wait_for_timeout(500)
        pg.wait_for_selector('#email'); pg.wait_for_timeout(300)
        pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
        try: pg.wait_for_selector('.menu-botoes > a', timeout=8000); pg.wait_for_timeout(500); return
        except Exception: pass
    print('SEM MENU', email, pg.url, pg.locator('body').inner_text()[:300].replace('\n', ' | '))
def menu(pg): return [t.strip().split('\n')[0] for t in pg.locator('.menu-botoes > a').all_inner_texts() if t.strip() != 'Sair']
def ir(pg, hash): pg.evaluate(f"location.hash = '{hash}'"); pg.wait_for_timeout(1300)
def abrir_cliente(pg, nome=None):
    linhas = pg.locator('table tbody tr').filter(has_not_text='Rascunho')
    (linhas.filter(has_text=nome).first if nome else linhas.first).click(); pg.wait_for_timeout(1300)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(**({'executable_path': os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}))
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page(); pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(B); pg.wait_for_timeout(800)
        expect(pg.get_by_text('Modelo 2 (demonstração)', exact=False).first).to_be_visible()
        # CCA nível 1: grupos, abas, fluxograma, conversa interna, perfil secundário
        entrar(pg, 'equipe@demo'); print('CCA nível 1:', menu(pg))
        assert menu(pg) == ['Início', 'Processos', 'Parceiros', 'Resultados', 'Financeiro', 'Administração'], menu(pg)
        ir(pg, '#/painel/clientes'); abrir_cliente(pg)
        assert pg.locator('#fluxograma .fluxo-no').count() == 13
        ir(pg, '#/painel/imobiliarias'); abas = ' '.join(pg.locator('.abas-grupo a').all_inner_texts()); print('Parceiros:', abas); assert 'Perfil secundário' in abas
        ir(pg, '#/painel/vercomo'); expect(pg.get_by_role('heading', name='Perfil secundário')).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/m2_vercomo.png', full_page=True)
        pg.locator('[data-entrar="u-gestor"]').click(); pg.wait_for_timeout(2500)
        expect(pg.locator('.faixa-vercomo')).to_be_visible(); print('como gestor:', menu(pg))
        assert menu(pg) == ['Início', 'Clientes', 'Novo cliente', 'Avisos', 'Mais'], menu(pg)
        pg.screenshot(path=f'{FOTOS}/m2_vercomo_gestor.png', full_page=True)
        pg.click('#voltarPrincipal'); pg.wait_for_timeout(2500)
        assert menu(pg)[1] == 'Processos', menu(pg)
        # CCA nível 2: sem perfil secundário
        entrar(pg, 'suzana@demo'); ir(pg, '#/painel/imobiliarias')
        assert 'Perfil secundário' not in ' '.join(pg.locator('.abas-grupo a').all_inner_texts())
        # CEO: Gestão (convida gestor ou corretor), Comissões, Avisos
        entrar(pg, 'ceo@demo'); print('CEO:', menu(pg)); assert menu(pg) == ['Início', 'Gestão', 'Comissões', 'Clientes', 'Mais'], menu(pg)
        ir(pg, '#/gestao'); expect(pg.locator('#chaveAcessoCliente')).to_be_visible()
        pg.click('#gestConvidar'); expect(pg.locator('#gest-funcao')).to_be_visible()
        pg.select_option('#gest-funcao', 'gestor'); pg.fill('#gest-nome', 'Marina Lopes Souza'); pg.click('#gestGerar')
        expect(pg.get_by_text('Convite gerado. Mande pelo WhatsApp.')).to_be_visible()
        expect(pg.locator('.gest-equipe').get_by_text('Gestor', exact=False).first).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/m2_ceo_gestao.png', full_page=True)
        ir(pg, '#/comissoes'); expect(pg.get_by_role('heading', name='Comissões')).to_be_visible()
        n = pg.locator('.com-linha').count(); print('comissões a pagar:', n); assert n >= 1
        antes = pg.locator('.com-kpis .ini-kpi-valor').first.inner_text()
        pg.locator('.com-linha [data-comissao]').first.click(); pg.wait_for_timeout(900)
        print('a pagar:', antes, '->', pg.locator('.com-kpis .ini-kpi-valor').first.inner_text())
        pg.screenshot(path=f'{FOTOS}/m2_ceo_comissoes.png', full_page=True)
        ir(pg, '#/avisos'); pg.fill('#mural-campo', 'Reunião de equipe sexta às 9h.'); pg.click('#publicarAviso'); pg.wait_for_timeout(800)
        expect(pg.get_by_text('Reunião de equipe sexta às 9h.')).to_be_visible()
        # Gestor: sem Gestão; Sua vez com o que era do corretor; conversa interna
        entrar(pg, 'gestor@demo'); print('Gestor:', menu(pg)); assert menu(pg) == ['Início', 'Clientes', 'Novo cliente', 'Avisos', 'Mais'], menu(pg)
        expect(pg.get_by_role('heading', name='Sua vez')).to_be_visible(); expect(pg.get_by_role('heading', name='Avisos da equipe')).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/m2_gestor_inicio.png', full_page=True)
        ir(pg, '#/gestao'); assert '#/inicio' in pg.url
        ir(pg, '#/clientes'); abrir_cliente(pg)
        expect(pg.locator('#conversa-interna')).to_be_visible()
        pg.fill('#interna-campo', 'João, falta o holerite do comprador.'); pg.locator('#conversa-interna .conversa-enviar').click(); pg.wait_for_timeout(800)
        expect(pg.locator('#conversa-interna').get_by_text('falta o holerite')).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/m2_gestor_cliente.png', full_page=True)
        # Corretor: menus, CCA só leitura, conversa interna
        entrar(pg, 'corretor@demo'); print('Corretor:', menu(pg)); assert menu(pg) == ['Início', 'Meus clientes', 'Novo cliente', 'Mais'], menu(pg)
        ir(pg, '#/clientes'); abrir_cliente(pg)
        expect(pg.locator('#conversa-interna')).to_be_visible()
        expect(pg.locator('#conversa').get_by_text('Somente leitura')).to_be_visible()
        assert pg.locator('#conversa textarea').count() == 0
        expect(pg.locator('#fluxograma')).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/m2_corretor_cliente.png', full_page=True)
        link = None
        if pg.locator('#darAcessoCliente').count():
            pg.click('#darAcessoCliente'); pg.wait_for_timeout(800)
            link = re.search(r'(http\S+)', pg.locator('#acesso-cliente .gest-convite-texto').inner_text()).group(1)
        # Corretor independente: liga o acesso em Mais
        entrar(pg, 'pedro@demo'); ir(pg, '#/mais')
        assert pg.locator('#chaveAcessoCliente').get_attribute('aria-checked') == 'false'
        pg.click('#chaveAcessoCliente'); pg.wait_for_timeout(1000)
        assert pg.locator('#chaveAcessoCliente').get_attribute('aria-checked') == 'true'
        # Cliente final
        entrar(pg, 'cliente@demo'); assert menu(pg) == ['Meu financiamento'], menu(pg)
        expect(pg.locator('#fluxograma')).to_be_visible()
        ir(pg, '#/painel/clientes'); assert '#/meu' in pg.url
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_timeout(500)
        assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rolagem lateral no celular'
        pg.screenshot(path=f'{FOTOS}/m2_cliente_cel.png', full_page=True)
        pg.set_viewport_size({'width': 1440, 'height': 900})
        # CEO desliga: cliente não entra
        entrar(pg, 'ceo@demo'); ir(pg, '#/gestao'); pg.click('#chaveAcessoCliente'); pg.wait_for_timeout(1000)
        entrar(pg, 'cliente@demo'); expect(pg.get_by_text('O acompanhamento pelo portal está desligado', exact=False)).to_be_visible()
        entrar(pg, 'ceo@demo'); ir(pg, '#/gestao'); pg.click('#chaveAcessoCliente'); pg.wait_for_timeout(1000)
        if link:
            sair(pg); pg.goto(link); pg.wait_for_timeout(800)
            pg.fill('#cv-email', 'novocliente@teste.com')
            if not pg.locator('#cv-whats').input_value(): pg.fill('#cv-whats', '21977771111')
            pg.fill('#cv-senha', 'senha1234'); pg.fill('#cv-senha2', 'senha1234')
            pg.get_by_role('button', name='Criar meu acesso').click(); pg.wait_for_timeout(1800)
            print('cliente convidado:', menu(pg)); assert menu(pg) == ['Meu financiamento']
        # celular: gestor e CEO sem rolagem lateral
        pg.set_viewport_size({'width': 390, 'height': 844})
        entrar(pg, 'ceo@demo'); ir(pg, '#/comissoes'); assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rolagem lateral comissões'
        pg.screenshot(path=f'{FOTOS}/m2_comissoes_cel.png', full_page=True)
        pg.set_viewport_size({'width': 1440, 'height': 900})
        # o ?demo atual continua igual
        pg.goto('http://127.0.0.1:8821/index.html?demo#/entrar'); pg.wait_for_timeout(700)
        if not pg.locator('#email').count(): sair(pg)
        pg.fill('#email', 'equipe@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_timeout(1500)
        pg.wait_for_selector('.menu-botoes > a', timeout=12000)
        print('demo atual:', len(menu(pg)), 'itens'); assert len(menu(pg)) > 10
        b.close()
finally:
    srv.terminate()
print('ERROS', erros); assert not erros
print('OK')
