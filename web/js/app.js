// APP CCA – Portal do Corretor: rotas e telas do corretor.
import { h, limpar, icone, toast, adicionar } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import {
  marcaRegra, aviso, legendaAsteriscos, etapas, botaoOpcao, listaDocumentos, paginasDocumentos,
  avisoDocumentos, barraProgresso, dataHora, perguntarSimNao, listaPendencias, resumoPorSecao, faixaNotificacoes, logo, chipStatus, ativarNotificacoes, notificacoesAtivas,
  blocoConversa, topoMenu, cabecalho, secaoTitulo, painelPrevia, faixaProgresso, rolarParaColunas, blocoEntrevistaCorretor,
} from './componentes.js';
import { telaPainel, itensMenuEquipe } from './painel.js';
import { inicioCorretor } from './inicio.js';
import { conteudoEngenharia } from './engenharia.js';
import { conteudoGestao } from './gestao.js';
import { MODELO2 } from './config.js';
import * as IMV from './imoveis.js';
import * as M2 from './modelo2.js';
import { conteudoDesempenho } from './desempenho.js';
import { fluxograma } from './fluxo.js';
import { blocoContrato } from './contrato.js';
import { instalarBusca, abrirBusca } from './busca.js';

const raiz = document.getElementById('app');
let perfil = null;
let config = null;

// Busca rápida (Ctrl+K): clientes e telas do perfil que está logado
const contextoBusca = () => {
  if (!perfil) return null;
  const equipe = ['equipe_cca', 'admin'].includes(perfil.papel);
  if (R.ehConsumidor(perfil)) return { perfil, telas: [{ nome: 'Meu financiamento', href: '#/', icone: 'casa' }] };
  const teclaPorTela = { inicio: 'h', clientes: 'c', convites: 'v', docs: 'd', imobiliarias: 'i', corretores: 't', vendedores: 'e', mensagens: 'm', relatorios: 'r', acessos: 'a', config: 'f' };
  const telas = equipe ? itensMenuEquipe(perfil, '').map((i) => ({ nome: i.nome, href: i.href, icone: i.icone, tecla: teclaPorTela[i.href.split('/').pop()] }))
    : [{ nome: 'Início', href: '#/inicio', icone: 'painel', tecla: 'h' }, { nome: 'Meus clientes', href: '#/clientes', icone: 'pessoas', tecla: 'c' }, { nome: 'Novo cliente', href: '#/novo', icone: 'mais', tecla: 'n' }, { nome: 'Engenharia', href: '#/engenharia', icone: 'casa' }];
  return { perfil, telas };
};
instalarBusca(contextoBusca);

// ---------- rotas ----------
// #/entrar  #/clientes  #/novo  #/cliente/:id  #/cliente/:id/documentos
// #/cliente/:id/cadastro/:etapa  #/painel/:secao
export function ir(rota) { location.hash = rota; }

// Links que chegam pelo WhatsApp/notificação: ?c=<cliente> abre a ficha; ?acesso=<tipo>.<código> abre "criar senha"
(function linksExternos() {
  const q = new URLSearchParams(location.search);
  const c = q.get('c'); const acesso = q.get('acesso'); const irPara = q.get('ir');
  if (!c && !acesso && !irPara) return;
  q.delete('c'); q.delete('acesso'); q.delete('ir');
  let hash = location.hash;
  if (acesso) { const [tipo, ...resto] = acesso.split('.'); hash = `#/acesso?token_hash=${encodeURIComponent(resto.join('.'))}&tipo=${tipo === 'recovery' ? 'recovery' : 'invite'}`; }
  else if (c && /^[0-9a-f-]{36}$/i.test(c)) hash = `#/cliente/${c}`;
  // Avisos de engenharia e de verificação de identidade: ?ir=engenharia/<id> | painel/engenharia/<id> | painel/verificacoes | verificacao
  else if (irPara && /^(engenharia(\/[0-9a-f-]{36})?|painel\/engenharia(\/[0-9a-f-]{36})?|painel\/verificacoes|verificacao)$/i.test(irPara)) hash = `#/${irPara}`;
  history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : '') + hash);
})();

let vezRota = 0;
async function rotear() {
  // Só a navegação mais recente aparece (uma tela lenta não cobre a que a pessoa abriu depois)
  const vez = ++vezRota;
  let exibida = false;
  const exibir = (el) => { if (vez === vezRota) { exibida = true; mostrar(el); } };
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if ((partes[0] || '').startsWith('acesso')) return exibir(await telaAcesso());
  if ((partes[0] || '').startsWith('convite')) return exibir(await telaConvite());
  try {
    perfil = await api.sessao();
  } catch (e) { toast(e.message); perfil = null; }
  if (!perfil) return exibir(telaEntrar());
  // Tela lenta (mais de 0,2 s): mostra o esqueleto da página em vez de deixar a tela antiga ou em branco
  setTimeout(() => { if (vez === vezRota && !exibida) mostrar(esqueletoPagina()); }, 200);
  // Painel: relê a configuração (o ADM pode ter mudado um parâmetro); o servidor guarda em cache até mudar
  config = !config || partes[0] === 'painel' ? await api.configuracao() : config;
  const equipe = ['equipe_cca', 'admin'].includes(perfil.papel);
  const [a, b, c, d] = partes;
  try {
    // Consumidor final: primeiro confirma a identidade por vídeo; depois só vê o próprio processo
    if (R.ehConsumidor(perfil) && !equipe) {
      const verif = await api.minhaVerificacao();
      const liberado = verif?.status === 'aprovada';
      if (!liberado && ['novo', 'cliente'].includes(a)) return ir('/verificacao');
      if (a === 'engenharia' || a === 'painel') return ir('/');
      if (!a || a === 'clientes' || a === 'verificacao') {
        if (liberado && a !== 'verificacao') {
          const meus = await api.listarClientes();
          if (meus.length) return ir(meus[0].rascunho ? `/cliente/${meus[0].id}/cadastro/1` : `/cliente/${meus[0].id}`);
          return ir('/novo');
        }
        return exibir(telaVerificacao(verif));
      }
    }
    // Modelo 2: o cliente final só vê o próprio processo
    if (MODELO2 && M2.ehCliente(perfil)) {
      if (a === 'cliente' && b && c === 'documentos') return exibir(await telaDocumentos(b));
      if (a !== 'meu') return ir('/meu');
      return exibir(portal('meu', await M2.conteudoMeuFinanciamento({ perfil })));
    }
    if (MODELO2 && a === 'mais' && !equipe) return exibir(portal('mais', await M2.conteudoMais({ perfil, recarregar: rotear })));
    if (MODELO2 && a === 'desempenho' && !equipe) return exibir(portal('mais', await conteudoDesempenho({ perfil })));
    if (MODELO2 && a === 'gestao' && !M2.ehCeo(perfil)) return ir('/inicio');
    if (MODELO2 && a === 'comissoes' && M2.ehCeo(perfil)) return exibir(portal('comissoes', await M2.conteudoComissoes({ perfil })));
    if (MODELO2 && a === 'imoveis' && !equipe) return exibir(portal('mais', await IMV.conteudoImoveis({ daEquipe: false, id: b || null, recarregar: async () => { const y = window.scrollY; await rotear(); window.scrollTo(0, y); } })));
    if (MODELO2 && a === 'avisos' && !equipe && perfil.imobiliaria_id) return exibir(portal('avisos', await M2.conteudoAvisos({ perfil })));
    if (!a) return ir(equipe ? '/painel/inicio' : '/inicio');
    if (a === 'inicio' && !equipe) return exibir(portal('inicio', await inicioCorretor({ perfil, config })));
    if (a === 'gestao' && perfil.papel === 'gestor_imobiliaria') return exibir(portal('gestao', await conteudoGestao({ perfil, config })));
    if (a === 'clientes') return exibir(await telaClientes());
    if (a === 'novo') return exibir(telaCadastro(null, 1));
    if (a === 'engenharia' && !equipe) return exibir(portal('engenharia', await conteudoEngenharia({ daEquipe: false, id: b || null, recarregar: async () => { const y = window.scrollY; await rotear(); window.scrollTo(0, y); } })));
    if (a === 'cliente' && b && c === 'documentos') return exibir(await telaDocumentos(b));
    if (a === 'cliente' && b && c === 'cadastro') return exibir(await telaCadastroExistente(b, Number(d) || 1));
    // Equipe abrindo o link de um aviso (?c=): vai para o cliente selecionado no painel
    if (a === 'cliente' && b && equipe) return ir(`/painel/clientes/${b}`);
    if (a === 'cliente' && b) return exibir(window.matchMedia(MODELO2 ? '(min-width: 700px)' : '(min-width: 960px)').matches ? await telaClientes(b) : await telaFicha(b));
    if (a === 'painel' && equipe) return exibir(await telaPainel(b || 'clientes', { perfil, config, sair, selecionar: c || null, topo: { aoBuscar: () => abrirBusca(contextoBusca()), foto: perfil.foto || null, extras: [extraFoto()] } }));
    ir(equipe ? '/painel/inicio' : '/inicio');
  } catch (e) {
    if (vez !== vezRota) return; // a pessoa já foi para outra tela (ex.: saiu)
    console.error(e);
    exibir(h('div', { class: 'tela' }, h('div', { class: 'carregando' }, e.message, h('p', null, h('a', { href: '#/' }, 'Voltar ao início')))));
  }
}

function mostrar(el) {
  limpar(raiz);
  if (MODELO2 && perfil?.ver_como) raiz.appendChild(M2.faixaVerComo(perfil));
  if (api.demo) raiz.appendChild(h('div', { class: 'faixa-demo' }, MODELO2 ? 'Modelo 2 (demonstração): caminhos por perfil e fluxograma das etapas' : 'Modo demonstração: dados de exemplo, nada é enviado'));
  raiz.appendChild(el);
  window.scrollTo(0, 0);
}

async function sair() { await api.sair(); perfil = null; ir('/entrar'); rotear(); }

if (MODELO2) import('./genero.js').then((m) => m.ligarGeneroNeutro(document.body)).catch(() => {});
window.addEventListener('hashchange', rotear);
mostrar(h('div', { class: 'carregando' }, 'Carregando…'));
rotear();

