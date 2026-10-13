// APP CCA – Busca rápida (Ctrl+K ou /): acha um cliente ou uma tela de qualquer lugar do sistema.
import { h, icone, limpar } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';

let instalada = false;
let aberta = null;

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// contexto(): { perfil, telas: [{ nome, href }] }, devolve null fora do login
export function instalarBusca(contexto) {
  if (instalada) return;
  instalada = true;
  document.addEventListener('keydown', (e) => {
    const digitando = /^(input|textarea|select)$/i.test(e.target?.tagName || '') || e.target?.isContentEditable;
    const atalho = (e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey);
    const barra = e.key === '/' && !digitando && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!atalho && !barra) return;
    const ctx = contexto();
    if (!ctx?.perfil) return;
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
