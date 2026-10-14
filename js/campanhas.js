// Campanhas (concursos com prêmio) e metas por mês: página do painel e peças usadas no Início.
import { h, limpar, icone, toast } from './dom.js';
import { api } from './api.js';
import * as C from './campanhas-dados.js';
import { cabecalho, secaoTitulo } from './componentes.js';
import { hojeIso } from './regras.js';

const numero = (n) => Number(n).toLocaleString('pt-BR');
const GRUPOS = { imobiliaria: ['Imobiliárias', 'predio', 'O brinde vai para o gestor ou para quem a imobiliária indicar'], corretor: ['Melhor corretor de imobiliária', 'pessoa', null], autonomo: ['Corretores autônomos', 'pessoa', 'Sem vínculo com imobiliária'] };
const TOM = { andamento: 'ok', agendada: 'info', encerrada: 'neutro' };

// Abre a página de Campanhas já na aba (ou na campanha) pedida
export function irParaCampanhas({ aba = 'campanhas', id = null } = {}) { est.aba = aba; est.aberta = id; est.editando = null; if (aba === 'metas') est.mes = null; location.hash = '#/painel/campanhas'; }

export const chipEstado = (s) => h('span', { class: `ini-chip tom-${TOM[s.estado]}` }, s.rotulo);

// Coluna de uma categoria: prêmio(s), placar e a posição de quem está olhando
export function colunaCategoria(campanha, categoria, linhas, { limite = 5, vazioTexto = 'Ninguém pontuou ainda. O primeiro contrato assinado entra na frente!' } = {}) {
  const [titulo, ic, nota] = GRUPOS[categoria];
  const premios = C.premiosDe(campanha, categoria);
  const com = linhas.filter((l) => l.posicao);
  const eu = linhas.find((l) => l.meu);
  const topo = com.slice(0, limite);
  const euForaDoTopo = eu && !topo.includes(eu);
  return h('div', { class: 'camp-cat' },
    h('div', { class: 'camp-cat-cab' }, h('span', { class: 'camp-cat-ic' }, icone(ic, { tam: 18, traco: 2 })), h('div', { class: 'camp-cat-tit' }, h('b', null, titulo), nota ? h('small', null, nota) : null)),
    premios.length ? h('ul', { class: 'camp-premios' }, premios.map((p) => h('li', null, icone('trofeu', { tam: 16, traco: 2 }),
      h('span', null, h('b', null, `${p.posicao}º lugar`), ` · ${p.descricao}`)))) : h('p', { class: 'camp-sem-premio' }, 'Sem prêmio definido para esta categoria.'),
    topo.length ? h('ol', { class: 'camp-placar' }, topo.map((l) => linhaPlacar(l, premios))) : h('div', { class: 'ini-vazio' }, h('span', null, icone('grafico', { tam: 20, traco: 2.4 })), vazioTexto),
    euForaDoTopo ? h('div', { class: 'camp-eu' }, eu.posicao ? `Você está em ${eu.posicao}º lugar, com ${numero(eu.valor)}.` : 'Você ainda não pontuou nesta campanha.') : null);
}

function linhaPlacar(l, premios) {
  const premiada = premios.some((p) => p.posicao === l.posicao);
  return h('li', { class: `camp-linha${l.meu ? ' meu' : ''}${premiada ? ' premiada' : ''}` },
    h('span', { class: 'camp-pos' }, `${l.posicao}º`),
    h('span', { class: 'camp-nome' }, h('b', null, l.nome, l.meu ? h('span', { class: 'camp-voce' }, l.categoria === 'imobiliaria' ? ' (sua imobiliária)' : ' (você)') : null), l.subnome ? h('small', null, l.subnome) : null),
    h('span', { class: 'camp-valor' }, numero(l.valor), h('small', null, `${l.valor === 1 ? 'ponto' : 'pontos'}${l.contratos && l.contratos !== l.valor ? ` · ${numero(l.contratos)} ${l.contratos === 1 ? 'cliente' : 'clientes'}` : ''}`)));
}

// ---------- página do painel ----------
const est = { aba: 'campanhas', aberta: null, editando: null, mes: null, arquivadas: false, editandoEntrega: null };

