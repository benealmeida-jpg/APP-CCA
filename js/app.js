// APP CCA – Portal do Corretor: rotas e telas do corretor.
import { h, limpar, icone, toast, adicionar } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import {
  marcaRegra, aviso, legendaAsteriscos, etapas, botaoOpcao, listaDocumentos,
  avisoDocumentos, barraProgresso, dataHora, perguntarSimNao,
} from './componentes.js';
import { telaPainel } from './painel.js';

const raiz = document.getElementById('app');
let perfil = null;
let config = null;

// ---------- rotas ----------
// #/entrar  #/clientes  #/novo  #/cliente/:id  #/cliente/:id/documentos
// #/cliente/:id/cadastro/:etapa  #/painel/:secao
export function ir(rota) { location.hash = rota; }

async function rotear() {
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  try {
    perfil = await api.sessao();
  } catch (e) { toast(e.message); perfil = null; }
  if (!perfil) return mostrar(telaEntrar());
  config ||= await api.configuracao();
  const equipe = ['equipe_cca', 'admin'].includes(perfil.papel);
  const [a, b, c, d] = partes;
  try {
    if (!a) return ir(equipe ? '/painel/clientes' : '/clientes');
    if (a === 'clientes') return mostrar(await telaClientes());
    if (a === 'novo') return mostrar(telaCadastro(null, 1));
    if (a === 'cliente' && b && c === 'documentos') return mostrar(await telaDocumentos(b));
    if (a === 'cliente' && b && c === 'cadastro') return mostrar(await telaCadastroExistente(b, Number(d) || 1));
    if (a === 'cliente' && b) return mostrar(await telaFicha(b));
    if (a === 'painel' && equipe) return mostrar(await telaPainel(b || 'clientes', { perfil, config, sair }));
    ir(equipe ? '/painel/clientes' : '/clientes');
  } catch (e) {
    console.error(e);
    mostrar(h('div', { class: 'tela' }, h('div', { class: 'carregando' }, e.message, h('p', null, h('a', { href: '#/' }, 'Voltar ao início')))));
  }
}

function mostrar(el) {
  limpar(raiz);
  if (api.demo) raiz.appendChild(h('div', { class: 'faixa-demo' }, 'Modo demonstração: dados de exemplo, nada é enviado'));
  raiz.appendChild(el);
  window.scrollTo(0, 0);
}

async function sair() { await api.sair(); perfil = null; ir('/entrar'); rotear(); }

window.addEventListener('hashchange', rotear);
mostrar(h('div', { class: 'carregando' }, 'Carregando…'));
rotear();

