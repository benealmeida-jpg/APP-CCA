"""Modelo 2: Nato Digital/Manual no cadastro; Faturamento (nível 1); Despesas e créditos por nível; Fechamento do mês."""
import os, sys, subprocess, time
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = '/tmp/claude-0/-home-claude-app-cca/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos'
os.makedirs(FOTOS, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8824', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
B = 'http://127.0.0.1:8824/index.html?demo2&volume'
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
def sem_rolagem(pg): assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rolagem lateral'
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True, locale='pt-BR'); pg = ctx.new_page(); pg.on('pageerror', lambda e: erros.append(str(e)))
        # ---- corretor: Nato Digital ou Manual no cadastro ----
        entrar(pg, 'corretor@demo')
        cid = pg.evaluate("""async () => { const m = await import('./js/api.js'); const cs = await m.api.listarClientes(); return cs.find((x) => !x.rascunho).id; }""")
        ir(pg, f'#/cliente/{cid}/cadastro/3')
        expect(pg.get_by_text('Como o contrato vai ser assinado?')).to_be_visible()
        pg.get_by_role('button', name='Manual (em papel)').click()
        pg.locator('fieldset', has_text='Como o contrato vai ser assinado?').screenshot(path=f'{FOTOS}/fin_cadastro_assinatura.png')
        ir(pg, f'#/cliente/{cid}/cadastro/7'); pg.wait_for_timeout(500)
        # ---- CCA nível 1 ----
        entrar(pg, 'equipe@demo')
        expect(pg.get_by_role('link', name='Financeiro')).to_be_visible()
        titulos = pg.evaluate("""async () => { const a = await import('./js/api.js'); const f = await import('./js/financeiro.js'); return f.itensFinanceiro(await a.api.listarContratosFaturamento()).map((i) => i.titulo); }""")
        assert 'Faturamento: completar número e valor dos contratos' in titulos, titulos
        ir(pg, '#/painel/faturamento'); expect(pg.get_by_role('heading', name='Faturamento', exact=True)).to_be_visible()
        expect(pg.locator('.abas-grupo')).to_contain_text('Despesas e créditos')
        expect(pg.get_by_text('Faltam dados em 1 contrato')).to_be_visible()
        assert pg.locator('#fecharMes').is_disabled()
        pg.screenshot(path=f'{FOTOS}/fin_faturamento.png', full_page=True)
        # quadros clicáveis: cada um abre a lista detalhada embaixo
        for q, txt in [('contratos', 'Contratos do mês'), ('valor', 'Valor financiado por contrato'), ('bruto', 'Bruto: 8% do valor financiado'), ('liquido', 'Do bruto ao líquido')]:
            pg.click(f'[data-quadro={q}]'); pg.wait_for_timeout(400)
            expect(pg.locator('#fin-det-faturamento h2')).to_have_text(txt)
            assert pg.locator('#fin-det-faturamento tbody tr').count() >= 2
        expect(pg.locator('#fin-det-faturamento .fin-total')).to_contain_text('R$')
        pg.screenshot(path=f'{FOTOS}/fin_quadro_liquido.png', full_page=True)
        pg.click('[data-quadro=liquido]'); pg.wait_for_timeout(300); assert pg.locator('#fin-det-faturamento').count() == 0
        falta = pg.locator('.fin-linha.falta').first
        falta.locator('input').first.fill('8.4444.0999999-1'); falta.locator('input').first.press('Tab'); pg.wait_for_timeout(1200)
        assert pg.locator('.fin-linha.falta').count() == 0
        pg.click('#fecharMes'); pg.wait_for_timeout(300)
        if 'mesmo assim' in pg.locator('#fecharMes').inner_text(): pg.click('#fecharMes')
        pg.wait_for_timeout(1200)
        expect(pg.get_by_role('heading', name='NF-e do mês')).to_be_visible()
        pg.fill('#nfeNumero', '000124'); pg.click('#registrarNfe'); pg.wait_for_timeout(1000)
        expect(pg.get_by_text('NF-e 000124', exact=False).first).to_be_visible()
        pg.click('#marcarRecebido'); pg.wait_for_timeout(1000)
        expect(pg.locator('.fin-nfe-form').get_by_text('Recebido em', exact=False)).to_be_visible()
        with pg.expect_download() as dl: pg.click('#baixarFaturamento')
        print('planilha:', dl.value.suggested_filename)
        pg.screenshot(path=f'{FOTOS}/fin_faturamento_fechado.png', full_page=True)
        pg.get_by_role('button', name='Mês anterior').click(); pg.wait_for_timeout(900)
        expect(pg.locator('.fin-mes .chip')).to_contain_text('Recebido')
        # despesas e créditos
        ir(pg, '#/painel/lancamentos'); expect(pg.get_by_role('heading', name='Despesas e créditos')).to_be_visible()
        expect(pg.get_by_role('heading', name='Quem pode o quê')).to_be_visible()
        antes = pg.locator('.fin-lanc').count()
        pg.click('[data-tipo=variavel]'); pg.wait_for_timeout(400)
        pg.select_option('#lancCategoria', 'Marketing'); pg.fill('#lancDescricao', 'Anúncio no Instagram'); pg.fill('#lancValor', '350,00'); pg.click('#lancar'); pg.wait_for_timeout(1000)
        assert pg.locator('.fin-lanc').count() == antes + 1
        if pg.locator('#copiarFixas').count(): pg.click('#copiarFixas'); pg.wait_for_timeout(1000)
        pg.screenshot(path=f'{FOTOS}/fin_lancamentos.png', full_page=True)
        for q in ['fixa', 'variavel', 'total', 'credito']:
            pg.click(f'[data-quadro={q}]'); pg.wait_for_timeout(400); expect(pg.locator('#fin-det-lancamentos')).to_be_visible()
        pg.click('[data-quadro=fixa]'); pg.wait_for_timeout(400)
        expect(pg.locator('#fin-det-lancamentos')).to_contain_text('Aluguel')
        pg.screenshot(path=f'{FOTOS}/fin_quadro_fixas.png', full_page=True)
        ir(pg, '#/painel/fechamento'); expect(pg.get_by_role('heading', name='Fechamento do mês')).to_be_visible()
        expect(pg.get_by_text('Resultado do mês')).to_be_visible()
        pg.click('[data-quadro=resultado]'); pg.wait_for_timeout(400); expect(pg.locator('#fin-det-fechamento')).to_contain_text('Despesas fixas')
        pg.screenshot(path=f'{FOTOS}/fin_fechamento.png', full_page=True)
        # dados do contrato no painel do cliente
        alvo = pg.evaluate("""async () => { const m = await import('./js/api.js'); const cs = await m.api.listarClientes(); return cs.find((x) => x.status === 'registro_cartorio').id; }""")
        ir(pg, f'#/painel/clientes/{alvo}'); pg.wait_for_timeout(800)
        expect(pg.locator('#dadosContrato')).to_be_visible(); expect(pg.locator('#dadosContrato')).to_contain_text('Entra no faturamento de')
        pg.locator('#dadosContrato').scroll_into_view_if_needed(); pg.locator('#dadosContrato').screenshot(path=f'{FOTOS}/fin_dados_contrato.png')
        # celular
        pg.set_viewport_size({'width': 390, 'height': 844})
        for t in ['faturamento', 'lancamentos', 'fechamento']:
            ir(pg, f'#/painel/{t}'); pg.locator('[data-quadro]').first.click(); pg.wait_for_timeout(400); sem_rolagem(pg); pg.screenshot(path=f'{FOTOS}/fin_{t}_cel.png', full_page=True)
        pg.set_viewport_size({'width': 820, 'height': 1180}); ir(pg, '#/painel/faturamento'); sem_rolagem(pg); pg.screenshot(path=f'{FOTOS}/fin_faturamento_tablet.png', full_page=True)
        pg.set_viewport_size({'width': 1440, 'height': 900})
        # ---- Gabriel (nível 3): só lança despesas e vê as dele ----
        entrar(pg, 'gabriel@demo')
        ir(pg, '#/painel/faturamento'); expect(pg.get_by_role('heading', name='Faturamento', exact=True)).to_have_count(0)
        ir(pg, '#/painel/lancamentos'); expect(pg.get_by_role('heading', name='Despesas e créditos')).to_be_visible()
        assert pg.locator('[data-tipo=credito]').count() == 0
        expect(pg.get_by_role('heading', name='Quem pode o quê')).to_have_count(0)
        nomes = pg.locator('.fin-lanc small').all_inner_texts()
        assert all('Gabriel' in n for n in nomes), nomes
        pg.fill('#lancDescricao', 'Táxi para a agência'); pg.fill('#lancValor', '42,90'); pg.click('#lancar'); pg.wait_for_timeout(1000)
        expect(pg.get_by_text('Táxi para a agência')).to_be_visible()
        expect(pg.locator('.abas-grupo')).to_have_count(0)
        pg.screenshot(path=f'{FOTOS}/fin_gabriel.png', full_page=True)
        # ---- Suzana (nível 2): sem faturamento, vê todos os lançamentos ----
        entrar(pg, 'suzana@demo')
        ir(pg, '#/painel/lancamentos'); expect(pg.get_by_text('Táxi para a agência')).to_be_visible()
        assert pg.locator('[data-tipo=credito]').count() == 1
        ir(pg, '#/painel/fechamento'); expect(pg.get_by_role('heading', name='Fechamento do mês')).to_have_count(0)
        b.close()
finally:
    srv.terminate()
print('ERROS', erros); assert not erros
print('OK')
