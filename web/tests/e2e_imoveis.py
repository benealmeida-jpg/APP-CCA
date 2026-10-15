"""Modelo 2: cadastro do imóvel (lista, ficha, documentos, engenharia a partir do imóvel, processo ligado) e o botão Anexar."""
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = '/tmp/claude-0/-home-claude-app-cca/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos'
os.makedirs(FOTOS, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8833', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
B = 'http://127.0.0.1:8833/index.html?demo2&volume'
ARQ = {'name': 'doc.pdf', 'mimeType': 'application/pdf', 'buffer': b'%PDF-1.4 x'}
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
def ir(pg, h): pg.evaluate(f"location.hash = '{h}'"); pg.wait_for_timeout(1400)
def sem_rolagem(pg):
    ok = pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
    if not ok: print(pg.evaluate("""() => { const W = innerWidth; const out = []; document.querySelectorAll('body *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.right > W + 1 && r.width > 0) out.push(el.tagName + '.' + (el.className?.baseVal ?? el.className) + ' ' + Math.round(r.left) + '-' + Math.round(r.right) + ' <' + el.parentElement.className); }); return [document.documentElement.scrollWidth, out.slice(0, 10)]; }"""))
    assert ok, 'rolagem lateral'
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='pt-BR'); pg = ctx.new_page(); pg.on('pageerror', lambda e: erros.append(str(e)))
        entrar(pg, 'equipe@demo')
        ir(pg, '#/painel/imoveis'); expect(pg.get_by_role('heading', name='Imóveis', exact=True)).to_be_visible()
        expect(pg.locator('.abas-grupo a.ativa')).to_have_text('Imóveis')
        n = pg.locator('tr[data-imovel]').count(); print('imóveis:', n); assert n >= 3
        pg.screenshot(path=f'{FOTOS}/im_lista.png', full_page=True)
        # o imóvel com laudo válido e processo ligado
        alvo = pg.evaluate("""async () => { const m = await import('./js/api.js'); const l = await m.api.listarImoveis(); const i = l.find((x) => x.clientes.length) || l[0]; return { id: i.id, cliente: i.clientes[0]?.id || null }; }""")
        ir(pg, f"#/painel/imoveis/{alvo['id']}")
        expect(pg.get_by_role('heading', name='Documentos do imóvel')).to_be_visible()
        antes = pg.locator('.imovel-doc .imovel-doc-ic.ok').count()
        pg.locator('.imovel-outros summary').click()
        with pg.expect_file_chooser() as fc: pg.locator('[data-doc=ALVARA]').get_by_role('button', name='Anexar').click()
        fc.value.set_files(ARQ); pg.wait_for_timeout(1500)
        assert pg.locator('.imovel-doc .imovel-doc-ic.ok').count() == antes + 1, 'anexo no imóvel'
        expect(pg.get_by_role('heading', name='Vendas (processos de clientes)')).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/im_ficha.png', full_page=True)
        # pedir engenharia deste imóvel
        pg.click('#pedirEngImovel'); pg.wait_for_timeout(2200)
        expect(pg.get_by_role('heading', name='Nova engenharia')).to_be_visible()
        expect(pg.locator(f"[data-opcao-imovel='{alvo['id']}']")).to_have_attribute('aria-pressed', 'true')
        assert not pg.locator('#eng-end').is_visible(), 'endereço deve ficar escondido com imóvel escolhido'
        if pg.locator('#eng-vtel').count(): pg.fill('#eng-vtel', '21977776666'); pg.fill('#eng-vmail', 'antonio@teste.com')
        pg.get_by_role('button', name='Leilão').click(); pg.wait_for_timeout(300)
        expect(pg.locator('[data-docs-imovel]')).to_contain_text('Já estão no cadastro do imóvel')
        pg.fill('#eng-valor', '30000000'); assert pg.evaluate("document.getElementById('eng-valor').value.replace(/\\s/g, ' ')") == 'R$ 300.000,00', pg.input_value('#eng-valor')
        pg.get_by_role('group', name='Quem vai acompanhar a vistoria').get_by_role('button', name='Vendedor').click(); pg.wait_for_timeout(300)
        if pg.locator('#eng-amail').count(): pg.fill('#eng-amail', 'vendedor@teste.com')
        if pg.locator('#eng-atel').count(): pg.fill('#eng-atel', '21988887777')
        pg.screenshot(path=f'{FOTOS}/im_eng_form.png', full_page=True)
        pg.get_by_role('button', name='Criar solicitação').click(); pg.wait_for_timeout(1800)
        expect(pg.get_by_text('Do cadastro do imóvel').first).to_be_visible()
        expect(pg.locator('[data-ver-imovel]')).to_be_visible()
        pend = pg.get_by_role('button', name='Anexar').count(); print('pendentes na nova engenharia:', pend)
        pg.screenshot(path=f'{FOTOS}/im_eng_detalhe.png', full_page=True)
        # o processo ligado puxa os documentos do imóvel
        if alvo['cliente']:
            r = pg.evaluate(f"""async () => {{ const m = await import('./js/api.js'); const d = await m.api.obterCliente('{alvo['cliente']}'); const n = d.necessarios.find((x) => x.tipo_codigo === 'MATRICULA'); return n ? {{ sit: n.situacao, imovel: !!n.documento?.do_imovel }} : null; }}""")
            print('matrícula no processo:', r); assert r and r['imovel'], r
            ir(pg, f"#/painel/clientes/{alvo['cliente']}"); pg.wait_for_timeout(800)
            expect(pg.locator('#imovelDoCliente')).to_contain_text('Imóvel cadastrado')
        # vendedor -> imóveis deste vendedor
        ir(pg, '#/painel/vendedores'); pg.locator('table.tabela tbody tr').first.click(); pg.wait_for_timeout(1200)
        pg.locator('[data-imoveis-vendedor]').click(); pg.wait_for_timeout(1400)
        expect(pg.get_by_text('Imóveis de', exact=False).first).to_be_visible()
        # celular
        pg.set_viewport_size({'width': 390, 'height': 844}); ir(pg, f"#/painel/imoveis/{alvo['id']}"); pg.wait_for_timeout(1500); sem_rolagem(pg); pg.screenshot(path=f'{FOTOS}/im_ficha_cel.png', full_page=True)
        ir(pg, '#/painel/imoveis'); sem_rolagem(pg)
        pg.set_viewport_size({'width': 1440, 'height': 900})
        # corretor: Anexar na engenharia e menu Imóveis
        entrar(pg, 'corretor@demo')
        eid = pg.evaluate("async () => { const m = await import('./js/api.js'); const l = await m.api.listarEngenharias(); return (l.find((e) => ['documentacao','em_analise'].includes(e.etapa)) || {}).id; }")
        ir(pg, f'#/engenharia/{eid}')
        n0 = pg.get_by_role('button', name='Anexar').count()
        with pg.expect_file_chooser() as fc: pg.get_by_role('button', name='Anexar').first.click()
        fc.value.set_files(ARQ); pg.wait_for_timeout(1500)
        assert pg.get_by_role('button', name='Anexar').count() == n0 - 1, 'anexar do corretor'
        ir(pg, '#/mais'); pg.get_by_role('link', name='Imóveis').click(); pg.wait_for_timeout(1400)
        expect(pg.get_by_role('heading', name='Imóveis', exact=True)).to_be_visible()
        assert pg.locator('tr[data-imovel]').count() >= 1
        b.close()
finally:
    srv.terminate()
print('ERROS', erros); assert not erros
print('OK')
