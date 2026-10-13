"""Fase 3: salvamento automático do cadastro, busca rápida (Ctrl+K) e atalhos (modo demonstração)."""
import os, re, sys, subprocess, time, tempfile
from playwright.sync_api import sync_playwright, expect

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8791', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8791/index.html?demo'
erros = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        pg = b.new_context(viewport={'width': 1440, 'height': 900}).new_page()
        pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
        pg.on('console', lambda m: erros.append(f'console: {m.text}') if m.type == 'error' and 'fonts.googleapis' not in m.text and 'ERR_' not in m.text else None)
        pg.goto(URL); pg.fill('#email', 'corretor@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
        expect(pg.get_by_role('heading', name='Meus clientes')).to_be_visible()

        # Busca rápida: Ctrl+K, digitar, Enter abre o cliente
        pg.keyboard.press('Control+k')
        expect(pg.get_by_role('dialog', name='Busca rápida')).to_be_visible()
        pg.keyboard.type('mari')
        expect(pg.locator('.busca-item').first).to_contain_text('Mariana Costa')
        pg.keyboard.press('Enter')
        expect(pg.get_by_role('heading', name='Mariana Costa').first).to_be_visible()
        # "/" também abre; Esc fecha; telas aparecem na busca
        pg.keyboard.press('/')
        expect(pg.get_by_role('dialog', name='Busca rápida')).to_be_visible()
        pg.keyboard.type('novo')
        expect(pg.locator('.busca-item', has_text='Novo cliente')).to_be_visible()
        pg.keyboard.press('Escape')
        expect(pg.get_by_role('dialog', name='Busca rápida')).to_have_count(0)
        # Botão da barra
        pg.get_by_role('button', name=re.compile('Buscar cliente ou tela')).click()
        expect(pg.get_by_role('dialog', name='Busca rápida')).to_be_visible()
        pg.keyboard.press('Escape')

        # Salvamento automático do cadastro
        pg.goto(URL + '#/novo')
        pg.fill('#nome', 'Teste Autosave') if pg.locator('#nome').count() else pg.get_by_label('Nome completo').fill('Teste Autosave')
        pg.get_by_label('CPF').fill('52998224725')
        expect(pg.locator('.autosave')).to_contain_text('Salvo às', timeout=8000)
        n = pg.evaluate("JSON.parse(localStorage.getItem('appcca-demo-v5')).clientes.filter(c => c.nome === 'Teste Autosave').length")
        assert n == 1, f'esperava 1 rascunho salvo sozinho, achei {n}'
        pg.get_by_label('Nome completo').fill('Teste Autosave Dois')
        expect(pg.locator('.autosave')).to_contain_text('Salvo às', timeout=8000)
        n = pg.evaluate("JSON.parse(localStorage.getItem('appcca-demo-v5')).clientes.filter(c => c.nome.startsWith('Teste Autosave')).length")
        assert n == 1, f'segundo salvamento duplicou o cliente: {n}'
        pg.screenshot(path=os.path.join(SAIDA, 'f3-autosave.png'))

        # Equipe: a busca leva ao cliente no painel
        pg.goto(URL); 
        pg.get_by_role('link', name='Sair').click()
        pg.fill('#email', 'equipe@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
        expect(pg.get_by_role('heading', name='Clientes')).to_be_visible()
        pg.keyboard.press('Control+k'); pg.keyboard.type('carlos')
        expect(pg.locator('.busca-item').first).to_contain_text('Carlos')
        pg.keyboard.press('Enter')
        expect(pg.locator('.lateral', has_text='Carlos Menezes').first).to_be_visible()
        pg.keyboard.press('Control+k'); pg.keyboard.type('relat'); expect(pg.locator('.busca-item').first).to_contain_text('Relat'); pg.keyboard.press('Enter')
        expect(pg.get_by_role('heading', name='Relatórios')).to_be_visible()
        b.close()
finally:
    srv.terminate()
print('ERROS', erros)
assert not erros, erros
print('OK – fluidez: busca rápida e salvamento automático')
