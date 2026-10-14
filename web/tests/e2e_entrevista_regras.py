"""Agenda com agência/gerente/endereço, botões de envio ao cliente e escolha dos asteriscos nas Configurações."""
import os, sys, subprocess, time, re
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = '/tmp/claude-0/-home-claude-app-cca/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos'
os.makedirs(FOTOS, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8812', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
erros = []
def entrar(b, email, w=1440):
    pg = b.new_context(viewport={'width': w, 'height': 900}).new_page()
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto('http://127.0.0.1:8812/index.html?demo&volume'); pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
    pg.wait_for_selector('.ini-grade, .meus-clientes, .cartao-cliente, nav'); pg.wait_for_timeout(700); return pg
def ir(pg, h):
    pg.evaluate('(h) => { location.hash = h }', h); pg.wait_for_timeout(900)
def sem_rolagem(pg, onde):
    assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), f'rolagem lateral: {onde}'
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        for w in (1440, 390):
            pg = entrar(b, 'equipe@demo', w)
            ir(pg, '#/painel/agenda')
            expect(pg.get_by_text('Agência Centro Niterói').first).to_be_visible()
            expect(pg.get_by_text('Gerente: Marcelo Tavares').first).to_be_visible()
            expect(pg.get_by_text('Av. Amaral Peixoto, 100, Centro, Niterói').first).to_be_visible()
            sem_rolagem(pg, f'agenda {w}')
            pg.screenshot(path=f'{FOTOS}/agenda_{w}.png', full_page=True)
        # Cliente na visão do ADM: edita agência e vê os botões
        pg = entrar(b, 'equipe@demo')
        ir(pg, '#/painel/agenda')
        nome = pg.locator('tbody tr td b').nth(1).inner_text()
        print('cliente com entrevista:', nome)
        ir(pg, '#/painel/clientes')
        pg.get_by_text(nome, exact=True).first.click()
        pg.wait_for_selector('#secao-entrevista')
        pg.fill('#entrevista-agencia', 'Agência Teste 123'); pg.fill('#entrevista-gerente', 'Gerente Teste'); pg.fill('#entrevista-endereco', 'Rua Teste, 1')
        pg.get_by_role('button', name='Alterar entrevista').click()
        pg.wait_for_timeout(600)
        ir(pg, '#/painel/agenda')
        expect(pg.get_by_text('Agência Teste 123').first).to_be_visible()
        # Resultado: a etapa Entrevista aparece na barra; aprovar leva a Conformidade
        pg.get_by_role('link', name='Clientes').first.click(); pg.wait_for_timeout(700)
        pg.get_by_text(nome, exact=True).first.click(); pg.wait_for_selector('#secao-entrevista')
        expect(pg.locator('.faixa-progresso-txt b').first).to_have_text('Entrevista')
        expect(pg.locator('#entrevista-resultado')).to_contain_text('Aguardando o resultado')
        pg.screenshot(path=f'{FOTOS}/entrevista_etapa_adm.png', full_page=True)
        pg.click('#entrevista-aprovada'); pg.wait_for_timeout(900)
        expect(pg.locator('.faixa-progresso-txt b').first).to_have_text('Conformidade')
        expect(pg.locator('#entrevista-resultado')).to_contain_text('Entrevista aprovada')
        # outro cliente: reprovada encerra o processo
        ir(pg, '#/painel/agenda')
        nomes = [pg.locator('tbody tr').nth(k).locator('td').nth(1).inner_text() for k in range(pg.locator('tbody tr').count())]
        nome2 = next(x for x in nomes if x != nome); print('reprovar:', nome2)
        ir(pg, '#/painel/clientes'); pg.get_by_text(nome2, exact=True).first.click(); pg.wait_for_selector('#entrevista-reprovada', timeout=5000)
        pg.click('#entrevista-reprovada'); pg.get_by_role('button', name='Sim').click(); pg.wait_for_timeout(900)
        expect(pg.locator('.faixa-progresso-txt b').first).to_have_text('Entrevista reprovada')
        expect(pg.locator('.faixa-progresso.reprovado')).to_be_visible()
        expect(pg.locator('#entrevista-resultado')).to_contain_text('processo encerrado')
        pg.screenshot(path=f'{FOTOS}/entrevista_reprovada_adm.png', full_page=True)
        # Configurações: asteriscos
        ir(pg, '#/painel/config')
        linha = pg.locator('tr', has_text='Último comprovante de residência').first
        expect(linha.get_by_role('button', name='Dois asteriscos', exact=True)).to_have_attribute('aria-pressed', 'true')
        linha.get_by_role('button', name='Um asterisco', exact=True).click(); pg.wait_for_timeout(500)
        linha = pg.locator('tr', has_text='Último comprovante de residência').first
        expect(linha.get_by_role('button', name='Um asterisco', exact=True)).to_have_attribute('aria-pressed', 'true')
        expect(linha.get_by_role('button', name='Dois asteriscos', exact=True)).to_have_attribute('aria-pressed', 'false')
        linha.get_by_role('button', name='Nenhum asterisco', exact=True).click(); pg.wait_for_timeout(500)
        expect(pg.locator('tr', has_text='Último comprovante de residência').first.get_by_role('button', name='Nenhum asterisco', exact=True)).to_have_attribute('aria-pressed', 'true')
        pg.screenshot(path=f'{FOTOS}/config_asteriscos.png')
        pm = entrar(b, 'equipe@demo', 390); ir(pm, '#/painel/config'); pm.locator('tr', has_text='Último comprovante de residência').first.scroll_into_view_if_needed(); sem_rolagem(pm, 'config 390'); pm.screenshot(path=f'{FOTOS}/config_asteriscos_390.png')
        # recarregando, a escolha continua
        pg.reload(); pg.wait_for_timeout(800)
        ir(pg, '#/painel/config')
        expect(pg.locator('tr', has_text='Último comprovante de residência').first.get_by_role('button', name='Nenhum asterisco', exact=True)).to_have_attribute('aria-pressed', 'true')
        # volta ao original
        pg.locator('tr', has_text='Último comprovante de residência').first.get_by_role('button', name='Dois asteriscos', exact=True).click(); pg.wait_for_timeout(400)
        # Corretor: vê a faixa com os botões
        achou = False
        for email in ('corretor@demo', 'ana@demo', 'pedro@demo', 'doc@demo'):
            pc = entrar(b, email, 390)
            pc.get_by_role('link', name='Meus clientes').first.click(); pc.wait_for_timeout(900)
            if pc.get_by_text(nome, exact=True).count():
                pc.get_by_text(nome, exact=True).first.click(); pc.wait_for_selector('.entrevista-faixa')
                achou = True
                expect(pc.locator('#entrevista-whats')).to_be_visible(); print('email?', pc.locator('#entrevista-email').count(), pc.locator('.entrevista-enviar').inner_text().replace('\n',' | '))
                href = pc.locator('#entrevista-whats').get_attribute('href'); print('whats:', href[:80])
                assert href.startswith('https://wa.me/'), href
                texto = __import__('urllib.parse').parse.unquote(href.split('text=')[1]); assert 'Agência Centro Niterói' in texto and 'Marcelo Tavares' in texto and 'Av. Amaral Peixoto' in texto, texto
                assert re.match(r'https://wa.me/55\d{10,11}\?text=', href), href
                expect(pc.locator('#entrevista-email')).to_be_visible(); assert pc.locator('#entrevista-email').get_attribute('href').startswith('mailto:')
                sem_rolagem(pc, 'cartao corretor 390'); pc.screenshot(path=f'{FOTOS}/entrevista_corretor_390.png', full_page=True)
                break
        assert achou, 'nenhum corretor viu o cliente'
    assert not erros, erros
    print('OK')
finally:
    srv.terminate()