export async function secaoCampanhas(ctx, recarregar) {
  const admin = ctx.perfil.papel === 'admin';
  const raiz = h('div', { class: 'camp-pagina' });
  if (ctx.selecionar) { est.aba = 'campanhas'; est.aberta = ctx.selecionar; est.editando = null; ctx.selecionar = null; }
  const desenhar = async () => {
    limpar(raiz);
    const abas = h('div', { class: 'pilulas abas-docs', role: 'group', 'aria-label': 'Campanhas e metas' },
      [['campanhas', 'Campanhas'], ['metas', 'Metas por mês']].map(([k, n]) => h('button', { type: 'button', class: 'pilula', 'aria-pressed': est.aba === k ? 'true' : 'false', onclick: () => { est.aba = k; est.aberta = null; est.editando = null; desenhar(); } }, n)));
    raiz.appendChild(abas);
    try {
      raiz.appendChild(est.aba === 'metas' ? await abaMetas({ admin, desenhar }) : await abaCampanhas({ admin, ctx, desenhar }));
    } catch (e) { raiz.appendChild(h('div', { class: 'aviso aviso-laranja' }, e.message || 'Não consegui carregar.')); }
  };
  await desenhar();
  return [cabecalho('Campanhas', 'Concursos com prêmio para imobiliárias e corretores, e as metas de cada mês.'), raiz];
}

async function abaCampanhas({ admin, ctx, desenhar }) {
  const campanhas = await api.listarCampanhas();
  const area = h('div', { class: 'camp-lista' });
  if (est.editando) return formCampanha({ campanha: est.editando === 'nova' ? null : campanhas.find((c) => c.id === est.editando), desenhar });
  if (est.aberta) {
    const c = campanhas.find((x) => x.id === est.aberta);
    if (c) return detalhe({ campanha: c, admin, desenhar });
    est.aberta = null;
  }
  const visiveis = campanhas.filter((c) => est.arquivadas || !c.arquivada);
  const topo = h('div', { class: 'camp-topo' },
    h('label', { class: 'camp-check' }, h('input', { type: 'checkbox', checked: est.arquivadas, onchange: (e) => { est.arquivadas = e.target.checked; desenhar(); } }), ' Mostrar arquivadas'),
    admin ? h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', onclick: () => { est.editando = 'nova'; desenhar(); } }, icone('mais', { tam: 16, traco: 2.4 }), ' Nova campanha') : null);
  area.appendChild(topo);
  if (!visiveis.length) area.appendChild(h('div', { class: 'cartao' }, admin ? 'Nenhuma campanha ainda. Crie a primeira: defina o período, o que vale ponto e o prêmio.' : 'Nenhuma campanha no momento.'));
  const placares = await Promise.all(visiveis.map((c) => api.rankingCampanha(c.id).catch(() => [])));
  visiveis.forEach((c, i) => area.appendChild(cartaoResumo(c, placares[i], { admin, desenhar })));
  return area;
}

function cartaoResumo(c, placar, { admin, desenhar }) {
  const s = C.situacaoCampanha(c);
  return h('section', { class: `ini-cartao camp-cartao${c.arquivada ? ' arquivada' : ''}` },
    h('header', { class: 'ini-cartao-cab' },
      h('div', { class: 'ini-cartao-tit' }, h('h2', null, c.nome), h('p', null, `${C.periodoTexto(c)} · conta: ${C.nomeMetrica(c.metrica).toLowerCase()} · ${C.regraPontos(c)}`)),
      h('div', { class: 'camp-chips' }, c.arquivada ? h('span', { class: 'ini-chip tom-neutro' }, 'Arquivada') : null, !c.ativa ? h('span', { class: 'ini-chip tom-atencao' }, 'Rascunho: corretores não veem') : null, chipEstado(s), h('small', null, s.detalhe))),
    c.descricao ? h('p', { class: 'camp-desc' }, c.descricao) : null,
    h('div', { class: 'camp-cats' }, C.categoriasDaCampanha(c).map((k) => colunaCategoria(c, k, C.doGrupo(placar, k), { limite: 3 }))),
    h('div', { class: 'linha-botoes camp-acoes' },
      h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => { est.aberta = c.id; desenhar(); } }, 'Ver placar completo'),
      admin ? h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => { est.editando = c.id; desenhar(); } }, 'Editar') : null));
}

