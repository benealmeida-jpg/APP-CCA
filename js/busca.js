// APP CCA – Busca rápida (Ctrl+K ou /): acha um cliente ou uma tela de qualquer lugar do sistema.
import { h, icone, limpar } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';

let instalada = false;
let aberta = null;
let irPendente = 0;
let contextoAtual = null;

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// contexto(): { perfil, telas: [{ nome, href }] }, devolve null fora do login
export function instalarBusca(contexto) {
  if (instalada) return;
  instalada = true;
  contextoAtual = contexto;
  document.addEventListener('keydown', (e) => {
    const digitando = /^(input|textarea|select)$/i.test(e.target?.tagName || '') || e.target?.isContentEditable;
    const atalho = (e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey);
    const barra = e.key === '/' && !digitando && !e.ctrlKey && !e.metaKey && !e.altKey;
    const livre = !digitando && !e.ctrlKey && !e.metaKey && !e.altKey && !aberta && !document.querySelector('.atalhos-fundo');
    const ctx = contexto();
    if (!ctx?.perfil) return;
    // ? = lista de atalhos; g e depois uma letra = ir para uma tela
    if (livre && e.key === '?') { e.preventDefault(); abrirAtalhos(); return; }
    if (livre && irPendente && Date.now() - irPendente < 1500) {
      irPendente = 0;
      const t = (ctx.telas || []).find((x) => x.tecla === e.key.toLowerCase());
      if (t) { e.preventDefault(); location.hash = t.href.replace(/^#/, ''); }
      return;
    }
    if (livre && atalhoDeCliente(e.key.toLowerCase())) { e.preventDefault(); return; }
    if (livre && e.key.toLowerCase() === 'g') { irPendente = Date.now(); return; }
    if (!atalho && !barra) return;
    e.preventDefault();
    abrirBusca(ctx);
  });
}

export function abrirBusca(ctx) {
  if (aberta) { aberta.querySelector('input')?.focus(); return; }
  const equipe = ['equipe_cca', 'admin'].includes(ctx.perfil.papel);
  let clientes = null; let ativo = 0; let itens = [];
  const campo = h('input', { type: 'search', class: 'busca-campo', placeholder: 'Buscar cliente por nome ou CPF, ou ir para uma tela…', 'aria-label': 'Buscar', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'busca-lista' });
  const lista = h('ul', { class: 'busca-lista', id: 'busca-lista', role: 'listbox' });
  const fechar = () => { aberta?.remove(); aberta = null; document.removeEventListener('keydown', teclas, true); };
  const ir = (href) => { fechar(); location.hash = href.replace(/^#/, ''); };
  const hrefCliente = (c) => equipe ? `/painel/clientes/${c.id}` : (c.rascunho ? `/cliente/${c.id}/cadastro/1` : `/cliente/${c.id}`);

  const montar = () => {
    const t = semAcento(campo.value).trim(); const dig = R.soDigitos(campo.value);
    const achadosClientes = (clientes || []).filter((c) => !t || semAcento(c.nome).includes(t) || (dig.length >= 3 && R.soDigitos(c.cpf).includes(dig))
      || semAcento(c.corretor_nome).includes(t)).slice(0, 7)
      .map((c) => ({ tipo: 'cliente', titulo: c.nome, sub: [R.formatarCpf(c.cpf), c.programa, c.rascunho ? 'Rascunho' : c.status_nome, equipe ? c.corretor_nome : null].filter(Boolean).join(' · '), href: hrefCliente(c), icone: 'pessoa' }));
    const achadasTelas = (ctx.telas || []).filter((x) => !t || semAcento(x.nome).includes(t)).slice(0, 5)
      .map((x) => ({ tipo: 'tela', titulo: x.nome, sub: 'Ir para esta tela', href: x.href, icone: x.icone || 'seta' }));
    itens = [...achadosClientes, ...achadasTelas];
    ativo = Math.min(ativo, Math.max(itens.length - 1, 0));
    limpar(lista);
    if (clientes === null) { lista.appendChild(h('li', { class: 'busca-vazio' }, 'Carregando clientes…')); return; }
    if (!itens.length) { lista.appendChild(h('li', { class: 'busca-vazio' }, 'Nada encontrado. Tente o nome, o CPF ou parte do nome da tela.')); return; }
    itens.forEach((it, i) => lista.appendChild(h('li', { role: 'option', id: `busca-${i}`, 'aria-selected': i === ativo ? 'true' : 'false', class: `busca-item${i === ativo ? ' ativo' : ''}`,
      onmousemove: () => { if (ativo !== i) { ativo = i; marcar(); } }, onclick: () => ir(it.href) },
    h('span', { class: 'busca-ic' }, icone(it.icone, { tam: 18, traco: 2 })),
    h('span', { class: 'busca-txt' }, h('b', null, it.titulo), h('small', null, it.sub)),
    it.tipo === 'tela' ? h('span', { class: 'busca-tag' }, 'Tela') : null)));
  };
  const marcar = () => {
    [...lista.children].forEach((li, i) => { const on = i === ativo; li.classList.toggle('ativo', on); li.setAttribute('aria-selected', on ? 'true' : 'false'); if (on) li.scrollIntoView({ block: 'nearest' }); });
    campo.setAttribute('aria-activedescendant', `busca-${ativo}`);
  };
  function teclas(e) {
    if (!aberta) return;
    if (e.key === 'Escape') { e.preventDefault(); fechar(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); ativo = Math.min(ativo + 1, itens.length - 1); marcar(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(ativo - 1, 0); marcar(); }
    else if (e.key === 'Enter' && itens[ativo]) { e.preventDefault(); ir(itens[ativo].href); }
  }
  campo.addEventListener('input', () => { ativo = 0; montar(); });
  aberta = h('div', { class: 'busca-fundo', onclick: (e) => { if (e.target === aberta) fechar(); } },
    h('div', { class: 'busca-caixa', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Busca rápida' },
      h('div', { class: 'busca-topo' }, icone('busca', { tam: 20, traco: 2 }), campo, h('kbd', null, 'Esc')),
      lista,
      h('div', { class: 'busca-rodape' }, h('span', null, h('kbd', null, '↑'), h('kbd', null, '↓'), ' escolher'), h('span', null, h('kbd', null, 'Enter'), ' abrir'), h('span', null, 'Dica: aperte ', h('kbd', null, 'Ctrl'), ' + ', h('kbd', null, 'K'), ' em qualquer tela'))));
  document.body.appendChild(aberta);
  document.addEventListener('keydown', teclas, true);
  montar(); campo.focus();
  api.listarClientes().then((l) => { clientes = l || []; if (aberta) montar(); }).catch(() => { clientes = []; if (aberta) montar(); });
}

// Atalhos de dentro do cliente / dos documentos. Devolve true quando a tecla foi usada.
//  M conversa · N próximo documento · P documento anterior · A aceitar · R recusar (ADM, no documento marcado)
function atalhoDeCliente(tecla) {
  if (tecla === 'm') {
    const campo = document.querySelector('#secao-conversa textarea, #conversa textarea');
    if (!campo) return false;
    campo.scrollIntoView({ behavior: 'smooth', block: 'center' }); campo.focus({ preventScroll: true }); return true;
  }
  if (tecla === 'n' || tecla === 'p') {
    const conferencia = [...document.querySelectorAll('.cartao')].filter((c) => [...c.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Aceitar') && !c.hidden);
    const lista = conferencia.length ? conferencia : [...document.querySelectorAll('.docs-pagina .doc')].filter((d) => d.querySelector('[aria-label^="Visualizar"]'));
    if (!lista.length) return false;
    const atual = lista.findIndex((c) => c.classList.contains('foco-doc') || c.classList.contains('selecionado'));
    const prox = Math.min(Math.max((atual < 0 ? (tecla === 'n' ? 0 : lista.length - 1) : atual + (tecla === 'n' ? 1 : -1)), 0), lista.length - 1);
    document.querySelectorAll('.foco-doc').forEach((x) => x.classList.remove('foco-doc'));
    const alvo = lista[prox];
    if (conferencia.length) { alvo.classList.add('foco-doc'); alvo.setAttribute('tabindex', '-1'); alvo.focus({ preventScroll: true }); }
    else alvo.querySelector('[aria-label^="Visualizar"]').click();
    alvo.scrollIntoView({ behavior: 'smooth', block: conferencia.length ? 'start' : 'nearest' });
    return true;
  }
  if (tecla === 'a' || tecla === 'r') {
    const alvo = document.querySelector('.cartao.foco-doc');
    const botao = alvo && [...alvo.querySelectorAll('button')].find((b) => b.textContent.trim() === (tecla === 'a' ? 'Aceitar' : 'Recusar'));
    if (!botao) return false;
    botao.click(); return true;
  }
  return false;
}

// Lista de atalhos de teclado (tecla ?)
export function abrirAtalhos() {
  if (document.querySelector('.atalhos-fundo')) return;
  const ctx = contextoAtual ? contextoAtual() : null;
  const k = (...t) => h('span', { class: 'atalho-teclas' }, ...t.flatMap((x, i) => (i ? [' ', h('kbd', null, x)] : [h('kbd', null, x)])));
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc, true); };
  const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); fechar(); } };
  const linhas = [[k('Ctrl', 'K'), 'Buscar cliente ou tela'], [k('/'), 'Buscar (atalho curto)'],
    ...(ctx?.telas || []).filter((t) => t.tecla).map((t) => [k('G', t.tecla.toUpperCase()), `Ir para ${t.nome}`]),
    [k('M'), 'Escrever na conversa do cliente'], [k('N'), 'Próximo documento'], [k('P'), 'Documento anterior'],
    [k('A'), 'Aceitar o documento marcado (equipe)'], [k('R'), 'Recusar o documento marcado (equipe)'],
    [k('?'), 'Mostrar esta lista'], [k('Esc'), 'Fechar janelas e a busca']];
  const fundo = h('div', { class: 'busca-fundo atalhos-fundo', onclick: (e) => { if (e.target === fundo) fechar(); } },
    h('div', { class: 'busca-caixa atalhos-caixa', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Atalhos de teclado' },
      h('h2', null, 'Atalhos de teclado'),
      h('p', { class: 'dica' }, 'Para ir a uma tela: aperte G e, em seguida, a letra.'),
      h('ul', null, linhas.map(([a, b]) => h('li', null, a, h('span', null, b)))),
      h('button', { type: 'button', class: 'btn btn-sec', onclick: fechar }, 'Fechar')));
  document.body.appendChild(fundo);
  document.addEventListener('keydown', esc, true);
  fundo.querySelector('button').focus();
}
