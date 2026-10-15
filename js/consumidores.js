// Consumidores finais (Modelo 2): clientes que procuram a CCA direto, sem corretor. Lista, situação da identidade e do processo, e cadastro pela CCA.
import { h, limpar, icone, toast } from './dom.js';
import { api } from './api.js';
import * as R from './regras.js';
import { cabecalho, secaoTitulo, aviso, chipStatus } from './componentes.js';

const IDENT = {
  confirmada: ['Identidade confirmada', 'chip-aceito'],
  conferir: ['Vídeo para conferir', 'chip-alerta'],
  recusada: ['Vídeo recusado', 'chip-alerta'],
  aguardando: ['Aguardando o vídeo', ''],
};
const estado = { filtro: 'todos', busca: '' };

export async function secaoConsumidores(recarregar) {
  const lista = await api.listarConsumidores();
  const caixa = h('div');
  const area = h('div');
  const desenhar = () => {
    limpar(caixa);
    const termo = estado.busca.toLowerCase().trim(); const dig = R.soDigitos(termo);
    const filtros = [['todos', 'Todos'], ['conferir', 'Vídeo para conferir'], ['sem_processo', 'Sem processo'], ['com_processo', 'Com processo']];
    const passa = (c) => (estado.filtro === 'todos' || (estado.filtro === 'conferir' && c.identidade === 'conferir') || (estado.filtro === 'sem_processo' && !c.processos.length) || (estado.filtro === 'com_processo' && c.processos.length))
      && (!termo || c.nome.toLowerCase().includes(termo) || (dig && String(c.cpf || '').includes(dig)) || c.email.toLowerCase().includes(termo));
    const vis = lista.filter(passa);
    caixa.appendChild(h('div', { class: 'ini-pilulas', role: 'group', 'aria-label': 'Filtrar consumidores finais', style: { alignSelf: 'flex-start' } },
      filtros.map(([v, n]) => h('button', { type: 'button', class: `ini-pilula${estado.filtro === v ? ' ativa' : ''}`, 'aria-pressed': String(estado.filtro === v), onclick: () => { estado.filtro = v; desenhar(); } },
        `${n} · ${lista.filter((c) => v === 'todos' || (v === 'conferir' && c.identidade === 'conferir') || (v === 'sem_processo' && !c.processos.length) || (v === 'com_processo' && c.processos.length)).length}`))));
    caixa.appendChild(h('div', { class: 'tabela-caixa' }, h('table', { class: 'tabela tabela-consumidores' },
      h('thead', null, h('tr', null, ['Consumidor final', 'Contato', 'Identidade', 'Processo', 'Imóvel'].map((t) => h('th', null, t)))),
      h('tbody', null, vis.length ? vis.map((c) => h('tr', { 'data-consumidor': c.id },
        h('td', null, h('b', null, c.nome), h('div', { class: 'sub' }, c.cpf ? `CPF ${R.formatarCpf(c.cpf)}` : 'CPF não informado'),
          c.link_pendente ? h('span', { class: 'chip chip-em_conferencia' }, 'Ainda não criou a senha') : null),
        h('td', null, c.whatsapp ? h('div', null, R.formatarCelular(c.whatsapp)) : null, h('div', { class: 'sub' }, c.email)),
        h('td', null, h('span', { class: `chip ${IDENT[c.identidade][1]}` }, IDENT[c.identidade][0]),
          c.identidade === 'conferir' ? h('div', null, h('a', { href: '#/painel/verificacoes' }, 'Conferir o vídeo')) : null),
        h('td', null, c.processos.length ? c.processos.map((pr) => h('div', null, h('a', { href: `#/painel/clientes/${pr.id}` }, pr.rascunho ? 'Rascunho' : chipStatus(pr.status)))) : h('span', { class: 'sub' }, 'Ainda não cadastrou')),
        h('td', null, c.imoveis.length ? c.imoveis.map((i) => h('div', null, h('a', { href: `#/painel/imoveis/${i.id}` }, i.endereco || 'Imóvel'))) : h('span', { class: 'sub' }, '—'))))
        : h('tr', null, h('td', { colspan: 5, class: 'sub', style: { textAlign: 'center', padding: '30px' } }, lista.length ? 'Ninguém neste filtro.' : 'Nenhum consumidor final ainda. Convide ou cadastre abaixo.'))))));
  };
  const busca = h('input', { type: 'search', class: 'entrada', id: 'buscaConsumidor', placeholder: 'Nome, CPF ou e-mail', value: estado.busca, style: { width: '300px', maxWidth: '100%' }, oninput: (e) => { estado.busca = e.target.value; desenhar(); } });
  desenhar();
  const abrirForm = () => { limpar(area); area.appendChild(formCadastro(() => { limpar(area); area.appendChild(botoes()); }, recarregar)); area.querySelector('input')?.focus(); };
  const botoes = () => h('div', { class: 'gest-acoes' },
    h('button', { type: 'button', class: 'btn btn-primario', id: 'cadastrarConsumidor', onclick: abrirForm }, icone('mais', { tam: 18, traco: 2.4 }), ' Cadastrar consumidor final'),
    h('a', { class: 'btn btn-contorno', href: '#/painel/convites' }, 'Enviar convite por link'));
  area.appendChild(botoes());
  return [cabecalho({ sobre: 'Parceiros', titulo: 'Consumidores finais', sub: 'Quem procura a CCA direto, sem corretor. Antes de cadastrar o processo, a CCA confere a identidade (vídeo) para evitar golpe com documentos de terceiros.' }, busca),
    caixa, area];
}