function detalhe({ campanha: c, admin, desenhar }) {
  const s = C.situacaoCampanha(c);
  const corpo = h('div', { class: 'camp-detalhe' });
  const carregar = async () => {
    const placar = await api.rankingCampanha(c.id);
    const premios = C.premiosAtivos(c);
    limpar(corpo);
    corpo.appendChild(h('section', { class: 'ini-cartao' },
      h('header', { class: 'ini-cartao-cab' },
        h('div', { class: 'ini-cartao-tit' }, h('h2', null, c.nome), h('p', null, `${C.periodoTexto(c)} · conta: ${C.nomeMetrica(c.metrica).toLowerCase()} · ${C.regraPontos(c)}`)),
        h('div', { class: 'camp-chips' }, chipEstado(s), h('small', null, s.detalhe))),
      c.descricao ? h('p', { class: 'camp-desc' }, c.descricao) : null,
      h('div', { class: 'camp-cats' }, C.categoriasDaCampanha(c).map((k) => colunaCategoria(c, k, C.doGrupo(placar, k), { limite: 15 }))),
      c.regulamento ? h('details', { class: 'camp-regulamento' }, h('summary', null, 'Regulamento'), h('p', null, c.regulamento)) : null,
      !c.mostrar_nomes ? h('p', { class: 'camp-nota' }, 'Os corretores veem só a própria posição. Você vê o placar completo.') : null));
    // Premiação: vencedores e entrega
    // Para quem vai o brinde (pode ser ajustado pelo ADM, por exemplo quando a imobiliária não tem gestor)
    const blocoDestino = (p) => {
      if (!admin) return h('span', { class: 'camp-destino' }, `Brinde para: ${p.entregar_para || 'a definir'}`);
      if (est.editandoEntrega !== p.id) return h('span', { class: 'camp-destino' }, h('span', { class: p.entregar_para ? '' : 'camp-destino-falta' }, `Brinde para: ${p.entregar_para || 'definir quem recebe'}`),
        h('button', { type: 'button', class: 'camp-link', onclick: () => { est.editandoEntrega = p.id; carregar(); } }, p.entregar_para ? 'Alterar' : 'Definir'));
      const campo = h('input', { class: 'entrada', value: p.entregar_para || '', 'aria-label': 'Para quem vai o brinde', placeholder: 'Nome de quem vai receber', style: { height: '42px', maxWidth: '320px' } });
      return h('span', { class: 'camp-destino camp-destino-edit' }, campo,
        h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', onclick: async () => { try { await api.definirEntregaPara(c.id, p.id, campo.value); est.editandoEntrega = null; toast('Anotado.'); refrescar(); } catch (e) { toast(e.message); } } }, 'Salvar'),
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => { est.editandoEntrega = null; carregar(); } }, 'Cancelar'));
    };
    const linhas = premios.map((p) => {
      const ao_vivo = placar.find((l) => l.categoria === p.categoria && l.posicao === p.posicao);
      const ganhador = c.apurada_em ? p.ganhador_nome : null;
      return h('li', { class: 'camp-premio-linha' },
        h('span', { class: 'camp-premio-ic' }, icone('trofeu', { tam: 18, traco: 2 })),
        h('span', { class: 'camp-premio-txt' }, h('b', null, `${C.nomeCategoria(p.categoria)} · ${p.posicao}º lugar`), h('small', null, p.descricao),
          h('small', { class: 'camp-ganhador' }, c.apurada_em ? (ganhador ? `Vencedor: ${ganhador}` : 'Sem vencedor (ninguém pontuou)') : (ao_vivo ? `Liderando agora: ${ao_vivo.nome}` : 'Ninguém pontuou ainda')),
          c.apurada_em && ganhador ? blocoDestino(p) : null),
        p.entregue_em ? h('span', { class: 'ini-chip tom-ok' }, `Entregue em ${C.dataLonga(p.entregue_em)}`) : null,
        admin && c.apurada_em && ganhador ? h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async () => {
          try { await api.entregarPremio(c.id, p.id, p.entregue_em ? null : hojeIso()); toast(p.entregue_em ? 'Entrega desmarcada.' : 'Entrega registrada.'); refrescar(); } catch (e) { toast(e.message); }
        } }, p.entregue_em ? 'Desfazer entrega' : 'Marcar como entregue') : null);
    });
    corpo.appendChild(h('section', { class: 'ini-cartao' },
      h('header', { class: 'ini-cartao-cab' }, h('div', { class: 'ini-cartao-tit' }, h('h2', null, 'Premiação'),
        h('p', null, c.apurada_em ? `Vencedores apurados em ${new Date(c.apurada_em).toLocaleDateString('pt-BR')}` : 'Quando a campanha terminar, apure os vencedores para registrar quem ganhou.'))),
      premios.length ? h('ul', { class: 'camp-premio-lista' }, linhas) : h('p', { class: 'camp-sem-premio' }, 'Nenhum prêmio cadastrado.'),
      admin ? h('div', { class: 'linha-botoes camp-acoes' },
        h('button', { type: 'button', class: 'btn btn-primario btn-pequeno', onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          try { await api.apurarCampanha(c.id); toast('Vencedores registrados.'); refrescar(); } catch (e) { toast(e.message); ev.currentTarget.disabled = false; }
        } }, c.apurada_em ? 'Apurar de novo' : s.estado === 'encerrada' ? 'Apurar vencedores' : 'Apurar agora (campanha em andamento)'),
        s.estado !== 'encerrada' ? h('small', { class: 'camp-nota' }, 'Apurar antes do fim registra os líderes de hoje. Você pode apurar de novo depois.') : null) : null));
  };
  const refrescar = async () => { const l = (await api.listarCampanhas()).find((x) => x.id === c.id); if (l) Object.assign(c, l); await carregar(); };
  carregar().catch((e) => corpo.appendChild(h('div', { class: 'aviso aviso-laranja' }, e.message)));
  return h('div', { class: 'camp-detalhe-pag' },
    h('div', { class: 'camp-topo' },
      h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => { est.aberta = null; desenhar(); } }, icone('voltar', { tam: 16, traco: 2.4 }), ' Todas as campanhas'),
      admin ? h('div', { class: 'linha-botoes' },
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => { est.editando = c.id; desenhar(); } }, 'Editar'),
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: async () => { try { await api.arquivarCampanha(c.id, !c.arquivada); toast(c.arquivada ? 'Campanha reaberta.' : 'Campanha arquivada.'); est.aberta = null; desenhar(); } catch (e) { toast(e.message); } } }, c.arquivada ? 'Desarquivar' : 'Arquivar')) : null),
    corpo);
}