// ---------- login ----------
function telaEntrar() {
  const email = h('input', { id: 'email', class: 'entrada', type: 'email', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', placeholder: 'seuemail@imobiliaria.com.br', required: true });
  const senha = h('input', { id: 'senha', class: 'entrada', type: 'password', autocomplete: 'current-password', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true });
  const erro = h('div', { class: 'erro-campo', role: 'alert' });
  const botao = h('button', { class: 'btn btn-primario', type: 'submit' }, 'Entrar');

  const form = h('form', { class: 'conteudo', style: { paddingBottom: '24px' }, onsubmit: async (e) => {
    e.preventDefault();
    erro.textContent = ''; botao.disabled = true; botao.textContent = 'Entrando…';
    try { await api.entrar(email.value, senha.value); ir('/'); rotear(); }
    catch (err) { erro.textContent = err.message; botao.disabled = false; botao.textContent = 'Entrar'; }
  } },
    h('div', { class: 'campo' }, h('label', { for: 'email' }, 'E-mail'), email),
    h('div', { class: 'campo' }, h('label', { for: 'senha' }, 'Senha'), senha),
    erro,
    h('button', { type: 'button', class: 'voltar', style: { alignSelf: 'flex-end', color: '#3D657C' }, onclick: async () => {
      if (!email.value) { erro.textContent = 'Digite seu e-mail para receber o link de nova senha.'; return; }
      try { await api.recuperarSenha(email.value); toast('Enviamos um link para o seu e-mail.'); } catch (err) { toast(err.message); }
    } }, 'Esqueci minha senha'),
    botao,
    api.demo ? aviso('azul', 'Demonstração: entre com ', h('b', null, 'corretor@demo'), ' ou ', h('b', null, 'equipe@demo'), ', senha ', h('b', null, 'demo'), '.') : null);

  return h('div', { class: 'tela' },
    h('div', { class: 'topo-laranja', style: { padding: '56px 28px 36px', gap: '24px' } },
      h('div', { class: 'marca-topo' },
        h('div', { class: 'monograma' }, 'AA'),
        h('div', null, h('div', { style: { fontSize: '20px', fontWeight: '700' } }, 'andrade almeida'), h('div', { style: { fontSize: '13px', fontWeight: '600' } }, 'CCA · Correspondente Caixa Aqui'))),
      h('div', null, h('h1', { style: { fontSize: '30px', fontWeight: '800', letterSpacing: '-0.6px' } }, 'Portal do Corretor'),
        h('p', { style: { margin: '8px 0 0', fontSize: '16px', lineHeight: '23px' } }, 'Cadastre clientes, envie documentos e acompanhe cada aprovação.'))),
    form,
    h('div', { style: { marginTop: 'auto', padding: '0 28px 32px', display: 'flex', gap: '8px', fontSize: '12px', lineHeight: '17px', color: '#5A646B' } },
      icone('cadeado', { tam: 16, cor: '#5A646B' }),
      h('span', null, 'Acesso individual e registrado. Os dados dos clientes são tratados conforme a LGPD. Ainda não é parceiro? Fale com a CCA pelo WhatsApp (21) 99639-4546.')));
}

// ---------- lista de clientes ----------
const estadoLista = { filtro: 'todos', busca: '' };

async function telaClientes() {
  const clientes = await api.listarClientes();
  const lista = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const filtros = [
    ['todos', 'Todos', () => true],
    ['pendencia', 'Com pendência', (c) => c.docs_pendentes > 0 || c.docs_recusados > 0],
    ['aprovados', 'Aprovados', (c) => ['cliente_aprovado', 'conformidade', 'minuta_em_maos', 'contrato_assinado'].includes(c.status)],
    ['rascunhos', 'Rascunhos', (c) => c.rascunho],
  ];
  const caixaFiltros = h('div', { class: 'pilulas', role: 'group', 'aria-label': 'Filtrar clientes' });

  const desenhar = () => {
    const termo = R.soDigitos(estadoLista.busca) || estadoLista.busca.toLowerCase().trim();
    const f = filtros.find((x) => x[0] === estadoLista.filtro)[2];
    const vis = clientes.filter(f).filter((c) => !termo || c.nome.toLowerCase().includes(termo) || R.soDigitos(c.cpf).includes(termo));
    limpar(caixaFiltros);
    filtros.forEach(([cod, nome, fn]) => caixaFiltros.appendChild(botaoOpcao(`${nome} · ${clientes.filter(fn).length}`, estadoLista.filtro === cod, () => { estadoLista.filtro = cod; desenhar(); }, 'pilula')));
    limpar(lista);
    if (!vis.length) lista.appendChild(h('div', { class: 'vazio' }, clientes.length ? 'Nenhum cliente neste filtro.' : 'Você ainda não cadastrou clientes. Toque em Novo cliente para começar.'));
    vis.forEach((c) => {
      const pend = c.docs_pendentes + c.docs_recusados;
      lista.appendChild(h('a', { class: 'item-cliente', href: c.rascunho ? `#/cliente/${c.id}/cadastro/1` : `#/cliente/${c.id}` },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px' } },
          h('div', null, h('div', { class: 'nome' }, c.nome), h('div', { class: 'meta' }, `CPF ${R.formatarCpf(c.cpf)} · ${c.programa || '—'}`)),
          icone('seta', { cor: '#5A646B' })),
        h('div', { class: 'pilulas' },
          c.rascunho ? h('span', { class: 'chip chip-pendente' }, 'Rascunho – não enviado')
            : h('span', { class: `chip chip-status${c.status_ordem >= 5 || ['cliente_aprovado', 'conformidade', 'minuta_em_maos', 'contrato_assinado'].includes(c.status) ? ' forte' : ''}` }, c.status_nome || R.nomeStatus(c.status)),
          c.docs_recusados ? h('span', { class: 'chip chip-alerta' }, `${c.docs_recusados} recusado${c.docs_recusados > 1 ? 's' : ''}`) : null,
          c.docs_pendentes ? h('span', { class: 'chip chip-alerta' }, `Falta${pend > 1 ? 'm' : ''} ${c.docs_pendentes} doc${c.docs_pendentes > 1 ? 's' : ''}`) : null)));
    });
  };

  const busca = h('input', { id: 'busca', type: 'search', placeholder: 'Buscar por nome ou CPF', value: estadoLista.busca, oninput: (e) => { estadoLista.busca = e.target.value; desenhar(); } });
  desenhar();

  return h('div', { class: 'tela' },
    h('div', { class: 'topo-laranja' },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('div', null, h('div', { class: 'subtitulo' }, perfil.nome), h('h1', { class: 'titulo' }, 'Meus clientes')),
        h('button', { class: 'btn-icone', style: { background: '#1F2A30', border: '0', borderRadius: '22px', width: '44px', height: '44px' }, 'aria-label': 'Sair', onclick: sair }, icone('sair', { cor: '#FFFFFF' }))),
      h('div', { class: 'busca' }, icone('busca', { cor: '#5A646B' }), h('label', { for: 'busca', class: 'sr' }, 'Buscar cliente'), busca)),
    h('div', { class: 'conteudo' }, caixaFiltros, lista),
    h('a', { class: 'fab', href: '#/novo' }, icone('mais', { cor: '#1F2A30', traco: 2.4 }), 'Novo cliente'),
    navInferior('clientes'));
}

function navInferior(ativo) {
  return h('nav', { class: 'nav-inferior', 'aria-label': 'Menu' },
    h('a', { href: '#/clientes', class: ativo === 'clientes' ? 'ativo' : '' }, icone('casa'), 'Início'),
    h('a', { href: '#/novo', class: ativo === 'novo' ? 'ativo' : '' }, icone('mais'), 'Novo'),
    h('button', { type: 'button', onclick: sair }, icone('sair'), 'Sair'));
}

// ---------- cadastro guiado (5 etapas) ----------
async function telaCadastroExistente(id, etapa) {
  const dados = await api.obterCliente(id);
  return telaCadastro(dados, etapa);
}

