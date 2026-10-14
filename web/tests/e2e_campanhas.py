"""Campanhas e metas por mês: Início (ADM e corretor), página do painel, criar, apurar, entregar, metas."""
import os, sys, subprocess, time, re
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = '/tmp/claude-0/-home-claude-app-cca/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8811', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
erros = []
def entrar(b, email, w=1440):
    pg = b.new_context(viewport={'width': w, 'height': 900}).new_page()
    pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto('http://127.0.0.1:8811/index.html?demo&volume'); pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
    pg.wait_for_selector('.ini-grade'); return pg
def sem_rolagem(pg, onde):
    assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), f'rolagem lateral: {onde}'
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        for w in (1440, 390):
            # ADM: bloco no Início
            pg = entrar(b, 'equipe@demo', w)
            expect(pg.get_by_role('heading', name='Campanha Vacaria do Sul').first).to_be_visible()
            expect(pg.locator('.camp-cat')).to_have_count(2)
            assert pg.locator('.camp-linha').count() >= 2, 'placar vazio'
            sem_rolagem(pg, f'inicio adm {w}')
            pg.screenshot(path=f'{FOTOS}/camp_inicio_adm_{w}.png', full_page=True)
            # corretor: vê a própria posição
            pc = entrar(b, 'corretor@demo', w)
            expect(pc.get_by_role('heading', name='Campanha Vacaria do Sul').first).to_be_visible()
            sem_rolagem(pc, f'inicio corretor {w}')
            pc.screenshot(path=f'{FOTOS}/camp_inicio_corretor_{w}.png', full_page=True)
            if w != 1440: continue
            # Página do painel
            pg.get_by_role('link', name='Campanhas').first.click()
            expect(pg.get_by_role('heading', name='Campanha Vacaria do Sul').first).to_be_visible()
            pg.screenshot(path=f'{FOTOS}/camp_lista_{w}.png', full_page=True)
            # Criar nova campanha
            pg.get_by_role('button', name='Nova campanha').click()
            pg.fill('#cn', 'Campanha de Natal')
            pg.fill('#pd-0', '1 jantar para duas pessoas'); pg.fill('#pd-1', '1 almoço para duas pessoas')
            pg.screenshot(path=f'{FOTOS}/camp_form_{w}.png', full_page=True)
            pg.get_by_role('button', name='Salvar campanha').click()
            expect(pg.get_by_role('heading', name='Campanha de Natal').first).to_be_visible()
            # Abrir a primeira, apurar e entregar
            pg.get_by_role('button', name='Ver placar completo').first.click()
            expect(pg.get_by_role('heading', name='Premiação')).to_be_visible()
            pg.get_by_role('button', name=re.compile('Apurar')).click()
            expect(pg.get_by_text('Vencedor:').first).to_be_visible()
            pg.get_by_role('button', name='Marcar como entregue').first.click()
            expect(pg.get_by_text('Entregue em').first).to_be_visible()
            pg.screenshot(path=f'{FOTOS}/camp_detalhe_{w}.png', full_page=True)
            # Metas por mês
            pg.get_by_role('button', name='Todas as campanhas').click()
            pg.get_by_role('button', name='Metas por mês').click()
            pg.fill('#mm-assinados', '12'); pg.get_by_role('button', name=re.compile('Salvar metas')).click()
            pg.get_by_role('button', name='Metas por mês').click()
            assert pg.input_value('#mm-assinados') == '12'
            pg.screenshot(path=f'{FOTOS}/camp_metas_{w}.png', full_page=True)
            pg.get_by_role('link', name='Início').first.click(); pg.wait_for_selector('.ini-grade')
            expect(pg.get_by_text('de 12', exact=False).first).to_be_visible()
        b.close()
finally:
    srv.terminate()
assert not erros, erros
print('OK campanhas')
