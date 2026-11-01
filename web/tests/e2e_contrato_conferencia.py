"""Assinatura do contrato: gerentes e procurações em Configurações; conferência da CCA (tipo, gerente, assinaturas lidas do PDF,
itens conferidos) e liberação. Antes de liberar, o corretor não vê contrato, procuração e validador."""
import os, sys, subprocess, time, tempfile
from playwright.sync_api import sync_playwright, expect
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(SAIDA, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8817', '--bind', '127.0.0.1'], cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
URL = 'http://127.0.0.1:8817/index.html?demo2'
erros = []
def entrar(pg, email):
    pg.goto(URL + '#/entrar'); pg.wait_for_timeout(700)
    if not pg.locator('#email').count():
        pg.click('.usuario-botao'); pg.get_by_role('menuitem', name='Sair').click(); pg.wait_for_selector('#email'); pg.wait_for_timeout(300)
    pg.fill('#email', email); pg.fill('#senha', 'demo'); pg.click('button[type=submit]'); pg.wait_for_selector('.menu-botoes > a', timeout=10000); pg.wait_for_timeout(600)

# PDF de teste com assinaturas digitais (CN dos certificados), igual ao teste de regras
GERA_PDF = """(nomes) => {
  const enc = new TextEncoder();
  const cn = (t) => { const b = enc.encode(t); return [0x30, b.length + 7, 0x06, 0x03, 0x55, 0x04, 0x03, 0x0c, b.length, ...b]; };
  const der = [...new Array(300).fill(0x30), ...nomes.flatMap(cn), ...cn('AC Final do Governo Federal do Brasil v1')];
  const hex = der.map((x) => x.toString(16).padStart(2, '0')).join('').padEnd(1200, '0');
  return `%PDF-1.7\\n1 0 obj\\n<< /Type /Sig /Filter /Adobe.PPKLite /ByteRange [0 100 200 300] /Contents <${hex}> >>\\nendobj\\n%%EOF`;
}"""
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome') if os.path.exists('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') else p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 1000}); pg = ctx.new_page()
        pg.on('pageerror', lambda e: erros.append(str(e)))
        entrar(pg, 'equipe@demo')

        # 1) Configurações: gerentes e procurações
        pg.evaluate("location.hash = '#/painel/config'"); pg.wait_for_selector('#secao-gerentes', timeout=10000)
        sec = pg.locator('#secao-gerentes')
        expect(sec).to_contain_text('Gerson Melo'); expect(sec).to_contain_text('Válida até 30/06/2027')
        pg.fill('#ger-nome', 'Ana Teste Gerente'); pg.fill('#ger-cpf', '52998224725'); pg.fill('#ger-agencia', '0001'); pg.click('#ger-salvar'); pg.wait_for_timeout(900)
        expect(sec).to_contain_text('Ana Teste Gerente'); expect(sec).to_contain_text('Sem procuração anexada')
        sec.screenshot(path=f'{SAIDA}/contrato_gerentes_config.png')

        # 2) Cliente na etapa Contrato, com minuta e minuta assinada
        cid = pg.evaluate("""async () => { const m = await import('./js/api.js'); const c = (await m.api.listarClientes()).filter((x) => !x.rascunho && x.corretor_id === 'u-corretor').sort((a, b) => Number(!!b.vendedor_id) - Number(!!a.vendedor_id))[0]; return c.id; }""")
        pg.evaluate(f"""() => {{ const k = 'appcca-demo2-v4'; const d = JSON.parse(localStorage.getItem(k)); d.clientes.find((c) => c.id === '{cid}').status = 'minuta_em_maos'; localStorage.setItem(k, JSON.stringify(d)); }}""")
        pg.reload(); pg.wait_for_timeout(1500)
        pg.evaluate(f"""async () => {{
          const m = await import('./js/api.js'); const CC = await import('./js/contrato-conferencia-dados.js');
          const dados = await m.api.obterCliente('{cid}');
          const nomes = CC.assinantesEsperados({{ cliente: dados.cliente, participantes: dados.participantes, vendedor: dados.vendedor, gerente: {{ nome: 'Gerson Melo' }} }}).filter((x) => !x.indefinido).map((x) => x.nome.toUpperCase());
          const pdf = ({GERA_PDF})(nomes);
          const arq = (n, txt) => new File([txt], n, {{ type: 'application/pdf' }});
          await m.api.enviarContratoArquivo('{cid}', 'minuta', arq('minuta.pdf', '%PDF-1.4'));
          await m.api.enviarContratoArquivo('{cid}', 'minuta_assinada', arq('minuta_assinada.pdf', '%PDF-1.4'));
          await m.api.enviarContratoArquivo('{cid}', 'contrato_assinado', arq('contrato_assinado.pdf', pdf));
          await m.api.enviarContratoArquivo('{cid}', 'validador_assinatura', arq('relatorio_iti.pdf', '%PDF-1.4'));
        }}""")
        st = pg.evaluate(f"(async () => {{ const m = await import('./js/api.js'); return (await m.api.obterCliente('{cid}')).cliente.status; }})()")
        assert st == 'minuta_em_maos', f'anexar não pode liberar sozinho: {st}'

        # 3) Conferência no painel
        pg.evaluate(f"location.hash = '#/painel/clientes/{cid}'"); pg.wait_for_selector('#secao-conferencia-contrato', timeout=10000); pg.wait_for_timeout(800)
        conf = pg.locator('#secao-conferencia-contrato')
        expect(conf.locator('#cc-liberar')).to_be_disabled()
        conf.get_by_role('button', name='NATO Digital').click(); pg.wait_for_timeout(500)
        pg.select_option('#cc-gerente', label='Gerson Melo · ag. 1234 – Itaboraí'); pg.wait_for_timeout(1800)
        conf = pg.locator('#secao-conferencia-contrato')
        expect(conf).to_contain_text('vinculada a este contrato')
        expect(conf.locator('#cc-assinaturas')).to_contain_text('assinaturas esperadas estão no PDF', timeout=8000)
        conf.screenshot(path=f'{SAIDA}/contrato_conferencia_antes.png')

        # Corretor ainda não vê contrato, procuração e validador
        entrar(pg, 'corretor@demo')
        tipos = pg.evaluate(f"(async () => {{ const m = await import('./js/api.js'); return (await m.api.listarContratoArquivos('{cid}')).map((a) => a.tipo); }})()")
        assert 'contrato_assinado' not in tipos and 'procuracao_gerente' not in tipos, tipos
        pg.evaluate(f"location.hash = '#/cliente/{cid}'"); pg.wait_for_timeout(1500)
        expect(pg.get_by_text('conferindo o contrato assinado', exact=False).first).to_be_visible()

        # 4) CCA marca os itens e libera
        entrar(pg, 'equipe@demo')
        pg.evaluate(f"location.hash = '#/painel/clientes/{cid}'"); pg.wait_for_selector('#secao-conferencia-contrato', timeout=10000); pg.wait_for_timeout(800)
        for item in ['comprador', 'vendedor', 'imovel', 'gerente', 'campos_assinatura', 'assinaturas']:
            pg.locator(f'#cc-item-{item}').check(); pg.wait_for_timeout(250)
        conf = pg.locator('#secao-conferencia-contrato')
        expect(conf).to_contain_text('Só depende de você liberar')
        expect(conf.locator('#cc-liberar')).to_be_enabled()
        conf.screenshot(path=f'{SAIDA}/contrato_conferencia_pronto.png')
        conf.locator('#cc-liberar').click(); pg.get_by_role('dialog').get_by_role('button', name='Sim').click(); pg.wait_for_timeout(1200)
        st = pg.evaluate(f"(async () => {{ const m = await import('./js/api.js'); return (await m.api.obterCliente('{cid}')).cliente.status; }})()")
        assert st == 'registro_cartorio', st

        # 5) Corretor agora baixa
        entrar(pg, 'corretor@demo')
        tipos = pg.evaluate(f"(async () => {{ const m = await import('./js/api.js'); return (await m.api.listarContratoArquivos('{cid}')).map((a) => a.tipo); }})()")
        assert 'procuracao_gerente' in tipos and 'contrato_assinado' in tipos, tipos

        # Celular: tela da conferência (outro cliente) para conferir o layout
        entrar(pg, 'equipe@demo')
        cel = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2); pc = cel.new_page(); pc.on('pageerror', lambda e: erros.append(str(e)))
        entrar(pc, 'equipe@demo')
        cid2 = pc.evaluate("""async () => { const m = await import('./js/api.js'); const c = (await m.api.listarClientes()).filter((x) => !x.rascunho && x.status !== 'registro_cartorio')[1]; return c.id; }""")
        pc.evaluate(f"""async () => {{ const k = 'appcca-demo2-v4'; const d = JSON.parse(localStorage.getItem(k)); d.clientes.find((c) => c.id === '{cid2}').status = 'minuta_em_maos'; localStorage.setItem(k, JSON.stringify(d)); }}""")
        pc.reload(); pc.wait_for_timeout(1200)
        pc.evaluate(f"""async () => {{ const m = await import('./js/api.js'); await m.api.enviarContratoArquivo('{cid2}', 'minuta', new File(['%PDF-1.4'], 'minuta.pdf', {{ type: 'application/pdf' }})); }}""")
        pc.evaluate(f"location.hash = '#/painel/clientes/{cid2}'"); pc.wait_for_selector('#secao-conferencia-contrato', timeout=10000); pc.wait_for_timeout(800)
        pc.locator('#secao-conferencia-contrato').screenshot(path=f'{SAIDA}/contrato_conferencia_celular.png')
        larg = pc.evaluate("document.documentElement.scrollWidth")
        assert larg <= 392, f'rolagem lateral no celular: {larg}'
        b.close()
    assert not erros, erros
    print('OK – conferência e liberação do contrato. Fotos em', SAIDA)
finally:
    srv.terminate()
