"""Modelo 2: MO / DAMP gerado ao aprovar, assinatura pelo corretor, CCA lança na Caixa; Modelos de MO / DAMP; Ficha para a Caixa."""
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = '/tmp/claude-0/-home-claude-app-cca/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8823', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
B = 'http://127.0.0.1:8823/index.html?demo2&volume'
erros = []
def entrar(pg, email):
    for _ in range(3):
        pg.goto(B + '#/entrar'); pg.wait_for_timeout(700)
        if not pg.locator('#email').count():
            pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email'); pg.wait_for_timeout(300)
        pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
        try: pg.wait_for_selector('.menu-botoes > a', timeout=8000); pg.wait_for_timeout(500); return
        except Exception: pass
    raise Exception('login falhou ' + email)
def ir(pg, h): pg.evaluate(f"location.hash = '{h}'"); pg.wait_for_timeout(1300)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True); pg = ctx.new_page(); pg.on('pageerror', lambda e: erros.append(str(e)))
        entrar(pg, 'equipe@demo')
        ir(pg, '#/painel/damp'); expect(pg.get_by_role('heading', name='Modelos de MO / DAMP')).to_be_visible()
        assert pg.locator('.damp-linha.exemplo').count() == 4
        pg.screenshot(path=f'{FOTOS}/damp_modelos.png', full_page=True)
        # aprova um cliente do João em análise: a DAMP sai sozinha
        alvo = pg.evaluate("""async () => { const m = await import('./js/api.js'); const cs = await m.api.listarClientes();
          const c = cs.find((x) => x.corretor_id === 'u-corretor' && x.status === 'em_analise'); await m.api.mudarStatus(c.id, 'cliente_aprovado'); return { id: c.id, nome: c.nome }; }""")
        print('aprovado:', alvo['nome'])
        ir(pg, f"#/painel/clientes/{alvo['id']}"); pg.wait_for_timeout(800)
        expect(pg.locator('#secao-damp')).to_be_visible(); expect(pg.locator('#secao-damp').get_by_text('Para assinar')).to_be_visible()
        with pg.expect_download() as dl: pg.click('#fichaCaixa')
        print('ficha:', dl.value.suggested_filename)
        pg.locator('#secao-damp').scroll_into_view_if_needed(); pg.locator('#secao-damp').screenshot(path=f'{FOTOS}/damp_cca.png')
        # corretor anexa a assinada
        entrar(pg, 'corretor@demo'); ir(pg, f"#/cliente/{alvo['id']}"); pg.wait_for_timeout(800)
        expect(pg.locator('#secao-damp')).to_be_visible()
        expect(pg.get_by_text('MO / DAMP: colher a assinatura', exact=False)).to_have_count(0)  # está no cartão, não no Início
        with pg.expect_popup() as pop: pg.click('#verDamp')
        doc = pop.value; doc.wait_for_load_state(); print('doc:', doc.title()); assert doc.title().startswith('MO '); doc.close()
        pg.locator('#secao-damp input[type=file]').set_input_files({'name': 'damp-assinada.pdf', 'mimeType': 'application/pdf', 'buffer': b'%PDF-1.4 x'})
        pg.wait_for_timeout(1200)
        expect(pg.locator('#secao-damp').get_by_text('Assinado', exact=True)).to_be_visible()
        pg.locator('#secao-damp').screenshot(path=f'{FOTOS}/damp_corretor.png')
        # CCA lança na Caixa (aparece no Sua vez)
        entrar(pg, 'equipe@demo')
        expect(pg.get_by_text('MO / DAMP assinado: lançar na Caixa')).to_be_visible()
        ir(pg, f"#/painel/clientes/{alvo['id']}"); pg.wait_for_timeout(800)
        pg.click('#dampLancada'); pg.wait_for_timeout(1000)
        expect(pg.locator('#secao-damp').get_by_text('Lançado na Caixa', exact=True)).to_be_visible()
        # celular
        pg.set_viewport_size({'width': 390, 'height': 844}); ir(pg, '#/painel/damp')
        assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rolagem lateral'
        pg.screenshot(path=f'{FOTOS}/damp_modelos_cel.png', full_page=True)
        b.close()
finally:
    srv.terminate()
print('ERROS', erros); assert not erros
print('OK')
