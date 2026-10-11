// APP CCA – Portal do Corretor: rotas e telas do corretor.
import { h, limpar, icone, toast, adicionar } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import {
  marcaRegra, aviso, legendaAsteriscos, etapas, botaoOpcao, listaDocumentos, paginasDocumentos,
  avisoDocumentos, barraProgresso, dataHora, perguntarSimNao, listaPendencias, resumoPorSecao, faixaNotificacoes,
} from './componentes.js';
import { telaPainel } from './painel.js';

const raiz = document.getElementById('app');
let perfil = null;
let config = null;

// ---------- rotas ----------
// #/entrar  #/clientes  #/novo  #/cliente/:id  #/cliente/:id/documentos
// #/cliente/:id/cadastro/:etapa  #/painel/:secao
export function ir(rota) { location.hash = rota; }

// Links que chegam pelo WhatsApp/notificação: ?c=<cliente> abre a ficha; ?acesso=<tipo>.<código> abre "criar senha"
(function linksExternos() {
  const q = new URLSearchParams(location.search);
  const c = q.get('c'); const acesso = q.get('acesso');
  if (!c && !acesso) return;
  q.delete('c'); q.delete('acesso');
  let hash = location.hash;
  if (acesso) { const [tipo, ...resto] = acesso.split('.'); hash = `#/acesso?token_hash=${encodeURIComponent(resto.join('.'))}&tipo=${tipo === 'recovery' ? 'recovery' : 'invite'}`; }
  else if (c && /^[0-9a-f-]{36}$/i.test(c)) hash = `#/cliente/${c}`;
  history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '') + hash);
})();