// ---------- formulário (criar / editar) ----------
function formCampanha({ campanha, desenhar }) {
  const hoje = hojeIso(); const mes = hoje.slice(0, 7);
  const fimMes = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  const st = campanha ? { ...campanha, premios: C.premiosAtivos(campanha).map((p) => ({ ...p })) } : {
    nome: '', descricao: '', regulamento: '', metrica: 'assinados', inicio: `${mes}-01`, fim: `${mes}-${String(fimMes).padStart(2, '0')}`, mostrar_nomes: true, ativa: true,
    pontos_avulso: 2, pontos_empreendimento: 1,
    premios: [{ categoria: 'imobiliaria', posicao: 1, descricao: '' }, { categoria: 'corretor', posicao: 1, descricao: '' }, { categoria: 'autonomo', posicao: 1, descricao: '' }] };
  const removidos = [];
  const lista = h('div', { class: 'camp-form-premios' });
  const desenharPremios = () => {
    limpar(lista);
    st.premios.forEach((p, i) => lista.appendChild(h('div', { class: 'camp-form-premio' },
      h('div', { class: 'campo' }, h('label', { for: `pc-${i}` }, 'Para quem'), h('select', { id: `pc-${i}`, class: 'entrada', onchange: (e) => { p.categoria = e.target.value; } }, C.CATEGORIAS.map(([k, n]) => h('option', { value: k, selected: k === p.categoria }, n)))),
      h('div', { class: 'campo' }, h('label', { for: `pp-${i}` }, 'Colocação'), h('input', { id: `pp-${i}`, class: 'entrada', type: 'number', min: '1', inputmode: 'numeric', value: p.posicao, oninput: (e) => { p.posicao = Number(e.target.value) || 1; } })),
      h('div', { class: 'campo camp-form-desc' }, h('label', { for: `pd-${i}` }, 'Prêmio'), h('input', { id: `pd-${i}`, class: 'entrada', value: p.descricao, placeholder: 'Ex.: 2 vouchers de almoço ou jantar na Vacaria do Sul', oninput: (e) => { p.descricao = e.target.value; } })),
      h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno camp-remover', 'aria-label': 'Remover prêmio', onclick: () => { if (p.id) removidos.push(p.id); st.premios.splice(i, 1); desenharPremios(); } }, icone('fechar', { tam: 16, traco: 2.4 })))));
    lista.appendChild(h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', style: { alignSelf: 'flex-start' }, onclick: () => { st.premios.push({ categoria: 'corretor', posicao: 1, descricao: '' }); desenharPremios(); } }, icone('mais', { tam: 16, traco: 2.4 }), ' Adicionar prêmio'));
  };
  desenharPremios();
  const campo = (id, rotulo, ctl, ajuda) => h('div', { class: 'campo' }, h('label', { for: id }, rotulo), ctl, ajuda ? h('small', { class: 'ajuda' }, ajuda) : null);
  const metricaAjuda = h('small', { class: 'ajuda' }, C.METRICAS_CAMPANHA.find(([k]) => k === st.metrica)?.[2] || '');
  const salvar = h('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar campanha');
  salvar.onclick = async () => {
    salvar.disabled = true;
    try { await api.salvarCampanha({ ...st, premiosRemovidos: removidos }); toast('Campanha salva.'); est.editando = null; est.aberta = null; desenhar(); }
    catch (e) { toast(e.message); salvar.disabled = false; }
  };
  return h('section', { class: 'cartao camp-form' },
    secaoTitulo(campanha ? 'Editar campanha' : 'Nova campanha', 'Defina o período, o que vale ponto e os prêmios.'),
    campo('cn', 'Nome da campanha', h('input', { id: 'cn', class: 'entrada', value: st.nome, placeholder: 'Ex.: Campanha Vacaria do Sul', oninput: (e) => { st.nome = e.target.value; } })),
    campo('cd', 'Descrição (aparece para todos)', h('textarea', { id: 'cd', class: 'entrada camp-texto', rows: 2, oninput: (e) => { st.descricao = e.target.value; } }, st.descricao || '')),
    h('div', { class: 'camp-form-linha' },
      campo('ci', 'Começa em', h('input', { id: 'ci', class: 'entrada', type: 'date', value: st.inicio, onchange: (e) => { st.inicio = e.target.value; } })),
      campo('cf', 'Termina em (conta o dia inteiro)', h('input', { id: 'cf', class: 'entrada', type: 'date', value: st.fim, onchange: (e) => { st.fim = e.target.value; } }))),
    campo('cm', 'O que vale ponto', h('select', { id: 'cm', class: 'entrada', onchange: (e) => { st.metrica = e.target.value; metricaAjuda.textContent = C.METRICAS_CAMPANHA.find(([k]) => k === st.metrica)?.[2] || ''; } },
      C.METRICAS_CAMPANHA.map(([k, n]) => h('option', { value: k, selected: k === st.metrica }, n))), null),
    metricaAjuda,
    h('div', { class: 'camp-form-linha' },
      campo('cpa', 'Pontos: imóvel avulso', h('input', { id: 'cpa', class: 'entrada', type: 'number', min: '0', inputmode: 'numeric', value: st.pontos_avulso, oninput: (e) => { st.pontos_avulso = e.target.value === '' ? 2 : Number(e.target.value); } })),
      campo('cpe', 'Pontos: empreendimento', h('input', { id: 'cpe', class: 'entrada', type: 'number', min: '0', inputmode: 'numeric', value: st.pontos_empreendimento, oninput: (e) => { st.pontos_empreendimento = e.target.value === '' ? 1 : Number(e.target.value); } }))),
    h('div', { class: 'camp-form-bloco' }, secaoTitulo('Prêmios', 'Um prêmio por colocação. A imobiliária (o brinde vai para quem ela indicar; padrão: o gestor), o melhor corretor de imobiliária e o corretor autônomo disputam separados. Deixe sem prêmio a disputa que não existir.', { pequeno: true, nivel: 'h3' }), lista),
    campo('cr', 'Regulamento (opcional)', h('textarea', { id: 'cr', class: 'entrada camp-texto', rows: 3, placeholder: 'Ex.: em caso de empate, ganha quem chegou primeiro ao total.', oninput: (e) => { st.regulamento = e.target.value; } }, st.regulamento || '')),
    h('label', { class: 'camp-check' }, h('input', { type: 'checkbox', checked: st.mostrar_nomes, onchange: (e) => { st.mostrar_nomes = e.target.checked; } }), ' Mostrar o placar com nomes para os corretores (desmarcado: cada um vê só a própria posição)'),
    h('label', { class: 'camp-check' }, h('input', { type: 'checkbox', checked: st.ativa, onchange: (e) => { st.ativa = e.target.checked; } }), ' Publicada (desmarcado: rascunho que só a equipe enxerga)'),
    h('div', { class: 'linha-botoes' }, h('button', { type: 'button', class: 'btn btn-contorno', onclick: () => { est.editando = null; desenhar(); } }, 'Cancelar'), salvar));
}

// ---------- metas por mês ----------
async function abaMetas({ admin, desenhar }) {
  const [metasMensais, parametros] = await Promise.all([api.listarMetasMensais(), api.listarParametros().catch(() => [])]);
  const par = Object.fromEntries(parametros.map((p) => [p.chave, p.valor]));
  est.mes ||= C.mesIso();
  const mes = est.mes; const atual = C.metasDoMesDefinidas(mes, metasMensais, par);
  const campos = [['abertos', 'Processos abertos'], ['minutas', 'Chegaram na etapa Contrato'], ['assinados', 'Contratos assinados']];
  const salvar = h('button', { type: 'button', class: 'btn btn-primario btn-pequeno' }, 'Salvar metas de ' + C.nomeMes(mes));
  const lerCampo = (cod) => document.getElementById(`mm-${cod}`).value;
  salvar.onclick = async () => {
    salvar.disabled = true;
    try { for (const [cod] of campos) await api.salvarMetaMensal(mes, cod, lerCampo(cod) === '' ? null : Math.max(0, Math.round(Number(lerCampo(cod))))); toast('Metas salvas.'); desenhar(); }
    catch (e) { toast(e.message); salvar.disabled = false; }
  };
  const copiar = h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', onclick: () => {
    const ant = C.metasDoMesDefinidas(C.somarMes(mes, -1), metasMensais, par);
    campos.forEach(([cod]) => { document.getElementById(`mm-${cod}`).value = ant[cod] || ''; });
    toast('Valores do mês anterior colocados. Toque em Salvar para confirmar.');
  } }, 'Copiar do mês anterior');
  const proximos = Array.from({ length: 6 }, (_, i) => C.somarMes(C.mesIso(), i));
  return h('div', { class: 'camp-metas' },
    h('section', { class: 'ini-cartao' },
      h('header', { class: 'ini-cartao-cab' }, h('div', { class: 'ini-cartao-tit' }, h('h2', null, 'Metas da CCA por mês'), h('p', null, 'Cada mês pode ter metas diferentes. O mês sem meta própria usa o valor padrão.'))),
      h('div', { class: 'camp-mes-nav' },
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', 'aria-label': 'Mês anterior', onclick: () => { est.mes = C.somarMes(mes, -1); desenhar(); } }, icone('voltar', { tam: 16, traco: 2.4 })),
        h('b', null, C.nomeMes(mes).replace(/^./, (x) => x.toUpperCase())),
        h('button', { type: 'button', class: 'btn btn-contorno btn-pequeno', 'aria-label': 'Próximo mês', onclick: () => { est.mes = C.somarMes(mes, 1); desenhar(); } }, icone('seta', { tam: 16, traco: 2.4 }))),
      admin ? h('div', { class: 'ini-meta-form' }, campos.map(([cod, nome]) => {
        const propria = metasMensais.find((x) => String(x.mes).slice(0, 7) === mes && x.metrica === cod);
        return h('div', { class: 'campo' }, h('label', { for: `mm-${cod}` }, nome), h('input', { id: `mm-${cod}`, class: 'entrada', type: 'number', min: '0', inputmode: 'numeric', value: propria ? propria.valor : '', placeholder: atual[cod] ? `padrão: ${atual[cod]}` : 'sem meta' }));
      }), h('div', { class: 'linha-botoes camp-acoes' }, copiar, salvar))
        : h('ul', { class: 'camp-metas-ro' }, campos.map(([cod, nome]) => h('li', null, h('span', null, nome), h('b', null, atual[cod] ? numero(atual[cod]) : 'sem meta')))),
      h('p', { class: 'camp-nota' }, 'Deixe em branco para voltar ao valor padrão. As metas aparecem no Início, no bloco "Metas do mês".')),
    h('section', { class: 'ini-cartao' },
      h('header', { class: 'ini-cartao-cab' }, h('div', { class: 'ini-cartao-tit' }, h('h2', null, 'Próximos meses'))),
      h('div', { class: 'tabela-caixa' }, h('table', { class: 'tabela', style: { cursor: 'default' } },
        h('thead', null, h('tr', null, ['Mês', ...campos.map(([, n]) => n)].map((c) => h('th', null, c)))),
        h('tbody', null, proximos.map((m) => { const d = C.metasDoMesDefinidas(m, metasMensais, par);
          return h('tr', { style: { cursor: admin ? 'pointer' : 'default' }, onclick: admin ? () => { est.mes = m; desenhar(); } : null },
            h('td', null, h('b', null, C.nomeMes(m)), d.proprias ? null : h('small', { class: 'camp-padrao' }, ' (padrão)')), campos.map(([cod]) => h('td', null, d[cod] ? numero(d[cod]) : '—'))); }))))));
}