function telaCadastro(dados, etapa) {
  const cli = dados ? { ...dados.cliente } : { dependentes: 0, extras: {} };
  const outros = dados ? (dados.participantes || []).map((p) => ({ ...p })) : [];
  const titulos = { 1: 'Compradores', 2: 'Operação', 3: 'Renda e dependentes', 4: 'Documentos', 5: 'Revisão' };
  const voltarPara = etapa === 1 ? (cli.id && !cli.rascunho ? `#/cliente/${cli.id}` : '#/clientes') : `#/cliente/${cli.id}/cadastro/${etapa - 1}`;
  const conteudo = h('div', { class: 'conteudo' });
  const rodape = h('div', { class: 'rodape-fixo' });
  const erro = h('div', { class: 'erro-campo', role: 'alert' });

  const salvarEAvancar = async (botao, validar) => {
    erro.textContent = '';
    const msg = validar?.();
    if (msg) { erro.textContent = msg; erro.scrollIntoView({ block: 'center' }); return; }
    botao.disabled = true;
    try {
      if (etapa === 1 && !cli.id) {
        const existente = await api.buscarPorCpf(cli.cpf);
        if (existente) { toast('Este CPF já está cadastrado. Abrimos a ficha existente.'); return ir(`/cliente/${existente.id}`); }
      }
      const salvo = await salvarTudo();
      ir(`/cliente/${salvo.id}/cadastro/${etapa + 1}`);
    } catch (e) { erro.textContent = e.message; botao.disabled = false; }
  };

  const salvarTudo = async () => {
    cli.compoe_renda = outros.some((p) => p.papel === 'comprador');
    const salvo = await api.salvarCliente(cli);
    cli.id = salvo.id;
    if (etapa === 1 || etapa === 3) {
      // Mantém o número de quem já existe; quem é novo pega o primeiro número livre (2 a 4)
      const usados = new Set(outros.filter((p) => p.id && p.ordem).map((p) => p.ordem));
      for (const p of outros) {
        if (p.id && p.ordem) continue;
        p.ordem = [2, 3, 4].find((n) => !usados.has(n));
        usados.add(p.ordem);
      }
      const gravados = await api.salvarParticipantes(salvo.id, outros);
      outros.splice(0, outros.length, ...gravados);
    }
    return salvo;
  };

  const botoesRodape = (validar) => {
    const continuar = h('button', { class: 'btn btn-primario cheio', type: 'button' }, 'Continuar');
    continuar.onclick = () => salvarEAvancar(continuar, validar);
    const rascunho = h('button', { class: 'btn btn-secundario cheio', type: 'button', onclick: async () => {
      if (!cli.nome || !R.cpfValido(cli.cpf || '')) return toast('Preencha nome e CPF para salvar o rascunho.');
      try { await salvarTudo(); toast('Rascunho salvo. Você continua de onde parou tocando no cliente.'); ir('/clientes'); } catch (e) { toast(e.message); }
    } }, 'Salvar rascunho');
    adicionar(rodape, erro, h('div', { class: 'linha-botoes' }, rascunho, continuar));
  };

  const grupoOpcoes = (titulo, campo, valores, colunas = 2, alvo = cli, aoMudar = null) => {
    const caixa = h('div', { class: `opcoes c${colunas}` });
    const desenhar = () => {
      limpar(caixa);
      valores.forEach(([rotulo, valor]) => caixa.appendChild(botaoOpcao(rotulo, alvo[campo] === valor, () => {
        alvo[campo] = valor; erro.textContent = ''; desenhar();
        if (aoMudar) aoMudar(campo); else aoMudarOpcao?.(campo);
      })));
    };
    desenhar();
    return h('fieldset', null, h('legend', null, titulo), caixa);
  };
  let aoMudarOpcao = null;
  const op = (lista) => lista.map((v) => [v, v]);

  if (etapa === 1) {
    const campoDe = (alvo, prefixo, rotulo, chave, attrs = {}, formatar) => {
      const id = `${prefixo}${chave}`;
      const input = h('input', { id, class: 'entrada', value: formatar ? formatar(alvo[chave] || '') : (alvo[chave] || ''), ...attrs,
        oninput: (e) => { if (formatar) { e.target.value = formatar(e.target.value); } alvo[chave] = e.target.value; erro.textContent = ''; } });
      return h('div', { class: 'campo' }, h('label', { for: id }, rotulo), input);
    };
    const camposPessoa = (alvo, prefixo, cpfTravado) => [
      campoDe(alvo, prefixo, 'Nome completo', 'nome', { autocomplete: 'off' }),
      campoDe(alvo, prefixo, 'CPF', 'cpf', { inputmode: 'numeric', placeholder: '000.000.000-00', disabled: cpfTravado }, R.formatarCpf),
      campoDe(alvo, prefixo, 'Data de nascimento', 'data_nascimento', { type: 'date' }),
      campoDe(alvo, prefixo, 'Celular (WhatsApp)', 'celular', { inputmode: 'tel', placeholder: '(21) 90000-0000' }, R.formatarCelular),
      campoDe(alvo, prefixo, 'E-mail', 'email', { type: 'email', inputmode: 'email', placeholder: 'email@exemplo.com' }),
    ];
    const casado = () => ['Casado(a)', 'União estável'].includes(cli.estado_civil);
    const conjuge = () => outros.find((p) => p.conjuge_do_titular);
    const demais = () => outros.filter((p) => !p.conjuge_do_titular);
    const areaPessoas = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
    const estado = { conjugeTemRenda: conjuge() ? conjuge().papel === 'comprador' : undefined };

    const desenharPessoas = () => {
      limpar(areaPessoas);
      // Cônjuge do titular
      if (casado()) {
        let cj = conjuge();
        if (!cj) { cj = { conjuge_do_titular: true, papel: 'conjuge', estado_civil: cli.estado_civil, extras: {} }; outros.push(cj); }
        cj.estado_civil = cli.estado_civil;
        if (estado.conjugeTemRenda !== undefined) cj.papel = estado.conjugeTemRenda ? 'comprador' : 'conjuge';
        adicionar(areaPessoas, h('section', { class: 'cartao' },
          h('h2', { style: { fontSize: '17px' } }, 'Cônjuge'),
          grupoOpcoes('O cônjuge tem renda?', 'conjugeTemRenda', [['Sim', true], ['Não', false]], 2, estado, () => desenharPessoas()),
          estado.conjugeTemRenda === undefined ? null : h('div', { class: 'ajuda' }, estado.conjugeTemRenda
            ? 'Entra como 2º comprador: a renda dele(a) soma na etapa de renda.'
            : 'Entra como cônjuge: é qualificado(a) no contrato, sem compor renda.'),
          ...camposPessoa(cj, 'cj-', false)));
      } else {
        const cj = conjuge();
        if (cj) outros.splice(outros.indexOf(cj), 1);
        estado.conjugeTemRenda = undefined;
      }
      // Demais compradores
      demais().forEach((p, i) => {
        adicionar(areaPessoas, h('section', { class: 'cartao' },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            h('h2', { style: { fontSize: '17px' } }, `Comprador ${outros.indexOf(p) + 2}`),
            h('button', { type: 'button', class: 'btn btn-pequeno btn-secundario', onclick: () => { outros.splice(outros.indexOf(p), 1); desenharPessoas(); } }, 'Remover')),
          ...camposPessoa(p, `p${i}-`, false),
          grupoOpcoes('Estado civil', 'estado_civil', op(config.opcoes.estado_civil), 2, p, () => {})));
      });
      if (outros.length < 3) {
        adicionar(areaPessoas, h('button', { type: 'button', class: 'btn btn-contorno', onclick: () => { outros.push({ papel: 'comprador', conjuge_do_titular: false, extras: {} }); desenharPessoas(); } },
          icone('mais', { tam: 18 }), 'Adicionar comprador para compor renda'));
        adicionar(areaPessoas, h('div', { class: 'ajuda' }, 'Até 4 pessoas no mesmo processo. Cada uma é cadastrada no sistema da Caixa e consta no contrato.'));
      }
    };
    desenharPessoas();

    adicionar(conteudo,
      h('h2', { style: { fontSize: '17px' } }, 'Titular'),
      ...camposPessoa(cli, 'c-', !!cli.id),
      grupoOpcoes('Estado civil', 'estado_civil', op(config.opcoes.estado_civil), 2, cli, () => desenharPessoas()),
      areaPessoas,
      cli.id ? null : aviso('azul', 'Se você já cadastrou este CPF, o app abre a ficha existente em vez de criar outra.'));
    botoesRodape(() => {
      if (!cli.nome || cli.nome.trim().split(/\s+/).length < 2) return 'Digite o nome completo do titular.';
      if (!R.cpfValido(cli.cpf || '')) return 'CPF do titular inválido. Confira os números.';
      if (!cli.estado_civil) return 'Escolha o estado civil do titular.';
      if (casado() && estado.conjugeTemRenda === undefined) return 'Responda se o cônjuge tem renda.';
      const cpfs = [R.soDigitos(cli.cpf)];
      for (const p of outros) {
        const quem = p.conjuge_do_titular ? 'do cônjuge' : `do comprador ${outros.indexOf(p) + 2}`;
        if (!p.nome || p.nome.trim().split(/\s+/).length < 2) return `Digite o nome completo ${quem}.`;
        if (!R.cpfValido(p.cpf || '')) return `CPF ${quem} inválido.`;
        if (cpfs.includes(R.soDigitos(p.cpf))) return `CPF ${quem} repetido.`;
        cpfs.push(R.soDigitos(p.cpf));
        if (!p.conjuge_do_titular && !p.estado_civil) return `Escolha o estado civil ${quem}.`;
      }
      return null;
    });
  }

  if (etapa === 2) {
    // Modalidades antigas (antes da lista ser simplificada)
    const antigas = { 'Aquisição de Imóvel Novo': 'Novo', 'Aquisição de Imóvel Usado': 'Usado', 'Aquisição de Imóvel na Planta': 'Na planta' };
    if (antigas[cli.modalidade]) { cli.imovel ||= antigas[cli.modalidade]; cli.modalidade = 'Aquisição de Imóvel'; }
    const pedeImovel = () => cli.modalidade === 'Aquisição de Imóvel';
    const pedeVendedor = () => /^Aquisição/.test(cli.modalidade || '');
    const grupoImovel = grupoOpcoes('Qual imóvel?', 'imovel', op(config.opcoes.imovel), 2);
    const vendedorPj = () => pedeVendedor() && cli.vendedor === 'Construtora / PJ';
    const respostaCaixa = h('div');
    const desenharRespostaCaixa = () => {
      limpar(respostaCaixa);
      if (!vendedorPj() || cli.empreendimento_caixa === undefined || cli.empreendimento_caixa === null) return;
      respostaCaixa.appendChild(h('div', { class: 'aviso aviso-azul', style: { justifyContent: 'space-between', alignItems: 'center' } },
        h('span', null, 'Empreendimento construído com recurso da Caixa: ', h('strong', null, cli.empreendimento_caixa ? 'Sim' : 'Não')),
        h('button', { type: 'button', class: 'btn btn-pequeno btn-contorno', onclick: perguntarCaixa }, 'Alterar')));
    };
    const perguntarCaixa = async () => {
      const r = await perguntarSimNao('O empreendimento foi construído com recurso da Caixa?',
        'Isso muda a taxa de juros e, em alguns casos, o prazo de pagamento.');
      if (r !== null) cli.empreendimento_caixa = r;
      desenharRespostaCaixa();
    };
    const grupoVendedor = grupoOpcoes('Vendedor', 'vendedor', op(config.opcoes.vendedor), 2, cli, async (campo) => {
      if (vendedorPj()) await perguntarCaixa(); else { cli.empreendimento_caixa = null; desenharRespostaCaixa(); }
    });
    const ajustar = () => {
      grupoImovel.style.display = pedeImovel() ? '' : 'none';
      grupoVendedor.style.display = pedeVendedor() ? '' : 'none';
      respostaCaixa.style.display = pedeVendedor() ? '' : 'none';
    };
    desenharRespostaCaixa();
    aoMudarOpcao = (campo) => { if (campo === 'modalidade') ajustar(); };
    ajustar();
    adicionar(conteudo, 
      grupoOpcoes('Modalidade', 'modalidade', op(config.opcoes.modalidade), 1),
      h('div', { class: 'ajuda', style: { marginTop: '-6px' } }, 'Lista provisória: será conferida com o simulador da Caixa.'),
      grupoImovel,
      grupoOpcoes('Programa', 'programa', op(config.opcoes.programa), 3),
      grupoVendedor,
      respostaCaixa,
      grupoOpcoes('Vai usar FGTS?', 'usa_fgts', [['Sim', true], ['Não', false]], 2),
      aviso('azul', 'Cada resposta ajusta a lista de documentos. Você verá só o que esta operação exige.'));
    botoesRodape(() => {
      if (!cli.modalidade) return 'Escolha a modalidade.';
      if (pedeImovel() && !cli.imovel) return 'Escolha qual é o imóvel.';
      if (!cli.programa) return 'Escolha o programa.';
      if (pedeVendedor() && !cli.vendedor) return 'Escolha o vendedor.';
      if (vendedorPj() && (cli.empreendimento_caixa === undefined || cli.empreendimento_caixa === null)) { perguntarCaixa(); return 'Responda se o empreendimento foi construído com recurso da Caixa.'; }
      if (!vendedorPj()) cli.empreendimento_caixa = null;
      if (cli.usa_fgts === undefined || cli.usa_fgts === null) return 'Responda se vai usar FGTS.';
      if (!pedeImovel()) cli.imovel = null;
      if (!pedeVendedor()) cli.vendedor = null;
      return null;
    });
  }

  if (etapa === 3) {
    const comRenda = [cli, ...outros.filter((p) => p.papel === 'comprador')];
    const checagens = [];
    const caixaTotal = h('div', { class: 'aviso aviso-azul', 'aria-live': 'polite', style: { flexDirection: 'column', gap: '4px' } });
    const atualizarTotal = () => {
      if (comRenda.length < 2) return;
      const t = R.rendaDoProcesso(cli, outros, config.parametros);
      limpar(caixaTotal);
      adicionar(caixaTotal,
        h('strong', { style: { fontSize: '16px' } }, `Renda total dos compradores: ${R.formatarMoeda(t.considerada)}`),
        h('span', { style: { fontSize: '13px' } }, t.porPessoa.map((p) => `${R.primeiroNome(p.nome) || 'Comprador'}: ${R.formatarMoeda(p.considerada)}`).join(' + ')),
        t.considerada !== t.bruta ? h('span', { style: { fontSize: '13px' } }, `Valor aceito pela Caixa, já com o corte da renda informal sem IR. Renda informada: ${R.formatarMoeda(t.bruta)}.`) : null);
    };
    const blocoRenda = (alvo, prefixo, titulo) => {
      const caixa = h('section', { class: comRenda.length > 1 ? 'cartao' : '', style: { display: 'flex', flexDirection: 'column', gap: '14px' } });
      const campoMoeda = (sufixo, rotulo, chave, ajuda) => {
        const id = `${prefixo}${sufixo}`;
        const input = h('input', { id, class: 'entrada', inputmode: 'numeric', placeholder: 'R$ 0,00',
          value: alvo[chave] ? R.formatarMoeda(alvo[chave]) : '',
          oninput: (e) => { alvo[chave] = R.lerMoeda(e.target.value); e.target.value = alvo[chave] === null ? '' : R.formatarMoeda(alvo[chave]); erro.textContent = ''; atualizar(); } });
        return h('div', { class: 'campo' }, h('label', { for: id }, rotulo), input, ajuda ? h('span', { class: 'ajuda' }, ajuda) : null);
      };
      const total = h('div', { class: 'ajuda', style: { fontWeight: '700', color: '#26323A' } });
      const blocoUnica = campoMoeda('renda', 'Renda bruta mensal', 'renda_bruta', 'Valor antes dos descontos.');
      const blocoMista = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        campoMoeda('renda-formal', 'Renda formal (bruta mensal)', 'renda_formal', 'Com carteira assinada, aposentadoria ou pró-labore.'),
        campoMoeda('renda-informal', 'Renda informal (média mensal)', 'renda_informal', 'Trabalho sem registro, comprovado por extrato ou declaração.'),
        total);
      const avisoProLabore = aviso('azul', 'Empresário: a Caixa exige a DEFIS dos últimos 2 anos da empresa. Os campos aparecem na etapa de documentos.');
      const avisoIr = h('div');
      const aoMudar = (campo) => { if (campo === 'declara_ir' && !alvo.declara_ir) alvo.ir_retificado = null; atualizar(); };
      const grupoRetificacao = grupoOpcoes('Houve retificação do IR?', 'ir_retificado', [['Sim', true], ['Não', false]], 2, alvo, aoMudar);
      const atualizar = () => {
        const mista = alvo.tipo_renda === 'Mista';
        if (mista) {
          alvo.renda_bruta = (alvo.renda_formal || 0) + (alvo.renda_informal || 0) || null;
          total.textContent = alvo.renda_bruta ? `Renda bruta total: ${R.formatarMoeda(alvo.renda_bruta)}` : '';
        }
        blocoUnica.style.display = mista ? 'none' : '';
        blocoMista.style.display = mista ? '' : 'none';
        avisoProLabore.style.display = alvo.tipo_renda === 'Pró-labore' ? '' : 'none';
        grupoRetificacao.style.display = alvo.declara_ir ? '' : 'none';
        limpar(avisoIr);
        if (!alvo.tipo_renda || alvo.declara_ir === undefined || alvo.declara_ir === null) { atualizarTotal(); return; }
        const a = R.analisarRenda(alvo, config.parametros);
        alvo.renda_considerada = a.total ? a.considerada : null;
        atualizarTotal();
        const limite = R.formatarMoeda(a.limiteMensal);
        if (a.corte) {
          avisoIr.appendChild(aviso('laranja', h('strong', null, 'Renda informal limitada. '),
            `A renda informal passa do limite de isenção do IR (${limite} por mês) e não houve declaração de IR. A Caixa considera no máximo ${R.formatarMoeda(a.teto)} de renda informal. `,
            h('strong', null, `Renda considerada: ${R.formatarMoeda(a.considerada)}.`)));
        } else if (a.irObrigatorioSemIr) {
          avisoIr.appendChild(aviso('laranja', h('strong', null, 'Declaração de IR obrigatória. '),
            `A renda passa do limite de isenção (${limite} por mês). A Caixa exige a declaração de IR entregue no prazo da Receita Federal.`));
        } else if (a.acimaLimite && alvo.declara_ir) {
          avisoIr.appendChild(aviso('azul', `A declaração precisa ter sido entregue no prazo da Receita (até ${R.formatarData(a.prazo)}). IR entregue depois do prazo não é aceito pela Caixa.`));
        }
      };
      adicionar(caixa,
        titulo ? h('h2', { style: { fontSize: '17px' } }, titulo) : null,
        grupoOpcoes('Tipo de renda', 'tipo_renda', op(config.opcoes.tipo_renda), 2, alvo, aoMudar),
        avisoProLabore, blocoUnica, blocoMista,
        grupoOpcoes(alvo === cli ? 'O cliente declara Imposto de Renda?' : 'Declara Imposto de Renda?', 'declara_ir', [['Sim', true], ['Não', false]], 2, alvo, aoMudar),
        grupoRetificacao, avisoIr);
      atualizar();
      checagens.push(() => {
        const quem = comRenda.length > 1 ? ` de ${R.primeiroNome(alvo.nome)}` : '';
        if (!alvo.tipo_renda) return `Escolha o tipo de renda${quem}.`;
        if (alvo.tipo_renda === 'Mista') {
          if (!alvo.renda_formal) return `Informe a renda formal${quem}.`;
          if (!alvo.renda_informal) return `Informe a renda informal${quem}.`;
        } else {
          if (!alvo.renda_bruta) return `Informe a renda bruta mensal${quem}.`;
          alvo.renda_formal = null; alvo.renda_informal = null;
        }
        if (alvo.declara_ir === undefined || alvo.declara_ir === null) return `Responda se${quem ? ` ${R.primeiroNome(alvo.nome)}` : ' o cliente'} declara Imposto de Renda.`;
        if (alvo.declara_ir && (alvo.ir_retificado === undefined || alvo.ir_retificado === null)) return `Responda se houve retificação do IR${quem}.`;
        atualizar();
        return null;
      });
      return caixa;
    };

    const qtd = h('output', null, String(cli.dependentes || 0));
    const contador = h('div', { class: 'contador' }, h('span', { style: { fontWeight: '600' } }, 'Quantos dependentes?'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        h('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Diminuir', onclick: () => { cli.dependentes = Math.max(0, (cli.dependentes || 0) - 1); qtd.textContent = cli.dependentes; } }, '−'),
        qtd,
        h('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Aumentar', onclick: () => { cli.dependentes = (cli.dependentes || 0) + 1; qtd.textContent = cli.dependentes; } }, '+')));
    cli._temDep = cli._temDep ?? (cli.dependentes > 0 ? true : cli.id && cli.tipo_renda ? false : undefined);
    contador.style.display = cli._temDep ? '' : 'none';
    const aoMudarDep = () => {
      if (!cli._temDep) { cli.dependentes = 0; qtd.textContent = '0'; } else if (!cli.dependentes) { cli.dependentes = 1; qtd.textContent = '1'; }
      contador.style.display = cli._temDep ? '' : 'none';
    };

    adicionar(conteudo,
      ...comRenda.map((p, i) => blocoRenda(p, i === 0 ? 'c-' : `r${i}-`, comRenda.length > 1 ? `Renda de ${p.nome || 'comprador'}${i === 0 ? ' (titular)' : ''}` : null)),
      comRenda.length > 1 ? caixaTotal : null,
      grupoOpcoes('Tem dependente?', '_temDep', [['Sim', true], ['Não', false]], 2, cli, aoMudarDep),
      contador);
    botoesRodape(() => {
      for (const c of checagens) { const m = c(); if (m) return m; }
      if (cli._temDep === undefined) return 'Responda se tem dependente.';
      delete cli._temDep;
      return null;
    });
  }

  if (etapa === 4) {
    adicionar(conteudo, avisoDocumentos(dados.necessarios) || aviso('azul', 'Todos os documentos foram anexados.'), legendaAsteriscos(),
      ...listaDocumentos({ clienteId: cli.id, necessarios: dados.necessarios, aoMudar: rotear }));
    adicionar(rodape, ...barraProgresso(dados.necessarios),
      h('a', { class: 'btn btn-primario', href: `#/cliente/${cli.id}/cadastro/5` }, 'Continuar'));
  }

  if (etapa === 5) {
    const bloco = (titulo, etapaEditar, itens) => h('section', { class: 'cartao' },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('h2', { style: { fontSize: '16px' } }, titulo), h('a', { href: `#/cliente/${cli.id}/cadastro/${etapaEditar}` }, 'Editar')),
      h('dl', { class: 'resumo' }, itens.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v ?? '—')])));
    const sn = (v) => (v === true ? 'Sim' : v === false ? 'Não' : '—');
    const r = R.resumoDocumentos(dados.necessarios);
    const lgpd = h('input', { type: 'checkbox', id: 'lgpd', checked: !!cli.autorizacao_lgpd_em, style: { width: '22px', height: '22px', accentColor: '#3D657C', margin: '0', flexShrink: '0' } });
    adicionar(conteudo, 
      outros.length ? bloco('Compradores', 1, [[`${cli.nome}`, 'Titular'], ...outros.map((p) => [p.nome, p.papel === 'conjuge' ? 'Cônjuge (sem renda)' : `${p.conjuge_do_titular ? 'Cônjuge, ' : ''}compõe renda: ${R.formatarMoeda(p.renda_bruta) || '—'}`])]) : null,
      bloco('Titular', 1, [['Nome', cli.nome], ['CPF', R.formatarCpf(cli.cpf)], ['Nascimento', cli.data_nascimento ? cli.data_nascimento.split('-').reverse().join('/') : null], ['Estado civil', cli.estado_civil], ['Celular', cli.celular ? R.formatarCelular(cli.celular) : null], ['E-mail', cli.email]]),
      bloco('Operação', 2, [['Modalidade', cli.modalidade], ['Programa', cli.programa], ['Imóvel', cli.imovel], ['Vendedor', cli.vendedor], ...(cli.vendedor === 'Construtora / PJ' ? [['Recurso Caixa', cli.empreendimento_caixa ? 'Sim, construído com recurso da Caixa' : 'Não']] : []), ['FGTS', cli.usa_fgts ? 'Vai usar' : 'Não vai usar']]),
      outros.some((p) => p.papel === 'comprador') ? (() => { const t = R.rendaDoProcesso(cli, outros, config.parametros); return bloco('Renda total dos compradores', 3, [...t.porPessoa.map((p) => [p.nome || 'Comprador', R.formatarMoeda(p.considerada)]), ['Total aceito pela Caixa', R.formatarMoeda(t.considerada)], ...(t.considerada !== t.bruta ? [['Renda informada', `${R.formatarMoeda(t.bruta)} (antes do corte)`]] : [])]); })() : null,
      bloco('Renda e dependentes', 3, [['Tipo de renda', cli.tipo_renda], ...(cli.tipo_renda === 'Mista' ? [['Renda formal', R.formatarMoeda(cli.renda_formal)], ['Renda informal', R.formatarMoeda(cli.renda_informal)]] : []), ['Renda bruta', R.formatarMoeda(cli.renda_bruta)], ...(cli.renda_considerada && Number(cli.renda_considerada) !== Number(cli.renda_bruta) ? [['Renda considerada', `${R.formatarMoeda(cli.renda_considerada)} (sem IR)`]] : []), ['Compõe renda', sn(cli.compoe_renda)], ['Declara IR', sn(cli.declara_ir)], ...(cli.declara_ir ? [['IR retificado', sn(cli.ir_retificado)]] : []), ['Dependentes', String(cli.dependentes || 0)]]),
      h('section', { class: 'cartao' },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, h('h2', { style: { fontSize: '16px' } }, 'Documentos'), h('a', { href: `#/cliente/${cli.id}/cadastro/4` }, 'Editar')),
        h('div', { style: { fontSize: '14px' } }, `${r.enviados} de ${r.total} enviados`),
        avisoDocumentos(dados.necessarios)),
      h('label', { for: 'lgpd', style: { display: 'flex', gap: '12px', alignItems: 'flex-start', fontSize: '14px', lineHeight: '20px' } }, lgpd,
        h('span', null, 'Confirmo que o cliente autorizou o envio dos dados e documentos dele à Andrade Almeida CCA para análise de crédito.')));
    const enviar = h('button', { class: 'btn btn-primario', type: 'button' }, cli.rascunho ? 'Enviar para a CCA' : 'Salvar alterações');
    enviar.onclick = async () => {
      erro.textContent = '';
      if (!lgpd.checked) { erro.textContent = 'Marque a confirmação de autorização do cliente.'; return; }
      enviar.disabled = true; enviar.textContent = 'Enviando…';
      try {
        cli.autorizacao_lgpd_em ||= new Date().toISOString();
        await api.salvarCliente(cli);
        await api.enviarCadastro(cli.id);
        toast(cli.rascunho ? 'Cadastro enviado! Você recebe a confirmação no WhatsApp.' : 'Alterações salvas');
        ir(`/cliente/${cli.id}`);
      } catch (e) { erro.textContent = e.message; enviar.disabled = false; enviar.textContent = 'Enviar para a CCA'; }
    };
    adicionar(rodape, erro, enviar, h('div', { class: 'ajuda', style: { textAlign: 'center' } }, 'Você recebe a confirmação e os avisos no WhatsApp.'));
  }

  return h('div', { class: 'tela' },
    h('div', { class: 'topo-branco' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        h('a', { href: voltarPara, class: 'voltar', 'aria-label': 'Voltar', style: { width: '44px', justifyContent: 'center', marginLeft: '-12px' } }, icone('voltar', { tam: 22, traco: 2.2 })),
        h('div', null,
          h('div', { class: 'subtitulo' }, cli.nome && etapa > 1 ? `${cli.nome} · Etapa ${etapa} de 5` : `Novo cliente · Etapa ${etapa} de 5`),
          h('h1', { style: { fontSize: '21px', fontWeight: '800' } }, titulos[etapa]))),
      ...etapas(etapa)),
    conteudo, rodape);
}

