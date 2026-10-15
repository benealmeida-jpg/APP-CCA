"""Modelo 2: CCA pede engenharia; submenu ligado ao menu; cliente selecionado abre embaixo da lista (PC, tablet, celular)."""
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = '/tmp/claude-0/-home-claude-app-cca/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos'
os.makedirs(FOTOS, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8827', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
B = 'http://127.0.0.1:8827/index.html?demo2&volume'
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
def sem_rolagem(pg):
    ok = pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
    if not ok: print(pg.evaluate("""() => { const W = innerWidth; const out = []; document.querySelectorAll('body *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.right > W + 1 && r.width > 0) out.push(el.tagName + '.' + (el.className?.baseVal ?? el.className) + ' ' + Math.round(r.left) + '-' + Math.round(r.right) + ' <' + el.parentElement.className); }); return [document.documentElement.scrollWidth, out.slice(0, 12)]; }"""))
    assert ok, 'rolagem lateral'
def cpf(base):
    d = [int(x) for x in base]
    for n in (9, 10):
        s = sum(v * (n + 1 - i) for i, v in enumerate(d[:n])); r = (s * 10) % 11; d.append(0 if r == 10 else r)
    return ''.join(map(str, d))
def selecionado_visivel(pg):
    box = pg.locator('#clienteSelecionado').bounding_box(); topo = pg.locator('.painel-topo').bounding_box()
    assert box and box['y'] >= topo['height'] - 4 and box['y'] < pg.viewport_size['height'] * 0.6, (box, topo)
def nova_eng(pg, doc, para=None):
    ir(pg, '#/painel/engenharia'); pg.click('#novaEngenharia'); pg.wait_for_timeout(900)
    expect(pg.get_by_role('heading', name='Nova engenharia')).to_be_visible()
    if para: pg.wait_for_timeout(500); pg.select_option('#eng-para', label=para)
    pg.fill('#eng-doc', doc); pg.wait_for_timeout(700)
    if pg.locator('#eng-vnome').count(): pg.fill('#eng-vnome', 'Vendedor Teste CCA')
    if pg.locator('#eng-vtel').count(): pg.fill('#eng-vtel', '21999990000'); pg.fill('#eng-vmail', 'vendedor@teste.com')
    pg.fill('#eng-end', 'Rua das Flores, 10, Centro'); pg.select_option('#eng-uf', 'RJ'); pg.wait_for_timeout(900); pg.select_option('#eng-cid', 'Niterói')
    pg.get_by_role('button', name='Criar solicitação').click(); pg.wait_for_timeout(1500)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='pt-BR'); pg = ctx.new_page(); pg.on('pageerror', lambda e: erros.append(str(e)))
        entrar(pg, 'equipe@demo')
        # ---- 1. engenharia pedida pela CCA (cliente direto) ----
        nova_eng(pg, cpf('529982247'))
        pg.screenshot(path=f'{FOTOS}/lay_eng_cca.png', full_page=True)
        expect(pg.get_by_role('button', name='Anexar').first).to_be_visible()
        pg.locator('input[type=file]').count()
        # em nome de um corretor
        nova_eng(pg, cpf('111444777'), para='João Alves · Imobiliária Exemplo')
        ir(pg, '#/painel/engenharia'); expect(pg.get_by_text('pedido pela CCA', exact=False).first).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/lay_eng_lista.png', full_page=True)
        # ---- 2. submenu ligado ao menu ----
        ir(pg, '#/painel/clientes')
        sub = pg.locator('.painel-topo .m2-sub'); expect(sub).to_be_visible()
        expect(sub.locator('a.ativa')).to_have_text('Clientes')
        ativo = pg.locator('.menu-botoes a.ativo').bounding_box(); sb = sub.bounding_box()
        seta = float(pg.evaluate("parseFloat(getComputedStyle(document.querySelector('.m2-sub')).getPropertyValue('--seta-x'))"))
        assert abs((sb['x'] + seta) - (ativo['x'] + ativo['width'] / 2)) < 4, (seta, ativo, sb)
        assert 0 <= sb['y'] - (ativo['y'] + ativo['height']) < 30
        pg.screenshot(path=f'{FOTOS}/lay_submenu.png', clip={'x': 0, 'y': 0, 'width': 1440, 'height': 200})
        # ---- 3. cliente selecionado embaixo da lista ----
        pg.locator('table.tabela tbody tr').nth(3).click(); pg.wait_for_timeout(1600)
        selecionado_visivel(pg)
        cols = pg.locator('#clienteSelecionado .m2-sel-col')
        assert cols.count() == 2 and abs(cols.nth(0).bounding_box()['y'] - cols.nth(1).bounding_box()['y']) < 2
        pg.screenshot(path=f'{FOTOS}/lay_cca_sel.png')
        pg.locator('.tabela-caixa').evaluate('t => t.scrollTop = 400'); pg.wait_for_timeout(200)
        pg.evaluate('window.scrollTo(0, 0)'); pg.wait_for_timeout(300)
        pg.locator('table.tabela tbody tr').nth(9).click(); pg.wait_for_timeout(1600); selecionado_visivel(pg)
        # tablet e celular
        for w, hgt in [(820, 1180), (390, 844)]:
            pg.set_viewport_size({'width': w, 'height': hgt}); ir(pg, '#/painel/clientes'); pg.wait_for_timeout(500)
            alvo = pg.locator('table.tabela tbody tr').nth(2)
            alvo.click(); pg.wait_for_timeout(1700)
            sem_rolagem(pg); selecionado_visivel(pg)
            pg.screenshot(path=f'{FOTOS}/lay_cca_sel_{w}.png')
        pg.set_viewport_size({'width': 1440, 'height': 900})
        # ---- portal: gestor e corretor ----
        for email in ['gestor@demo', 'corretor@demo']:
            entrar(pg, email); ir(pg, '#/clientes')
            pg.locator('table.tabela tbody tr').nth(2).click(); pg.wait_for_timeout(1800)
            expect(pg.locator('.painel-colunas.m2-empilhado')).to_be_visible(); selecionado_visivel(pg)
            pg.screenshot(path=f'{FOTOS}/lay_{email.split("@")[0]}_sel.png')
            pg.screenshot(path=f'{FOTOS}/lay_{email.split("@")[0]}_sel_full.png', full_page=True)
        # o corretor vê a engenharia pedida em nome dele
        ir(pg, '#/engenharia'); expect(pg.get_by_text('Vendedor Teste CCA').first).to_be_visible()
        pg.set_viewport_size({'width': 820, 'height': 1180}); ir(pg, '#/clientes'); pg.locator('table.tabela tbody tr, .tabela-clicavel tbody tr').nth(1).click(); pg.wait_for_timeout(1800)
        sem_rolagem(pg); selecionado_visivel(pg); pg.screenshot(path=f'{FOTOS}/lay_corretor_sel_820.png')
        b.close()
finally:
    srv.terminate()
print('ERROS', erros); assert not erros
print('OK')
