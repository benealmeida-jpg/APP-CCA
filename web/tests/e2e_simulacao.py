"""Modelo 2: a Simulação é obrigatória para enviar o cadastro do cliente."""
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = '/tmp/claude-0/-home-claude-app-cca/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8830', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
B = 'http://127.0.0.1:8830/index.html?demo2'
erros = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        pg = b.new_page(viewport={'width': 1440, 'height': 900}, locale='pt-BR'); pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.goto(B + '#/entrar'); pg.wait_for_timeout(800)
        pg.fill('#email', 'corretor@demo'); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_selector('.menu-botoes > a')
        cid = pg.evaluate("""async () => { const m = await import('./js/api.js');
          const c = await m.api.salvarCliente({ nome: 'Teste Simulação', cpf: '529.982.247-25', celular: '21999990000', rascunho: true, autorizacao_lgpd_em: new Date().toISOString() });
          return c.id; }""")
        r = pg.evaluate(f"""async () => {{ const m = await import('./js/api.js'); try {{ await m.api.enviarCadastro('{cid}'); return 'enviou'; }} catch (e) {{ return e.message; }} }}""")
        print('sem simulação:', r); assert 'Simulação' in r, r
        pg.evaluate(f"location.hash = '#/cliente/{cid}/cadastro/6'"); pg.wait_for_timeout(1500)
        expect(pg.get_by_text('A Simulação é obrigatória.')).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/sim_docs.png')
        pg.evaluate(f"location.hash = '#/cliente/{cid}/cadastro/7'"); pg.wait_for_timeout(1500)
        expect(pg.get_by_text('Falta a Simulação.')).to_be_visible()
        pg.get_by_role('button', name='Enviar para a CCA').click(); pg.wait_for_timeout(600)
        expect(pg.get_by_text('Anexe a Simulação da Caixa para enviar o cadastro', exact=False).first).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/sim_revisao.png', full_page=True)
        r = pg.evaluate(f"""async () => {{ const m = await import('./js/api.js'); await m.api.enviarDocumento('{cid}', 'SIMULACAO', new File(['%PDF-1.4 x'], 'simulacao.pdf', {{ type: 'application/pdf' }}));
          try {{ await m.api.enviarCadastro('{cid}'); return 'enviou'; }} catch (e) {{ return e.message; }} }}""")
        print('com simulação:', r); assert r == 'enviou', r
        b.close()
finally:
    srv.terminate()
print('ERROS', erros); assert not erros
print('OK')