// ---------- documentos (depois do envio) ----------
async function telaDocumentos(id) {
  const { cliente, necessarios } = await api.obterCliente(id);
  return h('div', { class: 'tela' },
    h('div', { class: 'topo-branco' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        h('a', { href: `#/cliente/${id}`, class: 'voltar', 'aria-label': 'Voltar', style: { width: '44px', justifyContent: 'center', marginLeft: '-12px' } }, icone('voltar', { tam: 22, traco: 2.2 })),
        h('div', null, h('div', { class: 'subtitulo' }, `${cliente.nome} · CPF ${R.formatarCpf(cliente.cpf)}`), h('h1', { style: { fontSize: '21px', fontWeight: '800' } }, 'Documentos'))),
      h('div', { class: 'pilulas' }, [cliente.programa, cliente.imovel && `Imóvel ${cliente.imovel.toLowerCase()}`, cliente.vendedor, cliente.usa_fgts ? 'Com FGTS' : null].filter(Boolean)
        .map((t) => h('span', { class: 'chip chip-em_conferencia' }, t)))),
    h('div', { class: 'conteudo' },
      avisoDocumentos(necessarios) || aviso('azul', 'Todos os documentos foram enviados.'),
      legendaAsteriscos(),
      ...listaDocumentos({ clienteId: id, necessarios, aoMudar: rotear }),
      h('div', { class: 'legenda', style: { flexDirection: 'row', gap: '8px' } }, icone('historico', { tam: 16, cor: '#5A646B' }),
        h('span', null, 'Ao substituir, a versão anterior fica guardada no histórico da pasta do cliente. Você pode trocar até documentos já aceitos, se receber uma cópia melhor.'))),
    h('div', { class: 'rodape-fixo' }, ...barraProgresso(necessarios)));
}