async function rotear() {
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if ((partes[0] || '').startsWith('acesso')) return mostrar(await telaAcesso());
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
  const senha = h('input', { id: 'senha', class: 'entrada', type: 'password', style: { paddingRight: '52px' }, autocomplete: 'current-password', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true });
  const erro = h('div', { class: 'erro-campo', role: 'alert' });
  const botao = h('button', { class: 'btn btn-primario', type: 'submit' }, 'Entrar');

  const form = h('form', { class: 'conteudo', style: { paddingBottom: '24px' }, onsubmit: async (e) => {
    e.preventDefault();
    erro.textContent = ''; botao.disabled = true; botao.textContent = 'Entrando…';
    try { await api.entrar(email.value, senha.value); ir('/'); rotear(); }
    catch (err) { erro.textContent = err.message; botao.disabled = false; botao.textContent = 'Entrar'; }
  } },
    h('div', { class: 'campo' }, h('label', { for: 'email' }, 'E-mail'), email),
    h('div', { class: 'campo' }, h('label', { for: 'senha' }, 'Senha'),
      h('div', { style: { position: 'relative' } }, senha,
        h('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Mostrar senha', 'aria-pressed': 'false',
          style: { position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', border: '0', background: 'transparent' },
          onclick: (e) => {
            const mostrar = senha.type === 'password';
            senha.type = mostrar ? 'text' : 'password';
            e.currentTarget.setAttribute('aria-pressed', mostrar ? 'true' : 'false');
            e.currentTarget.setAttribute('aria-label', mostrar ? 'Esconder senha' : 'Mostrar senha');
            limpar(e.currentTarget); e.currentTarget.appendChild(icone(mostrar ? 'olhoFechado' : 'olho', { cor: '#5A646B' }));
          } }, icone('olho', { cor: '#5A646B' })))),
    erro,
    h('a', { class: 'voltar', style: { alignSelf: 'flex-end', color: '#3D657C' }, target: '_blank', rel: 'noopener',
      href: 'https://wa.me/5521996394546', onclick: (e) => {
        e.currentTarget.href = `https://wa.me/5521996394546?text=${encodeURIComponent(`Olá! Esqueci minha senha do Portal do Corretor. Meu e-mail de acesso é ${email.value || '(meu e-mail)'}. Pode me mandar um novo link de acesso?`)}`;
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

// ---------- link de convite / novo acesso: criar a senha ----------
async function telaAcesso() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const tipo = q.get('tipo') === 'recovery' ? 'recovery' : 'invite';
  const corpo = h('div', { class: 'conteudo', style: { paddingBottom: '24px' } });
  const cabeca = h('div', { class: 'topo-laranja', style: { padding: '56px 28px 36px', gap: '24px' } },
    h('div', { class: 'marca-topo' }, h('div', { class: 'monograma' }, 'AA'),
      h('div', null, h('div', { style: { fontSize: '20px', fontWeight: '700' } }, 'andrade almeida'), h('div', { style: { fontSize: '13px', fontWeight: '600' } }, 'CCA · Correspondente Caixa Aqui'))),
    h('h1', { style: { fontSize: '28px', fontWeight: '800', letterSpacing: '-0.6px' } }, tipo === 'invite' ? 'Bem-vindo ao Portal do Corretor' : 'Crie uma nova senha'));
  let perfilLink = null;
  try { perfilLink = await api.entrarComLink(q.get('token_hash'), tipo); }
  catch (e) {
    adicionar(corpo, aviso('laranja', h('strong', null, 'Link inválido. '), e.message),
      h('a', { class: 'btn btn-primario', target: '_blank', rel: 'noopener', href: `https://wa.me/5521996394546?text=${encodeURIComponent('Olá! Meu link de acesso ao Portal do Corretor expirou. Pode me mandar um novo?')}` }, 'Pedir novo link pelo WhatsApp'),
      h('a', { class: 'btn btn-secundario', href: '#/' }, 'Ir para o login'));
    return h('div', { class: 'tela' }, cabeca, corpo);
  }
  const campoSenha = (id, rotulo) => {
    const input = h('input', { id, class: 'entrada', type: 'password', autocomplete: 'new-password', autocapitalize: 'none', style: { paddingRight: '52px' } });
    const olho = h('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Mostrar senha', style: { position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', border: '0', background: 'transparent' },
      onclick: () => { const m = input.type === 'password'; input.type = m ? 'text' : 'password'; olho.setAttribute('aria-label', m ? 'Esconder senha' : 'Mostrar senha'); limpar(olho); olho.appendChild(icone(m ? 'olhoFechado' : 'olho', { cor: '#5A646B' })); } },
    icone('olho', { cor: '#5A646B' }));
    return [input, h('div', { class: 'campo' }, h('label', { for: id }, rotulo), h('div', { style: { position: 'relative' } }, input, olho))];
  };
  const [s1, c1] = campoSenha('nova-senha', 'Nova senha');
  const [s2, c2] = campoSenha('nova-senha-2', 'Repita a senha');
  const erro = h('div', { class: 'erro-campo', role: 'alert' });
  const botao = h('button', { class: 'btn btn-primario', type: 'submit' }, 'Salvar senha e entrar');
  const form = h('form', { style: { display: 'flex', flexDirection: 'column', gap: '16px' }, onsubmit: async (e) => {
    e.preventDefault(); erro.textContent = '';
    if (s1.value.length < 8) { erro.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
    if (s1.value !== s2.value) { erro.textContent = 'As duas senhas não são iguais.'; return; }
    botao.disabled = true; botao.textContent = 'Salvando…';
    try { await api.definirSenha(s1.value); await api.aceitarWhatsapp(document.getElementById('aceita-whats')?.checked !== false).catch(() => {}); toast('Senha criada. Bem-vindo!'); history.replaceState(null, '', location.pathname + location.search + '#/'); rotear(); }
    catch (err) { erro.textContent = err.message; botao.disabled = false; botao.textContent = 'Salvar senha e entrar'; }
  } }, c1, c2, h('div', { class: 'ajuda' }, 'Use pelo menos 8 caracteres. Guarde bem: ela é pessoal.'),
    h('label', { for: 'aceita-whats', style: { display: 'flex', gap: '12px', alignItems: 'flex-start', fontSize: '14px', lineHeight: '20px' } },
      h('input', { type: 'checkbox', id: 'aceita-whats', checked: true, style: { width: '22px', height: '22px', accentColor: '#3D657C', margin: '0', flexShrink: '0' } }),
      h('span', null, 'Aceito receber avisos da Andrade Almeida CCA no WhatsApp (status dos clientes e documentos pendentes).')),
    erro, botao);
  adicionar(corpo, h('p', { style: { margin: '0', fontSize: '16px' } }, `Olá, ${R.primeiroNome(perfilLink?.nome || '')}! Crie a sua senha para entrar.`), h('div', { class: 'subtitulo' }, perfilLink?.email || ''), form);
  return h('div', { class: 'tela' }, cabeca, corpo);
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
          h('div', null, h('div', { class: 'nome' }, c.nome), h('div', { class: 'meta' }, `CPF ${R.formatarCpf(c.cpf)} · ${c.programa || '—'}${perfil.papel === 'gestor_imobiliaria' && c.corretor_nome ? ` · ${c.corretor_nome}` : ''}`)),
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
        h('div', null, h('div', { class: 'subtitulo' }, `${R.saudacao()}, ${R.primeiroNome(perfil.nome)}!`), h('h1', { class: 'titulo' }, 'Meus clientes')),
        h('button', { class: 'btn-icone', style: { background: '#1F2A30', border: '0', borderRadius: '22px', width: '44px', height: '44px' }, 'aria-label': 'Sair', onclick: sair }, icone('sair', { cor: '#FFFFFF' }))),
      h('div', { class: 'busca' }, icone('busca', { cor: '#5A646B' }), h('label', { for: 'busca', class: 'sr' }, 'Buscar cliente'), busca)),
    h('div', { class: 'conteudo' }, faixaNotificacoes(config), caixaFiltros, lista),
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

// Ordem das telas do cadastro. A tela Vendedor só aparece nas aquisições.
export const E = { compradores: 1, renda: 2, operacao: 3, imovel: 4, vendedor: 5, docs: 6, revisao: 7 };
const temVendedor = (cli) => /^Aquisição/.test(cli.modalidade || '');
const proximaEtapa = (etapa, cli) => (etapa + 1 === E.vendedor && !temVendedor(cli) ? E.docs : etapa + 1);
const etapaAnterior = (etapa, cli) => (etapa - 1 === E.vendedor && !temVendedor(cli) ? E.imovel : etapa - 1);

function telaCadastro(dados, etapa) {
  const cli = dados ? { ...dados.cliente } : { dependentes: 0, extras: {} };
  const outros = dados ? (dados.participantes || []).map((p) => ({ ...p })) : [];
  const titulos = { [E.compradores]: 'Compradores', [E.renda]: 'Renda e dependentes', [E.operacao]: 'Operação', [E.imovel]: 'Imóvel', [E.vendedor]: 'Vendedor', [E.docs]: 'Documentos', [E.revisao]: 'Revisão' };
  const total = temVendedor(cli) ? 7 : 6;
  const posicao = !temVendedor(cli) && etapa > E.vendedor ? etapa - 1 : etapa;
  const voltarPara = etapa === 1 ? (cli.id && !cli.rascunho ? `#/cliente/${cli.id}` : '#/clientes') : `#/cliente/${cli.id}/cadastro/${etapaAnterior(etapa, cli)}`;
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
      if (depoisDeSalvar) await depoisDeSalvar(salvo);
      ir(`/cliente/${salvo.id}/cadastro/${proximaEtapa(etapa, cli)}`);
    } catch (e) { erro.textContent = e.message; botao.disabled = false; }
  };

  const salvarTudo = async () => {
    cli.compoe_renda = outros.some((p) => p.papel === 'comprador');
    const salvo = await api.salvarCliente(cli);
    cli.id = salvo.id;
    if (etapa === E.compradores || etapa === E.renda) {
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
      try { const salvo = await salvarTudo(); if (depoisDeSalvar) await depoisDeSalvar(salvo).catch(() => {}); toast('Rascunho salvo. Você continua de onde parou tocando no cliente.'); ir('/clientes'); } catch (e) { toast(e.message); }
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
  let depoisDeSalvar = null;
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
    const casado = () => cli.estado_civil === 'Casado(a)'; // a Caixa trata união estável como solteiro(a)
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
        // Se já tinha renda, continua como comprador; sem renda, sai do processo
        if (cj) { if (cj.papel === 'comprador') { cj.conjuge_do_titular = false; cj.estado_civil = cli.estado_civil === 'União estável' ? 'União estável' : null; } else outros.splice(outros.indexOf(cj), 1); }
        estado.conjugeTemRenda = undefined;
        if (cli.estado_civil === 'União estável') adicionar(areaPessoas, aviso('azul', h('strong', null, 'União estável: '),
          'para a Caixa o estado civil é solteiro(a). O(a) companheiro(a) não entra como cônjuge. Se for compor renda, adicione como comprador.'));
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

    // Documentação da imobiliária: escolhe o corretor responsável pelo cliente
    const caixaResponsavel = h('div');
    if (perfil.papel === 'gestor_imobiliaria') {
      api.corretoresDaImobiliaria().then((lista) => {
        const sel = h('select', { id: 'corretor-resp', class: 'entrada', onchange: (e) => { cli._corretor_responsavel = e.target.value || null; } },
          h('option', { value: '' }, 'Escolha o corretor'),
          lista.map((c) => h('option', { value: c.id, selected: (cli._corretor_responsavel || cli.corretor_id) === c.id }, `${c.nome}${c.id === perfil.id ? ' (eu)' : ''}`)));
        if (!cli._corretor_responsavel && cli.corretor_id) cli._corretor_responsavel = cli.corretor_id;
        adicionar(caixaResponsavel, h('section', { class: 'cartao', style: { gap: '8px' } },
          h('div', { class: 'campo' }, h('label', { for: 'corretor-resp' }, 'Corretor responsável pelo cliente'), sel),
          h('div', { class: 'ajuda' }, 'Os avisos da CCA seguem a configuração da imobiliária (corretor, imobiliária ou os dois).')));
      }).catch(() => {});
    }

    adicionar(conteudo,
      caixaResponsavel,
      h('h2', { style: { fontSize: '17px' } }, 'Titular'),
      ...camposPessoa(cli, 'c-', !!cli.id),
      grupoOpcoes('Estado civil', 'estado_civil', op(config.opcoes.estado_civil), 2, cli, () => desenharPessoas()),
      areaPessoas,
      cli.id ? null : aviso('azul', 'Se você já cadastrou este CPF, o app abre a ficha existente em vez de criar outra.'));
    botoesRodape(() => {
      if (perfil.papel === 'gestor_imobiliaria' && !cli._corretor_responsavel) return 'Escolha o corretor responsável pelo cliente.';
      if (!cli.nome || cli.nome.trim().split(/\s+/).length < 2) return 'Digite o nome completo do titular.';
      if (!R.cpfValido(cli.cpf || '')) return 'CPF do titular inválido. Confira os números.';
      if (!cli.data_nascimento) return 'Informe a data de nascimento do titular (a idade define o prazo máximo).';
      if (!cli.estado_civil) return 'Escolha o estado civil do titular.';
      if (casado() && estado.conjugeTemRenda === undefined) return 'Responda se o cônjuge tem renda.';
      const cpfs = [R.soDigitos(cli.cpf)];
      for (const p of outros) {
        const quem = p.conjuge_do_titular ? 'do cônjuge' : `do comprador ${outros.indexOf(p) + 2}`;
        if (!p.nome || p.nome.trim().split(/\s+/).length < 2) return `Digite o nome completo ${quem}.`;
        if (!R.cpfValido(p.cpf || '')) return `CPF ${quem} inválido.`;
        if (cpfs.includes(R.soDigitos(p.cpf))) return `CPF ${quem} repetido.`;
        cpfs.push(R.soDigitos(p.cpf));
        if (p.papel === 'comprador' && !p.data_nascimento) return `Informe a data de nascimento ${quem}.`;
        if (!p.conjuge_do_titular && !p.estado_civil) return `Escolha o estado civil ${quem}.`;
      }
      return null;
    });
  }

  // ---------- Etapa 3: Operação ----------
  if (etapa === E.operacao) {
    // Modalidades antigas (antes da lista ser simplificada)
    const antigas = { 'Aquisição de Imóvel Novo': 'Novo', 'Aquisição de Imóvel Usado': 'Usado', 'Aquisição de Imóvel na Planta': 'Na planta' };
    if (antigas[cli.modalidade]) { cli.imovel ||= antigas[cli.modalidade]; cli.modalidade = 'Aquisição de Imóvel'; }
    const caixaPrograma = h('div', { 'aria-live': 'polite' });
    const desenharPrograma = () => {
      limpar(caixaPrograma);
      const e = R.enquadramentoDoProcesso(cli, outros, config.parametros);
      if (!e.renda.considerada) return;
      const m = R.enquadrarMcmv({ rendaMensal: e.renda.considerada, zona: cli.imovel_zona || 'Urbana' }, config.parametros);
      if (m.foraPorRenda) {
        caixaPrograma.appendChild(aviso(cli.programa === 'MCMV' ? 'laranja' : 'azul', h('strong', null, 'Renda acima do MCMV. '),
          `A renda considerada dos compradores (${R.formatarMoeda(e.renda.considerada)}) passa de ${R.formatarMoeda(m.limiteRenda)}${m.rural ? ' por ano' : ' por mês'}. Escolha SBPE ou Pró-Cotista.`));
      } else {
        caixaPrograma.appendChild(aviso('azul', h('strong', null, `Pela renda, o cliente se enquadra no MCMV Faixa ${m.faixaRenda}. `),
          'O valor do imóvel (próxima tela) pode mudar a faixa.'));
      }
    };
    desenharPrograma();
    aoMudarOpcao = (campo) => { if (campo === 'programa') desenharPrograma(); };
    adicionar(conteudo,
      grupoOpcoes('Modalidade', 'modalidade', op(config.opcoes.modalidade), 1),
      h('div', { class: 'ajuda', style: { marginTop: '-6px' } }, 'Lista provisória: será conferida com o simulador da Caixa.'),
      grupoOpcoes('Programa', 'programa', op(config.opcoes.programa), 3),
      caixaPrograma,
      grupoOpcoes('Vai usar FGTS?', 'usa_fgts', [['Sim', true], ['Não', false]], 2),
      grupoOpcoes('Algum comprador tem 3 anos ou mais de FGTS? (somando todos os empregos)', 'cotista_fgts', [['Sim', true], ['Não', false]], 2),
      h('div', { class: 'ajuda', style: { marginTop: '-6px' } }, 'Cotista do FGTS tem taxa de juros menor no MCMV e pode usar a linha Pró-Cotista.'),
      aviso('azul', 'Cada resposta ajusta a lista de documentos. Você verá só o que esta operação exige.'));
    botoesRodape(() => {
      if (!cli.modalidade) return 'Escolha a modalidade.';
      if (!cli.programa) return 'Escolha o programa.';
      const e = R.enquadramentoDoProcesso(cli, outros, config.parametros);
      if (cli.programa === 'MCMV' && e.renda.considerada && R.enquadrarMcmv({ rendaMensal: e.renda.considerada, zona: cli.imovel_zona || 'Urbana' }, config.parametros).foraPorRenda) return 'Renda acima do limite do MCMV. Escolha SBPE ou Pró-Cotista.';
      if (cli.usa_fgts === undefined || cli.usa_fgts === null) return 'Responda se vai usar FGTS.';
      if (cli.cotista_fgts === undefined || cli.cotista_fgts === null) return 'Responda se algum comprador tem 3 anos ou mais de FGTS.';
      if (cli.programa === 'Pró-Cotista' && !cli.cotista_fgts) return 'A linha Pró-Cotista exige comprador com 3 anos ou mais de FGTS.';
      if (cli.modalidade !== 'Aquisição de Imóvel') cli.imovel = null;
      if (!temVendedor(cli)) { cli.vendedor = null; cli.empreendimento_caixa = null; }
      return null;
    });
  }

  // ---------- Etapa 4: Imóvel ----------
  if (etapa === E.imovel) {
    const pedeImovel = cli.modalidade === 'Aquisição de Imóvel';
    const selMunicipio = h('select', { id: 'imovel-municipio', class: 'entrada', onchange: (e) => { cli.imovel_municipio = e.target.value || null; erro.textContent = ''; } });
    const carregarMunicipios = async (uf) => {
      limpar(selMunicipio);
      selMunicipio.appendChild(h('option', { value: '' }, uf ? 'Carregando…' : 'Escolha a UF'));
      selMunicipio.disabled = !uf;
      if (!uf) return;
      let lista = [];
      try { lista = await api.municipios(uf); } catch { /* sem conexão */ }
      if (cli.imovel_municipio && !lista.includes(cli.imovel_municipio)) lista = [cli.imovel_municipio, ...lista];
      limpar(selMunicipio);
      selMunicipio.appendChild(h('option', { value: '' }, 'Escolha o município'));
      for (const nome of lista) selMunicipio.appendChild(h('option', { value: nome, selected: nome === cli.imovel_municipio }, nome));
    };
    const selUf = h('select', { id: 'imovel-uf', class: 'entrada', onchange: (e) => {
      cli.imovel_uf = e.target.value || null; cli.imovel_municipio = null; erro.textContent = ''; carregarMunicipios(cli.imovel_uf);
    } }, h('option', { value: '' }, 'UF'), R.UFS.map((uf) => h('option', { value: uf, selected: cli.imovel_uf === uf }, uf)));
    carregarMunicipios(cli.imovel_uf);
    const avisoValor = h('div', { 'aria-live': 'polite' });
    const desenharAvisoValor = () => {
      limpar(avisoValor);
      if (cli.programa !== 'MCMV' || !cli.valor_imovel) return;
      const e = R.enquadramentoDoProcesso(cli, outros, config.parametros);
      const m = e.mcmv;
      if (m.foraPorValor) avisoValor.appendChild(aviso('laranja', h('strong', null, 'Fora do MCMV. '), `O MCMV aceita imóvel de até ${R.formatarMoeda(m.tetoImovel)}. Volte em Operação e escolha SBPE ou Pró-Cotista.`));
      else if (m.faixa) avisoValor.appendChild(aviso('azul', h('strong', null, `Enquadramento MCMV: Faixa ${m.faixa}. `),
        m.faixaValor > m.faixaRenda ? `Pela renda seria Faixa ${m.faixaRenda}, mas o valor do imóvel leva para a Faixa ${m.faixa} (teto das Faixas 1 e 2: até ${R.formatarMoeda(m.tetos[0])}, varia por município).` : 'O valor do imóvel cabe nesta faixa.'));
    };
    const inpValor = h('input', { id: 'valor-imovel', class: 'entrada', inputmode: 'numeric', placeholder: 'R$ 0,00',
      value: cli.valor_imovel ? R.formatarMoeda(cli.valor_imovel) : '',
      oninput: (e) => { cli.valor_imovel = R.lerMoeda(e.target.value); e.target.value = cli.valor_imovel === null ? '' : R.formatarMoeda(cli.valor_imovel); erro.textContent = ''; desenharAvisoValor(); } });
    desenharAvisoValor();
    aoMudarOpcao = (campo) => { if (campo === 'imovel_zona') desenharAvisoValor(); };
    adicionar(conteudo,
      pedeImovel ? grupoOpcoes('Qual imóvel?', 'imovel', op(config.opcoes.imovel), 2) : null,
      h('section', { class: 'cartao', style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        h('h2', { style: { fontSize: '17px' } }, 'Onde fica o imóvel'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '96px 1fr', gap: '12px' } },
          h('div', { class: 'campo' }, h('label', { for: 'imovel-uf' }, 'Estado'), selUf),
          h('div', { class: 'campo' }, h('label', { for: 'imovel-municipio' }, 'Município'), selMunicipio)),
        grupoOpcoes('Zona', 'imovel_zona', [['Urbana', 'Urbana'], ['Rural', 'Rural']], 2),
        grupoOpcoes('Fica em região metropolitana?', 'imovel_regiao_metropolitana', [['Sim', true], ['Não', false]], 2)),
      h('div', { class: 'campo' }, h('label', { for: 'valor-imovel' }, 'Valor do imóvel'), inpValor,
        h('span', { class: 'ajuda' }, 'Valor de compra e venda. Em construção, terreno + obra.')),
      avisoValor);
    botoesRodape(() => {
      if (pedeImovel && !cli.imovel) return 'Escolha qual é o imóvel.';
      if (!cli.imovel_uf) return 'Escolha o estado onde fica o imóvel.';
      if (!cli.imovel_municipio) return 'Escolha o município do imóvel.';
      if (!cli.imovel_zona) return 'Responda se o imóvel fica em zona urbana ou rural.';
      if (cli.imovel_regiao_metropolitana === undefined || cli.imovel_regiao_metropolitana === null) return 'Responda se o imóvel fica em região metropolitana.';
      if (!cli.valor_imovel) return 'Informe o valor do imóvel.';
      const e = R.enquadramentoDoProcesso(cli, outros, config.parametros);
      if (cli.programa === 'MCMV' && e.mcmv.foraPorValor) return 'Imóvel acima do teto do MCMV. Volte em Operação e escolha SBPE ou Pró-Cotista.';
      if (cli.programa === 'MCMV' && e.mcmv.foraPorRenda) return 'Renda acima do limite do MCMV. Volte em Operação e escolha SBPE ou Pró-Cotista.';
      cli.faixa_mcmv = cli.programa === 'MCMV' ? e.mcmv.faixa : null;
      return null;
    });
  }

  // ---------- Etapa 5: Vendedor (só nas aquisições) ----------
  if (etapa === E.vendedor) {
    const vendedorPj = () => cli.vendedor === 'Construtora / PJ';
    const vendedorPf = () => cli.vendedor === 'Pessoa física';
    const vend = { ...(dados?.vendedor || {}) };
    if (vend.cpf_cnpj) vend.cpf_cnpj = vend.cpf_cnpj.length === 11 ? R.formatarCpf(vend.cpf_cnpj) : R.formatarCnpj(vend.cpf_cnpj);
    if (vend.construtora_cnpj) vend.construtora_cnpj = R.formatarCnpj(vend.construtora_cnpj);
    if (vend.conjuge_cpf) vend.conjuge_cpf = R.formatarCpf(vend.conjuge_cpf);
    const empreendimentoCaixa = () => vendedorPj() && vend.pj_tipo === 'Empreendimento' && cli.empreendimento_caixa === true;
    const pedeDocsPj = () => vendedorPj() && (vend.pj_tipo === 'Avulso' || (vend.pj_tipo === 'Empreendimento' && cli.empreendimento_caixa === false));

    const area = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
    const avisoCadastro = h('div');
    let ultimaBusca = '';
    let bancos = null;
    const buscarCadastro = async () => {
      const doc = R.soDigitos(vend.cpf_cnpj || '');
      const valido = vendedorPf() ? R.cpfValido(doc) : R.cnpjValido(doc);
      if (!valido || doc === ultimaBusca) return;
      ultimaBusca = doc;
      try {
        const achado = await api.buscarVendedor(doc);
        if (!achado) { limpar(avisoCadastro); return; }
        for (const k of ['nome', 'pj_tipo', 'empreendimento', 'construtora_nome', 'banco', 'agencia', 'operacao', 'conta', 'conta_digito', 'estado_civil', 'conjuge_nome']) if (!vend[k] && achado[k]) vend[k] = achado[k];
        if ((vend.teve_alteracao_contratual ?? null) === null && typeof achado.teve_alteracao_contratual === 'boolean') vend.teve_alteracao_contratual = achado.teve_alteracao_contratual;
        if (!vend.construtora_cnpj && achado.construtora_cnpj) vend.construtora_cnpj = R.formatarCnpj(achado.construtora_cnpj);
        if (!vend.conjuge_cpf && achado.conjuge_cpf) vend.conjuge_cpf = R.formatarCpf(achado.conjuge_cpf);
        desenhar();
        limpar(avisoCadastro);
        avisoCadastro.appendChild(aviso('azul', h('strong', null, 'Vendedor já cadastrado na CCA. '),
          achado.documentos_na_cca ? `${achado.documentos_na_cca} documento${achado.documentos_na_cca > 1 ? 's' : ''} dele já ${achado.documentos_na_cca > 1 ? 'estão' : 'está'} com a CCA e ${achado.documentos_na_cca > 1 ? 'serão aproveitados' : 'será aproveitado'}.` : 'Os dados foram preenchidos. Confira e atualize se mudou algo.'));
      } catch { /* sem conexão: segue sem preencher */ }
    };
    const campoVend = (chave, rotulo, attrs = {}, formatar, ajuda) => {
      const id = `v-${chave}`;
      const input = h('input', { id, class: 'entrada', value: vend[chave] || '', autocomplete: 'off', ...attrs,
        oninput: (e) => { if (formatar) e.target.value = formatar(e.target.value); vend[chave] = e.target.value; erro.textContent = ''; },
        onblur: chave === 'cpf_cnpj' ? buscarCadastro : null });
      return h('div', { class: 'campo' }, h('label', { for: id }, rotulo), input, ajuda ? h('span', { class: 'ajuda' }, ajuda) : null);
    };

    // Conta para recebimento: banco escolhido numa lista (código + nome), igual ao município
    const selBanco = h('select', { id: 'v-banco', class: 'entrada', onchange: (e) => { vend.banco = e.target.value || ''; erro.textContent = ''; desenharOperacao(); } });
    const caixaOperacao = h('div');
    const desenharOperacao = () => {
      limpar(caixaOperacao);
      if (R.ehCaixa(vend.banco)) caixaOperacao.appendChild(campoVend('operacao', 'Operação', { inputmode: 'numeric', placeholder: 'Ex.: 001, 013, 1288, 3701' }));
      else vend.operacao = '';
    };
    const preencherBancos = async () => {
      bancos ||= await api.bancos().catch(() => ({ principais: [], todos: [] }));
      limpar(selBanco);
      selBanco.appendChild(h('option', { value: '' }, 'Escolha o banco'));
      const opc = (b) => h('option', { value: b, selected: b === vend.banco }, b);
      const todos = bancos.todos || [];
      if (vend.banco && !todos.includes(vend.banco)) selBanco.appendChild(opc(vend.banco));
      if (bancos.principais?.length) selBanco.appendChild(h('optgroup', { label: 'Principais' }, bancos.principais.map(opc)));
      selBanco.appendChild(h('optgroup', { label: 'Todos (por código)' }, todos.map((b) => h('option', { value: b }, b))));
      if (vend.banco) selBanco.value = vend.banco;
    };
    const blocoConta = () => {
      preencherBancos();
      desenharOperacao();
      return h('section', { class: 'cartao', style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        h('h2', { style: { fontSize: '17px' } }, 'Conta para recebimento'),
        aviso('laranja', h('strong', null, 'É expressamente recomendado '), 'que seja uma conta da Caixa Econômica Federal no nome do vendedor. Não é obrigatório.'),
        h('div', { class: 'campo' }, h('label', { for: 'v-banco' }, 'Banco'), selBanco),
        caixaOperacao,
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1.3fr 0.8fr', gap: '10px' } },
          campoVend('agencia', 'Agência', { inputmode: 'numeric', placeholder: '0000' }),
          campoVend('conta', 'Conta corrente', { inputmode: 'numeric', placeholder: '000000' }),
          campoVend('conta_digito', 'Dígito', { inputmode: 'numeric', placeholder: '—', maxlength: '2' })),
        h('div', { class: 'ajuda' }, 'Dígito: deixe em branco se o banco não usa. Se ainda não tiver a conta, pode completar depois.'));
    };

    const desenhar = () => {
      limpar(area);
      if (!cli.vendedor) return;
      const pf = vendedorPf();
      const docTam = R.soDigitos(vend.cpf_cnpj || '').length;
      if ((pf && docTam > 11) || (!pf && docTam && docTam <= 11)) { vend.cpf_cnpj = ''; ultimaBusca = ''; limpar(avisoCadastro); }
      const cartao = h('section', { class: 'cartao', style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, h('h2', { style: { fontSize: '17px' } }, 'Dados do vendedor'));
      if (pf) {
        adicionar(cartao,
          campoVend('cpf_cnpj', 'CPF do vendedor', { inputmode: 'numeric', placeholder: '000.000.000-00' }, R.formatarCpf),
          avisoCadastro,
          campoVend('nome', 'Nome completo do vendedor'),
          grupoOpcoes('Estado civil do vendedor', 'estado_civil', op(config.opcoes.estado_civil), 2, vend, () => desenhar()));
        if (vend.estado_civil === 'Casado(a)') {
          adicionar(cartao,
            aviso('azul', h('strong', null, 'Cônjuge também é vendedor: '), 'entra no contrato da Caixa e envia os documentos dele(a), além da certidão de casamento.'),
            campoVend('conjuge_nome', 'Nome completo do cônjuge'),
            campoVend('conjuge_cpf', 'CPF do cônjuge', { inputmode: 'numeric', placeholder: '000.000.000-00' }, R.formatarCpf));
        } else if (vend.estado_civil === 'União estável') {
          adicionar(cartao, aviso('azul', 'Para a Caixa, união estável é solteiro(a): pede a certidão de nascimento.'));
        }
        adicionar(area, cartao, blocoConta());
        return;
      }
      // Pessoa jurídica
      adicionar(cartao, grupoOpcoes('Tipo de venda', 'pj_tipo', [['Imóvel avulso', 'Avulso'], ['Empreendimento (SPE)', 'Empreendimento']], 2, vend, () => desenhar()));
      if (vend.pj_tipo === 'Empreendimento') {
        adicionar(cartao,
          campoVend('cpf_cnpj', 'CNPJ do empreendimento (SPE)', { inputmode: 'numeric', placeholder: '00.000.000/0000-00' }, R.formatarCnpj),
          avisoCadastro,
          campoVend('nome', 'Razão social da SPE'),
          campoVend('empreendimento', 'Nome do empreendimento'));
        if (cli.empreendimento_caixa === true) {
          adicionar(cartao, aviso('azul', h('strong', null, 'Empreendimento Caixa: '), 'os dados da SPE já estão no SIOPI. Basta CNPJ, razão social e nome do empreendimento. Não precisa anexar documentos do vendedor.'));
        } else if (cli.empreendimento_caixa === false) {
          adicionar(cartao,
            aviso('laranja', 'Empreendimento sem recurso da Caixa: envie todos os documentos da empresa, como no imóvel avulso.'),
            campoVend('construtora_cnpj', 'CNPJ da construtora (opcional)', { inputmode: 'numeric', placeholder: '00.000.000/0000-00' }, R.formatarCnpj),
            campoVend('construtora_nome', 'Nome da construtora (opcional)'));
        }
      } else if (vend.pj_tipo === 'Avulso') {
        adicionar(cartao,
          campoVend('cpf_cnpj', 'CNPJ do vendedor', { inputmode: 'numeric', placeholder: '00.000.000/0000-00' }, R.formatarCnpj),
          avisoCadastro,
          campoVend('nome', 'Razão social'));
      }
      if (pedeDocsPj()) {
        adicionar(cartao,
          grupoOpcoes('Houve alteração contratual depois do contrato social consolidado?', 'teve_alteracao_contratual', [['Sim', true], ['Não', false]], 2, vend, () => {}),
          h('div', { class: 'ajuda', style: { marginTop: '-6px' } }, 'Se não houve, o documento de alterações não é pedido.'));
      }
      adicionar(area, cartao, vend.pj_tipo ? blocoConta() : null);
    };

    const grupoCaixa = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      grupoOpcoes('O empreendimento foi construído com recurso da Caixa?', 'empreendimento_caixa', [['Sim', true], ['Não', false]], 2, cli, () => desenhar()),
      aviso('azul', 'Isso muda a taxa de juros e, em alguns casos, o prazo de pagamento.'));
    const grupoVendedor = grupoOpcoes('Quem está vendendo?', 'vendedor', op(config.opcoes.vendedor), 2, cli, () => {
      if (!vendedorPj()) cli.empreendimento_caixa = null;
      grupoCaixa.style.display = vendedorPj() ? '' : 'none';
      desenhar();
    });
    grupoCaixa.style.display = vendedorPj() ? '' : 'none';
    desenhar();
    adicionar(conteudo, grupoVendedor, grupoCaixa, area);

    depoisDeSalvar = async (salvo) => {
      if (!cli.vendedor || !R.soDigitos(vend.cpf_cnpj || '')) return;
      const dadosVend = { ...vend, pj_tipo: vendedorPj() ? vend.pj_tipo : null, estado_civil: vendedorPf() ? vend.estado_civil : null };
      const r = await api.vincularVendedor(salvo.id, dadosVend);
      if (r?.id) cli.vendedor_id = r.id;
    };
    botoesRodape(() => {
      if (!cli.vendedor) return 'Escolha quem está vendendo.';
      if (vendedorPj() && (cli.empreendimento_caixa === undefined || cli.empreendimento_caixa === null)) return 'Responda se o empreendimento foi construído com recurso da Caixa.';
      if (vendedorPf()) {
        if (!R.cpfValido(vend.cpf_cnpj || '')) return 'CPF do vendedor inválido. Confira os números.';
        if (!vend.nome || vend.nome.trim().split(/\s+/).length < 2) return 'Digite o nome completo do vendedor.';
        if (!vend.estado_civil) return 'Escolha o estado civil do vendedor.';
        if (vend.estado_civil === 'Casado(a)') {
          if (!vend.conjuge_nome || vend.conjuge_nome.trim().split(/\s+/).length < 2) return 'Digite o nome completo do cônjuge do vendedor.';
          if (!R.cpfValido(vend.conjuge_cpf || '')) return 'CPF do cônjuge do vendedor inválido.';
        }
      }
      if (vendedorPj()) {
        if (!vend.pj_tipo) return 'Escolha se é imóvel avulso ou empreendimento (SPE).';
        if (!R.cnpjValido(vend.cpf_cnpj || '')) return vend.pj_tipo === 'Empreendimento' ? 'CNPJ do empreendimento (SPE) inválido.' : 'CNPJ do vendedor inválido.';
        if (!String(vend.nome || '').trim()) return vend.pj_tipo === 'Empreendimento' ? 'Informe a razão social da SPE.' : 'Informe a razão social do vendedor.';
        if (vend.pj_tipo === 'Empreendimento' && !String(vend.empreendimento || '').trim()) return 'Informe o nome do empreendimento.';
        if (vend.construtora_cnpj && !empreendimentoCaixa() && !R.cnpjValido(vend.construtora_cnpj)) return 'CNPJ da construtora inválido.';
        if (pedeDocsPj() && (vend.teve_alteracao_contratual === undefined || vend.teve_alteracao_contratual === null)) return 'Responda se houve alteração contratual depois do contrato social consolidado.';
      }
      if (vend.conta && !vend.banco) return 'Escolha o banco da conta para recebimento.';
      return null;
    });
  }

  // ---------- Etapa 2: Renda ----------
  if (etapa === E.renda) {
    const comRenda = [cli, ...outros.filter((p) => p.papel === 'comprador')];
    const checagens = [];
    const caixaTotal = h('div', { class: 'aviso aviso-azul', 'aria-live': 'polite', style: { flexDirection: 'column', gap: '4px' } });
    const caixaEnquadramento = h('div', { 'aria-live': 'polite', style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
    const desenharEnquadramento = () => {
      limpar(caixaEnquadramento);
      const e = R.enquadramentoDoProcesso(cli, outros, config.parametros);
      const trocarPrograma = (novo) => h('button', { type: 'button', class: 'btn btn-pequeno btn-contorno', onclick: () => { cli.programa = novo; erro.textContent = ''; desenharEnquadramento(); } }, `Mudar para ${novo}`);
      if (e.renda.considerada > 0) {
        const m = e.mcmv;
        const limiteTxt = m.rural ? `${R.formatarMoeda(m.limiteRenda)} por ano (zona rural)` : `${R.formatarMoeda(m.limiteRenda)} por mês`;
        if (cli.programa === 'MCMV' && m.foraPorRenda) {
          caixaEnquadramento.appendChild(h('div', { class: 'aviso aviso-laranja', role: 'alert', style: { flexDirection: 'column', gap: '10px' } },
            h('span', null, h('strong', null, 'Renda acima do MCMV. '), `A renda considerada pela Caixa passa do limite do programa (${limiteTxt}). Este cliente tem que ir para SBPE ou Pró-Cotista.`),
            h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, trocarPrograma('SBPE'), cli.cotista_fgts ? trocarPrograma('Pró-Cotista') : null)));
        } else if (cli.programa === 'MCMV' && m.faixa) {
          const pelaValor = m.faixaValor && m.faixaValor > m.faixaRenda;
          caixaEnquadramento.appendChild(aviso('azul', h('strong', null, `Enquadramento MCMV: Faixa ${m.faixa}. `),
            pelaValor ? `Pela renda seria Faixa ${m.faixaRenda}, mas o valor do imóvel leva para a Faixa ${m.faixa}. ` : '',
            cli.cotista_fgts ? 'Cotista do FGTS: taxa de juros reduzida.' : 'Não cotista do FGTS: taxa sem a redução de cotista.'));
        } else if (!cli.programa) {
          caixaEnquadramento.appendChild(aviso('azul', m.foraPorRenda
            ? [h('strong', null, 'Renda acima do MCMV. '), `Passa de ${limiteTxt}: o processo vai para SBPE ou Pró-Cotista (escolha na tela Operação).`]
            : [h('strong', null, `Pela renda: MCMV Faixa ${m.faixaRenda}. `), 'O valor do imóvel pode mudar a faixa.']));
        } else if (cli.programa && cli.programa !== 'MCMV' && !m.foraPorRenda && !m.foraPorValor) {
          caixaEnquadramento.appendChild(h('div', { class: 'aviso aviso-azul', style: { flexDirection: 'column', gap: '10px' } },
            h('span', null, `Pela renda e pelo valor do imóvel, este cliente também se enquadra no MCMV (Faixa ${m.faixa}), que tem juros menores.`),
            h('div', null, trocarPrograma('MCMV'))));
        }
      }
      const pz = e.prazo;
      if (pz.prazo === 0) {
        caixaEnquadramento.appendChild(aviso('laranja', h('strong', null, 'Idade acima do limite. '),
          `${pz.maisVelho.nome} tem ${pz.maisVelho.anos} anos. Na Caixa, idade + prazo não pode passar de ${pz.idadeMaxima} anos. Retire essa pessoa dos compradores ou revise a data de nascimento.`));
      } else if (pz.prazo) {
        caixaEnquadramento.appendChild(aviso('azul', h('strong', null, `Prazo máximo: ${pz.prazo} meses (${Math.floor(pz.prazo / 12)} anos${pz.prazo % 12 ? ` e ${pz.prazo % 12} meses` : ''}). `),
          pz.limitadoPelaIdade ? `Limitado pela idade de ${R.primeiroNome(pz.maisVelho.nome)} (${pz.maisVelho.anos} anos): idade + prazo não pode passar de ${pz.idadeMaxima} anos.` : `É o prazo máximo da Caixa.`));
      }
      if (pz.semData.length) caixaEnquadramento.appendChild(aviso('laranja', `Falta a data de nascimento de ${pz.semData.join(', ')}. Sem ela não dá para calcular o prazo máximo.`));
    };
    const atualizarTotal = () => {
      desenharEnquadramento();
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
        campoMoeda('renda-informal', 'Renda informal (média mensal)', 'renda_informal', 'Trabalho sem registro. Comprovada por extratos bancários dos últimos 12 meses.'),
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
            h('strong', null, `Renda considerada: ${R.formatarMoeda(a.considerada)}.`), ' ',
            'Mesmo assim, a Caixa exige os extratos bancários dos últimos 12 meses comprovando a renda informal apresentada.'));
        } else if (a.irObrigatorioSemIr) {
          avisoIr.appendChild(aviso('laranja', h('strong', null, 'Declaração de IR obrigatória. '),
            `A renda passa do limite de isenção (${limite} por mês). A Caixa exige a declaração de IR entregue no prazo da Receita Federal.`));
        } else if (a.acimaLimite && alvo.declara_ir) {
          avisoIr.appendChild(aviso('azul', `A declaração precisa ter sido entregue no prazo da Receita (até ${R.formatarData(a.prazo)}). IR entregue depois do prazo não é aceito pela Caixa.`));
        }
        if (a.informal > 0 && !a.corte) {
          avisoIr.appendChild(aviso('azul', 'Renda informal: com ou sem declaração de IR, a Caixa exige os extratos bancários dos últimos 12 meses comprovando o valor informado.'));
        }
        if (alvo.tipo_renda === 'Formal') {
          avisoIr.appendChild(h('div', { class: 'ajuda' }, 'Renda formal (CLT): não precisa de extrato bancário. A Caixa confere pelos depósitos do FGTS da empresa na conta do comprador.'));
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

    // Dependentes (fator social): cada um diz se é filho(a) e, se não for, se é menor de idade
    cli.dependentes_info = Array.isArray(cli.dependentes_info) ? cli.dependentes_info.map((d) => ({ ...d })) : [];
    const areaDependentes = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
    const desenharDependentes = () => {
      limpar(areaDependentes);
      const n = cli._temDep ? (cli.dependentes || 0) : 0;
      while (cli.dependentes_info.length < n) cli.dependentes_info.push({});
      cli.dependentes_info.length = n;
      cli.dependentes_info.forEach((d, i) => {
        const docs = d.filho === true ? 'RG ou Certidão de Nascimento.'
          : d.filho === false && d.menor === true ? 'RG ou Certidão de Nascimento + declaração de dependente.'
          : d.filho === false && d.menor === false ? 'RG ou CNH + declaração de dependente.' : null;
        adicionar(areaDependentes, h('section', { class: 'cartao', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
          h('h2', { style: { fontSize: '16px' } }, `Dependente ${i + 1}`),
          grupoOpcoes('É filho(a)?', 'filho', [['Sim', true], ['Não', false]], 2, d, () => { if (d.filho) delete d.menor; desenharDependentes(); }),
          d.filho === false ? grupoOpcoes('É menor de idade?', 'menor', [['Sim', true], ['Não', false]], 2, d, () => desenharDependentes()) : null,
          docs ? h('div', { class: 'ajuda' }, h('strong', null, 'Fator social: '), docs) : null));
      });
    };
    const qtd = h('output', null, String(cli.dependentes || 0));
    const mudarQtd = (delta) => { cli.dependentes = Math.max(1, (cli.dependentes || 0) + delta); qtd.textContent = cli.dependentes; desenharDependentes(); };
    const contador = h('div', { class: 'contador' }, h('span', { style: { fontWeight: '600' } }, 'Quantos dependentes?'),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
        h('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Diminuir', onclick: () => mudarQtd(-1) }, '−'),
        qtd,
        h('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Aumentar', onclick: () => mudarQtd(1) }, '+')));
    cli._temDep = cli._temDep ?? (cli.dependentes > 0 ? true : cli.id && cli.tipo_renda ? false : undefined);
    contador.style.display = cli._temDep ? '' : 'none';
    const aoMudarDep = () => {
      if (!cli._temDep) { cli.dependentes = 0; qtd.textContent = '0'; } else if (!cli.dependentes) { cli.dependentes = 1; qtd.textContent = '1'; }
      contador.style.display = cli._temDep ? '' : 'none';
      desenharDependentes();
    };
    desenharDependentes();

    adicionar(conteudo,
      ...comRenda.map((p, i) => blocoRenda(p, i === 0 ? 'c-' : `r${i}-`, comRenda.length > 1 ? `Renda de ${p.nome || 'comprador'}${i === 0 ? ' (titular)' : ''}` : null)),
      comRenda.length > 1 ? caixaTotal : null,
      caixaEnquadramento,
      grupoOpcoes('Tem dependente?', '_temDep', [['Sim', true], ['Não', false]], 2, cli, aoMudarDep),
      contador,
      areaDependentes);
    botoesRodape(() => {
      for (const c of checagens) { const m = c(); if (m) return m; }
      const enq = R.enquadramentoDoProcesso(cli, outros, config.parametros);
      if (cli.programa === 'MCMV' && enq.mcmv.foraPorRenda) return 'Renda acima do limite do MCMV. Escolha SBPE ou Pró-Cotista.';
      if (enq.prazo.prazo === 0) return `${enq.prazo.maisVelho.nome} passa da idade máxima de ${enq.prazo.idadeMaxima} anos.`;
      cli.faixa_mcmv = cli.programa === 'MCMV' ? enq.mcmv.faixa : null;
      cli.prazo_maximo_meses = enq.prazo.prazo;
      if (cli._temDep === undefined) return 'Responda se tem dependente.';
      for (const [i, d] of cli.dependentes_info.entries()) {
        if (d.filho === undefined || d.filho === null) return `Responda se o dependente ${i + 1} é filho(a).`;
        if (d.filho === false && (d.menor === undefined || d.menor === null)) return `Responda se o dependente ${i + 1} é menor de idade.`;
      }
      delete cli._temDep;
      return null;
    });
  }

  if (etapa === E.docs) {
    adicionar(conteudo, avisoDocumentos(dados.necessarios) || aviso('azul', 'Todos os documentos foram anexados.'), legendaAsteriscos(),
      ...paginasDocumentos({ clienteId: cli.id, vendedorId: cli.vendedor_id, necessarios: dados.necessarios, aoMudar: rotear, avisoVendedor: avisoDocsVendedor(dados) }));
    adicionar(rodape, ...barraProgresso(dados.necessarios),
      h('a', { class: 'btn btn-primario', href: `#/cliente/${cli.id}/cadastro/${E.revisao}` }, 'Continuar'));
  }

  if (etapa === E.revisao) {
    const bloco = (titulo, etapaEditar, itens) => h('section', { class: 'cartao' },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        h('h2', { style: { fontSize: '16px' } }, titulo), h('a', { href: `#/cliente/${cli.id}/cadastro/${etapaEditar}` }, 'Editar')),
      h('dl', { class: 'resumo' }, itens.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v ?? '—')])));
    const sn = (v) => (v === true ? 'Sim' : v === false ? 'Não' : '—');
    const r = R.resumoDocumentos(dados.necessarios);
    const lgpd = h('input', { type: 'checkbox', id: 'lgpd', checked: !!cli.autorizacao_lgpd_em, style: { width: '22px', height: '22px', accentColor: '#3D657C', margin: '0', flexShrink: '0' } });
    adicionar(conteudo, 
      outros.length ? bloco('Compradores', 1, [[`${cli.nome}`, 'Titular'], ...outros.map((p) => [p.nome, p.papel === 'conjuge' ? 'Cônjuge (sem renda)' : `${p.conjuge_do_titular ? 'Cônjuge, ' : ''}compõe renda: ${R.formatarMoeda(p.renda_bruta) || '—'}`])]) : null,
      bloco('Titular', 1, [['Nome', cli.nome], ['CPF', R.formatarCpf(cli.cpf)], ['Nascimento', cli.data_nascimento ? cli.data_nascimento.split('-').reverse().join('/') : null], ['Estado civil', cli.estado_civil === 'União estável' ? 'União estável (Caixa: solteiro)' : cli.estado_civil], ['Celular', cli.celular ? R.formatarCelular(cli.celular) : null], ['E-mail', cli.email]]),
      outros.some((p) => p.papel === 'comprador') ? (() => { const t = R.rendaDoProcesso(cli, outros, config.parametros); return bloco('Renda total dos compradores', E.renda, [...t.porPessoa.map((p) => [p.nome || 'Comprador', R.formatarMoeda(p.considerada)]), ['Total aceito pela Caixa', R.formatarMoeda(t.considerada)], ...(t.considerada !== t.bruta ? [['Renda informada', `${R.formatarMoeda(t.bruta)} (antes do corte)`]] : [])]); })() : null,
      bloco('Renda e dependentes', E.renda, [['Tipo de renda', cli.tipo_renda], ...(cli.tipo_renda === 'Mista' ? [['Renda formal', R.formatarMoeda(cli.renda_formal)], ['Renda informal', R.formatarMoeda(cli.renda_informal)]] : []), ['Renda bruta', R.formatarMoeda(cli.renda_bruta)], ...(cli.renda_considerada && Number(cli.renda_considerada) !== Number(cli.renda_bruta) ? [['Renda considerada', `${R.formatarMoeda(cli.renda_considerada)} (sem IR)`]] : []), ['Compõe renda', sn(cli.compoe_renda)], ['Declara IR', sn(cli.declara_ir)], ...(cli.declara_ir ? [['IR retificado', sn(cli.ir_retificado)]] : []), ['Dependentes', String(cli.dependentes || 0)], ...R.dependentesDoProcesso(cli).map((d) => [`Dependente ${d.ordem}`, d.filho ? 'Filho(a)' : `Não é filho(a), ${d.menor ? 'menor' : 'maior'} de idade`])]),
      bloco('Operação', E.operacao, [['Modalidade', cli.modalidade], ['Programa', cli.programa], ['FGTS', cli.usa_fgts ? 'Vai usar' : 'Não vai usar'], ['Cotista FGTS (3 anos+)', sn(cli.cotista_fgts)]]),
      bloco('Imóvel', E.imovel, [...(cli.imovel ? [['Imóvel', cli.imovel]] : []), ['Local', [cli.imovel_municipio, cli.imovel_uf].filter(Boolean).join(' / ') || null], ['Zona', cli.imovel_zona], ['Região metropolitana', sn(cli.imovel_regiao_metropolitana)], ['Valor do imóvel', cli.valor_imovel ? R.formatarMoeda(cli.valor_imovel) : null]]),
      (() => { const e = R.enquadramentoDoProcesso(cli, outros, config.parametros); return bloco('Enquadramento', E.imovel, [...(cli.programa === 'MCMV' ? [['Faixa MCMV', e.mcmv.faixa ? `Faixa ${e.mcmv.faixa}` : 'Fora do MCMV']] : []), ['Prazo máximo', e.prazo.prazo ? `${e.prazo.prazo} meses` : '—'], ...(e.prazo.limitadoPelaIdade ? [['Limitado pela idade de', `${e.prazo.maisVelho.nome} (${e.prazo.maisVelho.anos} anos)`]] : [])]); })(),
      dados.vendedor && /^Aquisição/.test(cli.modalidade || '') ? (() => { const v = dados.vendedor; return bloco('Vendedor', E.vendedor, [
        ['Vendedor', cli.vendedor], ...(cli.vendedor === 'Construtora / PJ' ? [['Recurso Caixa', cli.empreendimento_caixa ? 'Sim, construído com recurso da Caixa' : 'Não']] : []),
        [v.tipo === 'PF' ? 'CPF' : 'CNPJ', v.tipo === 'PF' ? R.formatarCpf(v.cpf_cnpj) : R.formatarCnpj(v.cpf_cnpj)], ['Nome', v.nome],
        ...(v.tipo === 'PJ' ? [['Tipo de venda', v.pj_tipo === 'Empreendimento' ? `Empreendimento (SPE): ${v.empreendimento || '—'}` : 'Imóvel avulso']] : []),
        ...(v.construtora_cnpj ? [['Construtora', `${v.construtora_nome || '—'} · ${R.formatarCnpj(v.construtora_cnpj)}`]] : []),
        ...(v.tipo === 'PF' && v.estado_civil ? [['Estado civil', v.estado_civil]] : []),
        ...(v.tipo === 'PF' && v.estado_civil === 'Casado(a)' ? [['Cônjuge (também vendedor)', `${v.conjuge_nome || '—'} · CPF ${R.formatarCpf(v.conjuge_cpf || '')}`]] : []),
        ['Conta para recebimento', v.banco ? `${v.banco} · ag. ${v.agencia || '—'}${v.operacao ? ` · op. ${v.operacao}` : ''} · c/c ${v.conta || '—'}${v.conta_digito ? `-${v.conta_digito}` : ''}` : 'Não informada'],
        ...(v.banco && !R.ehCaixa(v.banco) ? [['Atenção', 'Recomendado conta da Caixa no nome do vendedor']] : [])]); })() : null,
      h('section', { class: 'cartao' },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, h('h2', { style: { fontSize: '16px' } }, 'Documentos'), h('a', { href: `#/cliente/${cli.id}/cadastro/${E.docs}` }, 'Editar')),
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
          h('div', { class: 'subtitulo' }, cli.nome && etapa > 1 ? `${cli.nome} · Etapa ${posicao} de ${total}` : `Novo cliente · Etapa ${posicao} de ${total}`),
          h('h1', { style: { fontSize: '21px', fontWeight: '800' } }, titulos[etapa]))),
      ...etapas(etapa, temVendedor(cli))),
    conteudo, rodape);
}

