// MODELO 2 (?demo2): estrutura nova por perfil. Só roda na demonstração; o app real e o ?demo atual não usam este arquivo.
import { h, limpar, icone, toast } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import { cabecalho, secaoTitulo, aviso, listaPendencias, blocoConversa, chipStatus } from './componentes.js';
import { fluxograma } from './fluxo.js';

// ---------- perfis ----------
export const ehCliente = (p) => p?.papel === 'cliente';
export const ehDocumentacao = (p) => p?.papel === 'gestor_imobiliaria' && p?.funcao === 'documentacao';
export const ehGestor = (p) => p?.papel === 'gestor_imobiliaria' && !ehDocumentacao(p);
export function nomePerfil(p) {
  if (ehCliente(p)) return 'Cliente';
  if (ehDocumentacao(p)) return 'Documentação';
  if (ehGestor(p)) return 'Gestor';
  if (p?.papel === 'corretor') return p.imobiliaria_id ? 'Corretor' : 'Corretor independente';
  return '';
}

// ---------- CCA: 5 grupos no menu; dentro de cada grupo, abas ----------
export const GRUPOS_EQUIPE = [
  ['inicio', 'Início', 'painel', ['inicio']],
  ['processos', 'Processos', 'pessoas', ['clientes', 'docs', 'verificacoes', 'agenda', 'contratos', 'engenharia']],
  ['parceiros', 'Parceiros', 'predio', ['imobiliarias', 'corretores', 'vendedores', 'convites']],
  ['resultados', 'Resultados', 'grafico', ['relatorios', 'campanhas']],
  ['admin', 'Administração', 'engrenagem', ['mensagens', 'acessos', 'config']],
];
const grupoDe = (secao) => GRUPOS_EQUIPE.find(([, , , s]) => s.includes(secao))?.[0] || 'inicio';
// menu = a lista [código, nome, ícone, quem vê] do painel
export function itensGruposEquipe(perfil, secao, numDocs, menu) {
  const pode = (cod) => menu.some(([c, , , ve]) => c === cod && ve(perfil));
  const ativo = grupoDe(secao);
  return GRUPOS_EQUIPE.map(([cod, nome, ic, secoes]) => {
    const primeira = secoes.find(pode);
    if (!primeira) return null;
    return { href: `#/painel/${primeira}`, nome, icone: ic, ativo: cod === ativo, num: cod === 'processos' ? numDocs : 0 };
  }).filter(Boolean);
}
export function abasEquipe(perfil, secao, numDocs, menu) {
  const grupo = GRUPOS_EQUIPE.find(([cod]) => cod === grupoDe(secao));
  const abas = grupo[3].map((cod) => menu.find(([c, , , ve]) => c === cod && ve(perfil))).filter(Boolean);
  if (abas.length < 2) return null;
  return h('nav', { class: 'abas-grupo', 'aria-label': `Telas de ${grupo[1]}` }, abas.map(([cod, nome]) =>
    h('a', { href: `#/painel/${cod}`, class: cod === secao ? 'ativa' : '', 'aria-current': cod === secao ? 'page' : null }, nome,
      cod === 'docs' && numDocs ? h('span', { class: 'num' }, numDocs) : null)));
}

// ---------- portal: menus por perfil ----------
export function itensPortal(perfil, ativo) {
  if (ehCliente(perfil)) return [{ href: '#/meu', nome: 'Meu financiamento', icone: 'casa', ativo: true }];
  const itens = [{ href: '#/inicio', nome: 'Início', icone: 'painel', ativo: ativo === 'inicio' }];
  if (ehGestor(perfil)) itens.push({ href: '#/gestao', nome: 'Gestão', icone: 'grafico', ativo: ativo === 'gestao' });
  itens.push({ href: '#/clientes', nome: perfil.papel === 'gestor_imobiliaria' ? 'Clientes' : 'Meus clientes', icone: 'pessoas', ativo: ativo === 'clientes' });
  itens.push({ href: '#/novo', nome: 'Novo cliente', icone: 'mais', ativo: ativo === 'novo' });
  itens.push({ href: '#/mais', nome: 'Mais', icone: 'menu', ativo: ativo === 'mais' || ativo === 'engenharia' });
  return itens;
}

