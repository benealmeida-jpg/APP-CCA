"""Convites por link: ADM e Usuário geram convite; corretor e imobiliária aceitam e entram (modo demonstração)."""
import subprocess, sys, time, re
from playwright.sync_api import sync_playwright, expect
import tempfile; S=tempfile.mkdtemp() + '/'
B='http://127.0.0.1:8769/index.html?demo'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8769', '--bind', '127.0.0.1'], cwd=__import__('os').path.dirname(__import__('os').path.dirname(__import__('os').path.abspath(__file__))), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); erros=[]
def entrar(pg, email):
    pg.goto(B+'#/entrar'); pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]')
    expect(pg.get_by_role('heading', name='Clientes', exact=True)).to_be_visible()
def gerar(pg, tipo, nome, whats, imob=None):
    pg.goto(B+'#/painel/convites')
    expect(pg.get_by_role('heading', name='Convidar', exact=True)).to_be_visible()
    pg.get_by_role('group', name='Quem você vai convidar').get_by_role('button', name=tipo, exact=True).click()
    if imob: pg.select_option('#cvl-imob', label=imob)
    pg.fill('#cvl-nome', nome); pg.fill('#cvl-whats', whats)
    pg.get_by_role('button', name='Gerar convite').click()
    expect(pg.get_by_text('Convite gerado. Mande pelo WhatsApp.')).to_be_visible()
    txt = pg.locator('.balao').last.inner_text()
    return re.search(r'(http\S+)', txt).group(1)
try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
    ctx = b.new_context(viewport={'width': 1440, 'height': 1000}); pg = ctx.new_page()
    pg.on('pageerror', lambda e: erros.append(str(e)))
    entrar(pg, 'equipe@demo')
    expect(pg.locator('.menu-botoes').get_by_role('link', name='Convidar')).to_be_visible()
    grupo = pg.get_by_role('group', name='Quem você vai convidar') if False else None
    pg.goto(B+'#/painel/convites'); time.sleep(0.5)
    rot = pg.get_by_role('group', name='Quem você vai convidar').get_by_role('button').all_inner_texts()
    print('ADM pode convidar:', rot)
    pg.screenshot(path=S+'cv-1-pagina.png', full_page=True)
    link_cor = gerar(pg, 'Corretor', 'Marcos Paulo Dias', '21966665555', 'Imobiliária Exemplo')
    link_imo = gerar(pg, 'Imobiliária', 'Renata Gomes', '21955554444')
    pg.screenshot(path=S+'cv-2-gerado.png', full_page=True)
    # Corretor aceita (sem login, mesmo navegador -> sair antes)
    pg.goto(B+'#/painel/clientes'); pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); time.sleep(0.8); time.sleep(0.5)
    pg.goto(link_cor); expect(pg.get_by_text('Você foi convidado(a) como corretor da Imobiliária Exemplo', exact=False)).to_be_visible()
    expect(pg.locator('#cv-nome')).to_have_value('Marcos Paulo Dias')
    pg.fill('#cv-email', 'marcos@teste.com'); pg.fill('#cv-senha', 'senha1234'); pg.fill('#cv-senha2', 'senha1234')
    pg.screenshot(path=S+'cv-3-aceitar-corretor.png', full_page=True)
    pg.get_by_role('button', name='Criar meu acesso').click()
    expect(pg.get_by_role('heading', name='Meus clientes')).to_be_visible()
    print('corretor entrou: ok')
    # link usado de novo
    pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); time.sleep(0.8); time.sleep(0.5)
    pg.goto(link_cor); expect(pg.get_by_text('Este convite já foi usado', exact=False)).to_be_visible()
    # Imobiliária aceita
    pg.goto(link_imo); expect(pg.get_by_text('para cadastrar a sua imobiliária', exact=False)).to_be_visible()
    pg.fill('#cv-cnpj', '11222333000181'); expect(pg.get_by_text('IMOBILIARIA EXEMPLO LTDA')).to_be_visible()
    pg.fill('#cv-imob-nome', 'Renata Imóveis')
    pg.fill('#cv-email', 'renata@teste.com'); pg.fill('#cv-senha', 'senha1234'); pg.fill('#cv-senha2', 'senha1234')
    pg.screenshot(path=S+'cv-4-aceitar-imob.png', full_page=True)
    pg.get_by_role('button', name='Criar meu acesso').click()
    expect(pg.get_by_role('heading', name='Meus clientes')).to_be_visible()
    print('imobiliária entrou: ok')
    pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); time.sleep(0.8); time.sleep(0.5)
    # Usuário (gabriel) só corretor/imobiliária
    entrar(pg, 'gabriel@demo')
    pg.goto(B+'#/painel/convites'); time.sleep(0.5)
    print('Usuário pode convidar:', pg.get_by_role('group', name='Quem você vai convidar').get_by_role('button').all_inner_texts())
    pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); time.sleep(0.8); time.sleep(0.5)
    # Corretores: lista antes do cadastro manual; lista de convites
    entrar(pg, 'equipe@demo')
    pg.goto(B+'#/painel/corretores'); time.sleep(0.5)
    pg.get_by_role('button', name='Cadastrar novo corretor').click()
    tab_y = pg.locator('table').bounding_box()['y']; form_y = pg.get_by_role('heading', name='Dados do novo corretor').bounding_box()['y']
    print('lista antes do cadastro manual:', tab_y < form_y)
    expect(pg.get_by_text('Marcos Paulo Dias')).to_be_visible()
    pg.screenshot(path=S+'cv-5-corretores.png', full_page=True)
    pg.goto(B+'#/painel/config'); time.sleep(0.5)
    print('checkbox convidar_equipe do Gabriel marcado?', pg.locator('input[id$="-convidar_equipe"]').first.is_checked())
    pg.goto(B+'#/painel/convites'); time.sleep(0.5)
    pg.screenshot(path=S+'cv-6-lista.png', full_page=True)
    print('ERROS', erros)
finally: srv.terminate()