// ---------- ficha do cliente ----------
async function telaFicha(id) {
  const { cliente, necessarios, historico, mensagens, participantes = [] } = await api.obterCliente(id);
  const r = R.resumoDocumentos(necessarios);
  const atualIdx = config.status.findIndex((s) => s.codigo === cliente.status);
  const dataDe = (cod) => historico.filter((x) => x.para === cod).map((x) => x.em).pop();
  const parado = r.faltando_obrigatorio.length > 0;

  return h('div', { class: 'tela' },
    h('div', { class: 'topo-laranja' },
      h('a', { href: '#/clientes', class: 'voltar' }, icone('voltar', { tam: 18, traco: 2.4 }), 'Meus clientes'),
      h('h1', { class: 'titulo' }, cliente.nome),
      h('div', { style: { fontSize: '14px', fontWeight: '600' } }, `CPF ${R.formatarCpf(cliente.cpf)} · ${[cliente.programa, cliente.modalidade, cliente.imovel].filter(Boolean).join(' · ')}`),
      participantes.length ? h('div', { style: { fontSize: '14px' } }, `Com ${participantes.map((p) => `${p.nome} (${p.papel === 'conjuge' ? 'cônjuge' : 'comprador'})`).join(', ')}`) : null),
    h('div', { class: 'conteudo', style: { paddingBottom: '110px' } },
      cliente.rascunho ? aviso('laranja', h('strong', null, 'Rascunho: '), 'este cadastro ainda não foi enviado. ', h('a', { href: `#/cliente/${id}/cadastro/1` }, 'Continuar cadastro')) : null,
      !cliente.rascunho && (parado || r.recusado) ? aviso('laranja', h('strong', null, parado ? 'Processo parado. ' : 'Atenção. '),
        [parado ? `Falta ${r.faltando_obrigatorio.map((n) => n.rotulo).join(', ')} (**)` : null, r.recusado ? `${r.recusado} documento recusado` : null].filter(Boolean).join(' e '), '.',
        parado ? ' Sem ele, o processo não vai para análise.' : '') : null,
      h('section', { class: 'cartao' },
        h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('h2', { style: { fontSize: '16px' } }, 'Documentos'), h('span', { class: 'subtitulo' }, `${r.enviados} de ${r.total} enviados`)),
        h('div', { class: 'placar' },
          h('div', { style: { background: '#3D657C', color: '#fff' } }, h('b', null, r.aceito), h('span', null, 'Aceitos')),
          h('div', { style: { background: '#E3ECF1', color: '#2C4B5D' } }, h('b', null, r.em_conferencia), h('span', null, 'Conferência')),
          h('div', { style: { background: '#8A4E12', color: '#fff' } }, h('b', null, r.recusado), h('span', null, 'Recusado')),
          h('div', { style: { border: '1px dashed #B8732A', color: '#6E3D0C' } }, h('b', null, r.pendente), h('span', null, 'Pendentes'))),
        h('a', { class: 'btn btn-primario', href: `#/cliente/${id}/documentos` }, 'Ver, anexar e substituir documentos')),
      cliente.rascunho ? null : h('section', { class: 'cartao' },
        h('h2', { style: { fontSize: '16px' } }, 'Andamento'),
        h('ol', { class: 'andamento' }, config.status.map((s, i) => h('li', { class: i < atualIdx ? 'feito' : i === atualIdx ? 'agora' : '' },
          h('span', { class: 'ponto' }), s.nome, h('span', { class: 'data' }, i <= atualIdx ? dataHora(dataDe(s.codigo)) : ''))))),
      h('section', { class: 'cartao' },
        h('h2', { style: { fontSize: '16px' } }, 'Avisos enviados no seu WhatsApp'),
        mensagens.length ? mensagens.slice(0, 8).map((m) => h('div', { style: { display: 'flex', gap: '10px', fontSize: '14px', lineHeight: '19px' } },
          icone('conversa', { tam: 18, cor: '#3D657C' }),
          h('span', { style: { whiteSpace: 'pre-line' } }, m.texto.replace(/\n— Andrade Almeida CCA$/, ''), ' ', h('span', { class: 'subtitulo' }, `· ${dataHora(m.criada_em)}`))))
          : h('div', { class: 'subtitulo' }, 'Nenhum aviso ainda.')),
      h('a', { href: `#/cliente/${id}/cadastro/1`, class: 'btn btn-secundario' }, 'Ver ou editar dados do cadastro')),
    navInferior(''));
}
