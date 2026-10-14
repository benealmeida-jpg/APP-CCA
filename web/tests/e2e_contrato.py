"""Contrato: minuta → assinaturas → gerente da Caixa → registro → conformidade final → crédito liberado."""
import os, sys, subprocess, time, tempfile
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOTOS = '/tmp/claude-0/-home-claude-app-cca/0fb27a70-fa76-5074-9410-1c9ac77a0263/scratchpad/fotos'
os.makedirs(FOTOS, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8815', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
URL = 'http://127.0.0.1:8815/index.html?demo&volume'
erros = []
tmp = tempfile.mkdtemp(); arq = os.path.join(tmp, 'arquivo.pdf'); open(arq, 'wb').write(b'%PDF-1.4 teste')
def abrir(ctx, email):
    pg = ctx.new_page(); pg.on('pageerror', lambda e: erros.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(900)
    if not pg.locator('#email').count():
        pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email')
    pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_timeout(1500); return pg
def anexar(pg, tipo):
    pg.locator(f'.contrato-linha[data-tipo={tipo}] input[type=file]').set_input_files(arq); pg.wait_for_timeout(900)
def sem_rolagem(pg, onde):
    assert pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), f'rolagem lateral: {onde}'
def etapa(pg): return pg.locator('.faixa-progresso-txt b').first.inner_text()
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        adm = abrir(ctx, 'equipe@demo')
        # menu Contratos
        adm.get_by_role('link', name='Contratos').first.click(); expect(adm.get_by_role('heading', name='Contratos')).to_be_visible()
        adm.screenshot(path=f'{FOTOS}/contratos_lista.png', full_page=True)
        # um cliente em Conformidade
        adm.get_by_role('link', name='Clientes').first.click(); adm.wait_for_timeout(700)
        todos = [r.locator('td').first.inner_text().split('\n')[0] for r in adm.locator('table tbody tr').all()]
        adm.get_by_role('button', name=__import__('re').compile(r'^Conformidade ·')).click(); adm.wait_for_timeout(400)
        linhas = adm.locator('table tbody tr').all()
        linha = next(r for r in linhas if todos.count(r.locator('td').first.inner_text().split('\n')[0]) == 1)
        nome = linha.locator('td').first.inner_text().split('\n')[0]; print('cliente:', nome)
        linha.click(); adm.wait_for_selector('#secao-contrato')
        assert etapa(adm) == 'Conformidade', etapa(adm)
        expect(adm.locator('#secao-contrato')).to_contain_text('Preparando a minuta')
        for t in ('minuta', 'planilha_progressao'): anexar(adm, t); assert etapa(adm) == 'Conformidade'
        anexar(adm, 'carta_credito'); adm.wait_for_selector('#secao-contrato')
        assert etapa(adm) == 'Contrato', etapa(adm)
        expect(adm.locator('#secao-contrato')).to_contain_text('Aguardando a assinatura das partes')
        adm.locator('#secao-contrato').screenshot(path=f'{FOTOS}/contrato_adm_1440.png')
        # corretor (o dono do cliente): baixa a minuta e devolve assinada
        achou = None
        for email in ('corretor@demo', 'ana@demo', 'pedro@demo', 'u-c4@demo', 'u-c5@demo', 'u-c6@demo', 'u-c7@demo', 'u-c8@demo', 'doc@demo'):
            try:
                cor = abrir(ctx, email)
                cor.get_by_role('link', name='Meus clientes').first.click(); cor.wait_for_timeout(800)
                if cor.get_by_text(nome, exact=True).count(): achou = email; break
            except Exception as e: print('pulou', email, str(e)[:60])
            cor.close()
        assert achou, 'nenhum corretor com o cliente'; print('corretor:', achou)
        cor.get_by_text(nome, exact=True).first.click(); cor.wait_for_selector('#secao-contrato')
        print('etapa corretor:', etapa(cor)); assert etapa(cor) == 'Contrato'
        expect(cor.locator('#secao-contrato')).to_contain_text('Aguardando a assinatura das partes')
        expect(cor.locator('.contrato-linha[data-tipo=minuta]').get_by_role('button', name='Baixar')).to_be_visible()
        assert cor.locator('.contrato-linha[data-tipo=minuta] input[type=file]').count() == 0 or cor.locator('.contrato-linha[data-tipo=minuta] button[data-tipo]').count() == 0, 'corretor não pode anexar a minuta'
        anexar(cor, 'minuta_assinada'); cor.wait_for_selector('#secao-contrato')
        expect(cor.locator('#secao-contrato')).to_contain_text('enviar ao gerente')
        # equipe vê a mensagem na conversa e o passo seguinte
        adm2 = abrir(ctx, 'equipe@demo'); adm2.get_by_role('link', name='Clientes').first.click(); adm2.wait_for_timeout(700)
        adm2.get_by_text(nome, exact=True).first.click(); adm2.wait_for_selector('#secao-contrato')
        expect(adm2.locator('#secao-contrato')).to_contain_text('Assinada pelas partes')
        expect(adm2.get_by_text('Enviei a minuta assinada pelas partes').first).to_be_visible()
        for t in ('contrato_assinado', 'validador_assinatura'): anexar(adm2, t)
        assert etapa(adm2) == 'Contrato'
        anexar(adm2, 'procuracao_gerente'); adm2.wait_for_selector('#secao-contrato')
        assert etapa(adm2) == 'Registro', etapa(adm2)
        # corretor: recebe o aviso, baixa tudo e devolve o registro
        cor2 = abrir(ctx, achou); cor2.get_by_role('link', name='Meus clientes').first.click(); cor2.wait_for_timeout(800)
        cor2.get_by_text(nome, exact=True).first.click(); cor2.wait_for_selector('#secao-contrato')
        assert etapa(cor2) == 'Registro'
        expect(cor2.get_by_text('está assinado!').first).to_be_visible()
        for t in ('contrato_assinado', 'validador_assinatura', 'procuracao_gerente'): expect(cor2.locator(f'.contrato-linha[data-tipo={t}]').get_by_role('button', name='Baixar')).to_be_visible()
        for t in ('contrato_registrado', 'talao_rgi', 'onus_reais'): anexar(cor2, t)
        cor2.wait_for_selector('#secao-contrato'); assert etapa(cor2) == 'Conformidade final', etapa(cor2)
        cor2.screenshot(path=f'{FOTOS}/contrato_corretor_1440.png', full_page=True)
        # equipe libera o crédito
        adm3 = abrir(ctx, 'equipe@demo'); adm3.get_by_role('link', name='Clientes').first.click(); adm3.wait_for_timeout(700)
        adm3.get_by_text(nome, exact=True).first.click(); adm3.wait_for_selector('#creditoLiberado')
        assert etapa(adm3) == 'Conformidade final'
        adm3.click('#creditoLiberado'); adm3.get_by_role('button', name='Sim').click(); adm3.wait_for_timeout(900)
        assert etapa(adm3) == 'Crédito liberado', etapa(adm3)
        expect(adm3.locator('#secao-contrato')).to_contain_text('Processo finalizado')
        # celular: corretor vê o contrato sem rolagem lateral
        for email in (achou,):
            m = abrir(ctx, email); m.set_viewport_size({'width': 390, 'height': 900}); m.wait_for_timeout(600)
            m.get_by_role('link', name='Meus clientes').first.click(); m.wait_for_timeout(800)
            m.get_by_text(nome, exact=True).first.click(); m.wait_for_selector('#secao-contrato')
            m.get_by_role('link', name='Meus clientes').first.click() if False else None
            sem_rolagem(m, 'contrato celular'); m.locator('#secao-contrato').screenshot(path=f'{FOTOS}/contrato_corretor_390.png')
            m.screenshot(path=f'{FOTOS}/ficha_corretor_390.png', full_page=True)
        # painel no celular: página Contratos sem rolagem lateral
        pm = abrir(ctx, 'equipe@demo'); pm.set_viewport_size({'width': 390, 'height': 900}); pm.wait_for_timeout(600)
        pm.evaluate("location.hash = '#/painel/contratos'"); pm.wait_for_timeout(900)
        expect(pm.get_by_role('heading', name='Contratos')).to_be_visible(); sem_rolagem(pm, 'contratos celular'); pm.screenshot(path=f'{FOTOS}/contratos_lista_390.png', full_page=True)
    assert not erros, erros
    print('OK')
finally:
    srv.terminate()