// ---------- acesso do cliente final (opcional) ----------
// Liga/desliga: o gestor para a imobiliária toda; o corretor independente para os clientes dele
export async function cartaoAcessoClientes(aoMudar) {
  const cfg = await api.configAcessoCliente();
  if (!cfg.pode) return null;
  const chave = h('button', { type: 'button', role: 'switch', 'aria-checked': String(cfg.ligado), class: `chave${cfg.ligado ? ' ligada' : ''}`, id: 'chaveAcessoCliente',
    'aria-label': 'Permitir que os clientes acompanhem pelo portal',
    onclick: async () => {
      chave.disabled = true;
      try { await api.definirAcessoCliente(!cfg.ligado); toast(!cfg.ligado ? 'Acesso dos clientes ligado.' : 'Acesso dos clientes desligado. Quem já tinha acesso não entra mais.'); aoMudar(); }
      catch (e) { toast(e.message); chave.disabled = false; }
    } }, h('span', { class: 'chave-bola' }));
  return h('section', { class: 'cartao acesso-clientes' },
    h('div', { class: 'acesso-clientes-linha' },
      h('div', null, h('h3', { class: 'fluxo-titulo' }, 'Acesso dos clientes ao portal'),
        h('p', { class: 'sub', style: { margin: '4px 0 0' } }, cfg.escopo === 'imobiliaria'
          ? 'Quando ligado, os corretores da imobiliária podem convidar cada cliente para acompanhar o próprio processo, enviar documentos e conversar.'
          : 'Quando ligado, você pode convidar cada cliente para acompanhar o próprio processo, enviar documentos e conversar.')),
      chave),
    h('div', { class: 'ajuda' }, cfg.ligado ? 'Ligado. O convite é feito no cartão de cada cliente.' : 'Desligado. Nenhum cliente entra no portal.'));
}

// Bloco no cartão do cliente: convidar, ver situação, tirar o acesso
export function blocoAcessoCliente({ cliente, perfil, aoMudar }) {
  if (cliente.rascunho || ehCliente(perfil) || perfil.consumidor) return null;
  const caixa = h('section', { class: 'cartao acesso-cliente', id: 'acesso-cliente' }, h('div', { class: 'sub' }, 'Carregando o acesso do cliente…'));
  api.acessoDoCliente(cliente.id).then((a) => {
    limpar(caixa);
    caixa.appendChild(secaoTitulo('Acesso do cliente', null, { pequeno: true, nivel: 'h3', icone: 'pessoa' }));
    if (a.situacao === 'desligado') {
      caixa.appendChild(h('div', { class: 'ajuda' }, a.pode_ligar === 'gestor'
        ? 'Desligado pela imobiliária. O gestor liga em Gestão, se quiser que os clientes acompanhem pelo portal.'
        : 'Desligado. Você liga em Mais, se quiser que os seus clientes acompanhem pelo portal.'));
      return;
    }
    if (a.situacao === 'ativo') {
      caixa.appendChild(h('div', { class: 'ajuda' }, `${R.primeiroNome(cliente.nome)} já acompanha pelo portal (${a.email}). Ele vê as etapas, envia documentos e conversa com a CCA.`));
      caixa.appendChild(h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async (e) => { e.currentTarget.disabled = true; try { await api.removerAcessoCliente(cliente.id); toast('Acesso do cliente retirado.'); aoMudar(); } catch (er) { toast(er.message); } } }, 'Tirar o acesso'));
      return;
    }
    const mostrarConvite = (link, expira) => {
      const texto = `${R.saudacao()}, ${R.primeiroNome(cliente.nome)}! Agora você pode acompanhar o seu financiamento pelo portal da Andrade Almeida CCA: ver cada etapa, enviar documentos e falar com a equipe.\nToque no link e crie a sua senha:\n${link}${expira ? `\n\nO convite vale até ${new Date(expira).toLocaleDateString('pt-BR')}.` : ''}`;
      const fone = R.soDigitos(R.celularInternacional(cliente.celular || '') || '');
      return h('div', { class: 'acesso-convite' },
        h('div', { class: 'gest-convite-texto' }, texto),
        h('div', { class: 'gest-acoes' },
          h('a', { class: 'btn btn-primario btn-pequeno', target: '_blank', rel: 'noopener', href: `https://wa.me/${fone}?text=${encodeURIComponent(texto)}` }, 'Enviar pelo WhatsApp'),
          h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async () => { try { await navigator.clipboard.writeText(texto); toast('Mensagem copiada.'); } catch { toast('Não consegui copiar.'); } } }, 'Copiar mensagem'),
          h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async (e) => { e.currentTarget.disabled = true; try { await api.removerAcessoCliente(cliente.id); toast('Convite cancelado.'); aoMudar(); } catch (er) { toast(er.message); } } }, 'Cancelar convite')));
    };
    if (a.situacao === 'convidado') {
      caixa.appendChild(h('div', { class: 'ajuda' }, 'Convite enviado, aguardando o cliente criar a senha.'));
      caixa.appendChild(mostrarConvite(a.link, a.expira_em));
      return;
    }
    caixa.appendChild(h('div', { class: 'ajuda' }, 'Opcional. O cliente passa a ver as etapas, enviar documentos e conversar com a CCA.'));
    const botao = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', id: 'darAcessoCliente' }, 'Convidar o cliente');
    botao.onclick = async () => {
      botao.disabled = true;
      try { const r = await api.darAcessoCliente(cliente.id); botao.replaceWith(mostrarConvite(r.link, r.expira_em)); }
      catch (e) { toast(e.message); botao.disabled = false; }
    };
    caixa.appendChild(botao);
  }).catch((e) => { limpar(caixa); caixa.appendChild(h('div', { class: 'sub' }, e.message)); });
  return caixa;
}

