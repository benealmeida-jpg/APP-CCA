// Confirmação de e-mail e celular com código (todos os usuários). Aparece ao entrar quando o ADM liga a exigência.
import { h, limpar, icone, toast } from './dom.js';
import * as R from './regras.js';
import { api } from './api.js';
import { cabecalho, aviso } from './componentes.js';

// Um cartão por canal: mostra o destino, envia o código e confere o que a pessoa digitou
function cartaoCanal({ canal, titulo, destino, confirmado, podeCorrigir, aoConfirmar }) {
  const caixa = h('section', { class: `cartao contato-canal${confirmado ? ' ok' : ''}` });
  const estado = { enviado: false, destino };
  const desenhar = () => {
    limpar(caixa);
    caixa.appendChild(h('div', { class: 'contato-topo' },
      h('span', { class: 'contato-icone', 'aria-hidden': 'true' }, icone(canal === 'email' ? 'email' : 'conversa', { tam: 22, traco: 2 })),
      h('div', null, h('h2', null, titulo), h('p', null, estado.destino || (canal === 'email' ? 'Sem e-mail no cadastro' : 'Sem celular no cadastro'))),
      confirmado ? h('span', { class: 'chip chip-aceito' }, icone('check', { tam: 14, traco: 2.6 }), 'Confirmado') : null));
    if (confirmado) return;
    if (!estado.enviado) {
      const enviar = h('button', { type: 'button', class: 'btn btn-primario', id: `enviar-${canal}` }, canal === 'email' ? 'Enviar código por e-mail' : 'Enviar código pelo WhatsApp');
      enviar.onclick = async () => {
        enviar.disabled = true; enviar.textContent = 'Enviando…';
        try { const r = await api.enviarCodigo(canal); estado.enviado = true; estado.teste = r?.teste || null; toast(canal === 'email' ? `Código enviado para ${r?.destino || estado.destino}.` : `Código enviado pelo WhatsApp (${r?.destino || 'seu celular'}).`); desenhar(); }
        catch (e) { toast(e.message); enviar.disabled = false; enviar.textContent = canal === 'email' ? 'Enviar código por e-mail' : 'Enviar código pelo WhatsApp'; }
      };
      caixa.appendChild(h('div', { class: 'contato-acoes' }, enviar, podeCorrigir ? h('button', { type: 'button', class: 'btn-link', onclick: corrigir }, 'Corrigir o número') : null));
      if (canal === 'email') caixa.appendChild(h('p', { class: 'ajuda' }, 'O e-mail errado? Fale com a CCA para corrigir antes de confirmar.'));
      return;
    }
    const campo = h('input', { id: `codigo-${canal}`, class: 'entrada contato-codigo', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '000000', 'aria-label': 'Código de 6 números',
      oninput: (e) => { e.target.value = R.soDigitos(e.target.value).slice(0, 6); if (e.target.value.length === 6) confirmar(); } });
    const botao = h('button', { type: 'button', class: 'btn btn-primario', id: `confirmar-${canal}` }, 'Confirmar');
    const confirmar = async () => {
      if (campo.value.length !== 6) return toast('Digite os 6 números do código.');
      botao.disabled = true;
      try { await api.confirmarCodigo(canal, campo.value); toast(canal === 'email' ? 'E-mail confirmado.' : 'Celular confirmado.'); aoConfirmar(); }
      catch (e) { toast(e.message); botao.disabled = false; campo.select(); }
    };
    botao.onclick = confirmar;
    caixa.append(
      h('p', { class: 'ajuda' }, canal === 'email' ? 'Abra o seu e-mail (veja também o spam) e digite o código. Ele vale por 10 minutos.' : 'Abra o WhatsApp, toque em "Copiar código" e cole aqui. Ele vale por 10 minutos.'),
      estado.teste ? aviso('azul', h('strong', null, 'Demonstração: '), `o código é ${estado.teste}.`) : null,
      h('div', { class: 'contato-acoes' }, campo, botao),
      h('button', { type: 'button', class: 'btn-link', onclick: () => { estado.enviado = false; desenhar(); } }, 'Não chegou? Pedir outro código'));
    setTimeout(() => campo.focus(), 50);
  };
  // Celular errado: corrige antes de pedir o código
  function corrigir() {
    limpar(caixa);
    const campo = h('input', { id: 'novo-celular', class: 'entrada', inputmode: 'tel', placeholder: '(21) 90000-0000', value: estado.destino || '',
      oninput: (e) => { e.target.value = R.formatarCelular(e.target.value); } });
    const salvar = h('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    salvar.onclick = async () => {
      salvar.disabled = true;
      try { await api.alterarMeuWhatsapp(campo.value); estado.destino = R.formatarCelular(campo.value); toast('Celular atualizado.'); desenhar(); }
      catch (e) { toast(e.message); salvar.disabled = false; }
    };
    caixa.append(h('h2', null, 'Corrigir o celular'), h('div', { class: 'campo' }, h('label', { for: 'novo-celular' }, 'Celular com WhatsApp (DDD + número)'), campo),
      h('div', { class: 'contato-acoes' }, salvar, h('button', { type: 'button', class: 'btn btn-contorno', onclick: desenhar }, 'Cancelar')));
    campo.focus();
  }
  desenhar();
  return caixa;
}

export function telaConfirmarContato({ perfil, aoTerminar, aoSair }) {
  const tela = h('main', { class: 'tela contato-tela' });
  const desenhar = async () => {
    const p = await api.sessao();
    if (p.email_verificado_em && p.whatsapp_verificado_em) { aoTerminar(); return; }
    limpar(tela);
    tela.append(
      cabecalho({ sobre: 'Segurança da sua conta', titulo: 'Confirme o seu e-mail e o seu celular', sub: 'É rápido: mandamos um código de 6 números para cada um. Isso protege a sua conta e garante que os avisos do seu processo cheguem até você.' }),
      cartaoCanal({ canal: 'whatsapp', titulo: 'Celular (WhatsApp)', destino: p.whatsapp ? R.formatarCelular(p.whatsapp) : '', confirmado: !!p.whatsapp_verificado_em, podeCorrigir: true, aoConfirmar: desenhar }),
      cartaoCanal({ canal: 'email', titulo: 'E-mail', destino: p.email || '', confirmado: !!p.email_verificado_em, podeCorrigir: false, aoConfirmar: desenhar }),
      h('p', { class: 'ajuda contato-rodape' }, `Entrou como ${perfil.nome}. `, h('button', { type: 'button', class: 'btn-link', onclick: aoSair }, 'Sair')));
  };
  desenhar().catch((e) => toast(e.message));
  return tela;
}