// ---------- login ----------
function telaEntrar() {
  const email = h('input', { id: 'email', class: 'entrada', type: 'email', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', placeholder: 'seuemail@imobiliaria.com.br', required: true });
  const senha = h('input', { id: 'senha', class: 'entrada', type: 'password', style: { paddingRight: '52px' }, autocomplete: 'current-password', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', required: true });
  const erro = h('div', { class: 'erro-campo', role: 'alert' });
  const botao = h('button', { class: 'btn btn-primario', type: 'submit' }, 'Entrar');

  const form = h('form', { style: { display: 'flex', flexDirection: 'column', gap: '16px' }, onsubmit: async (e) => {
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
    botao,
    h('a', { class: 'link-central', target: '_blank', rel: 'noopener',
      href: 'https://wa.me/5521996394546', onclick: (e) => {
        e.currentTarget.href = `https://wa.me/5521996394546?text=${encodeURIComponent(`Olá! Esqueci minha senha do Portal do Corretor. Meu e-mail de acesso é ${email.value || '(meu e-mail)'}. Pode me mandar um novo link de acesso?`)}`;
      } }, 'Esqueci minha senha'),
    api.demo && MODELO2 ? aviso('azul', h('b', null, 'Modelo 2. '), 'Senha ', h('b', null, 'demo'), ' para todos. CCA: ', h('b', null, 'equipe@demo'), ' (nível 1), ', h('b', null, 'suzana@demo'), ' (nível 2), ', h('b', null, 'gabriel@demo'), ' (nível 3). Imobiliária: ',
      h('b', null, 'ceo@demo'), ', ', h('b', null, 'gestor@demo'), ', ', h('b', null, 'corretor@demo'), '. Independente: ', h('b', null, 'pedro@demo'), '. Cliente: ', h('b', null, 'cliente@demo'), '. Consumidor final: ', h('b', null, 'consumidor@demo'), '.')
      : api.demo ? aviso('azul', 'Demonstração: entre com ', h('b', null, 'corretor@demo'), ' ou ', h('b', null, 'equipe@demo'), ', senha ', h('b', null, 'demo'), '.') : null);

  return h('div', { class: 'tela tela-entrar' },
    h('div', { class: 'entrar-foto' }, h('img', { src: 'img/entrar.jpg', alt: '', width: 900, height: 900, decoding: 'async' })),
    h('div', { class: 'entrar-cartao' },
      logo('logo-entrar'),
      h('h1', null, 'Portal do Corretor'),
      h('p', { class: 'lema' }, 'Cadastre clientes, envie documentos e acompanhe cada aprovação.'),
      form),
    h('div', { class: 'entrar-rodape' },
      h('div', { class: 'contato' }, 'Acesso por convite da CCA · (21) 99639-4546'),
      h('div', { style: { display: 'flex', gap: '6px', alignItems: 'flex-start', maxWidth: '360px' } }, icone('cadeado', { tam: 15, cor: '#5A646B' }),
        h('span', null, 'Acesso individual e registrado. Os dados dos clientes são tratados conforme a LGPD.'))));
}

// ---------- link de convite / novo acesso: criar a senha ----------
// Convite por link: a pessoa preenche os próprios dados e cria a senha (sem login ainda)
async function telaConvite() {
  const token = new URLSearchParams(location.hash.split('?')[1] || '').get('t') || '';
  const corpo = h('div', { class: 'conteudo', style: { paddingBottom: '32px' } });
  const cabeca = h('div', { class: 'topo-boasvindas' },
    h('h1', null, 'Bem-vindo ao Portal do Corretor'));
  let cv;
  try { cv = await api.verConvite(token); }
  catch (e) {
    adicionar(corpo, aviso('laranja', h('strong', null, 'Convite inválido. '), e.message),
      h('a', { class: 'btn btn-primario', target: '_blank', rel: 'noopener', href: `https://wa.me/5521996394546?text=${encodeURIComponent('Olá! Meu convite para o Portal do Corretor não funcionou. Pode me mandar um novo?')}` }, 'Pedir novo convite pelo WhatsApp'),
      h('a', { class: 'btn btn-secundario', href: '#/entrar' }, 'Já tenho acesso: entrar'));
    return portal('', h('div', { class: 'tela' }, cabeca, corpo));
  }
  if (cv.tipo === 'consumidor' || cv.tipo === 'cliente') cabeca.querySelector('h1').textContent = 'Bem-vindo à Andrade Almeida CCA';
  const v = { nome: cv.nome || '', email: '', whatsapp: cv.whatsapp ? R.formatarCelular(cv.whatsapp) : '', cpf: '' };
  const imob = { cnpj: '' };
  const campo = (alvo, chave, id, rotulo, attrs = {}, formatar) => {
    const input = h('input', { id, class: 'entrada', value: alvo[chave] || '', ...attrs,
      oninput: (e) => { if (formatar) e.target.value = formatar(e.target.value); alvo[chave] = e.target.value; erro.textContent = ''; } });
    return [input, h('div', { class: 'campo' }, h('label', { for: id }, rotulo), input)];
  };
  const campoSenha = (id, rotulo) => {
    const input = h('input', { id, class: 'entrada', type: 'password', autocomplete: 'new-password', autocapitalize: 'none', style: { paddingRight: '52px' } });
    const olho = h('button', { type: 'button', class: 'btn-icone', 'aria-label': 'Mostrar senha', style: { position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', border: '0', background: 'transparent' },
      onclick: () => { const m = input.type === 'password'; input.type = m ? 'text' : 'password'; olho.setAttribute('aria-label', m ? 'Esconder senha' : 'Mostrar senha'); limpar(olho); olho.appendChild(icone(m ? 'olhoFechado' : 'olho', { cor: '#5A646B' })); } },
    icone('olho', { cor: '#5A646B' }));
    return [input, h('div', { class: 'campo' }, h('label', { for: id }, rotulo), h('div', { style: { position: 'relative' } }, input, olho))];
  };
  const erro = h('div', { class: 'erro-campo', role: 'alert' });

  // Imobiliária: CNPJ com busca na Receita
  let blocoImob = null;
  if (cv.tipo === 'imobiliaria') {
    const info = h('div', { 'aria-live': 'polite' });
    let ultima = '';
    const [, cCnpj] = campo(imob, 'cnpj', 'cv-cnpj', 'CNPJ da imobiliária', { inputmode: 'numeric', placeholder: '00.000.000/0000-00' }, (x) => {
      const f = R.formatarCnpj(x); const d = R.soDigitos(f);
      if (d.length === 14 && d !== ultima && R.cnpjValido(d)) { ultima = d; buscar(d); }
      return f;
    });
    const [inNome, cNome] = campo(imob, 'nome', 'cv-imob-nome', 'Nome da imobiliária (como vai aparecer no app)');
    const buscar = async (d) => {
      limpar(info); info.appendChild(h('div', { class: 'ajuda' }, 'Buscando os dados na Receita Federal…'));
      try {
        const r = await api.buscarCnpj(d);
        Object.assign(imob, r, { cnpj: R.formatarCnpj(r.cnpj || d) });
        if (!imob.nome) { imob.nome = r.nome_fantasia || r.razao_social; inNome.value = imob.nome; }
        limpar(info);
        const ativa = /ativa/i.test(r.situacao_cadastral || '');
        info.appendChild(aviso(ativa ? 'azul' : 'laranja', h('strong', null, r.razao_social || 'CNPJ encontrado'), h('br'),
          [r.logradouro, r.numero, r.complemento, r.bairro].filter(Boolean).join(', '), r.municipio ? ` · ${r.municipio}/${r.uf}` : '', h('br'),
          `Situação na Receita: ${r.situacao_cadastral || 'não informada'}`));
      } catch (e) { limpar(info); info.appendChild(aviso('laranja', e.message, ' Você pode continuar e a CCA confere depois.')); }
    };
    blocoImob = h('section', { class: 'cartao', style: { gap: '14px' } }, h('h2', { style: { fontSize: '17px' } }, 'Dados da imobiliária'), cCnpj, info, cNome);
  }

  const [, cNomeP] = campo(v, 'nome', 'cv-nome', 'Seu nome completo', { autocomplete: 'name' });
  const [, cCpf] = campo(v, 'cpf', 'cv-cpf', 'Seu CPF', { inputmode: 'numeric', placeholder: '000.000.000-00' }, R.formatarCpf);
  const [, cEmail] = campo(v, 'email', 'cv-email', 'Seu e-mail (vai ser o seu login)', { type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'none' });
  const [, cWhats] = campo(v, 'whatsapp', 'cv-whats', 'Seu WhatsApp', { inputmode: 'tel', placeholder: '(21) 90000-0000' }, R.formatarCelular);
  const [s1, cS1] = campoSenha('cv-senha', 'Crie uma senha');
  const [s2, cS2] = campoSenha('cv-senha2', 'Repita a senha');
  const aceita = h('input', { type: 'checkbox', id: 'cv-aceita', checked: true, style: { width: '22px', height: '22px', accentColor: '#3D657C', margin: '0', flexShrink: '0' } });
  const botao = h('button', { class: 'btn btn-primario', type: 'submit' }, 'Criar meu acesso');
  const form = h('form', { style: { display: 'flex', flexDirection: 'column', gap: '16px' }, onsubmit: async (e) => {
    e.preventDefault(); erro.textContent = '';
    if (cv.tipo === 'imobiliaria') {
      if (!R.cnpjValido(imob.cnpj || '')) { erro.textContent = 'Digite um CNPJ válido da imobiliária.'; return; }
      if (!String(imob.nome || '').trim()) { erro.textContent = 'Digite o nome da imobiliária.'; return; }
    }
    if (String(v.nome).trim().split(/\s+/).length < 2) { erro.textContent = 'Digite o seu nome completo.'; return; }
    if (cv.tipo === 'consumidor' && !R.cpfValido(v.cpf)) { erro.textContent = 'Digite o seu CPF (é obrigatório).'; return; }
    if (v.cpf && !R.cpfValido(v.cpf)) { erro.textContent = 'CPF inválido. Confira os números.'; return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) { erro.textContent = 'E-mail inválido.'; return; }
    if (R.soDigitos(v.whatsapp).length < 10) { erro.textContent = 'Digite o seu WhatsApp com DDD.'; return; }
    if (s1.value.length < 8) { erro.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
    if (s1.value !== s2.value) { erro.textContent = 'As duas senhas não são iguais.'; return; }
    botao.disabled = true; botao.textContent = 'Criando…';
    try {
      await api.aceitarConvite(token, { nome: v.nome.trim(), cpf: v.cpf, email: v.email.trim(), whatsapp: v.whatsapp, senha: s1.value, aceita_whatsapp: aceita.checked,
        imobiliaria: cv.tipo === 'imobiliaria' ? { ...imob, cnpj: R.soDigitos(imob.cnpj) } : undefined });
      await api.entrar(v.email.trim(), s1.value);
      toast('Acesso criado. Bem-vindo!');
      history.replaceState(null, '', location.pathname + location.search + '#/');
      rotear();
    } catch (err) { erro.textContent = err.message; botao.disabled = false; botao.textContent = 'Criar meu acesso'; }
  } },
  blocoImob,
  h('section', { class: 'cartao', style: { gap: '14px' } }, h('h2', { style: { fontSize: '17px' } }, cv.tipo === 'imobiliaria' ? 'Seus dados (responsável)' : 'Seus dados'),
    cNomeP, cCpf, cEmail, cWhats, cS1, cS2, h('div', { class: 'ajuda' }, 'Use pelo menos 8 caracteres. Guarde bem: ela é pessoal.')),
  h('label', { for: 'cv-aceita', style: { display: 'flex', gap: '12px', alignItems: 'flex-start', fontSize: '14px', lineHeight: '20px' } }, aceita,
    h('span', null, 'Aceito receber avisos da Andrade Almeida CCA no WhatsApp (status dos clientes e documentos pendentes).')),
  erro, botao);
  const quem = { cliente: 'pelo seu corretor para acompanhar o seu financiamento com a Andrade Almeida CCA', consumidor: 'para acompanhar o seu financiamento com a Andrade Almeida CCA', corretor: `como corretor${cv.imobiliaria_nome ? ` da ${cv.imobiliaria_nome}` : ''}`, imobiliaria: 'para cadastrar a sua imobiliária', equipe_cca: 'para a equipe da CCA', admin: 'para a equipe da CCA (ADM)' }[cv.tipo];
  adicionar(corpo, h('p', { style: { margin: '0', fontSize: '16px' } }, `${R.saudacao()}${cv.nome ? `, ${R.primeiroNome(cv.nome)}` : ''}! Você foi convidado(a) ${quem}. Preencha os dados abaixo e crie a sua senha.`), form);
  return portal('', h('div', { class: 'tela' }, cabeca, corpo));
}

// Consumidor final: confirmação de identidade por vídeo (antes de cadastrar o processo)
function telaVerificacao(verif) {
  const st = { arquivo: null };
  const area = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
  const passos = [
    ['Segure o seu RG ou CNH aberto, perto do rosto', 'O documento precisa estar legível. Pode ser a frente e, se quiser, o verso.'],
    ['Diga em voz alta o seu nome completo e o seu CPF', 'Depois diga: "Quero financiar com a Caixa pela Andrade Almeida CCA".'],
    ['Grave num lugar com boa luz, com até 1 minuto', 'Pelo celular, toque em "Gravar vídeo" e a câmera abre. Também pode escolher um vídeo da galeria.'],
  ];
  const desenhar = () => {
    limpar(area);
    if (verif?.status === 'em_analise') {
      adicionar(area, h('section', { class: 'cartao', style: { gap: '12px' } },
        secaoTitulo('Vídeo recebido', `Enviado em ${dataHora(verif.enviada_em)}.`, { pequeno: true, nivel: 'h3', icone: 'escudo' }),
        h('span', { class: 'chip chip-em_conferencia', style: { alignSelf: 'flex-start' } }, 'A CCA está conferindo'),
        h('div', { class: 'ajuda' }, 'Assim que a equipe confirmar a sua identidade, você preenche o cadastro do financiamento aqui mesmo. Volte a esta tela mais tarde.'),
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', style: { alignSelf: 'flex-start' }, onclick: () => rotear() }, 'Atualizar')));
      return;
    }
    if (verif?.status === 'aprovada') {
      adicionar(area, h('section', { class: 'cartao', style: { gap: '12px' } },
        secaoTitulo('Identidade confirmada', null, { pequeno: true, nivel: 'h3', icone: 'escudo' }),
        h('span', { class: 'chip chip-aceito', style: { alignSelf: 'flex-start' } }, 'Confirmada pela CCA'),
        h('a', { class: 'btn btn-primario', style: { alignSelf: 'flex-start' }, href: '#/novo' }, 'Continuar para o cadastro')));
      return;
    }
    const aceite = h('input', { type: 'checkbox', id: 'verif-aceite', style: { width: '22px', height: '22px', accentColor: '#3D657C', margin: '0', flexShrink: '0' }, onchange: () => { enviar.disabled = !(aceite.checked && st.arquivo); } });
    const erro = h('div', { class: 'erro-campo', role: 'alert' });
    const previa = h('div', { class: 'verif-video', hidden: true });
    const entrada = h('input', { type: 'file', id: 'verif-arquivo', accept: 'video/*', capture: 'user', style: { display: 'none' } });
    const escolher = h('button', { type: 'button', class: 'btn btn-primario', style: { alignSelf: 'flex-start' } }, icone('camera', { tam: 20, traco: 2.2 }), ' Gravar vídeo ou escolher da galeria');
    escolher.onclick = () => entrada.click();
    const enviar = h('button', { type: 'button', class: 'btn btn-primario', disabled: true }, 'Enviar vídeo para a CCA');
    entrada.onchange = () => {
      const f = entrada.files[0]; erro.textContent = ''; st.arquivo = null; limpar(previa); previa.hidden = true;
      if (!f) return;
      if (!/^video\//.test(f.type) && !/\.(mp4|mov|webm|m4v|3gp)$/i.test(f.name)) { erro.textContent = 'Escolha um arquivo de vídeo.'; return; }
      if (f.size > 80 * 1024 * 1024) { erro.textContent = 'O vídeo ficou grande demais (máximo 80 MB). Grave um mais curto, com até 1 minuto.'; return; }
      st.arquivo = f; previa.hidden = false;
      previa.appendChild(h('video', { src: URL.createObjectURL(f), controls: true, playsinline: true, preload: 'metadata', 'aria-label': 'Prévia do seu vídeo' }));
      enviar.disabled = !aceite.checked;
    };
    enviar.onclick = async () => {
      enviar.disabled = true; enviar.textContent = 'Enviando…'; erro.textContent = '';
      try { await api.enviarVerificacao(st.arquivo); toast('Vídeo enviado. A CCA vai conferir.'); rotear(); }
      catch (e) { erro.textContent = e.message; enviar.disabled = false; enviar.textContent = 'Enviar vídeo para a CCA'; }
    };
    adicionar(area,
      verif?.status === 'recusada' ? aviso('laranja', h('strong', null, 'A CCA não conseguiu confirmar o seu vídeo. '), verif.motivo || 'Grave outro vídeo seguindo os passos abaixo.') : null,
      h('section', { class: 'cartao', style: { gap: '14px' } },
        secaoTitulo('Como gravar o vídeo', 'Leva 1 minuto. É a única forma de a CCA saber que o financiamento é realmente seu.', { pequeno: true, nivel: 'h3', icone: 'camera' }),
        h('ol', { class: 'verif-passos' }, passos.map(([t, s], i) => h('li', null, h('i', { class: 'eng-bola' }, String(i + 1)), h('div', null, h('b', null, t), h('div', { class: 'sub' }, s))))),
        entrada, escolher, previa,
        h('label', { for: 'verif-aceite', style: { display: 'flex', gap: '12px', alignItems: 'flex-start', fontSize: '14px', lineHeight: '20px' } }, aceite,
          h('span', null, 'Autorizo a Andrade Almeida CCA a usar este vídeo apenas para confirmar a minha identidade. Ele fica guardado com segurança e só a equipe da CCA vê.')),
        erro, h('div', null, enviar)));
  };
  desenhar();
  return portal('verificacao', [
    cabecalho({ sobre: 'Andrade Almeida CCA', titulo: 'Confirme a sua identidade', sub: 'Antes de cadastrar o financiamento, a CCA precisa ter certeza de que é você.', foto: 'corretor' }),
    faixaVerificacao(verif), area]);
}
function faixaVerificacao(verif) {
  const etapas = [['Vídeo', 'enviado'], ['Conferência', 'em_analise'], ['Cadastro', 'aprovada']];
  const idx = verif?.status === 'aprovada' ? 2 : verif?.status === 'em_analise' ? 1 : 0;
  return h('ol', { class: 'eng-etapas', 'aria-label': 'Andamento' }, etapas.map(([nome], i) =>
    h('li', { class: i < idx ? 'feito' : i === idx ? 'agora' : '', 'aria-current': i === idx ? 'step' : null }, h('i', { class: 'eng-bola' }, i < idx ? icone('check', { tam: 14, traco: 3 }) : String(i + 1)), h('span', null, nome))));
}

async function telaAcesso() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const tipo = q.get('tipo') === 'recovery' ? 'recovery' : 'invite';
  const corpo = h('div', { class: 'conteudo', style: { paddingBottom: '24px' } });
  const cabeca = h('div', { class: 'topo-boasvindas' },
    h('h1', null, tipo === 'invite' ? 'Bem-vindo ao Portal do Corretor' : 'Crie uma nova senha'));
  let perfilLink = null;
  try { perfilLink = await api.entrarComLink(q.get('token_hash'), tipo); }
  catch (e) {
    adicionar(corpo, aviso('laranja', h('strong', null, 'Link inválido. '), e.message),
      h('a', { class: 'btn btn-primario', target: '_blank', rel: 'noopener', href: `https://wa.me/5521996394546?text=${encodeURIComponent('Olá! Meu link de acesso ao Portal do Corretor expirou. Pode me mandar um novo?')}` }, 'Pedir novo link pelo WhatsApp'),
      h('a', { class: 'btn btn-secundario', href: '#/' }, 'Ir para o login'));
    return portal('', h('div', { class: 'tela' }, cabeca, corpo));
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
  return portal('', h('div', { class: 'tela' }, cabeca, corpo));
}

// ---------- lista de clientes ----------
const estadoLista = { filtro: 'todos', busca: '', visao: 'lista' };
try { if (localStorage.getItem('appcca-visao-corretor') === 'quadro') estadoLista.visao = 'quadro'; } catch { /* sem armazenamento */ }

// Meus clientes: mesmo padrão do painel da equipe (cabeçalho, filtros, Lista | Quadro, tabela)
async function telaClientes(selId = null) {
  const clientes = await api.listarClientes();
  const ficha = selId ? await montarFicha(selId) : null;
  const ehGestor = perfil.papel === 'gestor_imobiliaria';
  const APROVADOS = ['cliente_aprovado', 'entrevista', 'conformidade', 'minuta_em_maos', 'contrato_assinado', 'registro_cartorio', 'conformidade_final', 'credito_liberado'];
  const filtros = [
    ['todos', 'Todos', () => true],
    ['mensagens', 'Mensagens novas', (c) => c.conversa_nao_lidas > 0],
    ['pendencia', 'Com pendência', (c) => !c.rascunho && (c.docs_pendentes > 0 || c.docs_recusados > 0)],
    ['andamento', 'Em andamento', (c) => !c.rascunho && !APROVADOS.includes(c.status)],
    ['aprovados', 'Aprovados', (c) => !c.rascunho && APROVADOS.includes(c.status)],
    ['rascunhos', 'Rascunhos', (c) => c.rascunho],
  ];
  const caixaFiltros = h('div', { class: 'pilulas', role: 'group', 'aria-label': 'Filtrar clientes' });
  const caixaVisao = h('div', { class: 'alternar-visao', role: 'group', 'aria-label': 'Ver como' });
  const caixaTabela = h('div', { class: 'tabela-caixa' });
  const abrir = (c) => ir(c.rascunho ? `/cliente/${c.id}/cadastro/1` : `/cliente/${c.id}`);
  const alertas = (c) => [
    c.rascunho ? h('span', { class: 'chip chip-pendente' }, 'Rascunho') : null,
    c.conversa_nao_lidas ? h('span', { class: 'chip chip-msg' }, icone('conversa', { tam: 13, cor: '#FFFFFF', traco: 2.4 }), `${c.conversa_nao_lidas} da CCA`) : null,
  ].filter(Boolean);
  const docs = (c) => c.rascunho ? null : [
    c.docs_recusados ? h('div', null, h('span', { class: 'chip chip-alerta' }, `${c.docs_recusados} recusado`)) : null,
    c.docs_pendentes ? h('div', null, h('span', { class: 'chip chip-alerta' }, `Faltam ${c.docs_pendentes}`)) : null,
    c.docs_em_conferencia ? h('div', null, h('span', { class: 'chip chip-em_conferencia' }, `${c.docs_em_conferencia} em conferência`)) : null,
    !c.docs_pendentes && !c.docs_recusados && !c.docs_em_conferencia ? 'Completo' : null,
    c.pode_ir_para_analise === false ? h('div', { class: 'sub', style: { color: '#8A4E12', fontWeight: '700', marginTop: '4px' } }, h('span', { class: 'falta-obrig' }, icone('alerta', { tam: 14, cor: '#8A4E12', traco: 2.2 }), 'Falta obrigatório (**)')) : null,
  ];

  const desenhar = () => {
    limpar(caixaVisao);
    [['lista', 'Lista'], ['quadro', 'Quadro']].forEach(([v, nome]) => caixaVisao.appendChild(botaoOpcao(nome, estadoLista.visao === v, () => {
      estadoLista.visao = v; try { localStorage.setItem('appcca-visao-corretor', v); } catch { /* sem armazenamento */ } desenhar();
    }, 'pilula')));
    limpar(caixaFiltros);
    filtros.forEach(([cod, nome, fn]) => {
      const n = clientes.filter(fn).length;
      if (n || cod === 'todos' || estadoLista.filtro === cod) caixaFiltros.appendChild(botaoOpcao(`${nome} · ${n}`, estadoLista.filtro === cod, () => { estadoLista.filtro = cod; desenhar(); }, 'pilula'));
    });
    const termo = R.soDigitos(estadoLista.busca) || estadoLista.busca.toLowerCase().trim();
    const f = (filtros.find((x) => x[0] === estadoLista.filtro) || filtros[0])[2];
    const vis = clientes.filter(f).filter((c) => !termo || c.nome.toLowerCase().includes(termo) || R.soDigitos(c.cpf).includes(termo) || (ehGestor && String(c.corretor_nome || '').toLowerCase().includes(termo)));
    limpar(caixaTabela);
    if (estadoLista.visao === 'quadro') {
      const colunas = [{ codigo: 'rascunho', nome: 'Rascunho' }, ...config.status];
      caixaTabela.appendChild(h('div', { class: 'quadro', role: 'list', 'aria-label': 'Quadro de clientes por status' },
        colunas.filter((st) => st.codigo !== 'rascunho' || vis.some((c) => c.rascunho)).map((st) => {
          const doStatus = vis.filter((c) => (st.codigo === 'rascunho' ? c.rascunho : !c.rascunho && c.status === st.codigo));
          return h('section', { class: 'quadro-coluna', role: 'listitem', 'aria-label': `${st.nome}: ${doStatus.length}` },
            h('header', { class: 'quadro-cab' }, h('span', { class: `ponto-status st-${st.codigo}`, 'aria-hidden': 'true' }), h('b', null, st.nome), h('span', { class: 'quadro-num' }, doStatus.length)),
            doStatus.length ? doStatus.map((c) => h('button', { type: 'button', class: `quadro-cartao${c.id === selId ? ' selecionado' : ''}`, onclick: () => abrir(c) },
              h('b', { class: 'quadro-nome' }, c.nome),
              h('span', { class: 'quadro-meta' }, `${R.formatarCpf(c.cpf)} · ${c.programa || '—'}${ehGestor && c.corretor_nome ? ` · ${c.corretor_nome}` : ''}`),
              (() => {
                const ch = [...alertas(c).filter((x) => !x.classList.contains('chip-pendente')),
                  c.docs_recusados ? h('span', { class: 'chip chip-alerta' }, `${c.docs_recusados} recusado`) : null,
                  c.docs_pendentes && !c.rascunho ? h('span', { class: 'chip chip-alerta' }, `Faltam ${c.docs_pendentes}`) : null].filter(Boolean);
                return ch.length ? h('span', { class: 'quadro-chips' }, ch) : null;
              })()))
              : h('div', { class: 'quadro-vazio' }, 'Nenhum cliente'));
        })));
      return;
    }
    const cols = ['Cliente', ...(ehGestor ? ['Corretor'] : []), 'Operação', 'Docs', 'Status'];
    caixaTabela.appendChild(h('table', { class: 'tabela tabela-clicavel' },
      h('thead', null, h('tr', null, cols.map((t) => h('th', { class: t === 'Operação' ? 'col-op' : null }, t)))),
      h('tbody', null, vis.length ? vis.map((c) => h('tr', { tabindex: 0, role: 'link', 'aria-label': `Abrir ${c.nome}`, class: c.id === selId ? 'selecionado' : null, onclick: () => abrir(c), onkeydown: (e) => { if (e.key === 'Enter') abrir(c); } },
        h('td', null, h('div', { style: { fontWeight: '700' } }, c.nome), h('div', { class: 'sub' }, R.formatarCpf(c.cpf)),
          alertas(c).length ? h('div', { class: 'linha-chips' }, alertas(c)) : null),
        ehGestor ? h('td', null, h('div', { style: { fontWeight: '600' } }, c.corretor_nome || '—')) : null,
        h('td', { class: 'col-op' }, c.programa || '—', h('div', { class: 'sub' }, c.imovel || '')),
        h('td', null, ...(docs(c) || ['—'])),
        h('td', null, c.rascunho ? h('a', { href: `#/cliente/${c.id}/cadastro/1`, onclick: (e) => e.stopPropagation() }, 'Continuar cadastro') : chipStatus(c.status, c.status_nome))))
        : h('tr', null, h('td', { colspan: cols.length, class: 'sub vazio-grande' }, clientes.length ? null : h('img', { class: 'ilustra-vazio', src: 'img/vazio-clientes.jpg', alt: '', width: 200, height: 150 }),
          clientes.length ? 'Nenhum cliente neste filtro.' : 'Você ainda não cadastrou clientes. Toque em Novo cliente para começar.')))));
  };

  const busca = h('input', { id: 'busca', type: 'search', class: 'entrada', placeholder: ehGestor ? 'Nome, CPF ou corretor' : 'Nome ou CPF', value: estadoLista.busca, style: { width: '300px', maxWidth: '100%' },
    oninput: (e) => { estadoLista.busca = e.target.value; desenhar(); } });
  desenhar();
  if (selId) setTimeout(() => (MODELO2 ? M2.rolarAteSelecionado(document.getElementById('clienteSelecionado')) : rolarParaColunas()), 150);
  if (MODELO2) setTimeout(() => { const t = caixaTabela; if (t && estadoLista.rolagemLista) t.scrollTop = estadoLista.rolagemLista; t?.addEventListener('scroll', () => { estadoLista.rolagemLista = t.scrollTop; }, { passive: true }); }, 0);

  return portal('clientes', [
    cabecalho({ titulo: MODELO2 && ehGestor ? 'Clientes da imobiliária' : 'Meus clientes', sobre: MODELO2 ? M2.nomePerfil(perfil) : 'Portal do corretor', sub: `${R.saudacao()}, ${R.primeiroNome(perfil.nome)}. Acompanhe cada aprovação e envie o que falta.`, foto: 'corretor' },
      h('div', null, h('label', { for: 'busca', class: 'sr' }, 'Buscar cliente'), busca),
      h('a', { class: 'btn btn-primario btn-pequeno', href: '#/novo' }, icone('mais', { tam: 18, traco: 2.4 }), 'Novo cliente')),
    faixaNotificacoes(config),
    h('div', { class: 'barra-filtros' }, caixaFiltros, caixaVisao),
    ficha
      ? h('div', { class: `painel-colunas${estadoLista.visao === 'quadro' ? ' com-quadro' : ''}${MODELO2 ? ' m2-empilhado' : ''}` }, h('div', { class: 'principal' }, caixaTabela), painelCliente(ficha))
      : caixaTabela,
  ]);
}

// Avisos: liga as notificações neste aparelho ou explica como elas chegam
async function abrirAvisos() {
  if (config?.parametros?.canal_avisos === 'push' && !notificacoesAtivas()) {
    try { await ativarNotificacoes(config.parametros.vapid_publica); toast('Avisos ativados neste aparelho.'); document.querySelector('.faixa-avisos')?.remove(); } catch (e) { toast(e.message); }
  } else toast('Os avisos da CCA chegam aqui como notificação, no seu WhatsApp e no seu e-mail.');
}

// Foto do perfil: escolhe, recorta quadrado (256 px) e guarda
const extraFoto = () => ({ nome: perfil.foto ? 'Trocar minha foto' : 'Minha foto', icone: 'pessoa', onclick: abrirFoto });
const extrasUsuario = () => [extraFoto(), { nome: 'Avisos neste aparelho', icone: 'sino', onclick: abrirAvisos }];
function reduzirFoto(arquivo) {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(arquivo); const img = new Image();
    img.onload = () => {
      const t = 256; const c = document.createElement('canvas'); c.width = t; c.height = t;
      const lado = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, t, t);
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não consegui abrir essa foto. Tente outra.')); };
    img.src = url;
  });
}
function abrirFoto() {
  if (document.querySelector('.foto-fundo')) return;
  let nova = null;
  const previa = h('div', { class: 'foto-previa' });
  const desenhar = () => {
    limpar(previa);
    const src = nova || perfil.foto;
    if (src) previa.appendChild(h('img', { src, alt: 'Sua foto' }));
    else previa.textContent = (perfil.nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  };
  const fechar = () => fundo.remove();
  const arq = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: async () => {
    const f = arq.files[0]; if (!f) return;
    try { nova = await reduzirFoto(f); desenhar(); salvar.disabled = false; } catch (e) { toast(e.message); }
  } });
  const salvar = h('button', { type: 'button', class: 'btn btn-primario', disabled: true }, 'Salvar foto');
  salvar.onclick = async () => {
    salvar.disabled = true;
    try { await api.salvarMinhaFoto(nova); perfil = await api.sessao(); toast('Foto salva.'); fechar(); rotear(); } catch (e) { toast(e.message); salvar.disabled = false; }
  };
  const tirar = perfil.foto ? h('button', { type: 'button', class: 'btn btn-secundario', onclick: async () => {
    try { await api.salvarMinhaFoto(null); perfil = await api.sessao(); toast('Foto removida.'); fechar(); rotear(); } catch (e) { toast(e.message); }
  } }, 'Remover foto') : null;
  const fundo = h('div', { class: 'busca-fundo foto-fundo', onclick: (e) => { if (e.target === fundo) fechar(); } },
    h('div', { class: 'busca-caixa foto-caixa', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Minha foto' },
      h('h2', null, 'Minha foto'), h('p', { class: 'ajuda' }, 'Ela aparece no círculo do menu. Escolha uma foto do rosto, de frente.'),
      previa, arq,
      h('div', { class: 'foto-acoes' }, h('button', { type: 'button', class: 'btn btn-contorno', onclick: () => arq.click() }, icone('clipe', { tam: 18, traco: 2.2 }), ' Escolher foto'), salvar, tirar,
        h('button', { type: 'button', class: 'btn btn-secundario', onclick: fechar }, 'Fechar'))));
  document.body.appendChild(fundo); desenhar();
}

// Barra superior: a mesma do painel da equipe (logo, menu em botões, nome e Sair).
// `confirmarSaida`: no cadastro, pergunta antes de sair da tela pela logo ou pelo menu.
function barraTopo(ativo = '', { confirmarSaida = null } = {}) {
  const guardar = confirmarSaida ? (destino) => (e) => {
    e.preventDefault();
    confirmarSaida().then((ok) => { if (ok) ir(destino); });
  } : null;
  if (!perfil) return h('nav', { class: 'painel-topo', 'aria-label': 'Início' }, h('a', { href: '#/entrar', 'aria-label': 'Início', style: { display: 'flex' } }, logo('logo-painel')));
  const equipe = ['equipe_cca', 'admin'].includes(perfil.papel);
  if (equipe) {
    return topoMenu({ aoBuscar: () => abrirBusca(contextoBusca()), inicio: '#/painel/inicio', rotulo: 'Menu da equipe', itens: itensMenuEquipe(perfil, ativo === 'clientes' ? 'clientes' : ''),
      usuario: `${perfil.nome} · ${perfil.papel === 'admin' ? 'ADM' : 'Usuário'}`, aoSair: sair, guardar, foto: perfil.foto || null, extras: [extraFoto()] });
  }
  if (R.ehConsumidor(perfil)) {
    return topoMenu({ aoBuscar: () => abrirBusca(contextoBusca()), inicio: '#/', rotulo: 'Menu principal', guardar, aoSair: sair, usuario: `${perfil.nome} · Consumidor final`,
      itens: [{ href: '#/', nome: 'Meu financiamento', icone: 'casa', ativo: ativo !== 'avisos' }],
      foto: perfil.foto || null, extras: extrasUsuario() });
  }
  const papel = perfil.papel === 'gestor_imobiliaria' ? 'Imobiliária' : 'Corretor';
  if (MODELO2) {
    return topoMenu({ aoBuscar: M2.ehCliente(perfil) ? null : () => abrirBusca(contextoBusca()), inicio: M2.ehCliente(perfil) ? '#/meu' : '#/inicio', rotulo: 'Menu principal', guardar, aoSair: sair,
      usuario: `${perfil.nome} · ${M2.nomePerfil(perfil)}`, itens: M2.itensPortal(perfil, ativo), foto: perfil.foto || null, extras: extrasUsuario() });
  }
  return topoMenu({ aoBuscar: () => abrirBusca(contextoBusca()), inicio: '#/inicio', rotulo: 'Menu principal', guardar, aoSair: sair,
    usuario: `${perfil.nome} · ${perfil.imobiliaria_nome || papel}`,
    itens: [
      { href: '#/inicio', nome: 'Início', icone: 'painel', ativo: ativo === 'inicio' },
      ...(perfil.papel === 'gestor_imobiliaria' ? [{ href: '#/gestao', nome: 'Gestão', icone: 'grafico', ativo: ativo === 'gestao' }] : []),
      { href: '#/clientes', nome: perfil.papel === 'gestor_imobiliaria' ? 'Clientes' : 'Meus clientes', icone: 'pessoas', ativo: ativo === 'clientes' },
      { href: '#/novo', nome: 'Novo cliente', icone: 'mais', ativo: ativo === 'novo' },
      { href: '#/engenharia', nome: 'Engenharia', icone: 'casa', ativo: ativo === 'engenharia' },
    ],
    foto: perfil.foto || null, extras: extrasUsuario() });
}

// Página do portal: mesma estrutura do painel (barra no topo + corpo)
function portal(ativo, conteudo, opcoes) {
  return h('div', { class: 'painel portal' }, barraTopo(ativo, opcoes), h('main', { class: 'painel-corpo' }, ...[].concat(conteudo)));
}

// Esqueleto de carregamento: mesmo menu e cabeçalho, com blocos cinza onde o conteúdo vai entrar
function esqueletoPagina() {
  const bloco = (cls) => h('div', { class: `esq ${cls}`, 'aria-hidden': 'true' });
  return portal('', [bloco('esq-cab'), h('div', { class: 'esq-linha-filtros', 'aria-hidden': 'true' }, bloco('esq-pilula'), bloco('esq-pilula'), bloco('esq-pilula')),
    h('div', { class: 'esq-cartao', role: 'status', 'aria-label': 'Carregando' }, bloco('esq-linha'), bloco('esq-linha'), bloco('esq-linha'), bloco('esq-linha'))]);
}

// Link "voltar" no começo do conteúdo, sempre no mesmo lugar
function voltarLink(href, texto, onclick) {
  return h('a', { href, class: 'voltar-link', onclick }, icone('voltar', { tam: 20, traco: 2.4 }), texto);
}

function navInferior() { return null; } // menu inferior antigo: o menu agora é o do topo, igual ao painel

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
  // Consumidor final: o titular é a própria pessoa, então já vem preenchido com o que ela informou no convite
  if (!dados && R.ehConsumidor(perfil)) Object.assign(cli, { nome: perfil.nome, cpf: R.formatarCpf(perfil.cpf || ''), celular: perfil.whatsapp ? R.formatarCelular(perfil.whatsapp) : '', email: perfil.email || '' });
  const outros = dados ? (dados.participantes || []).map((p) => ({ ...p })) : [];
  const titulos = { [E.compradores]: 'Compradores', [E.renda]: 'Renda e dependentes', [E.operacao]: 'Operação', [E.imovel]: 'Imóvel', [E.vendedor]: 'Vendedor', [E.docs]: 'Documentos', [E.revisao]: 'Revisão' };
  const total = temVendedor(cli) ? 7 : 6;
  const posicao = !temVendedor(cli) && etapa > E.vendedor ? etapa - 1 : etapa;
  const daEquipe = ['equipe_cca', 'admin'].includes(perfil?.papel); // equipe da CCA editando o cadastro pelo painel
  const voltarPara = etapa === 1 ? (daEquipe ? '#/painel/clientes' : cli.id && !cli.rascunho ? `#/cliente/${cli.id}` : '#/clientes') : `#/cliente/${cli.id}/cadastro/${etapaAnterior(etapa, cli)}`;
  const conteudo = h('div', { class: 'conteudo' });
  const rodape = h('div', { class: 'rodape-fixo' });
  const erro = h('div', { class: 'erro-campo', role: 'alert' });

  // Salvamento automático: em rascunho e em cliente já enviado, depois de 2,5 s sem digitar. Nome e CPF válidos são o mínimo.
  const selo = h('div', { class: 'autosave', role: 'status', 'aria-live': 'polite' });
  let temporizador = null; let salvando = false; let sujo = false;
  const esperarAutosave = async () => { clearTimeout(temporizador); while (salvando) await new Promise((r) => setTimeout(r, 80)); };

  const salvarEAvancar = async (botao, validar) => {
    erro.textContent = '';
    const msg = validar?.();
    if (msg) { erro.textContent = msg; erro.scrollIntoView({ block: 'center' }); return; }
    botao.disabled = true;
    try {
      await esperarAutosave();
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

  // Rodapé do cadastro: [Voltar] [Salvar rascunho] lado a lado e, embaixo, o Continuar em destaque
  const botaoVoltar = () => h('a', { class: 'btn btn-secundario cheio', href: voltarPara }, icone('voltar', { tam: 18, traco: 2.4 }), 'Voltar');
  const botaoRascunho = () => h('button', { class: 'btn btn-secundario cheio', type: 'button', onclick: async () => {
    if (!cli.nome || !R.cpfValido(cli.cpf || '')) return toast('Preencha nome e CPF para salvar o rascunho.');
    try { await esperarAutosave(); const salvo = await salvarTudo(); if (depoisDeSalvar) await depoisDeSalvar(salvo).catch(() => {}); toast('Rascunho salvo. Você continua de onde parou tocando no cliente.'); ir('/clientes'); } catch (e) { toast(e.message); }
  } }, 'Salvar rascunho');
  const linhaSecundaria = (comRascunho = true) => h('div', { class: 'linha-botoes' }, botaoVoltar(), comRascunho && !daEquipe ? botaoRascunho() : null);
  const botoesRodape = (validar) => {
    const continuar = h('button', { class: 'btn btn-primario', type: 'button' }, 'Continuar');
    continuar.onclick = () => salvarEAvancar(continuar, validar);
    adicionar(rodape, erro, linhaSecundaria(), continuar);
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
    // CTPS: número e série (pedidos pelo SIOPI para renda formal e FGTS). Na CTPS digital, número = 7 primeiros dígitos do CPF e série = 4 últimos.
    const camposCtps = (alvo, prefixo) => {
      const num = h('input', { id: `${prefixo}ctps_numero`, class: 'entrada', inputmode: 'numeric', maxlength: '8', placeholder: '0000000', value: alvo.ctps_numero || '',
        oninput: (e) => { e.target.value = R.soDigitos(e.target.value); alvo.ctps_numero = e.target.value || null; erro.textContent = ''; } });
      const serie = h('input', { id: `${prefixo}ctps_serie`, class: 'entrada', inputmode: 'numeric', maxlength: '5', placeholder: '0000', value: alvo.ctps_serie || '',
        oninput: (e) => { e.target.value = R.soDigitos(e.target.value); alvo.ctps_serie = e.target.value || null; erro.textContent = ''; } });
      const usarCpf = h('button', { type: 'button', class: 'btn-link', id: `${prefixo}ctps_cpf`, onclick: () => {
        const c = R.ctpsDigitalDoCpf(alvo.cpf);
        if (!c) return toast('Preencha o CPF primeiro.');
        num.value = alvo.ctps_numero = c.numero; serie.value = alvo.ctps_serie = c.serie; erro.textContent = '';
      } }, 'É CTPS digital? Preencher pelo CPF');
      return h('div', { class: 'campo' },
        h('div', { class: 'campos-ctps' },
          h('div', { class: 'campo' }, h('label', { for: num.id }, 'CTPS: número *'), num),
          h('div', { class: 'campo' }, h('label', { for: serie.id }, 'Série *'), serie)),
        h('div', { class: 'ajuda' }, 'Para quem tem carteira assinada. ', usarCpf));
    };
    const camposPessoa = (alvo, prefixo, cpfTravado) => [
      campoDe(alvo, prefixo, 'Nome completo', 'nome', { autocomplete: 'off' }),
      campoDe(alvo, prefixo, 'CPF', 'cpf', { inputmode: 'numeric', placeholder: '000.000.000-00', disabled: cpfTravado }, R.formatarCpf),
      campoDe(alvo, prefixo, 'Data de nascimento', 'data_nascimento', { type: 'date' }),
      campoDe(alvo, prefixo, 'Celular (WhatsApp) *', 'celular', { inputmode: 'tel', placeholder: '(21) 90000-0000' }, R.formatarCelular),
      campoDe(alvo, prefixo, 'E-mail *', 'email', { type: 'email', inputmode: 'email', placeholder: 'email@exemplo.com' }),
      campoDe(alvo, prefixo, 'Número do PIS *', 'pis', { inputmode: 'numeric', placeholder: '000.00000.00-0', maxlength: '14' }),
      camposCtps(alvo, prefixo),
      h('div', { class: 'ajuda', style: { marginTop: '-6px' } }, '* Pode preencher depois.'),
      h('div', { class: 'campo' }, h('label', { for: `${prefixo}escolaridade` }, 'Grau de escolaridade'),
        h('select', { id: `${prefixo}escolaridade`, class: 'entrada', onchange: (e) => { alvo.escolaridade = e.target.value || null; erro.textContent = ''; } },
          h('option', { value: '' }, 'Escolha'), R.ESCOLARIDADE.map((v) => h('option', { value: v, selected: alvo.escolaridade === v }, v)))),
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
        adicionar(areaPessoas, grupoOpcoes('Regime de bens do casamento', 'regime_bens', op(R.REGIME_BENS), 1, cli, () => desenharPessoas()),
          R.pedePacto(cli) ? aviso('laranja', 'Este regime exige pacto antenupcial (Código Civil): envie o pacto e o registro do pacto.') : null);
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
          grupoOpcoes('Estado civil', 'estado_civil', op(config.opcoes.estado_civil), 2, p, () => { if (p.estado_civil !== 'Casado(a)') p.regime_bens = null; desenharPessoas(); }),
          p.estado_civil === 'Casado(a)' ? grupoOpcoes('Regime de bens do casamento', 'regime_bens', op(R.REGIME_BENS), 1, p, () => desenharPessoas()) : null,
          R.pedePacto(p) ? aviso('laranja', 'Este regime exige pacto antenupcial (Código Civil): envie o pacto e o registro do pacto.') : null));
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
      if (!cli.escolaridade) return 'Escolha o grau de escolaridade do titular.';
      if (!cli.estado_civil) return 'Escolha o estado civil do titular.';
      if (casado() && !cli.regime_bens) return 'Escolha o regime de bens do casamento do titular.';
      if (!casado()) cli.regime_bens = null;
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
        if (!p.escolaridade) return `Escolha o grau de escolaridade ${quem}.`;
        if (!p.conjuge_do_titular && p.estado_civil === 'Casado(a)' && !p.regime_bens) return `Escolha o regime de bens ${quem}.`;
        if (p.conjuge_do_titular) p.regime_bens = null;
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
      MODELO2 ? grupoOpcoes('Como o contrato vai ser assinado?', 'assinatura_contrato', [['Nato Digital (gov.br)', 'nato_digital'], ['Manual (em papel)', 'manual']], 2) : null,
      MODELO2 ? h('div', { class: 'ajuda', style: { marginTop: '-6px' } }, 'Nato Digital: todos assinam pelo gov.br. Manual: para quem tem dificuldade com o gov.br. A escolha muda o processo na Caixa.') : null,
      aviso('azul', 'Cada resposta ajusta a lista de documentos. Você verá só o que esta operação exige.'));
    botoesRodape(() => {
      if (!cli.modalidade) return 'Escolha a modalidade.';
      if (!cli.programa) return 'Escolha o programa.';
      const e = R.enquadramentoDoProcesso(cli, outros, config.parametros);
      if (cli.programa === 'MCMV' && e.renda.considerada && R.enquadrarMcmv({ rendaMensal: e.renda.considerada, zona: cli.imovel_zona || 'Urbana' }, config.parametros).foraPorRenda) return 'Renda acima do limite do MCMV. Escolha SBPE ou Pró-Cotista.';
      if (cli.usa_fgts === undefined || cli.usa_fgts === null) return 'Responda se vai usar FGTS.';
      if (cli.cotista_fgts === undefined || cli.cotista_fgts === null) return 'Responda se algum comprador tem 3 anos ou mais de FGTS.';
      if (cli.programa === 'Pró-Cotista' && !cli.cotista_fgts) return 'A linha Pró-Cotista exige comprador com 3 anos ou mais de FGTS.';
      if (MODELO2 && !cli.assinatura_contrato) return 'Escolha como o contrato vai ser assinado: Nato Digital ou Manual.';
      const rural = R.bloqueioZonaRural(cli);
      if (rural) return rural.replace(' Volte em Operação e escolha', ' Escolha');
      if (!cli.usa_fgts) { cli.fgts_local_ok = null; cli.fgts_tem_imovel_regiao = null; }
      if (cli.modalidade !== 'Aquisição de Imóvel') cli.imovel = null;
      if (!temVendedor(cli)) { cli.vendedor = null; cli.empreendimento_caixa = null; }
      return null;
    });
  }

  // ---------- Etapa 4: Imóvel ----------
  if (etapa === E.imovel) {
    const pedeImovel = cli.modalidade === 'Aquisição de Imóvel';
    const infoTeto = h('div', { class: 'ajuda', 'aria-live': 'polite' });
    const grupoRm = grupoOpcoes('Fica em região metropolitana?', 'imovel_regiao_metropolitana', [['Sim', true], ['Não', false]], 2);
    // Zona rural: FGTS só financia imóvel urbano
    const avisoZona = h('div', { 'aria-live': 'polite' });
    const desenharAvisoZona = () => {
      limpar(avisoZona);
      if (cli.imovel_zona !== 'Rural') return;
      const b = R.bloqueioZonaRural(cli);
      avisoZona.appendChild(b
        ? aviso('laranja', h('strong', null, 'Zona rural fora do FGTS. '), b.replace(/^[^:]+: /, ''))
        : aviso('laranja', h('strong', null, 'Confirme com a agência antes de seguir. '),
          'A Caixa financia, em regra, imóvel residencial urbano. Imóvel rural no SBPE depende de aceite da agência e da avaliação de engenharia. O MCMV Rural é outro programa: só por entidade organizadora (construção ou reforma), não passa pelo CCA.'));
    };
    // Uso do FGTS: local do imóvel (inclui municípios vizinhos e a mesma região metropolitana)
    const ajudaRmFgts = h('div', { class: 'ajuda', style: { marginTop: '-6px' } });
    const desenharAjudaRmFgts = (nomeRm) => {
      ajudaRmFgts.textContent = nomeRm
        ? `Vale qualquer cidade da ${nomeRm}, onde fica este imóvel, e as cidades vizinhas.`
        : 'Vale também cidade vizinha ou da mesma região metropolitana.';
    };
    desenharAjudaRmFgts(null);
    const avisoFgts = h('div', { 'aria-live': 'polite' });
    const desenharAvisoFgts = () => {
      limpar(avisoFgts);
      const b = R.bloqueioFgtsLocal(cli);
      if (b) avisoFgts.appendChild(aviso('laranja', h('strong', null, 'FGTS não pode ser usado. '), b));
    };
    const blocoFgts = cli.usa_fgts ? h('section', { class: 'cartao', style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('h2', { style: { fontSize: '17px' } }, 'Regras do FGTS para o local'),
      grupoOpcoes('O imóvel fica na cidade onde algum comprador trabalha, ou onde mora há pelo menos 1 ano?', 'fgts_local_ok', [['Sim', true], ['Não', false]], 2),
      ajudaRmFgts,
      grupoOpcoes('Algum comprador já tem imóvel residencial nessa região, ou financiamento habitacional ativo?', 'fgts_tem_imovel_regiao', [['Sim', true], ['Não', false]], 2),
      h('div', { class: 'ajuda', style: { marginTop: '-6px' } }, 'Região = cidade onde mora ou trabalha, cidades vizinhas e a mesma região metropolitana. Financiamento ativo no SFH, em qualquer lugar, também impede.'),
      avisoFgts) : null;
    const buscarTeto = async () => {
      limpar(infoTeto);
      desenharAjudaRmFgts(null);
      if (!cli.imovel_uf || !cli.imovel_municipio) { cli.imovel_teto_f12 = null; desenharAvisoValor(); return; }
      let t = null;
      try { t = await api.tetoMunicipio(cli.imovel_uf, cli.imovel_municipio); } catch { t = null; }
      cli.imovel_teto_f12 = t?.teto || null;
      if (t?.teto) {
        cli.imovel_regiao_metropolitana = t.regiaoMetropolitana;
        grupoRm.hidden = true;
        if (t.regiaoMetropolitana && t.nomeRm) desenharAjudaRmFgts(t.nomeRm);
        adicionar(infoTeto,
          h('strong', null, `Teto MCMV Faixas 1 e 2 em ${cli.imovel_municipio}: ${R.formatarMoeda(t.teto)}`),
          h('br'), `Região metropolitana: ${t.regiaoMetropolitana ? `Sim${t.nomeRm ? ` (${t.nomeRm})` : ''}` : 'Não'}`,
          t.hierarquia ? h('br') : null, t.hierarquia ? `Classificação: ${t.hierarquia}${t.recorte ? ` · recorte ${t.recorte}` : ''}` : null,
          h('br'), 'Fonte: tabela oficial da Caixa (FGTS), vigência 01/01/2026.');
      } else {
        grupoRm.hidden = false;
        adicionar(infoTeto, `Teto das Faixas 1 e 2 deste município ainda não carregado no app. Por enquanto vale o maior teto do país (${R.formatarMoeda(config.parametros.mcmv_teto_imovel_faixa12 ?? 275000)}). Confira no simulador da Caixa.`);
      }
      desenharAvisoValor();
    };
    const selMunicipio = h('select', { id: 'imovel-municipio', class: 'entrada', onchange: (e) => { cli.imovel_municipio = e.target.value || null; erro.textContent = ''; buscarTeto(); } });
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
      cli.imovel_uf = e.target.value || null; cli.imovel_municipio = null; erro.textContent = ''; carregarMunicipios(cli.imovel_uf); buscarTeto();
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
        m.faixaValor > m.faixaRenda ? `Pela renda seria Faixa ${m.faixaRenda}, mas o valor do imóvel passa do teto das Faixas 1 e 2 ${m.tetoDoMunicipio ? `em ${cli.imovel_municipio}` : '(maior teto do país; o do município ainda não foi carregado)'}: ${R.formatarMoeda(m.tetos[0])}. Vai para a Faixa ${m.faixa}.` : 'O valor do imóvel cabe nesta faixa.'));
    };
    const inpValor = h('input', { id: 'valor-imovel', class: 'entrada', inputmode: 'numeric', placeholder: 'R$ 0,00',
      value: cli.valor_imovel ? R.formatarMoeda(cli.valor_imovel) : '',
      oninput: (e) => { cli.valor_imovel = R.lerMoeda(e.target.value); e.target.value = cli.valor_imovel === null ? '' : R.formatarMoeda(cli.valor_imovel); erro.textContent = ''; desenharAvisoValor(); desenharAvisoDesconto(); } });
    const avisoDesconto = h('div', { 'aria-live': 'polite' });
    const desenharAvisoDesconto = () => {
      limpar(avisoDesconto);
      const faixa = R.faixaDescontoCartorio(cli);
      if (cli.desconto_cartorio === true && !faixa) avisoDesconto.appendChild(aviso('azul', 'Informe o valor do imóvel para saber como o desconto é comprovado.'));
      else if (faixa === 'BIB') avisoDesconto.appendChild(aviso('azul', h('strong', null, `Imóvel até ${R.formatarMoeda(R.LIMITE_BIB)}: `), 'o próprio cartório faz a pesquisa BIB e confirma a primeira aquisição, sem custo extra. Você não precisa pedir nada.',
        h('br'), h('br'), `Acima de ${R.formatarMoeda(R.LIMITE_BIB)}, a primeira aquisição é comprovada por certidão de busca de bens em escritura e em RGI, com custo de 2 GRERJ para cada participante do processo.`));
      else if (faixa === 'BUSCA') {
        const n = R.participantesDaBusca(outros);
        avisoDesconto.appendChild(aviso('laranja', h('strong', null, `Imóvel acima de ${R.formatarMoeda(R.LIMITE_BIB)}: `), 'a primeira aquisição é comprovada por certidão de busca de bens em escritura e em RGI. ',
          h('strong', null, `Custo: 2 GRERJ para cada participante`), ` (neste processo, ${n} ${n === 1 ? 'participante' : 'participantes'} = ${2 * n} GRERJ). `,
          'A CCA solicita as certidões no cartório distribuidor e paga as GRERJ no Bradesco; depois você recebe as certidões aqui.'));
      }
    };
    desenharAvisoValor();
    desenharAvisoDesconto();
    if (cli.imovel_municipio) buscarTeto();
    desenharAvisoZona();
    desenharAvisoFgts();
    aoMudarOpcao = (campo) => {
      if (campo === 'imovel_zona') { desenharAvisoValor(); desenharAvisoZona(); }
      if (campo === 'desconto_cartorio') desenharAvisoDesconto();
      if (campo === 'fgts_local_ok' || campo === 'fgts_tem_imovel_regiao') desenharAvisoFgts();
    };
    adicionar(conteudo,
      pedeImovel ? grupoOpcoes('Qual imóvel?', 'imovel', op(config.opcoes.imovel), 2) : null,
      h('section', { class: 'cartao', style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
        h('h2', { style: { fontSize: '17px' } }, 'Onde fica o imóvel'),
        h('div', { style: { display: 'grid', gridTemplateColumns: '96px 1fr', gap: '12px' } },
          h('div', { class: 'campo' }, h('label', { for: 'imovel-uf' }, 'Estado'), selUf),
          h('div', { class: 'campo' }, h('label', { for: 'imovel-municipio' }, 'Município'), selMunicipio)),
        infoTeto,
        grupoOpcoes('Zona (como está na matrícula)', 'imovel_zona', [['Urbana', 'Urbana'], ['Rural', 'Rural']], 2),
        h('div', { class: 'ajuda', style: { marginTop: '-6px' } }, 'Urbana: paga IPTU. Rural: tem CCIR e ITR (sítio, chácara, fazenda).'),
        avisoZona,
        grupoRm),
      blocoFgts,
      h('div', { class: 'campo' }, h('label', { for: 'valor-imovel' }, 'Valor do imóvel'), inpValor,
        h('span', { class: 'ajuda' }, 'Valor de compra e venda. Em construção, terreno + obra.')),
      avisoValor,
      !/^Aquisição/.test(cli.modalidade || '') ? null : h('section', { class: 'cartao', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        h('h2', { style: { fontSize: '17px' } }, 'Desconto de 50% nas taxas do cartório'),
        grupoOpcoes('É a primeira aquisição imobiliária dos compradores neste município?', 'desconto_cartorio', [['Sim', true], ['Não', false]], 2),
        h('div', { class: 'ajuda', style: { marginTop: '-6px' } }, 'Quem nunca comprou imóvel no município tem 50% de desconto nas taxas cartorárias. Se tiver dúvida, responda Sim e a CCA confirma.'),
        avisoDesconto));
    botoesRodape(() => {
      if (pedeImovel && !cli.imovel) return 'Escolha qual é o imóvel.';
      if (!cli.imovel_uf) return 'Escolha o estado onde fica o imóvel.';
      if (!cli.imovel_municipio) return 'Escolha o município do imóvel.';
      if (!cli.imovel_zona) return 'Responda se o imóvel fica em zona urbana ou rural.';
      if (cli.imovel_regiao_metropolitana === undefined || cli.imovel_regiao_metropolitana === null) return 'Responda se o imóvel fica em região metropolitana.';
      const rural = R.bloqueioZonaRural(cli);
      if (rural) return rural;
      if (cli.usa_fgts) {
        if (cli.fgts_local_ok === undefined || cli.fgts_local_ok === null) return 'Responda se o imóvel fica na cidade onde algum comprador trabalha ou mora.';
        if (cli.fgts_tem_imovel_regiao === undefined || cli.fgts_tem_imovel_regiao === null) return 'Responda se algum comprador já tem imóvel na região ou financiamento ativo.';
        const fg = R.bloqueioFgtsLocal(cli);
        if (fg) return fg;
      }
      if (!cli.valor_imovel) return 'Informe o valor do imóvel.';
      if (/^Aquisição/.test(cli.modalidade || '') && cli.desconto_cartorio !== true && cli.desconto_cartorio !== false) return 'Responda se é a primeira aquisição imobiliária no município (desconto de 50% no cartório).';
      const e = R.enquadramentoDoProcesso(cli, outros, config.parametros);
      if (cli.programa === 'MCMV' && e.mcmv.foraPorValor) return 'Imóvel acima do teto do MCMV. Volte em Operação e escolha SBPE ou Pró-Cotista.';
      if (cli.programa === 'MCMV' && e.mcmv.foraPorRenda) return 'Renda acima do limite do MCMV. Volte em Operação e escolha SBPE ou Pró-Cotista.';
      cli.faixa_mcmv = cli.programa === 'MCMV' ? e.mcmv.faixa : null;
      cli.docs_imovel_novo = R.docsImovelNovo(cli, dados?.vendedor || null);
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
        for (const k of ['nome', 'data_nascimento', 'residencia_municipio', 'pj_tipo', 'empreendimento', 'construtora_nome', 'banco', 'agencia', 'operacao', 'conta', 'conta_digito', 'estado_civil', 'conjuge_nome', 'regime_bens', 'natureza_juridica', 'telefone', 'email', 'responsavel_nome']) if (!vend[k] && achado[k]) vend[k] = achado[k];
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

    // Vendedor com 60 anos ou mais: pede ITC (no endereço do imóvel e, se mora em outra cidade, no da residência)
    const avisoItc = h('div', { 'aria-live': 'polite' });
    const atualizarItc = () => {
      limpar(avisoItc);
      const ind = R.indicadoresVendedor({ tipo: 'PF', ...vend, data_nascimento: vend.data_nascimento }, { imovel_municipio: cli.imovel_municipio });
      if (!ind.acima_60) return;
      avisoItc.appendChild(aviso('laranja', h('strong', null, 'Vendedor com 60 anos ou mais: '),
        ind.itc_duas && vend.residencia_municipio ? `pede 2 certidões de ITC (uma no endereço do imóvel e outra no da residência, em ${vend.residencia_municipio}). Cada uma vale 90 dias.`
          : vend.residencia_municipio ? 'mora na mesma cidade do imóvel: basta 1 certidão de ITC (vale 90 dias).' : 'informe a cidade onde ele mora para saber se pede 1 ou 2 certidões de ITC.'));
    };
    const comItc = (campo) => { campo.querySelector('input')?.addEventListener('input', atualizarItc); return campo; };

    const contatoVend = () => [
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' } },
        campoVend('telefone', 'Telefone do vendedor', { inputmode: 'tel', placeholder: '(21) 90000-0000' }, R.formatarCelular),
        campoVend('email', 'E-mail do vendedor', { type: 'email', inputmode: 'email', placeholder: 'email@exemplo.com' })),
    ];
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
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' } },
            comItc(campoVend('data_nascimento', 'Data de nascimento do vendedor', { type: 'date', max: R.hojeIso(), min: '1900-01-01' })),
            comItc(campoVend('residencia_municipio', 'Cidade onde o vendedor mora', { placeholder: 'Ex.: Rio de Janeiro' }))),
          avisoItc,
          grupoOpcoes('Estado civil do vendedor', 'estado_civil', op(config.opcoes.estado_civil), 2, vend, () => desenhar()));
        atualizarItc();
        if (vend.estado_civil === 'Casado(a)') {
          adicionar(cartao,
            aviso('azul', h('strong', null, 'Cônjuge também é vendedor: '), 'entra no contrato da Caixa e envia os documentos dele(a), além da certidão de casamento.'),
            campoVend('conjuge_nome', 'Nome completo do cônjuge'),
            campoVend('conjuge_cpf', 'CPF do cônjuge', { inputmode: 'numeric', placeholder: '000.000.000-00' }, R.formatarCpf),
            grupoOpcoes('Regime de bens do casamento', 'regime_bens', op(R.REGIME_BENS), 1, vend, () => desenhar()),
            R.pedePacto(vend) ? aviso('laranja', 'Este regime exige pacto antenupcial (Código Civil): envie o pacto e o registro do pacto.') : null);
        } else if (vend.estado_civil === 'União estável') {
          adicionar(cartao, aviso('azul', 'Para a Caixa, união estável é solteiro(a): pede a certidão de nascimento.'));
        }
        adicionar(cartao, ...contatoVend());
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
          campoVend('empreendimento', 'Nome do empreendimento'),
          campoVend('responsavel_nome', 'Proprietário / responsável (nome da pessoa)', { placeholder: 'Quem responde por esta venda' }));
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
          campoVend('nome', 'Razão social'),
          campoVend('responsavel_nome', 'Proprietário / responsável (nome da pessoa)', { placeholder: 'Quem responde por esta venda' }));
      }
      if (pedeDocsPj()) {
        adicionar(cartao,
          grupoOpcoes('Tipo de empresa', 'natureza_juridica', [['LTDA ou Cia', 'LTDA/Cia'], ['S/A', 'S/A'], ['Firma individual', 'Firma individual']], 3, vend, () => desenhar()),
          vend.natureza_juridica === 'S/A' ? h('div', { class: 'ajuda', style: { marginTop: '-6px' } }, 'S/A: estatuto com a última alteração e ata da eleição da última diretoria registrada.') : null,
          vend.natureza_juridica === 'Firma individual' ? h('div', { class: 'ajuda', style: { marginTop: '-6px' } }, 'Firma individual: documento de constituição e últimas alterações.') : null);
        if (vend.natureza_juridica === 'LTDA/Cia') {
          adicionar(cartao,
            grupoOpcoes('Houve alteração contratual depois do contrato social consolidado?', 'teve_alteracao_contratual', [['Sim', true], ['Não', false]], 2, vend, () => {}),
            h('div', { class: 'ajuda', style: { marginTop: '-6px' } }, 'Se não houve, o documento de alterações não é pedido.'));
        }
      }
      if (vend.pj_tipo) adicionar(cartao, ...contatoVend());
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
        if (!vend.data_nascimento || vend.data_nascimento > R.hojeIso() || vend.data_nascimento < '1900-01-01') return 'Informe a data de nascimento do vendedor.';
        if (R.idadeEm(vend.data_nascimento) >= 60 && !String(vend.residencia_municipio || '').trim()) return 'Vendedor com 60 anos ou mais: informe a cidade onde ele mora (para saber se pede 1 ou 2 certidões de ITC).';
        if (!vend.estado_civil) return 'Escolha o estado civil do vendedor.';
        if (vend.estado_civil === 'Casado(a)') {
          if (!vend.conjuge_nome || vend.conjuge_nome.trim().split(/\s+/).length < 2) return 'Digite o nome completo do cônjuge do vendedor.';
          if (!R.cpfValido(vend.conjuge_cpf || '')) return 'CPF do cônjuge do vendedor inválido.';
          if (!vend.regime_bens) return 'Escolha o regime de bens do casamento do vendedor.';
        } else vend.regime_bens = null;
      }
      if (vendedorPj()) {
        if (!vend.pj_tipo) return 'Escolha se é imóvel avulso ou empreendimento (SPE).';
        if (!R.cnpjValido(vend.cpf_cnpj || '')) return vend.pj_tipo === 'Empreendimento' ? 'CNPJ do empreendimento (SPE) inválido.' : 'CNPJ do vendedor inválido.';
        if (!String(vend.nome || '').trim()) return vend.pj_tipo === 'Empreendimento' ? 'Informe a razão social da SPE.' : 'Informe a razão social do vendedor.';
        if (vend.pj_tipo === 'Empreendimento' && !String(vend.empreendimento || '').trim()) return 'Informe o nome do empreendimento.';
        if (vend.construtora_cnpj && !empreendimentoCaixa() && !R.cnpjValido(vend.construtora_cnpj)) return 'CNPJ da construtora inválido.';
        if (pedeDocsPj() && !vend.natureza_juridica) return 'Escolha o tipo de empresa do vendedor (LTDA/Cia, S/A ou firma individual).';
        if (pedeDocsPj() && vend.natureza_juridica === 'LTDA/Cia' && (vend.teve_alteracao_contratual === undefined || vend.teve_alteracao_contratual === null)) return 'Responda se houve alteração contratual depois do contrato social consolidado.';
      }
      if (vend.conta && !vend.banco) return 'Escolha o banco da conta para recebimento.';
      if (vend.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(vend.email)) return 'E-mail do vendedor inválido.';
      cli.docs_imovel_novo = R.docsImovelNovo(cli, { pj_tipo: vendedorPj() ? vend.pj_tipo : null });
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
    const faltaSimulacao = MODELO2 && cli.rascunho && !R.temSimulacao(dados.necessarios);
    if (MODELO2 && cli.vendedor_id && /^Aquisição/.test(cli.modalidade || '')) adicionar(conteudo, IMV.blocoImovelDoCliente({ cliente: cli, editavel: true, aoMudar: rotear }));
    adicionar(conteudo, faltaSimulacao ? aviso('laranja', h('strong', null, 'A Simulação é obrigatória. '), 'Sem ela o cadastro não pode ser enviado à CCA. Anexe a simulação feita no simulador da Caixa (em Simulação e outros).') : null,
      avisoDocumentos(dados.necessarios) || aviso('azul', 'Todos os documentos foram anexados.'), legendaAsteriscos(),
      ...paginasDocumentos({ clienteId: cli.id, vendedorId: cli.vendedor_id, necessarios: dados.necessarios, aoMudar: rotear, avisoVendedor: avisoDocsVendedor(dados) }));
    adicionar(rodape, ...barraProgresso(dados.necessarios), linhaSecundaria(cli.rascunho),
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
      bloco('Titular', 1, [['Nome', cli.nome], ['CPF', R.formatarCpf(cli.cpf)], ['Nascimento', cli.data_nascimento ? cli.data_nascimento.split('-').reverse().join('/') : null], ['Estado civil', cli.estado_civil === 'União estável' ? 'União estável (Caixa: solteiro)' : cli.estado_civil], ['Celular', cli.celular ? R.formatarCelular(cli.celular) : null], ['E-mail', cli.email], ['Escolaridade', cli.escolaridade], ['PIS', cli.pis || 'Não informado'], ['CTPS', R.textoCtps(cli) || 'Não informada'], ...(cli.estado_civil === 'Casado(a)' ? [['Regime de bens', cli.regime_bens]] : [])]),
      outros.some((p) => p.papel === 'comprador') ? (() => { const t = R.rendaDoProcesso(cli, outros, config.parametros); return bloco('Renda total dos compradores', E.renda, [...t.porPessoa.map((p) => [p.nome || 'Comprador', R.formatarMoeda(p.considerada)]), ['Total aceito pela Caixa', R.formatarMoeda(t.considerada)], ...(t.considerada !== t.bruta ? [['Renda informada', `${R.formatarMoeda(t.bruta)} (antes do corte)`]] : [])]); })() : null,
      bloco('Renda e dependentes', E.renda, [['Tipo de renda', cli.tipo_renda], ...(cli.tipo_renda === 'Mista' ? [['Renda formal', R.formatarMoeda(cli.renda_formal)], ['Renda informal', R.formatarMoeda(cli.renda_informal)]] : []), ['Renda bruta', R.formatarMoeda(cli.renda_bruta)], ...(cli.renda_considerada && Number(cli.renda_considerada) !== Number(cli.renda_bruta) ? [['Renda considerada', `${R.formatarMoeda(cli.renda_considerada)} (sem IR)`]] : []), ['Compõe renda', sn(cli.compoe_renda)], ['Declara IR', sn(cli.declara_ir)], ...(cli.declara_ir ? [['IR retificado', sn(cli.ir_retificado)]] : []), ['Dependentes', String(cli.dependentes || 0)], ...R.dependentesDoProcesso(cli).map((d) => [`Dependente ${d.ordem}`, d.filho ? 'Filho(a)' : `Não é filho(a), ${d.menor ? 'menor' : 'maior'} de idade`])]),
      bloco('Operação', E.operacao, [['Modalidade', cli.modalidade], ['Programa', cli.programa], ['FGTS', cli.usa_fgts ? 'Vai usar' : 'Não vai usar'], ['Cotista FGTS (3 anos+)', sn(cli.cotista_fgts)], ...(MODELO2 ? [['Assinatura do contrato', R.nomeAssinatura(cli.assinatura_contrato)]] : [])]),
      bloco('Imóvel', E.imovel, [...(cli.imovel ? [['Imóvel', cli.imovel]] : []), ['Local', [cli.imovel_municipio, cli.imovel_uf].filter(Boolean).join(' / ') || null], ['Zona', cli.imovel_zona], ['Região metropolitana', sn(cli.imovel_regiao_metropolitana)], ...(/^Aquisição/.test(cli.modalidade || '') ? [['Primeira aquisição no município (desconto de 50% no cartório)', sn(cli.desconto_cartorio)]] : []), ...(cli.usa_fgts ? [['FGTS: onde trabalha ou mora', sn(cli.fgts_local_ok)], ['FGTS: já tem imóvel na região', sn(cli.fgts_tem_imovel_regiao)]] : []), ['Valor do imóvel', cli.valor_imovel ? R.formatarMoeda(cli.valor_imovel) : null]]),
      (() => { const e = R.enquadramentoDoProcesso(cli, outros, config.parametros); return bloco('Enquadramento', E.imovel, [...(cli.programa === 'MCMV' ? [['Faixa MCMV', e.mcmv.faixa ? `Faixa ${e.mcmv.faixa}` : 'Fora do MCMV']] : []), ['Prazo máximo', e.prazo.prazo ? `${e.prazo.prazo} meses` : '—'], ...(e.prazo.limitadoPelaIdade ? [['Limitado pela idade de', `${e.prazo.maisVelho.nome} (${e.prazo.maisVelho.anos} anos)`]] : [])]); })(),
      dados.vendedor && /^Aquisição/.test(cli.modalidade || '') ? (() => { const v = dados.vendedor; return bloco('Vendedor', E.vendedor, [
        ['Vendedor', cli.vendedor], ...(cli.vendedor === 'Construtora / PJ' ? [['Recurso Caixa', cli.empreendimento_caixa ? 'Sim, construído com recurso da Caixa' : 'Não']] : []),
        [v.tipo === 'PF' ? 'CPF' : 'CNPJ', v.tipo === 'PF' ? R.formatarCpf(v.cpf_cnpj) : R.formatarCnpj(v.cpf_cnpj)], ['Nome', v.nome],
        ...(v.tipo === 'PF' ? [['Nascimento', v.data_nascimento ? R.formatarData(v.data_nascimento) : null], ['Cidade onde mora', v.residencia_municipio]] : []),
        ...(v.tipo === 'PJ' ? [['Tipo de venda', v.pj_tipo === 'Empreendimento' ? `Empreendimento (SPE): ${v.empreendimento || '—'}` : 'Imóvel avulso']] : []),
        ...(v.construtora_cnpj ? [['Construtora', `${v.construtora_nome || '—'} · ${R.formatarCnpj(v.construtora_cnpj)}`]] : []),
        ...(v.tipo === 'PF' && v.estado_civil ? [['Estado civil', v.estado_civil]] : []),
        ...(v.tipo === 'PF' && v.estado_civil === 'Casado(a)' ? [['Cônjuge (também vendedor)', `${v.conjuge_nome || '—'} · CPF ${R.formatarCpf(v.conjuge_cpf || '')}`]] : []),
        ...(v.tipo === 'PF' && v.estado_civil === 'Casado(a)' ? [['Regime de bens', v.regime_bens]] : []),
        ...(v.tipo === 'PJ' && v.natureza_juridica ? [['Tipo de empresa', v.natureza_juridica]] : []),
        ['Telefone', v.telefone ? R.formatarCelular(v.telefone) : null], ['E-mail', v.email],
        ['Conta para recebimento', v.banco ? `${v.banco} · ag. ${v.agencia || '—'}${v.operacao ? ` · op. ${v.operacao}` : ''} · c/c ${v.conta || '—'}${v.conta_digito ? `-${v.conta_digito}` : ''}` : 'Não informada'],
        ...(v.banco && !R.ehCaixa(v.banco) ? [['Atenção', 'Recomendado conta da Caixa no nome do vendedor']] : [])]); })() : null,
      h('section', { class: 'cartao' },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, h('h2', { style: { fontSize: '16px' } }, 'Documentos'), h('a', { href: `#/cliente/${cli.id}/cadastro/${E.docs}` }, 'Editar')),
        h('div', { style: { fontSize: '14px' } }, `${r.enviados} de ${r.total} enviados`),
        MODELO2 && cli.rascunho && !R.temSimulacao(dados.necessarios) ? aviso('laranja', h('strong', null, 'Falta a Simulação. '), 'Ela é obrigatória para enviar o cadastro. ', h('a', { href: `#/cliente/${cli.id}/cadastro/${E.docs}` }, 'Anexar a Simulação')) : null,
        avisoDocumentos(dados.necessarios)),
      h('label', { for: 'lgpd', style: { display: 'flex', gap: '12px', alignItems: 'flex-start', fontSize: '14px', lineHeight: '20px' } }, lgpd,
        h('span', null, 'Confirmo que o cliente autorizou o envio dos dados e documentos dele à Andrade Almeida CCA para análise de crédito.')));
    const enviar = h('button', { class: 'btn btn-primario', type: 'button' }, cli.rascunho ? 'Enviar para a CCA' : 'Salvar alterações');
    enviar.onclick = async () => {
      erro.textContent = '';
      if (!lgpd.checked) { erro.textContent = 'Marque a confirmação de autorização do cliente.'; return; }
      if (MODELO2 && cli.rascunho && !R.temSimulacao(dados.necessarios)) { erro.textContent = 'Anexe a Simulação da Caixa para enviar o cadastro (etapa Documentos).'; return; }
      enviar.disabled = true; enviar.textContent = 'Enviando…';
      try {
        cli.autorizacao_lgpd_em ||= new Date().toISOString();
        await api.salvarCliente(cli);
        await api.enviarCadastro(cli.id);
        toast(cli.rascunho ? 'Cadastro enviado! Você recebe a confirmação no WhatsApp.' : 'Alterações salvas');
        ir(daEquipe ? '/painel/clientes' : `/cliente/${cli.id}`);
      } catch (e) { erro.textContent = e.message; enviar.disabled = false; enviar.textContent = 'Enviar para a CCA'; }
    };
    adicionar(rodape, erro, linhaSecundaria(cli.rascunho), enviar, h('div', { class: 'ajuda', style: { textAlign: 'center' } }, 'Você recebe a confirmação e os avisos no WhatsApp e no e-mail.'));
  }

  // Sair pela logo ou pelo menu no meio do cadastro: pergunta antes (o que já foi salvo fica como rascunho)
  const confirmarSaida = () => perguntarSimNao('Sair do cadastro?', cli.id
    ? 'O que você já salvou fica guardado. Para continuar depois, toque no cliente na lista.'
    : 'Os dados desta etapa ainda não foram salvos. Para guardar, use Salvar rascunho.');
  const podeAutosalvar = !daEquipe && etapa < E.docs; // rascunho e também cliente já enviado (mudanças ficam salvas na hora)
  const jaEnviado = !!cli.id && !cli.rascunho;
  const autosalvar = async () => {
    if (!conteudo.isConnected) return; // a pessoa já saiu desta tela
    if (salvando) { sujo = true; return; }
    if (!cli.nome || !R.cpfValido(cli.cpf || '')) { selo.textContent = 'Preencha nome e CPF para salvar sozinho.'; return; }
    salvando = true; selo.textContent = 'Salvando…'; selo.classList.remove('erro');
    try {
      if (!cli.id && await api.buscarPorCpf(cli.cpf)) { selo.textContent = 'Este CPF já tem cadastro. Use o botão Continuar.'; return; }
      const salvo = await salvarTudo();
      if (depoisDeSalvar) await depoisDeSalvar(salvo).catch(() => {});
      selo.textContent = `Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch { selo.textContent = 'Não consegui salvar agora. Seus dados continuam na tela.'; selo.classList.add('erro'); }
    finally { salvando = false; if (sujo) { sujo = false; agendar(); } }
  };
  const agendar = () => { clearTimeout(temporizador); temporizador = setTimeout(autosalvar, 2500); };
  if (podeAutosalvar) {
    selo.textContent = jaEnviado ? 'Salva sozinho. No fim, toque em Salvar alterações para avisar a CCA.' : 'Salva sozinho enquanto você preenche.';
    conteudo.addEventListener('input', agendar);
    conteudo.addEventListener('change', agendar);
    conteudo.addEventListener('click', (e) => { if (e.target.closest('.opcoes, .pilulas')) agendar(); });
  }
  return portal(cli.id ? '' : 'novo', h('div', { class: 'tela cadastro' },
    cabecalho({ sobre: `Etapa ${posicao} de ${total}${cli.nome && etapa > 1 ? ` · ${cli.nome}` : (R.ehConsumidor(perfil) ? ' · Seu cadastro' : ' · Novo cliente')}`, titulo: titulos[etapa] }, podeAutosalvar ? selo : null),
    h('div', { class: 'topo-etapa' }, ...etapas(etapa, temVendedor(cli))),
    conteudo, rodape), { confirmarSaida });
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
  const doCliente = MODELO2 && M2.ehCliente(perfil);
  return portal('', [
    doCliente ? voltarLink('#/meu', 'Meu financiamento') : voltarLink(`#/cliente/${id}`, 'Ficha do cliente'),
    cabecalho({ sobre: `${cliente.nome} · CPF ${R.formatarCpf(cliente.cpf)}`, titulo: 'Documentos',
      sub: [cliente.programa, cliente.imovel && `Imóvel ${cliente.imovel.toLowerCase()}`, cliente.vendedor, cliente.usa_fgts ? 'Com FGTS' : null].filter(Boolean).join(' · ') },
      h('div', { class: 'pag-progresso', style: { minWidth: '260px' } }, ...barraProgresso(necessarios))),
    avisoDocumentos(necessarios, { doCliente }) || aviso('azul', 'Todos os documentos foram enviados.'),
    doCliente ? aviso('azul', 'Aqui você envia os seus documentos e os dos outros compradores. Os do vendedor, do imóvel e a simulação ficam com o(a) seu(sua) corretor(a); na lista acima você acompanha o que ainda falta.') : null,
    h('div', { class: 'linha-legendas' }, legendaAsteriscos({ doCliente }),
      h('div', { class: 'legenda dica-arrastar' }, icone('clipe', { tam: 16, cor: '#5A646B' }), h('span', null, 'No computador, você também pode arrastar o arquivo até o documento.'))),
    (() => {
      const largo = window.matchMedia('(min-width: 1100px)').matches;
      const previa = largo ? painelPrevia() : null;
      // Cliente (comprador) só vê e anexa os documentos dos compradores; vendedor e imóvel ficam com o corretor
      const lista = h('div', { class: 'principal docs-pagina' }, ...paginasDocumentos({ clienteId: id, vendedorId: cliente.vendedor_id, necessarios: doCliente ? necessarios.filter((n) => n.secao === 'compradores') : necessarios, aoMudar: rotear, avisoVendedor: doCliente ? null : avisoDocsVendedor(dados), aoVisualizar: previa ? previa.mostrar : null }));
      return previa ? h('div', { class: 'painel-colunas docs-com-previa' }, lista, previa.el) : h('div', { class: 'docs-pagina' }, ...lista.childNodes);
    })(),
    h('div', { class: 'legenda', style: { flexDirection: 'row', gap: '8px' } }, icone('historico', { tam: 16, cor: '#5A646B' }),
      h('span', null, 'Ao substituir, a versão anterior fica guardada no histórico da pasta do(a) cliente. Documento aceito pela CCA não pode mais ser trocado por aqui: se precisar, peça pela conversa com a CCA.')),
  ]);
}

// ---------- ficha do cliente ----------
async function montarFicha(id) {
  const { cliente, necessarios, historico, mensagens: todas, participantes = [], gestor_imob: gestorImob = null } = await api.obterCliente(id);
  const mensagens = todas.filter((m) => m.tipo !== 'conversa'); // a conversa tem o próprio quadro
  const r = R.resumoDocumentos(necessarios);
  // Andamento: etapas na ordem; "Entrevista reprovada" só aparece (no fim) se o processo foi encerrado assim
  const etapasBase = config.status.filter((s) => !R.STATUS_ENCERRADOS.includes(s.codigo));
  const etapas = R.STATUS_ENCERRADOS.includes(cliente.status)
    ? [...etapasBase.slice(0, etapasBase.findIndex((s) => s.codigo === 'entrevista') + 1), config.status.find((s) => s.codigo === cliente.status)].filter(Boolean) : etapasBase;
  const atualIdx = etapas.findIndex((s) => s.codigo === cliente.status);
  const dataDe = (cod) => historico.filter((x) => x.para === cod).map((x) => x.em).pop();
  const parado = r.faltando_obrigatorio.length > 0;

  const nFalta = r.pendente + r.recusado;
  // Aviso de ação no mesmo padrão dos avisos do painel: laranja claro, botão laranja só na ação
  const acao = !cliente.rascunho && (nFalta > 0)
    ? h('div', { class: 'aviso-acao', role: 'alert' },
      h('span', { class: 'aviso-acao-icone', 'aria-hidden': 'true' }, '!'),
      h('div', { class: 'aviso-acao-texto' },
        h('strong', null, r.recusado && !r.pendente
          ? `${r.recusado} documento${r.recusado > 1 ? 's' : ''} recusado${r.recusado > 1 ? 's' : ''}`
          : `Falta${nFalta > 1 ? 'm' : ''} ${nFalta} documento${nFalta > 1 ? 's' : ''}`),
        h('span', null, [parado ? `Processo parado: ${r.faltando_obrigatorio.length === 1 ? `sem ${r.faltando_obrigatorio[0].rotulo} (**)` : `${r.faltando_obrigatorio.length} são obrigatórios (**)`}, não vai para análise.` : 'Você pode anexar agora ou depois.',
          r.recusado ? `${r.recusado} recusado: envie uma cópia melhor.` : null].filter(Boolean).join(' '))),
      h('a', { class: 'btn btn-primario btn-pequeno', href: `#/cliente/${id}/documentos` }, 'Anexar documentos'))
    : null;

  const arquivosContrato = MODELO2 ? await api.listarContratoArquivos(id).then((l) => l.filter((a) => !a.substituido).map((a) => a.tipo)).catch(() => []) : [];
  const andamento = cliente.rascunho ? null : MODELO2 ? fluxograma({ cliente, historico, arquivos: arquivosContrato, quemVe: M2.quemSou(perfil), temGestor: !!gestorImob }) : h('section', { class: 'cartao' },
    secaoTitulo('Andamento', null, { pequeno: true, icone: 'andamento' }),
    h('ol', { class: 'andamento' }, etapas.map((s, i) => h('li', { class: i < atualIdx ? 'feito' : i === atualIdx ? 'agora' : '' },
      h('span', { class: 'ponto' }), s.nome, h('span', { class: 'data' }, i <= atualIdx ? dataHora(dataDe(s.codigo)) : '')))));
  const documentos = h('section', { class: 'cartao' },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' } }, secaoTitulo('Documentos', null, { pequeno: true, icone: 'doc' }), h('span', { class: 'subtitulo' }, `${r.enviados} de ${r.total} enviados`)),
    h('div', { class: 'placar' },
      h('div', { class: 'p-aceito' }, h('b', null, r.aceito), h('span', null, 'Aceitos')),
      h('div', { class: 'p-conferencia' }, h('b', null, r.em_conferencia), h('span', null, 'Em conferência')),
      h('div', { class: 'p-recusado' }, h('b', null, r.recusado), h('span', null, 'Recusado')),
      h('div', { class: 'p-pendente' }, h('b', null, r.pendente), h('span', null, 'Pendentes'))),
    r.pendente || r.recusado ? h('div', { class: 'ajuda', style: { fontWeight: '600' } }, `Faltam — ${resumoPorSecao(necessarios)}`) : null,
    listaPendencias(necessarios),
    h('a', { class: 'btn btn-contorno', href: `#/cliente/${id}/documentos` }, 'Ver, anexar e substituir documentos'));
  const conversa = cliente.rascunho ? null : MODELO2 && perfil.papel === 'corretor' && gestorImob ? M2.blocoConversaCcaLeitura(id, gestorImob) : h('section', { class: 'cartao', id: 'conversa' },
    secaoTitulo('Conversa com a CCA', R.ehConsumidor(perfil) ? 'Dúvidas sobre o seu financiamento. A equipe responde aqui e você recebe o aviso no celular e no e-mail.' : 'Dúvidas sobre este cliente. A equipe responde aqui e você recebe o aviso no celular e no e-mail.', { pequeno: true }),
    blocoConversa(id, { lado: 'portal', doCliente: R.ehConsumidor(perfil) }));
  const avisos = h('section', { class: 'cartao' },
    secaoTitulo('Avisos enviados para você', null, { pequeno: true, icone: 'sino' }),
    mensagens.length ? mensagens.slice(0, 8).map((m) => h('div', { style: { display: 'flex', gap: '10px', fontSize: '14px', lineHeight: '19px' } },
      icone('conversa', { tam: 18, cor: '#3D657C' }),
      h('span', { style: { whiteSpace: 'pre-line' } }, m.texto.replace(/\n— Andrade Almeida CCA$/, ''), ' ', h('span', { class: 'subtitulo' }, `· ${dataHora(m.criada_em)}`))))
      : h('div', { class: 'subtitulo' }, 'Nenhum aviso ainda.'));

  return { id, cliente, participantes, r, acessoCliente: MODELO2 ? M2.blocoAcessoCliente({ cliente, perfil, aoMudar: () => rotear() }) : null, interna: MODELO2 ? M2.blocoConversaInterna({ cliente, perfil, gestor: gestorImob }) : null, damp: MODELO2 ? M2.blocoDamp({ cliente, perfil, aoMudar: () => rotear() }) : null, imovelCad: MODELO2 && !cliente.rascunho && cliente.vendedor_id ? IMV.blocoImovelDoCliente({ cliente, editavel: !M2.ehCliente(perfil), aoMudar: () => rotear() }) : null, entrevista: blocoEntrevistaCorretor(cliente), contrato: blocoContrato({ cliente, equipe: false, aoMudar: () => rotear() }), acao, andamento, documentos, conversa, avisos };
}

const subFicha = (m) => [`CPF ${R.formatarCpf(m.cliente.cpf)}`, m.cliente.programa, m.cliente.modalidade, m.cliente.imovel, MODELO2 && m.cliente.assinatura_contrato ? (m.cliente.assinatura_contrato === 'nato_digital' ? 'Nato Digital' : 'Assinatura manual') : null].filter(Boolean).join(' · ')
  + (m.participantes.length ? ` · Com ${m.participantes.map((p) => `${p.nome} (${p.papel === 'conjuge' ? 'cônjuge' : 'comprador'})`).join(', ')}` : '');

// Cliente em página inteira (celular e telas estreitas)
async function telaFicha(id) {
  const m = await montarFicha(id);
  const { cliente } = m;
  return portal('clientes', [
    R.ehConsumidor(perfil) ? null : voltarLink('#/clientes', 'Meus clientes'),
    cabecalho({ sobre: R.ehConsumidor(perfil) ? 'Meu financiamento' : 'Cliente', titulo: cliente.nome, sub: subFicha(m), foto: 'corretor' },
      cliente.rascunho ? null : chipStatus(cliente.status),
      h('a', { href: `#/cliente/${id}/cadastro/1`, class: 'btn btn-contorno btn-pequeno' }, cliente.rascunho ? 'Continuar cadastro' : 'Ver ou editar cadastro')),
    cliente.rascunho ? aviso('laranja', h('strong', null, 'Rascunho: '), 'este cadastro ainda não foi enviado. ', h('a', { href: `#/cliente/${id}/cadastro/1` }, 'Continuar cadastro')) : null,
    MODELO2 ? m.andamento : null,
    m.damp,
    m.entrevista,
    m.contrato,
    m.acao,
    h('div', { class: 'painel-colunas ficha-colunas' },
      h('div', { class: 'principal coluna-cartoes' }, MODELO2 ? null : m.andamento, m.imovelCad, m.documentos),
      h('aside', { class: 'lateral coluna-cartoes' }, m.interna, m.conversa, m.acessoCliente, m.avisos)),
  ].filter(Boolean));
}

// Cliente ao lado da lista (computador): o mesmo painel lateral da equipe
function painelCliente(m) {
  const { cliente, id } = m;
  return h('aside', { class: 'lateral painel-cliente', id: MODELO2 ? 'clienteSelecionado' : null }, h('div', { class: `cartao${MODELO2 ? ' m2-sel' : ''}` },
    h('a', { href: '#/clientes', class: 'painel-fechar', 'aria-label': 'Fechar o cliente' }, icone('fechar', { tam: 18, traco: 2.2 })),
    h('div', { class: 'painel-cliente-topo' },
      h('div', null, h('div', { class: 'sobretitulo' }, 'Cliente selecionado'), h('h2', { class: 'painel-cliente-nome' }, cliente.nome), h('div', { class: 'sub' }, subFicha(m))),
      h('a', { href: `#/cliente/${id}/cadastro/1`, class: 'btn btn-contorno btn-pequeno' }, cliente.rascunho ? 'Continuar cadastro' : 'Editar cadastro')),
    cliente.rascunho ? aviso('laranja', h('strong', null, 'Rascunho: '), 'cadastro ainda não enviado.') : MODELO2 ? null : faixaProgresso(config.status, cliente.status),
    ...(MODELO2 ? [m.andamento,
      h('div', { class: 'm2-sel-grade' },
        h('div', { class: 'm2-sel-col' }, h('div', { class: 'm2-sel-rotulo' }, 'O que fazer agora'), m.acao, m.damp, m.entrevista, m.contrato, m.imovelCad, m.documentos),
        h('div', { class: 'm2-sel-col' }, h('div', { class: 'm2-sel-rotulo' }, 'Conversas e avisos'), m.interna, m.conversa, m.acessoCliente, m.avisos))]
      : [m.entrevista, m.contrato, m.acao, m.conversa, m.andamento, m.documentos, m.avisos])));
}
