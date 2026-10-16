"""Modelo 2: Consumidores finais (lista e cadastro pela CCA) e Cadastrar imóvel pela CCA (vendedor novo/existente, corretor e consumidor opcionais)."""
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = '/tmp/claude-0/-home-claude-app-cca/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos'
os.makedirs(FOTOS, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8836', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
B = 'http://127.0.0.1:8836/index.html?demo2&volume'
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
        ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
        entrar(pg, 'equipe@demo')
        # ---- Consumidores finais no menu Parceiros
        ir(pg, '#/painel/imobiliarias')
        expect(pg.locator('.abas-grupo').get_by_role('link', name='Consumidores finais')).to_be_visible()
        pg.locator('.abas-grupo').get_by_role('link', name='Consumidores finais').click(); pg.wait_for_timeout(1400)
        expect(pg.get_by_role('heading', name='Consumidores finais', exact=True)).to_be_visible()
        expect(pg.locator('.abas-grupo a.ativa')).to_have_text('Consumidores finais')
        n0 = pg.locator('tr[data-consumidor]').count(); print('consumidores:', n0); assert n0 >= 2
        expect(pg.locator('tr[data-consumidor]', has_text='Fernanda Lima Souza')).to_contain_text('Identidade confirmada')
        expect(pg.locator('tr[data-consumidor]', has_text='Marcos Pereira Dias')).to_contain_text('Vídeo para conferir')
        pg.screenshot(path=f'{FOTOS}/cons_lista.png', full_page=True)
        pg.get_by_role('button', name='Vídeo para conferir').click(); pg.wait_for_timeout(200)
        assert pg.locator('tr[data-consumidor]').count() == 1
        pg.get_by_role('button', name='Todos', exact=False).click(); pg.wait_for_timeout(200)
        # cadastrar
        pg.click('#cadastrarConsumidor'); pg.wait_for_timeout(300)
        pg.click('#salvarConsumidor'); pg.wait_for_timeout(500)
        expect(pg.locator('.erro-campo').first).to_contain_text('nome completo')
        pg.fill('#cf-nome', 'Juliana Rocha Teixeira'); pg.fill('#cf-cpf', '52998224725'); pg.fill('#cf-whats', '21987654321'); pg.fill('#cf-email', 'juliana@teste.com')
        assert pg.input_value('#cf-cpf') == '529.982.247-25', pg.input_value('#cf-cpf')
        pg.check('#cf-conferida')
        pg.screenshot(path=f'{FOTOS}/cons_form.png', full_page=True)
        pg.click('#salvarConsumidor'); pg.wait_for_timeout(1200)
        expect(pg.get_by_text('Acesso criado.')).to_be_visible()
        expect(pg.get_by_role('link', name='Enviar pelo WhatsApp')).to_have_attribute('href', __import__('re').compile(r'wa\.me/5521987654321'))
        pg.get_by_role('button', name='Concluir').click(); pg.wait_for_timeout(1400)
        linha = pg.locator('tr[data-consumidor]', has_text='Juliana Rocha Teixeira')
        expect(linha).to_contain_text('Identidade confirmada'); expect(linha).to_contain_text('Ainda não criou a senha')
        # CPF repetido
        pg.click('#cadastrarConsumidor'); pg.fill('#cf-nome', 'Outra Pessoa Silva'); pg.fill('#cf-cpf', '52998224725'); pg.fill('#cf-whats', '21987654320'); pg.fill('#cf-email', 'outra@teste.com')
        pg.click('#salvarConsumidor'); pg.wait_for_timeout(700)
        print('cpf repetido:', pg.locator('.erro-campo').first.inner_text()); assert pg.locator('.erro-campo').first.inner_text().strip()
        pg.get_by_role('button', name='Cancelar').click()
        expect(pg.get_by_role('link', name='Enviar convite por link')).to_have_attribute('href', '#/painel/convites')

        # ---- Cadastrar imóvel pela CCA: vendedor novo (CNPJ), sem corretor, com consumidor final
        ir(pg, '#/painel/imoveis'); n_im = pg.locator('tr[data-imovel]').count()
        pg.click('#cadastrarImovel'); pg.wait_for_timeout(1400)
        expect(pg.get_by_role('heading', name='Cadastrar imóvel')).to_be_visible()
        pg.fill('#nim-doc', '11444777000161'); pg.wait_for_timeout(900)
        expect(pg.get_by_text('CPF ou CNPJ ainda não cadastrado.')).to_be_visible()
        pg.fill('#nim-vnome', 'Construtora Horizonte Ltda'); pg.fill('#nim-vresp', 'Paulo Henrique Costa'); pg.fill('#nim-vtel', '21966665555'); pg.fill('#nim-vmail', 'contato@horizonte.com')
        pg.fill('#nim-end', 'Rua das Acácias, 120, Centro'); pg.select_option('#nim-uf', 'RJ'); pg.wait_for_timeout(1200)
        pg.select_option('#nim-cid', 'Itaboraí'); pg.select_option('#nim-tipo', 'novo_fgts'); pg.fill('#nim-mat', '45.321')
        pg.wait_for_timeout(300)
        opts = pg.locator('#im-corretor option').all_inner_texts(); print('corretores:', len(opts))
        assert not any('Fernanda' in o for o in opts), 'consumidor final não pode aparecer como corretor'
        pg.select_option('#im-consumidor', label=pg.locator('#im-consumidor option', has_text='Juliana Rocha Teixeira').inner_text())
        sem_rolagem(pg); pg.screenshot(path=f'{FOTOS}/im_novo_form.png', full_page=True)
        pg.click('#salvarNovoImovel'); pg.wait_for_timeout(1800)
        expect(pg.get_by_role('heading', name='Documentos do imóvel')).to_be_visible()
        expect(pg.locator('[data-im-corretor]')).to_contain_text('Sem corretor')
        expect(pg.locator('[data-im-consumidor]')).to_contain_text('Juliana Rocha Teixeira')
        expect(pg.locator('#imovelDados')).to_contain_text('Construtora Horizonte Ltda')
        # documentos de imóvel novo FGTS
        expect(pg.locator('[data-doc=SINTESE]')).to_be_visible()
        pg.screenshot(path=f'{FOTOS}/im_novo_ficha.png', full_page=True)
        # editar: põe corretor
        pg.get_by_role('button', name='Editar dados').click(); pg.wait_for_timeout(600)
        cor = pg.locator('#im-corretor option').nth(1); nome_cor = cor.inner_text().split(' · ')[0]
        pg.select_option('#im-corretor', index=1); pg.get_by_role('button', name='Salvar').click(); pg.wait_for_timeout(1500)
        expect(pg.locator('[data-im-corretor]')).to_contain_text(nome_cor)
        # consumidor final mostra o imóvel
        ir(pg, '#/painel/consumidores')
        expect(pg.locator('tr[data-consumidor]', has_text='Juliana Rocha Teixeira')).to_contain_text('Rua das Acácias')
        # imóvel com vendedor que já existe
        ir(pg, '#/painel/imoveis/novo')
        vdoc = pg.evaluate("async () => { const d = JSON.parse(localStorage.getItem('appcca-demo2-v4')); return d.vendedores[0].cpf_cnpj; }")
        pg.fill('#nim-doc', vdoc); pg.wait_for_timeout(900)
        expect(pg.get_by_text('já está no cadastro:')).to_be_visible()
        pg.click('#salvarNovoImovel'); pg.wait_for_timeout(600)
        expect(pg.locator('.erro-campo').first).to_contain_text('endereço')
        pg.fill('#nim-end', 'Av. Brasil, 500'); pg.select_option('#nim-uf', 'RJ'); pg.wait_for_timeout(1200); pg.select_option('#nim-cid', 'Niterói')
        pg.click('#salvarNovoImovel'); pg.wait_for_timeout(1800)
        expect(pg.get_by_role('heading', name='Documentos do imóvel')).to_be_visible()
        ir(pg, '#/painel/imoveis'); assert pg.locator('tr[data-imovel]').count() == n_im + 2
        expect(pg.locator('tr[data-imovel]', has_text='Rua das Acácias')).to_contain_text('Juliana Rocha Teixeira')
        pg.screenshot(path=f'{FOTOS}/im_lista2.png', full_page=True)
        # tablet e celular
        for (w, hgt, nome) in [(820, 1180, 'tab'), (390, 844, 'cel')]:
            pg.set_viewport_size({'width': w, 'height': hgt})
            ir(pg, '#/painel/consumidores'); sem_rolagem(pg); pg.screenshot(path=f'{FOTOS}/cons_lista_{nome}.png', full_page=True)
            pg.click('#cadastrarConsumidor'); pg.wait_for_timeout(300); sem_rolagem(pg); pg.screenshot(path=f'{FOTOS}/cons_form_{nome}.png', full_page=True)
            ir(pg, '#/painel/imoveis/novo'); pg.fill('#nim-doc', '11444777000161'); pg.wait_for_timeout(900); sem_rolagem(pg); pg.screenshot(path=f'{FOTOS}/im_novo_{nome}.png', full_page=True)
            ir(pg, '#/painel/imoveis'); sem_rolagem(pg)
        pg.set_viewport_size({'width': 1440, 'height': 900})
        # consumidor final entra
        entrar(pg, 'consumidor@demo'); pg.wait_for_timeout(800)
        pg.screenshot(path=f'{FOTOS}/cons_login.png', full_page=True)
        b.close()
    assert not erros, erros
    print('OK')
finally:
    srv.terminate()