// ---------- tela "Mais" ----------
export async function conteudoMais({ perfil, recarregar }) {
  const cartao = (href, ic, titulo, texto) => h('a', { class: 'mais-cartao', href }, h('span', { class: 'mais-icone' }, icone(ic, { tam: 22, traco: 2 })), h('span', null, h('b', null, titulo), h('small', null, texto)));
  const acesso = perfil.papel === 'corretor' && !perfil.imobiliaria_id ? await cartaoAcessoClientes(recarregar) : null;
  return [
    cabecalho({ sobre: nomePerfil(perfil), titulo: 'Mais', sub: 'Ferramentas que você usa de vez em quando.' }),
    h('div', { class: 'mais-grade' },
      cartao('#/engenharia', 'casa', 'Engenharia', 'Pedir e acompanhar a avaliação do imóvel pela Caixa.'),
      perfil.papel === 'corretor' ? cartao('#/inicio', 'trofeu', 'Campanhas e desempenho', 'Sua posição no mês e as campanhas da CCA, no Início.') : null,
      cartao('#/clientes', 'pessoas', perfil.papel === 'gestor_imobiliaria' ? 'Clientes' : 'Meus clientes', 'Lista e quadro com todos os processos.')),
    acesso,
  ].filter(Boolean);
}

// ---------- cliente final: Meu financiamento ----------
export async function conteudoMeuFinanciamento({ perfil }) {
  const dados = await api.obterCliente(perfil.cliente_id);
  const { cliente, necessarios, historico, corretor } = dados;
  const arquivos = await api.listarContratoArquivos(cliente.id).then((l) => l.filter((a) => !a.substituido).map((a) => a.tipo)).catch(() => []);
  const r = R.resumoDocumentos(necessarios);
  const falta = r.pendente + r.recusado;
  const fone = R.soDigitos(corretor?.whatsapp || '');
  return [
    cabecalho({ sobre: 'Meu financiamento', titulo: `${R.saudacao()}, ${R.primeiroNome(perfil.nome)}`, sub: [cliente.programa, cliente.imovel && `Imóvel ${String(cliente.imovel).toLowerCase()}`].filter(Boolean).join(' · ') }, chipStatus(cliente.status)),
    fluxograma({ cliente, historico, arquivos, titulo: 'Seu processo, etapa por etapa', quemVe: 'cliente' }),
    h('div', { class: 'painel-colunas ficha-colunas' },
      h('div', { class: 'principal coluna-cartoes' },
        h('section', { class: 'cartao' }, secaoTitulo('Seus documentos', falta ? `Falta${falta > 1 ? 'm' : ''} ${falta}` : 'Todos enviados', { pequeno: true, icone: 'doc' }),
          falta ? listaPendencias(necessarios) : h('div', { class: 'ajuda' }, 'Nada pendente com você agora.'),
          h('a', { class: `btn ${falta ? 'btn-primario' : 'btn-contorno'}`, href: `#/cliente/${cliente.id}/documentos` }, falta ? 'Enviar documentos' : 'Ver meus documentos'))),
      h('aside', { class: 'lateral coluna-cartoes' },
        h('section', { class: 'cartao', id: 'conversa' }, secaoTitulo('Conversa com a CCA', 'Dúvidas sobre o seu processo. A equipe responde aqui.', { pequeno: true }), blocoConversa(cliente.id, { lado: 'portal' })),
        corretor ? h('section', { class: 'cartao' }, secaoTitulo('Seu corretor', null, { pequeno: true, icone: 'pessoa' }), h('div', null, h('b', null, corretor.nome)),
          fone ? h('a', { class: 'btn btn-contorno btn-pequeno', target: '_blank', rel: 'noopener', href: `https://wa.me/${fone}` }, 'Falar pelo WhatsApp') : null) : null)),
  ];
}

export { aviso };
