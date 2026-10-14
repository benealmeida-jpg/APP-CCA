"""Engenharia: corretor pede, anexa docs; equipe boleto/OS/laudo; PEPT; contestação (modo demonstração)."""
import os, sys, subprocess, time, tempfile, re
from playwright.sync_api import sync_playwright, expect

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
ARQ = os.path.join(SAIDA, 'doc.pdf'); open(ARQ, 'wb').write(b'%PDF-1.4 teste')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8795', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://127.0.0.1:8795/index.html?demo'
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
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        pg = b.new_context(viewport={'width': 1280, 'height': 900}).new_page()
        pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
        entrar(pg, 'corretor@demo')
        pg.get_by_role('link', name='Engenharia').first.click()
        expect(pg.get_by_role('heading', name='Engenharia')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/1-lista.png')
        pg.get_by_role('link', name='Nova solicitação').click()
        pg.fill('#eng-doc', '52998224725')
        pg.wait_for_selector('#eng-vnome')
        pg.fill('#eng-vnome', 'Maria Vendedora'); pg.fill('#eng-vresp', 'Maria Vendedora')
        pg.fill('#eng-vtel', '85999998888'); pg.fill('#eng-vmail', 'maria@vendedora.com')
        pg.fill('#eng-end', 'Rua das Flores, 100, Centro'); pg.select_option('#eng-uf', 'CE'); pg.wait_for_function("document.querySelector('#eng-cid').options.length > 5"); pg.select_option('#eng-cid', 'Fortaleza'); pg.fill('#eng-mat', '12345'); pg.fill('#eng-rgi', 'Segundo Oficio RGI, Fortaleza, CE')
        pg.get_by_role('button', name='Imóvel usado').click() if pg.get_by_role('button', name='Imóvel usado').count() else None
        pg.get_by_role('button', name='Vendedor').click() if pg.get_by_role('button', name='Vendedor').count() else None
        pg.screenshot(path=f'{SAIDA}/2-nova.png', full_page=True)
        pg.get_by_role('button', name='Criar solicitação').click()
        expect(pg.get_by_text('Documentos para Solicitar Engenharia')).to_be_visible()
        expect(pg.locator('body')).not_to_contain_text('SIOPI')
        expect(pg.get_by_text('maria@vendedora.com')).to_be_visible()
        expect(pg.get_by_text('Segundo Oficio RGI, Fortaleza, CE')).to_be_visible()
        expect(pg.locator('.chip-pendente').first).to_be_visible()
        # usado pede 3 documentos; editar dados do pedido
        assert pg.get_by_role('button', name='Anexar').count() == 3, pg.get_by_role('button', name='Anexar').count()
        pg.get_by_role('button', name='Editar dados').click()
        pg.fill('#ed-rgi', 'Primeiro Oficio RGI, Fortaleza, CE'); pg.fill('#ed-tel', '85988887777')
        pg.get_by_role('button', name='Salvar alterações').click()
        expect(pg.get_by_text('Primeiro Oficio RGI, Fortaleza, CE')).to_be_visible()
        expect(pg.get_by_text('(85) 98888-7777')).to_be_visible()
        enviar = pg.get_by_role('button', name='Enviar para a CCA')
        assert enviar.is_disabled()
        n = pg.get_by_role('button', name='Anexar').count()
        assert n >= 1, n
        pg.set_viewport_size({'width': 700, 'height': 500})
        for _ in range(n):
            pg.evaluate('window.scrollTo(0, 150)')
            with pg.expect_file_chooser() as fc:
                pg.get_by_role('button', name='Anexar').first.click()
            fc.value.set_files(ARQ)
            pg.wait_for_timeout(700)
            assert pg.evaluate('window.scrollY') > 100, 'a tela voltou ao topo'
        pg.set_viewport_size({'width': 1280, 'height': 900})
        expect(enviar).to_be_enabled()
        pg.screenshot(path=f'{SAIDA}/3-docs.png', full_page=True)
        enviar.click()
        expect(pg.get_by_text('A CCA está cadastrando')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/4-analise.png', full_page=True)
        # pedido já enviado com documento novo faltando: ainda dá para anexar
        pg.evaluate("() => { const k='appcca-demo-v7'; const d=JSON.parse(localStorage.getItem(k)); d.engenharia_docs=d.engenharia_docs.filter(x=>x.tipo!=='IPTU'); localStorage.setItem(k, JSON.stringify(d)); }")
        pg.reload(); pg.wait_for_timeout(1200)
        if pg.locator('#email').count(): raise SystemExit('sessão perdida no reload')
        expect(pg.get_by_text('Faltam documentos:')).to_be_visible()
        with pg.expect_file_chooser() as fc:
            pg.get_by_role('button', name='Anexar').first.click()
        fc.value.set_files(ARQ); pg.wait_for_timeout(800)
        expect(pg.get_by_text('Faltam documentos:')).to_have_count(0)
        pg.get_by_role('button', name='Enviar para a CCA').click()
        expect(pg.get_by_text('A CCA foi avisada dos documentos.')).to_be_visible()
        eid = re.search(r'#/engenharia/(.+)$', pg.url).group(1)
        sair(pg)
        # equipe: boleto
        entrar(pg, 'equipe@demo')
        # lista da equipe mostra o pedido com documentos novos (anexados depois do envio)
        IR(pg, '#/painel/engenharia')
        expect(pg.get_by_text('Documentos novos').first).to_be_visible()
        IR(pg, f'#/painel/engenharia/{eid}')
        expect(pg.get_by_text('Documentos novos:')).to_be_visible()
        # equipe corrige nome e CPF do vendedor
        pg.get_by_role('button', name='Editar dados').click()
        pg.fill('#ed-vnome', 'Maria Vendedora Silva')
        pg.get_by_role('button', name='Salvar alterações').click()
        expect(pg.get_by_text('Maria Vendedora Silva').first).to_be_visible()
        IR(pg, '#/painel/engenharia')
        expect(pg.get_by_text('Documentos novos')).to_have_count(0)
        IR(pg, f'#/painel/engenharia/{eid}')
        expect(pg.get_by_role('button', name='Anexar boleto')).to_be_visible()
        with pg.expect_file_chooser() as fc:
            pg.get_by_role('button', name='Anexar boleto').click()
        fc.value.set_files(ARQ)
        expect(pg.get_by_text('Aguardando o corretor anexar')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/5-equipe-boleto.png', full_page=True)
        sair(pg)
        # corretor: comprovante
        entrar(pg, 'corretor@demo')
        IR(pg, f'#/engenharia/{eid}')
        with pg.expect_file_chooser() as fc:
            pg.get_by_role('button', name='Anexar comprovante de pagamento').click()
        fc.value.set_files(ARQ)
        expect(pg.get_by_text('Ordem de serviço (OS)')).to_be_visible()
        sair(pg)
        # equipe: OS + laudo reprovado
        entrar(pg, 'equipe@demo')
        IR(pg, f'#/painel/engenharia/{eid}')
        pg.fill('#os-num', '7891.3307.000927006/2026'); pg.get_by_role('button', name='Registrar OS').click()
        expect(pg.get_by_text('OS 7891.3307.000927006/2026')).to_be_visible()
        pg.get_by_role('button', name='Reprovado').click()
        pg.fill('#lau-pept', 'Falta habite-se\nFalta planta aprovada')
        pg.get_by_role('button', name='Salvar resultado').click()
        expect(pg.get_by_text('Laudo reprovado: pendências (PEPT)')).to_be_visible()
        assert pg.get_by_text('Falta habite-se').count() >= 1
        pg.screenshot(path=f'{SAIDA}/6-pept.png', full_page=True)
        pg.get_by_role('button', name='Marcar como resolvida (enviada ao engenheiro)').first.click()
        expect(pg.get_by_text('Resolvida').first).to_be_visible()
        # novo resultado aprovado
        pg.locator('summary').first.click()
        pg.get_by_role('button', name='Aprovado').click()
        pg.fill('#lau-valor', '285000,00')
        hoje = time.strftime('%Y-%m-%d'); pg.fill('#lau-data', hoje)
        pg.get_by_role('button', name='Salvar resultado').click()
        expect(pg.get_by_text('Laudo aprovado')).to_be_visible()
        expect(pg.get_by_text('faltam 180 dias').or_(pg.get_by_text('faltam 179 dias'))).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/7-aprovado-equipe.png', full_page=True)
        sair(pg)
        # corretor contesta
        entrar(pg, 'corretor@demo')
        IR(pg, f'#/engenharia/{eid}')
        pg.get_by_role('button', name='Pedir reavaliação').click()
        pg.fill('#cont-links', 'https://a.com/1\nhttps://a.com/2')
        pg.get_by_role('button', name='Enviar pedido').click()
        expect(pg.get_by_text('Informe de 5 a 10 links').or_(pg.locator('.erro-campo:not(:empty)'))).to_be_visible()
        pg.fill('#cont-links', '\n'.join(f'https://a.com/{i}' for i in range(6)))
        pg.get_by_role('button', name='Enviar pedido').click()
        expect(pg.get_by_text('Reavaliação pedida.')).to_be_visible()
        pg.screenshot(path=f'{SAIDA}/8-contestou.png', full_page=True)
        # celular
        pg.set_viewport_size({'width': 390, 'height': 800}); pg.wait_for_timeout(600)
        IR(pg, '#/engenharia'); IR(pg, f'#/engenharia/{eid}')
        pg.wait_for_selector('.eng-etapas')
        assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rolagem horizontal no celular'
        pg.screenshot(path=f'{SAIDA}/9-celular.png', full_page=True)
        b.close()
finally:
    srv.terminate()
assert not erros, erros
print('OK engenharia')