function formCadastro(aoFechar, recarregar) {
  const v = { nome: '', cpf: '', email: '', whatsapp: '', conferida: false };
  const erro = h('div', { class: 'erro-campo', role: 'alert' });
  const resultado = h('div');
  const campo = (id, rot, k, attrs = {}, fmt) => h('div', { class: 'campo' }, h('label', { for: id }, rot),
    h('input', { id, class: 'entrada', autocomplete: 'off', ...attrs, oninput: (e) => { if (fmt) e.target.value = fmt(e.target.value); v[k] = e.target.value; } }));
  const salvar = h('button', { type: 'button', class: 'btn btn-primario', id: 'salvarConsumidor' }, 'Cadastrar e gerar o acesso');
  salvar.onclick = async () => {
    erro.textContent = ''; salvar.disabled = true;
    try {
      const r = await api.cadastrarConsumidor({ nome: v.nome, cpf: v.cpf, email: v.email, whatsapp: v.whatsapp, identidade_conferida: v.conferida });
      toast('Consumidor final cadastrado.');
      const texto = `Olá, ${R.primeiroNome(v.nome)}! Aqui é da Andrade Almeida CCA. Crie a sua senha neste link para acompanhar o seu financiamento: ${r.link}`;
      const wa = `https://wa.me/${R.soDigitos(R.celularInternacional(v.whatsapp))}?text=${encodeURIComponent(texto)}`;
      limpar(resultado);
      resultado.append(aviso('azul', h('b', null, 'Acesso criado. '), 'Envie o link para a pessoa criar a senha.'),
        h('div', { class: 'gest-acoes' }, h('a', { class: 'btn btn-primario btn-pequeno', href: wa, target: '_blank', rel: 'noopener' }, icone('conversa', { tam: 16, traco: 2.2 }), ' Enviar pelo WhatsApp'),
          h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async () => { try { await navigator.clipboard.writeText(r.link); toast('Link copiado.'); } catch { toast('Não deu para copiar.'); } } }, 'Copiar link'),
          h('button', { type: 'button', class: 'btn-link', onclick: () => recarregar() }, 'Concluir')));
    } catch (e) { erro.textContent = e.message; salvar.disabled = false; }
  };
  return h('section', { class: 'cartao form-eng', style: { gap: '12px', maxWidth: '760px' } },
    secaoTitulo('Cadastrar consumidor final', 'Para quem procurou a CCA direto. A pessoa recebe um link para criar a senha.', { pequeno: true, nivel: 'h3', icone: 'pessoa' }),
    h('div', { class: 'form-eng-grade' },
      h('div', { class: 'campo-largo' }, campo('cf-nome', 'Nome completo', 'nome')),
      campo('cf-cpf', 'CPF', 'cpf', { inputmode: 'numeric', placeholder: '000.000.000-00' }, R.formatarCpf),
      campo('cf-whats', 'WhatsApp', 'whatsapp', { inputmode: 'tel', placeholder: '(21) 99999-9999' }, R.formatarCelular),
      h('div', { class: 'campo-largo' }, campo('cf-email', 'E-mail', 'email', { type: 'email', inputmode: 'email', autocapitalize: 'none' }))),
    h('label', { class: 'fin-perm-item' }, h('input', { type: 'checkbox', id: 'cf-conferida', onchange: (e) => { v.conferida = e.target.checked; } }),
      h('span', null, 'Identidade conferida pessoalmente na CCA (documento original com foto). Assim a pessoa não precisa gravar o vídeo.')),
    erro, h('div', { class: 'gest-acoes' }, salvar, h('button', { type: 'button', class: 'btn btn-contorno', onclick: aoFechar }, 'Cancelar')), resultado);
}
