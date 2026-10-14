"""Fase 5: menu do usuário, atalhos (? e G+letra), cliente ao lado no tablet (modo demonstração)."""
import os, sys, subprocess, time, tempfile
from playwright.sync_api import sync_playwright, expect

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8792', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8792/index.html?demo'
erros = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        pg = b.new_context(viewport={'width': 1024, 'height': 768}).new_page()
        pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
        pg.goto(URL); pg.fill('#email', 'corretor@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
        pg.wait_for_timeout(900); pg.evaluate("location.hash = '#/clientes'"); expect(pg.get_by_role('heading', name='Meus clientes')).to_be_visible()
        # tablet: abrir cliente mostra a lista e o painel lado a lado
        pg.locator('.tabela tbody tr[tabindex]').first.click()
        expect(pg.locator('.painel-cliente')).to_be_visible()
        a = pg.locator('.painel-colunas > .principal').bounding_box(); c = pg.locator('.painel-cliente').bounding_box()
        assert c['x'] > a['x'] + 200 and abs(c['y'] - a['y']) < 200, (a, c)
        pg.screenshot(path=f'{SAIDA}/tablet.png')
        # menu do usuário
        pg.click('.usuario-botao')
        expect(pg.get_by_role('menuitem', name='Sair')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/menu.png')
        pg.keyboard.press('Escape')
        expect(pg.get_by_role('menuitem', name='Sair')).to_be_hidden()
        # atalhos
        pg.keyboard.press('Shift+?')
        expect(pg.get_by_role('dialog', name='Atalhos de teclado')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/atalhos.png')
        pg.keyboard.press('Escape')
        pg.keyboard.press('g'); pg.keyboard.press('n')
        expect(pg).to_have_url(__import__('re').compile(r'#/novo'))
        pg.keyboard.press('g'); pg.keyboard.press('c')
        expect(pg).to_have_url(__import__('re').compile(r'#/clientes$'))

        # conversa: atalho M foca o campo; faixa com ícones por etapa
        pg.locator('.tabela tbody tr').first.click(); expect(pg.locator('.painel-cliente')).to_be_visible()
        pg.keyboard.press('m')
        assert pg.evaluate("document.activeElement.tagName") == 'TEXTAREA'
        assert pg.locator('.faixa-progresso-barra span svg').count() == 12
        pg.evaluate("document.activeElement.blur()")
        # cliente já enviado: salva sozinho ao editar
        pg.goto(URL + '#/clientes'); pg.wait_for_timeout(900); pg.evaluate("location.hash = '#/clientes'"); expect(pg.get_by_role('heading', name='Meus clientes')).to_be_visible()
        pg.locator('.tabela tbody tr').first.click(); expect(pg.locator('.painel-cliente')).to_be_visible()
        pg.get_by_role('link', name='Editar cadastro').first.click()
        campo = pg.locator('input[type=text], input[type=tel], input[type=email]').first
        expect(pg.locator('.autosave')).to_contain_text('Salva sozinho')
        pg.locator('input[type=email]').first.fill('novo.email@exemplo.com') if pg.locator('input[type=email]').count() else campo.fill(campo.input_value() + ' ')
        expect(pg.locator('.autosave')).to_contain_text('Salvo às', timeout=8000)
        # documentos do corretor: N abre a prévia do próximo documento; PDF vira blob
        pg.goto(URL + '#/clientes'); pg.locator('.tabela tbody tr').first.click(); expect(pg.locator('.painel-cliente')).to_be_visible()
        pg.goto(URL + '#/cliente/' + pg.evaluate("location.hash").split('/')[2] + '/documentos')
        pg.set_viewport_size({'width': 1440, 'height': 900})
        pg.reload(); time.sleep(1)
        pg.keyboard.press('n'); time.sleep(1)
        assert pg.locator('.previa-pdf, .previa-img').count() == 1
        if pg.locator('.previa-pdf').count():
            src = pg.locator('.previa-pdf').get_attribute('src'); assert src.startswith('blob:'), src
            assert pg.evaluate("(u)=>fetch(u).then(r=>r.blob()).then(b=>b.type)", src) in ('application/pdf', 'image/svg+xml')  # no demo o arquivo de exemplo é SVG e não pode ser reclassificado como PDF
        # equipe: ícone colorido na conferência, N marca o cartão e A aceita (com desfazer)
        pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); time.sleep(0.8)
        pg.fill('#email', 'equipe@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
        expect(pg.get_by_role('heading', name='Clientes').first).to_be_visible(); pg.get_by_role('link', name='Docs a conferir').first.click(); expect(pg.get_by_role('heading', name='Documentos a conferir')).to_be_visible()
        expect(pg.locator('.cartao .doc-icone[class*="t-"]').first).to_be_visible(timeout=8000)
        pg.keyboard.press('n'); expect(pg.locator('.cartao.foco-doc')).to_have_count(1)
        pg.keyboard.press('a'); expect(pg.locator('.toast-desfazer')).to_be_visible()

        # regra das telas de cadastro: a lista fica no lugar; Editar e "Cadastrar novo" abrem o formulário embaixo dela
        pg.get_by_role('link', name='Imobiliárias').click()
        expect(pg.get_by_text('Imobiliárias cadastradas')).to_be_visible()
        expect(pg.get_by_text('Cadastro manual')).to_have_count(0)
        expect(pg.get_by_role('button', name='Cadastrar nova imobiliária')).to_be_visible()
        expect(pg.get_by_text('Dados da nova imobiliária')).to_have_count(0)
        expect(pg.get_by_text('Marcos Lima', exact=True)).to_be_visible(); expect(pg.get_by_text('CRECI 12345-J')).to_be_visible()
        pg.get_by_role('button', name='Editar', exact=False).first.click()
        expect(pg.get_by_text('Imobiliárias cadastradas')).to_be_visible()
        expect(pg.get_by_text('Editar: ', exact=False).first).to_be_visible()
        expect(pg.get_by_role('button', name='Cadastrar nova imobiliária')).to_have_count(0)
        pg.screenshot(path=f'{SAIDA}/edicao_imob.png', full_page=True)
        pg.get_by_role('button', name='Cancelar').click()
        pg.get_by_role('button', name='Cadastrar nova imobiliária').click()
        expect(pg.get_by_text('Dados da nova imobiliária')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/nova_imob.png', full_page=True)
        pg.get_by_role('button', name='Cancelar').click()
        expect(pg.get_by_role('button', name='Cadastrar nova imobiliária')).to_be_visible()
        pg.get_by_role('link', name='Corretores').click(); expect(pg.get_by_role('heading', name='Corretores', exact=True)).to_be_visible(); expect(pg.get_by_text('Corretores cadastrados')).to_be_visible()
        expect(pg.get_by_role('button', name='Cadastrar novo corretor')).to_be_visible()
        expect(pg.get_by_text('Conhecido como Joãozinho')).to_be_visible(); expect(pg.get_by_text('CRECI 67890-F')).to_be_visible()
        pg.get_by_role('button', name='Editar', exact=False).first.click()
        expect(pg.get_by_text('Corretores cadastrados')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/edicao_corretor.png', full_page=True)
        pg.get_by_role('button', name='Cancelar').click()
        pg.get_by_role('button', name='Cadastrar novo corretor').click()
        expect(pg.get_by_text('Dados do novo corretor')).to_be_visible()
        pg.get_by_role('link', name='Vendedores').click(); expect(pg.get_by_text('Henrique Souza').first).to_be_visible()
        # entrevista com o gerente: equipe agenda, corretor vê, agenda lista
        pg.get_by_role('link', name='Clientes').first.click(); expect(pg.get_by_role('heading', name='Clientes').first).to_be_visible()
        pg.locator('table tbody tr').first.click()
        expect(pg.get_by_text('Entrevista com o gerente da Caixa').first).to_be_visible()
        pg.fill('#entrevista-quando', '2030-05-14T14:30'); pg.get_by_role('button', name='Videoconferência').click(); pg.fill('#entrevista-local', 'https://meet.exemplo.com/abc')
        pg.get_by_role('button', name='Agendar entrevista').click()
        expect(pg.get_by_text('Entrevista salva. O corretor foi avisado.')).to_be_visible()
        pg.get_by_role('link', name='Agenda').first.click(); expect(pg.get_by_role('heading', name='Agenda')).to_be_visible()
        expect(pg.get_by_text('14:30').first).to_be_visible(); expect(pg.get_by_text('Videoconferência').first).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/agenda.png', full_page=True)
        pg.get_by_role('link', name='Configurações').click()
        expect(pg.get_by_role('button', name='Cadastrar pessoa da equipe')).to_be_visible()
        b.close()
finally:
    srv.terminate()
print('ERROS', erros)
print('OK – fase 5' if not erros else 'FALHOU')
