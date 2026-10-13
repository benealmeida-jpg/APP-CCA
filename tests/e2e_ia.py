"""Pré-conferência de documentos por IA (modo demonstração: resultado simulado)."""
import os, re, sys, subprocess, time, tempfile
from playwright.sync_api import sync_playwright, expect

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8769', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8769/index.html?demo'
erros = []

def foto(pg, nome):
    pg.screenshot(path=os.path.join(SAIDA, f'{nome}.png'), full_page=True)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
        pg.on('console', lambda m: erros.append(f'console: {m.text}') if m.type == 'error' and 'fonts.googleapis' not in m.text and 'ERR_' not in m.text else None)

        # Corretor troca o comprovante por uma foto cortada: a conferência automática avisa na hora
        pg.goto(URL)
        pg.fill('#email', 'corretor@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
        expect(pg.get_by_role('heading', name='Meus clientes')).to_be_visible()
        mariana = pg.evaluate("JSON.parse(localStorage.getItem('appcca-demo-v5')).clientes.find(c => c.nome === 'Mariana Costa').id")
        pg.goto(f'{URL}#/cliente/{mariana}/documentos')
        doc = pg.locator('.doc', has_text='Comprovante de residência').first
        expect(doc).to_be_visible()
        arq = os.path.join(SAIDA, 'conta-cortada.png')
        open(arq, 'wb').write(open(os.path.join(RAIZ, 'icons/icone-192.png'), 'rb').read())
        with pg.expect_file_chooser() as fc:
            doc.get_by_role('button', name='Substituir').click()
        fc.value.set_files(arq)
        doc = pg.locator('.doc', has_text='Comprovante de residência').first
        expect(doc.locator('.nota-ia.problema')).to_contain_text('Conferência automática')
        doc.scroll_into_view_if_needed()
        foto(pg, 'ia1-corretor')
        # Documento bom: "parece certo"
        doc2 = pg.locator('.doc', has_text='Certidão de estado civil').first
        if doc2.count():
            ok = os.path.join(SAIDA, 'certidao.png')
            open(ok, 'wb').write(open(os.path.join(RAIZ, 'icons/icone-192.png'), 'rb').read())
            with pg.expect_file_chooser() as fc:
                doc2.get_by_role('button', name=re.compile('Anexar|Substituir')).click()
            fc.value.set_files(ok)
            expect(pg.locator('.doc', has_text='Certidão de estado civil').first.locator('.nota-ia.ok')).to_be_visible()
        pg.goto(f'{URL}#/clientes')
        expect(pg.get_by_role('heading', name='Meus clientes')).to_be_visible()
        pg.get_by_role('button', name='Sair').first.click()
        expect(pg.locator('#email')).to_be_visible()

        # Equipe: sugestão da IA na conferência, motivo já marcado
        pg.set_viewport_size({'width': 1366, 'height': 900})
        pg.fill('#email', 'equipe@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
        expect(pg.get_by_role('heading', name='Clientes')).to_be_visible()
        pg.click('.menu-botoes a:has-text("Docs a conferir")')
        cartao = pg.locator('.cartao', has=pg.locator('.nota-ia.problema')).first
        expect(cartao).to_contain_text('IA · Possível problema')
        expect(cartao.get_by_role('button', name='Documento cortado')).to_have_attribute('aria-pressed', 'true')
        expect(pg.locator('.nota-ia.atencao', has_text='parece vencida')).to_be_visible()
        foto(pg, 'ia2-equipe')

        # Configurações: chave, teste e uso do mês
        pg.click('.menu-botoes a:has-text("Configurações")')
        expect(pg.get_by_role('heading', name='Pré-conferência de documentos por IA')).to_be_visible()
        pg.fill('#ia-chave', 'chave-errada')
        pg.locator('#ia-chave').locator('xpath=..').get_by_role('button', name='Salvar').click()
        expect(pg.get_by_text('A chave da Anthropic começa com "sk-ant-"', exact=False)).to_be_visible()
        pg.fill('#ia-chave', 'sk-ant-api03-teste-1234')
        pg.locator('#ia-chave').locator('xpath=..').get_by_role('button', name='Salvar').click()
        expect(pg.get_by_text('Chave guardada.')).to_be_visible()
        expect(pg.locator('#ia-chave')).to_have_attribute('placeholder', 'Configurada (…1234)')
        pg.get_by_role('button', name='Testar a chave').click()
        expect(pg.get_by_text('Tudo certo.')).to_be_visible()
        expect(pg.locator('.kpi', has_text='documentos analisados')).not_to_contain_text(re.compile(r'^0'))
        pg.locator('#ia-chave').scroll_into_view_if_needed()
        foto(pg, 'ia3-config')
        b.close()
finally:
    srv.terminate()

print('ERROS', erros)
assert not erros, erros
print('OK – pré-conferência por IA')
