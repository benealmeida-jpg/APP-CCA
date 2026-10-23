"""Modelo 2: kit de MO / DAMP ao aprovar; corretor confere e baixa o PDF preenchido, abre a DAMP da Caixa preenchida,
anexa os assinados; barreira da Conformidade; CCA lança na Caixa; tela de modelos do ADM; celular."""
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = os.environ.get('FOTOS', '/tmp/claude-0/-home-claude/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos')
os.makedirs(FOTOS, exist_ok=True)
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
        assert pg.locator('.damp-linha').count() == 6, pg.locator('.damp-linha').count()  # 5 oficiais + novo
        assert pg.get_by_text('Modelo oficial · o app preenche sozinho').count() == 5
        pg.screenshot(path=f'{FOTOS}/damp_modelos.png', full_page=True)
        # aprova um cliente do João em análise, com FGTS: o kit sai sozinho (MO30844, MO30825 e DAMP por comprador)
        alvo = pg.evaluate("""async () => { const m = await import('./js/api.js'); const cs = await m.api.listarClientes();
          const doJoao = cs.filter((x) => x.corretor_id === 'u-corretor' && ['em_analise', 'cadastro_ok', 'documentacao_pendente', 'cadastro_recebido'].includes(x.status));
          const c = doJoao.find((x) => x.programa === 'MCMV' || x.usa_fgts) || doJoao[0];
          await m.api.mudarStatus(c.id, 'cliente_aprovado'); const k = await m.api.moKit(c.id);
          let erro = ''; try { await m.api.mudarStatus(c.id, 'conformidade'); } catch (e) { erro = e.message; }
          return { id: c.id, nome: c.nome, itens: k.itens.map((i) => i.modelo.codigo + (i.pessoa_nome ? ' / ' + i.pessoa_nome : '')), erro }; }""")
        print('aprovado:', alvo['nome'], alvo['itens']); print('barreira:', alvo['erro'])
        assert 'MO30844' in alvo['itens'] and 'MO30825' in alvo['itens'] and any(i.startswith('DAMP') for i in alvo['itens']), alvo
        assert 'faltam MO / DAMP' in alvo['erro'], alvo['erro']
        ir(pg, f"#/painel/clientes/{alvo['id']}"); pg.wait_for_timeout(900)
        expect(pg.locator('#secao-damp')).to_be_visible(); expect(pg.locator('#secao-damp .damp-cab').get_by_text('Para assinar')).to_be_visible()
        pg.locator('#secao-damp').scroll_into_view_if_needed(); pg.locator('#secao-damp').screenshot(path=f'{FOTOS}/damp_cca.png')
        # corretor: confere e baixa o PDF preenchido; abre a DAMP da Caixa preenchida; anexa os assinados
        entrar(pg, 'corretor@demo'); ir(pg, f"#/cliente/{alvo['id']}"); pg.wait_for_timeout(900)
        sec = pg.locator('#secao-damp'); expect(sec).to_be_visible()
        sec.get_by_role('button', name='Conferir e baixar PDF').first.click()
        expect(pg.locator('.janela-larga')).to_be_visible(); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{FOTOS}/damp_conferir.png')
        primeiro = pg.locator('.mo-campos input.entrada').first.input_value(); print('campo 1:', primeiro); assert primeiro
        with pg.expect_download() as dl: pg.click('#moBaixar')
        caminho = dl.value.path(); dados = open(caminho, 'rb').read(); print('pdf:', dl.value.suggested_filename, len(dados))
        assert dados.startswith(b'%PDF') and b') Tj' in dados[-6000:]
        os.replace(caminho, f'{FOTOS}/mo_preenchido.pdf')
        if sec.get_by_role('button', name='Abrir DAMP preenchida').count():
            with pg.expect_popup() as pop: sec.get_by_role('button', name='Abrir DAMP preenchida').first.click()
            damp = pop.value; damp.wait_for_load_state(); damp.wait_for_timeout(1500)
            nome = damp.locator('#text_nome').input_value(); print('DAMP nome:', nome); assert nome and nome == nome.upper()
            damp.screenshot(path=f'{FOTOS}/damp_caixa.png'); damp.close()
        for i in range(8):
            item = pg.locator('#secao-damp .mo-item').filter(has=pg.get_by_role('button', name='Anexar assinado', exact=True))
            if not item.count(): break
            item.first.locator('input[type=file]').set_input_files({'name': f'assinado-{i}.pdf', 'mimeType': 'application/pdf', 'buffer': b'%PDF-1.4 x'})
            pg.wait_for_timeout(700)
            # PDF sem assinatura digital: o app avisa e pede confirmação
            if pg.get_by_role('button', name='Anexar mesmo assim').count(): pg.get_by_role('button', name='Anexar mesmo assim').click()
            pg.wait_for_timeout(1000)
        sec = pg.locator('#secao-damp')
        expect(sec.locator('.damp-cab').get_by_text('Assinados')).to_be_visible()
        sec.screenshot(path=f'{FOTOS}/damp_corretor.png')
        # CCA lança na Caixa (aparece no Sua vez) e o processo passa para a Conformidade
        entrar(pg, 'equipe@demo')
        expect(pg.get_by_text('MO / DAMP assinado: lançar na Caixa')).to_be_visible()
        ir(pg, f"#/painel/clientes/{alvo['id']}"); pg.wait_for_timeout(900)
        for _ in range(8):
            bt = pg.locator('#secao-damp').get_by_role('button', name='Marcar lançado na Caixa')
            if not bt.count(): break
            bt.first.click(); pg.wait_for_timeout(1100)
        expect(pg.locator('#secao-damp .damp-cab').get_by_text('Lançados na Caixa')).to_be_visible()
        ok = pg.evaluate("""async (id) => { const m = await import('./js/api.js'); await m.api.mudarStatus(id, 'conformidade'); return (await m.api.listarClientes()).find((c) => c.id === id).status; }""", alvo['id'])
        assert ok == 'conformidade', ok
        # celular
        pg.set_viewport_size({'width': 390, 'height': 844}); ir(pg, f"#/painel/clientes/{alvo['id']}"); pg.wait_for_timeout(600)
        assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rolagem lateral (cliente)'
        pg.locator('#secao-damp').scroll_into_view_if_needed(); pg.locator('#secao-damp').screenshot(path=f'{FOTOS}/damp_cel.png')
        ir(pg, '#/painel/damp')
        assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rolagem lateral (modelos)'
        pg.screenshot(path=f'{FOTOS}/damp_modelos_cel.png', full_page=True)
        entrar(pg, 'corretor@demo'); ir(pg, f"#/cliente/{alvo['id']}"); pg.wait_for_timeout(800)
        pg.locator('#secao-damp').get_by_role('button', name='Conferir e baixar PDF').first.click(); pg.wait_for_timeout(400)
        assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rolagem lateral (janela)'
        pg.screenshot(path=f'{FOTOS}/damp_conferir_cel.png')
        b.close()
finally:
    srv.terminate()
print('ERROS', erros); assert not erros
print('OK')