// Aviso no topo da página Vendedor
function avisoDocsVendedor({ cliente, vendedor }) {
  if (!/^Aquisição/.test(cliente.modalidade || '')) return null;
  if (!vendedor) return aviso('laranja', 'Preencha os dados do vendedor na etapa Operação para anexar os documentos dele.');
  if (vendedor.tipo === 'PJ' && vendedor.pj_tipo === 'Empreendimento') return aviso('azul', `Empreendimento ${vendedor.empreendimento || ''}: os documentos da SPE ficam com a CCA. Nada a anexar aqui por enquanto.`);
  return aviso('azul', h('strong', null, `${vendedor.nome}. `), 'Os documentos do vendedor ficam guardados no cadastro dele na CCA e valem para todos os processos com este vendedor. Se já estiverem com a CCA, aparecem como enviados.');
}

// ---------- documentos (depois do envio) ----------
async function telaDocumentos(id) {
  const dados = await api.obterCliente(id);
  const { cliente, necessarios } = dados;
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
      ...paginasDocumentos({ clienteId: id, vendedorId: cliente.vendedor_id, necessarios, aoMudar: rotear, avisoVendedor: avisoDocsVendedor(dados) }),
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
        r.pendente || r.recusado ? h('div', { class: 'ajuda', style: { fontWeight: '600' } }, `Faltam — ${resumoPorSecao(necessarios)}`) : null,
        listaPendencias(necessarios),
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
