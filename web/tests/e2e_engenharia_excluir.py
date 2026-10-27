"""Engenharia (editar tipo depois de enviado, excluir): corretor pede, anexa docs; equipe boleto/OS/laudo; PEPT; contestação (modo demonstração)."""
import os, sys, subprocess, time, tempfile, re
from playwright.sync_api import sync_playwright, expect

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
ARQ = os.path.join(SAIDA, 'doc.pdf'); open(ARQ, 'wb').write(b'%PDF-1.4 teste')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8796', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8796/index.html?demo'
erros = []

def entrar(pg, email):
    pg.goto(URL); pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
    pg.wait_for_selector('.painel'); pg.wait_for_timeout(900)

def IR(pg, h):
    pg.evaluate('h => { location.hash = h }', h); pg.wait_for_timeout(600)

def sair(pg):
    pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click()
    expect(pg.locator('#email')).to_be_visible()

try:
    with sync_playwright() as p:
        b = p.chromium.launch(**({'executable_path': os.environ['CHROMIUM']} if os.environ.get('CHROMIUM') else {}))
        pg = b.new_context(viewport={'width': 1280, 'height': 900}).new_page()
        pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
        entrar(pg, 'corretor@demo')
        def criar(nome, cpf):
            IR(pg, '#/engenharia/nova')
            pg.fill('#eng-doc', cpf); pg.wait_for_selector('#eng-vnome')
            pg.fill('#eng-vnome', nome); pg.fill('#eng-vresp', nome); pg.fill('#eng-vtel', '85999998888'); pg.fill('#eng-vmail', 'a@b.com')
            pg.fill('#eng-end', 'Rua A, 1'); pg.select_option('#eng-uf', 'CE'); pg.wait_for_function("document.querySelector('#eng-cid').options.length > 5"); pg.select_option('#eng-cid', index=1)
            pg.fill('#eng-mat', '123'); pg.fill('#eng-rgi', 'RGI X')
            pg.get_by_role('button', name='Imóvel novo (FGTS)').click()
            pg.get_by_role('button', name='Criar solicitação').click()
            expect(pg.get_by_text('Documentos para Solicitar Engenharia')).to_be_visible()
        criar('Maria Teste', '52998224725')
        # troca o tipo ainda na documentação
        pg.get_by_role('button', name='Editar dados').click()
        pg.get_by_role('button', name='Imóvel usado').click(); pg.get_by_role('button', name='Salvar alterações').click()
        expect(pg.get_by_text('Imóvel usado').first).to_be_visible()
        pg.wait_for_timeout(800); assert pg.get_by_role('button', name='Anexar').count() == 3, pg.get_by_role('button', name='Anexar').count()
        # anexa tudo, envia, e troca o tipo depois de enviado
        for _ in range(3):
            with pg.expect_file_chooser() as fc: pg.get_by_role('button', name='Anexar').first.click()
            fc.value.set_files(ARQ); pg.wait_for_timeout(600)
        pg.get_by_role('button', name='Enviar para a CCA').click(); expect(pg.get_by_text('A CCA está cadastrando')).to_be_visible()
        pg.get_by_role('button', name='Editar dados').click()
        pg.get_by_role('button', name='Imóvel novo (SBPE)').click(); pg.get_by_role('button', name='Salvar alterações').click()
        expect(pg.get_by_text('Dados atualizados.')).to_be_visible()
        expect(pg.locator('.erro-campo:not(:empty)')).to_have_count(0)
        # excluir pela tela do pedido
        pg.get_by_role('button', name='Excluir pedido').click()
        pg.get_by_role('button', name='Não').click()
        expect(pg.get_by_role('button', name='Excluir pedido')).to_be_visible()
        pg.get_by_role('button', name='Excluir pedido').click(); pg.get_by_role('button', name='Sim').click()
        expect(pg.get_by_text('Pedido excluído.')).to_be_visible()
        expect(pg.locator('body')).not_to_contain_text('Maria Teste')
        # excluir pela lista
        criar('João Lista', '11144477735'); IR(pg, '#/engenharia')
        expect(pg.get_by_text('João Lista').first).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/lista-excluir.png', full_page=True)
        pg.get_by_role('button', name='Excluir pedido de João Lista').click(); pg.get_by_role('button', name='Sim').click()
        pg.wait_for_timeout(800)
        expect(pg.locator('body')).not_to_contain_text('João Lista')
        # celular sem rolagem lateral
        criar('Ana Celular', '39053344705'); pg.set_viewport_size({'width': 390, 'height': 800}); IR(pg, '#/engenharia'); pg.wait_for_timeout(500)
        assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
        pg.screenshot(path=f'{SAIDA}/lista-excluir-390.png', full_page=True)
        b.close()
finally:
    srv.terminate()
assert not erros, erros
print('OK excluir')
