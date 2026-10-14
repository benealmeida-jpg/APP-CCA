// MODO DEMONSTRAÇÃO: mesma interface do api-supabase.js, com dados guardados no próprio aparelho.
import * as R from './regras.js';
import * as KC from './contrato-dados.js';
import { tetoDoArquivo } from './tetos.js';
import { TIPOS_DOCUMENTO, OPCOES, PARAMETROS } from './dados-iniciais.js';
import { validadeDoLaudo, servicoDoTipo } from './engenharia-regras.js';
import { placarCampanha, placarVisivel, entregarParaDoGanhador } from './campanhas-dados.js';

const CHAVE = 'appcca-demo-v13';
const arquivosNaMemoria = new Map(); // documento_id -> URL do arquivo enviado nesta sessão

const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const agora = () => new Date().toISOString();
const atraso = (ms = 120) => new Promise((r) => setTimeout(r, ms));

function semente() {
  const imob = { id: 'imob-1', nome: 'Imobiliária Exemplo', proprietario_nome: 'Marcos Lima', responsavel_nome: 'Patrícia Gomes', creci_juridico: '12345-J' };
  const usuarios = [
    { id: 'u-corretor', email: 'corretor@demo', senha: 'demo', nome: 'João Alves', apelido: 'Joãozinho', creci: '67890-F', whatsapp: '+5521900000002', papel: 'corretor', imobiliaria_id: imob.id },
    { id: 'u-corretora', email: 'ana@demo', senha: 'demo', nome: 'Ana Ribeiro', whatsapp: '+5521900000003', papel: 'corretor', imobiliaria_id: imob.id },
    { id: 'u-autonomo', email: 'pedro@demo', senha: 'demo', nome: 'Pedro Sousa', whatsapp: '+5521900000004', papel: 'corretor', imobiliaria_id: null },
    { id: 'u-equipe', email: 'equipe@demo', senha: 'demo', nome: 'Ebenézer', whatsapp: null, papel: 'admin', imobiliaria_id: null, permissoes: {} },
    { id: 'u-doc', email: 'doc@demo', senha: 'demo', nome: 'Luciana Prado', whatsapp: '+5521900000005', papel: 'gestor_imobiliaria', imobiliaria_id: imob.id },
    { id: 'u-gabriel', email: 'gabriel@demo', senha: 'demo', nome: 'Gabriel', whatsapp: null, papel: 'equipe_cca', imobiliaria_id: null, permissoes: {} },
  ];
  const base = { modalidade: 'Aquisição de Terreno e Construção', vendedor: 'Pessoa física', compoe_renda: false, dependentes: 0, estado_civil: 'Solteiro(a)', rascunho: false, autorizacao_lgpd_em: agora(), extras: {} };
  const c = (o) => ({ ...base, id: id(), imobiliaria_id: usuarios.find((u) => u.id === o.corretor_id).imobiliaria_id, criado_em: agora(), atualizado_em: agora(), enviado_em: agora(), ...o });
  const clientes = [
    c({ corretor_id: 'u-corretor', nome: 'Mariana Costa', cpf: '12345678909', programa: 'MCMV', imovel: 'Usado', usa_fgts: true, tipo_renda: 'Formal', renda_bruta: 4200, dependentes: 1, celular: '21987650001', status: 'documentacao_pendente' }),
    c({ corretor_id: 'u-corretor', nome: 'Rafael Nunes', cpf: '23456789092', programa: 'SBPE', imovel: 'Novo', usa_fgts: false, tipo_renda: 'Formal', renda_bruta: 9800, status: 'cliente_aprovado' }),
    c({ corretor_id: 'u-corretora', nome: 'Carlos Menezes', cpf: '45678901249', programa: 'MCMV', imovel: 'Na planta', usa_fgts: true, tipo_renda: 'Mista', renda_bruta: 3900, status: 'conformidade' }),
    c({ corretor_id: 'u-autonomo', nome: 'Juliana Prado', cpf: '34567890175', programa: 'Pró-Cotista', imovel: 'Leilão', usa_fgts: true, tipo_renda: 'Formal', renda_bruta: 7300, status: 'em_analise' }),
  ];
  const doc = (cli, tipo, situacao, extra = {}) => ({ id: id(), cliente_id: cli.id, tipo_codigo: tipo, versao: 1, situacao, nome_original: `${tipo.toLowerCase()}.pdf`, enviado_em: agora(), ...extra });
  const [mariana, rafael, carlos, juliana] = clientes;
  const documentos = [
    doc(mariana, 'COMPROVANTE_RESIDENCIA', 'recusado', { nome_original: 'conta-luz.jpg', motivo_recusa: 'Foto com baixa qualidade', observacao_recusa: 'endereço cortado na parte de baixo' }),
    doc(mariana, 'CONTRACHEQUES', 'aceito'), doc(mariana, 'CARTEIRA_TRABALHO', 'em_conferencia'),
    doc(mariana, 'EXTRATO_FGTS', 'aceito'), doc(mariana, 'MATRICULA', 'aceito'), doc(mariana, 'DOCS_VENDEDOR', 'aceito'),
    ...['RG_CNH', 'PIS', 'COMPROVANTE_RESIDENCIA', 'CERTIDAO_ESTADO_CIVIL', 'CONTRACHEQUES', 'CARTEIRA_TRABALHO', 'MATRICULA', 'DOCS_VENDEDOR'].map((t) => doc(rafael, t, 'aceito')),
    ...['PIS', 'COMPROVANTE_RESIDENCIA', 'CERTIDAO_ESTADO_CIVIL', 'CONTRACHEQUES', 'CARTEIRA_TRABALHO', 'COMPROVANTE_RENDA_INF', 'EXTRATO_FGTS', 'DOCS_VENDEDOR'].map((t) => doc(carlos, t, 'aceito')),
    doc(carlos, 'RG_CNH', 'em_conferencia', { nome_original: 'cnh-carlos.jpg', versao: 2 }),
    ...['RG_CNH', 'PIS', 'COMPROVANTE_RESIDENCIA', 'CERTIDAO_ESTADO_CIVIL', 'CONTRACHEQUES', 'CARTEIRA_TRABALHO', 'EXTRATO_FGTS', 'MATRICULA', 'DOCS_VENDEDOR'].map((t) => doc(juliana, t, 'aceito')),
  ];
  const historico = [];
  const ordem = R.STATUS.map((s) => s.codigo);
  for (const cli of clientes) {
    const ate = ordem.indexOf(cli.status);
    for (let i = 1; i <= ate; i++) historico.push({ cliente_id: cli.id, de: ordem[i - 1], para: ordem[i], em: agora() });
  }
  const mensagens = [
    { id: id(), cliente_id: mariana.id, destino_id: 'u-corretor', tipo: 'recusa', texto: R.msgRecusa({ corretor: usuarios[0], cliente: mariana, documentoNome: 'Comprovante de residência', motivo: 'Foto com baixa qualidade', observacao: 'endereço cortado na parte de baixo' }), situacao: 'enviada', criada_em: agora() },
    { id: id(), cliente_id: mariana.id, destino_id: 'u-corretor', tipo: 'confirmacao', texto: 'Bom dia, João! Recebemos o cadastro de *Mariana Costa*.\n\n⚠️ Sem RG ou CNH, o processo não tem como ir para análise neste momento. Anexe pelo Portal do Corretor.\n— Andrade Almeida CCA', situacao: 'enviada', criada_em: agora() },
  ];
  // Vendedores: Rafael e Carlos compram da mesma construtora (documentos guardados uma vez só)
  const vendedores = [
    { id: 'v-pf-1', tipo: 'PF', cpf_cnpj: '98765432100', nome: 'Antônio Ferreira', estado_civil: 'Solteiro(a)', banco: '104 - Caixa Econômica Federal', agencia: '0182', operacao: '1288', conta: '12345', conta_digito: '6' },
    { id: 'v-pj-1', tipo: 'PJ', pj_tipo: 'Avulso', natureza_juridica: 'LTDA/Cia', cpf_cnpj: '11222333000181', nome: 'Construtora Exemplo Ltda', responsavel_nome: 'Henrique Souza', banco: '104 - Caixa Econômica Federal', agencia: '0182', operacao: '003', conta: '998', conta_digito: '7' },
  ];
  mariana.vendedor_id = 'v-pf-1';
  rafael.vendedor = 'Construtora / PJ'; rafael.empreendimento_caixa = false; rafael.vendedor_id = 'v-pj-1';
  carlos.vendedor = 'Construtora / PJ'; carlos.empreendimento_caixa = false; carlos.vendedor_id = 'v-pj-1';
  for (const x of clientes) x.modalidade = 'Aquisição de Imóvel';
  juliana.vendedor_id = null;
  // Regras de emissão/validade: ônus reais perto de vencer (Mariana) e vencido (Rafael); JUCERJA da construtora; vendedor com 60+ anos
  const hoje = R.hojeIso();
  mariana.imovel_municipio = 'Rio de Janeiro'; mariana.valor_imovel = 450000; mariana.desconto_cartorio = true;
  rafael.imovel_municipio = 'Niterói'; rafael.valor_imovel = 300000; rafael.desconto_cartorio = true;
  const diaMes = (n) => { const x = new Date(); x.setDate(Math.min(28, Math.max(1, x.getDate() + n))); return `19${80 + n + 3}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  mariana.data_nascimento = diaMes(0); rafael.data_nascimento = diaMes(2); carlos.data_nascimento = diaMes(-1);
  documentos.push(doc(mariana, 'ONUS_REAIS', 'aceito', { emitido_em: R.somarDias(hoje, -36) }), doc(rafael, 'ONUS_REAIS', 'aceito', { emitido_em: R.somarDias(hoje, -60) }));
  vendedores[0].data_nascimento = '1958-03-12'; vendedores[0].residencia_municipio = 'Niterói';
  const dv = (vid, tipo, situacao, por) => ({ id: id(), vendedor_id: vid, tipo_codigo: tipo, versao: 1, situacao, nome_original: `${tipo.toLowerCase()}.pdf`, enviado_por: por, enviado_em: agora() });
  const documentos_vendedor = [
    dv('v-pf-1', 'VEND_PF_IDENTIDADE', 'aceito', 'u-corretor'),
    ...['VEND_PJ_CONTRATO_SOCIAL', 'VEND_PJ_ALTERACOES', 'VEND_PJ_DOCS_SOCIOS'].map((t) => dv('v-pj-1', t, 'aceito', 'u-corretora')),
  ];
  return { imobiliarias: [imob], usuarios, clientes, participantes: [], documentos, historico, mensagens, acessos: [], vendedores, documentos_vendedor, sessao: null };
}

// Datas e conversa de exemplo (quadro, processo parado, relatórios). Também atualiza demonstrações já abertas.
function completar(d) {
  if (d.versaoDemo >= 6) return d;
  const diasAtras = (n, h = 10) => { const x = new Date(Date.now() - n * 864e5); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const ordem = R.STATUS.map((s) => s.codigo);
  const plano = { 'Mariana Costa': [9, 8], 'Rafael Nunes': [26, 3], 'Carlos Menezes': [41, 2], 'Juliana Prado': [15, 7] }; // [dias desde o envio, dias no status atual]
  d.historico = (d.historico || []).filter((x) => !d.clientes.some((c) => c.id === x.cliente_id && plano[c.nome]));
  for (const c of d.clientes) {
    const pl = plano[c.nome];
    if (!pl) continue;
    const [envio, noStatus] = pl;
    c.criado_em = diasAtras(envio + 1); c.enviado_em = diasAtras(envio);
    const ate = ordem.indexOf(c.status);
    for (let i = 1; i <= ate; i++) {
      const dia = i === ate ? noStatus : Math.round(envio - ((envio - noStatus) * i) / ate);
      d.historico.push({ cliente_id: c.id, de: ordem[i - 1], para: ordem[i], por: 'u-equipe', em: diasAtras(dia, 6) });
    }
    c.atualizado_em = diasAtras(Math.min(noStatus, envio));
  }
  const mariana = d.clientes.find((c) => c.nome === 'Mariana Costa');
  const carlos = d.clientes.find((c) => c.nome === 'Carlos Menezes');
  d.conversa ||= [];
  d.conversa_lida ||= [];
  if (mariana && !d.conversa.length) {
    d.conversa.push(
      { id: 1, cliente_id: mariana.id, autor_id: 'u-equipe', texto: 'Oi, João! A conta de luz veio com o endereço cortado. Consegue uma foto da conta inteira, ou outro comprovante no nome da Mariana?', criada_em: diasAtras(2, 9) },
      { id: 2, cliente_id: mariana.id, autor_id: 'u-corretor', texto: 'Consigo sim. Ela vai me mandar hoje à noite.', criada_em: diasAtras(2, 14) },
      { id: 3, cliente_id: mariana.id, autor_id: 'u-equipe', texto: 'Perfeito. Assim que chegar, conferimos no mesmo dia.', criada_em: diasAtras(1, 10) });
    if (carlos) d.conversa.push({ id: 4, cliente_id: carlos.id, autor_id: 'u-corretora', texto: 'Bom dia! A Caixa pediu mais algum documento na conformidade do Carlos?', criada_em: diasAtras(0, 8) });
  }
  d.versaoDemo = 6;
  return d;
}
// Pré-conferência simulada (na demonstração não há IA de verdade)
function iaSimulada(nomeArquivo = '', tipoNome = 'documento') {
  const n = String(nomeArquivo).toLowerCase();
  if (/cort|borr|ruim|errad/.test(n)) {
    return { analisado: true, modelo: 'demonstração', sugestao: 'recusar', motivo_recusa: /errad/.test(n) ? 'Documento errado' : 'Documento cortado',
      tipo_confere: !/errad/.test(n), tipo_identificado: tipoNome, legivel: true, completo: false, nome_confere: 'sim', cpf_confere: 'nao_aparece', validade: 'nao_identificado',
      data_documento: '', problemas: ['Parte de baixo do documento ficou de fora da foto'], resumo: 'A foto está cortada: falta a parte de baixo do documento' };
  }
  return { analisado: true, modelo: 'demonstração', sugestao: 'aceitar', motivo_recusa: '', tipo_confere: true, tipo_identificado: tipoNome, legivel: true, completo: true,
    nome_confere: 'sim', cpf_confere: 'sim', validade: 'valido', data_documento: '', problemas: [], resumo: `${tipoNome} legível, com nome e CPF do cliente` };
}
function completarIa(d) {
  if (d.versaoIa >= 1) return d;
  for (const doc of [...(d.documentos || []), ...(d.documentos_vendedor || [])]) {
    if (doc.situacao !== 'em_conferencia' || doc.ia) continue;
    const t = TIPOS_DOCUMENTO.find((x) => x.codigo === doc.tipo_codigo)?.nome || 'Documento';
    doc.ia = doc.tipo_codigo === 'RG_CNH'
      ? { analisado: true, modelo: 'demonstração', sugestao: 'revisar', motivo_recusa: '', tipo_confere: true, tipo_identificado: 'CNH', legivel: true, completo: true,
        nome_confere: 'sim', cpf_confere: 'sim', validade: 'vencido', data_documento: '14/03/2021', problemas: ['CNH com validade vencida há mais de 30 dias'], resumo: 'CNH legível, mas parece vencida: confira a validade' }
      : iaSimulada(doc.nome_original, t);
    doc.ia_em = agora();
  }
  d.ia_uso ||= [];
  d.versaoIa = 1;
  return d;
}

// Volume de exemplo para avaliar a página inicial: abra a demonstração com ?demo&volume
function semearVolume(d) {
  if (d.volume) return d;
  let sem = 7; const rnd = () => { sem = (sem * 9301 + 49297) % 233280; return sem / 233280; };
  const dia = (n, h = 10) => { const x = new Date(Date.now() - n * 864e5); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const ordem = R.STATUS.map((x) => x.codigo);
  const imobs = [...d.imobiliarias, { id: 'imob-2', nome: 'Habitar Imóveis' }, { id: 'imob-3', nome: 'Lar & Chave Negócios' }];
  d.imobiliarias = imobs;
  imobs.find((i) => i.id === 'imob-2').premio_para = 'Beatriz Lopes (corretor)'; // imobiliária pequena, sem gestor: o brinde vai para a corretora
  const novos = [['u-c4', 'Beatriz Lopes', 'imob-2'], ['u-c5', 'Rodrigo Tavares', 'imob-2'], ['u-c6', 'Camila Duarte', 'imob-3'], ['u-c7', 'Felipe Moura', 'imob-3'], ['u-c8', 'Larissa Prado', null]];
  for (const [uid, nome, im] of novos) d.usuarios.push({ id: uid, email: `${uid}@demo`, senha: 'demo', nome, whatsapp: '+5521900000099', papel: 'corretor', imobiliaria_id: im });
  const corretores = d.usuarios.filter((u) => u.papel === 'corretor');
  const nomes = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gisele', 'Hugo', 'Iara', 'Jonas', 'Karen', 'Leandro', 'Marta', 'Nilton', 'Olga', 'Paulo', 'Quésia', 'Renato', 'Sônia', 'Tiago'];
  const sobrenomes = ['Silva', 'Souza', 'Costa', 'Pereira', 'Ramos', 'Barros', 'Lima', 'Rocha', 'Dias', 'Cardoso'];
  const progr = ['MCMV', 'SBPE', 'Pró-Cotista'];
  for (let i = 0; i < 54; i++) {
    const cor = corretores[Math.floor(rnd() * corretores.length)];
    const envio = Math.floor(rnd() * 175) + 1;
    const alvo = Math.min(ordem.length - 1, Math.floor(rnd() * (envio > 60 ? 9 : envio > 20 ? 8 : 5)));
    const status = ordem[Math.max(0, alvo)];
    const cli = { id: id(), corretor_id: cor.id, imobiliaria_id: cor.imobiliaria_id, nome: `${nomes[i % nomes.length]} ${sobrenomes[Math.floor(rnd() * sobrenomes.length)]}`, cpf: String(10000000000 + i * 7919).slice(0, 11),
      programa: progr[i % 3], imovel: 'Usado', modalidade: 'Aquisição de Imóvel', rascunho: false, status, criado_em: dia(envio + 1), enviado_em: dia(envio), atualizado_em: dia(Math.max(0, envio - 4)), tipo_renda: 'Formal', renda_bruta: 4000 + Math.round(rnd() * 6000), dependentes: 0, estado_civil: 'Solteiro(a)', vendedor: 'Pessoa física', compoe_renda: false, usa_fgts: false };
    d.clientes.push(cli);
    const ate = ordem.indexOf(status); let t = envio;
    for (let k = 1; k <= ate; k++) { t = Math.max(0, t - Math.round((envio / (ate + 1)) * (0.6 + rnd() * 0.8))); d.historico.push({ cliente_id: cli.id, de: ordem[k - 1], para: ordem[k], por: 'u-equipe', em: dia(t, 6) }); }
  }
  const e = (vend, cidade, etapa, extra = {}) => ({ id: id(), vendedor_id: 'v-pf-1', criado_por: 'u-corretor', imobiliaria_id: 'imob-1', tipo: 'usado', codigo_servico: servicoDoTipo('usado'), imovel_endereco: vend, imovel_cidade: cidade, imovel_uf: 'RJ', etapa, criado_em: dia(40), atualizado_em: dia(2), ...extra });
  d.engenharias = [...(d.engenharias || []),
    e('Rua das Palmeiras, 120', 'Itaboraí', 'laudo', { laudo_aprovado: true, avaliacao_valor: 280000, avaliacao_data: dia(168).slice(0, 10) }),
    e('Av. Central, 45', 'Niterói', 'laudo', { laudo_aprovado: true, avaliacao_valor: 410000, avaliacao_data: dia(150).slice(0, 10) }),
    e('Rua do Sol, 9', 'Maricá', 'laudo', { laudo_aprovado: true, avaliacao_valor: 195000, avaliacao_data: dia(60).slice(0, 10) }),
    e('Rua B, 300', 'São Gonçalo', 'boleto'), e('Rua C, 12', 'Itaboraí', 'documentacao', { docs_novos: false }), e('Rua D, 77', 'Niterói', 'em_analise', { docs_novos: true })];
  // aniversariantes do mês, aniversários de contrato, motivos de recusa e corretora sem cadastro novo
  const hojeD = new Date();
  d.clientes.slice(-14).forEach((c, i) => { c.data_nascimento = `19${70 + i}-${String(hojeD.getMonth() + 1).padStart(2, '0')}-${String(Math.min(28, Math.max(1, hojeD.getDate() + i - 4))).padStart(2, '0')}`; c.celular = `2199${String(1000000 + i * 1111).slice(0, 7)}`; });
  const dois = d.clientes.filter((c) => !R.STATUS_CONTRATO_ASSINADO.includes(c.status)).slice(0, 2);
  d.historico = d.historico.filter((x) => !dois.some((c) => c.id === x.cliente_id));
  dois.forEach((c, i) => { c.status = 'credito_liberado'; ordem.forEach((st, k) => { if (k) d.historico.push({ cliente_id: c.id, de: ordem[k - 1], para: st, por: 'u-equipe', em: dia(360 - i * 12 + (ordem.length - 1 - k) * 3, 6) }); }); c.enviado_em = dia(395 - i * 12); c.criado_em = c.enviado_em; });
  // contratos assinados neste mês (para o placar das campanhas)
  const diaMesAtual = Math.max(0, new Date().getDate() - 1);
  d.clientes.filter((c) => ['minuta_em_maos', 'conformidade', 'cliente_aprovado'].includes(c.status)).slice(0, 12).forEach((c, i) => {
    const quando = dia(Math.min(diaMesAtual, i % (diaMesAtual + 1)), 6 + (i % 5));
    d.historico.push({ cliente_id: c.id, de: c.status, para: 'contrato_assinado', por: 'u-equipe', em: quando }, { cliente_id: c.id, de: 'contrato_assinado', para: 'registro_cartorio', por: 'u-equipe', em: quando }); c.status = 'registro_cartorio';
    c.vendedor = i % 3 === 0 ? 'Construtora / PJ' : 'Pessoa física'; // 1 em cada 3 é unidade de empreendimento (1 ponto); os demais, imóvel avulso (2 pontos)
  });
  // entrevistas com o gerente da Caixa: acontecem depois da aprovação e antes da conformidade: o processo está na etapa Entrevista
  d.clientes.filter((c) => c.status === 'cliente_aprovado').slice(0, 2).forEach((c) => { d.historico.push({ cliente_id: c.id, de: c.status, para: 'entrevista', por: 'u-equipe', em: dia(0, 8) }); c.status = 'entrevista'; });
  d.clientes.filter((c) => c.status === 'entrevista').forEach((c, i) => { c.entrevista_em = new Date(Date.now() + ((i % 6) + 1) * 864e5).toISOString(); c.entrevista_modalidade = 'presencial'; if (!c.celular) c.celular = `2198${String(8000000 + i * 1111).padStart(7, '0')}`; if (!c.email) c.email = `${(c.nome || 'cliente').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}@exemplo.com.br`; c.entrevista_agencia = ['Agência Centro Niterói', 'Agência Icaraí', 'Agência Alcântara'][i % 3]; c.entrevista_gerente = ['Marcelo Tavares', 'Patrícia Duarte', 'Rogério Falcão'][i % 3]; c.entrevista_endereco = ['Av. Amaral Peixoto, 100, Centro, Niterói', 'Rua Moreira César, 250, Icaraí, Niterói', 'Alameda São Boaventura, 800, Fonseca, Niterói'][i % 3]; });
  ['Foto com baixa qualidade', 'Foto com baixa qualidade', 'Documento cortado', 'Documento vencido', 'Foto com baixa qualidade', 'Documento errado', 'Documento cortado'].forEach((m, i) => d.documentos.push({ id: id(), cliente_id: d.clientes[i].id, tipo_codigo: 'RG_CNH', versao: 1, situacao: 'substituido', motivo_recusa: m, conferido_em: dia(3 + i * 9), enviado_em: dia(4 + i * 9) }));
  d.clientes.filter((c) => c.corretor_id === 'u-c8').forEach((c) => { c.enviado_em = dia(70); });
  d.parametros ||= [];
  for (const [chave, valor] of [['meta_abertos', '20'], ['meta_minutas', '8'], ['meta_contratos', '4']]) if (!d.parametros.some((x) => x.chave === chave)) d.parametros.push({ chave, valor });
  d.volume = true;
  return d;
}

// Campanha de exemplo (mês atual) e metas por mês
// Arquivos do contrato de exemplo, de acordo com a etapa de cada cliente (sem arquivo real: o demo mostra uma folha de exemplo)
function completarContratos(d) {
  d.contrato_arquivos ||= [];
  if (d.contratos_semeados) return d;
  d.contratos_semeados = true;
  const nomes = { minuta: 'minuta.pdf', planilha_progressao: 'planilha-progressao.xlsx', carta_credito: 'carta-de-credito.pdf', minuta_assinada: 'minuta-assinada.pdf', contrato_assinado: 'contrato-assinado.pdf', validador_assinatura: 'validador.pdf', procuracao_gerente: 'procuracao-gerente.pdf', contrato_registrado: 'contrato-registrado.pdf', talao_rgi: 'talao-rgi.pdf', onus_reais: 'onus-reais.pdf' };
  const ord = R.STATUS.map((s) => s.codigo);
  const add = (c, tipo, dias) => d.contrato_arquivos.push({ id: id(), cliente_id: c.id, tipo, nome_original: nomes[tipo], mime: 'application/pdf', tamanho_bytes: 120000, enviado_por: 'u-equipe', enviado_por_nome: 'Ebenézer', enviado_em: new Date(Date.now() - dias * 864e5).toISOString(), substituido: false });
  let k = 0;
  for (const c of d.clientes.filter((x) => !x.rascunho)) {
    const i = ord.indexOf(c.status); if (i < ord.indexOf('minuta_em_maos')) continue;
    ['minuta', 'planilha_progressao', 'carta_credito'].forEach((t) => add(c, t, 12));
    if (c.status === 'minuta_em_maos') { if (k++ % 2) add(c, 'minuta_assinada', 3); continue; }
    add(c, 'minuta_assinada', 9); ['contrato_assinado', 'validador_assinatura', 'procuracao_gerente'].forEach((t) => add(c, t, 6));
    if (i >= ord.indexOf('conformidade_final')) ['contrato_registrado', 'talao_rgi', 'onus_reais'].forEach((t) => add(c, t, 2));
  }
  return d;
}

function completarCampanhas(d) {
  d.metas_mensais ||= [];
  if (d.campanhas) return d;
  const hoje = R.hojeIso(); const [a, m] = hoje.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  d.campanhas = [{ id: id(), nome: 'Campanha Vacaria do Sul', descricao: 'Quem mais pontuar com contratos assinados no mês ganha almoço ou jantar na Vacaria do Sul Churrascaria.',
    regulamento: 'Vale o cliente que chegar em Contrato assinado dentro do período. Imóvel avulso vale 2 pontos e empreendimento vale 1 ponto. Imobiliárias, corretores de imobiliária e corretores autônomos disputam separado. Em caso de empate, ganha quem chegou primeiro ao total. A CCA entrega os vouchers até 10 dias após o fim.',
    metrica: 'assinados', pontos_avulso: 2, pontos_empreendimento: 1, inicio: `${a}-${String(m).padStart(2, '0')}-01`, fim: `${a}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`, mostrar_nomes: true, ativa: true, arquivada: false, apurada_em: null, criado_em: agora(),
    premios: [
      { id: id(), categoria: 'imobiliaria', posicao: 1, descricao: '2 vouchers de almoço ou jantar na Vacaria do Sul Churrascaria', ganhador_id: null, ganhador_nome: null, entregue_em: null, removido: false },
      { id: id(), categoria: 'corretor', posicao: 1, descricao: '2 vouchers de almoço ou jantar na Vacaria do Sul Churrascaria', ganhador_id: null, ganhador_nome: null, entregue_em: null, removido: false },
      { id: id(), categoria: 'autonomo', posicao: 1, descricao: '2 vouchers de almoço ou jantar na Vacaria do Sul Churrascaria', ganhador_id: null, ganhador_nome: null, entregue_em: null, removido: false },
    ] }];
  return d;
}

function ler() {
  try {
    const s = localStorage.getItem(CHAVE);
    if (s) { const d = completarContratos(completarCampanhas(completarIa(completar(JSON.parse(s))))); return location.search.includes('volume') ? semearVolume(d) : d; }
  } catch { /* armazenamento indisponível */ }
  const d = completarContratos(completarCampanhas(completarIa(completar(semente()))));
  if (location.search.includes('volume')) semearVolume(d);
  gravar(d);
  return d;
}
let memoria = null;
function aplicarRegrasDoc(d) { for (const t of TIPOS_DOCUMENTO) if (d.regras_doc && d.regras_doc[t.codigo] !== undefined) t.regra = d.regras_doc[t.codigo]; }
function db() { if (!memoria) { memoria = ler(); aplicarRegrasDoc(memoria); } return memoria; }
function gravar(d = memoria) {
  memoria = d;
  try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch { /* segue só na memória */ }
}

function perfilAtual() {
  const d = db();
  const u = d.usuarios.find((x) => x.id === d.sessao);
  if (!u) return null;
  const { senha, ...perfil } = u;
  return perfil;
}
function exigirLogin() {
  const p = perfilAtual();
  if (!p) throw new Error('Faça login novamente');
  return p;
}
function souEquipe(p) { return ['equipe_cca', 'admin'].includes(p.papel); }
function possoVer(p, cli) {
  return cli.corretor_id === p.id || souEquipe(p) || (p.papel === 'gestor_imobiliaria' && cli.imobiliaria_id && cli.imobiliaria_id === p.imobiliaria_id);
}
const CAMPOS_IMOB = ['nome', 'cnpj', 'whatsapp', 'razao_social', 'nome_fantasia', 'situacao_cadastral', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf', 'telefone', 'email', 'cnpj_consultado_em', 'proprietario_nome', 'responsavel_nome', 'creci_juridico'];
function linhaImobiliaria(campos) {
  const linha = {};
  for (const k of CAMPOS_IMOB) {
    if (campos[k] === undefined) continue;
    let v = typeof campos[k] === 'string' ? campos[k].trim() : campos[k];
    if (k === 'cnpj' || k === 'cep' || k === 'telefone') v = R.soDigitos(v || '');
    if (k === 'whatsapp') v = v ? R.celularInternacional(v) : null;
    if (k === 'uf') v = String(v || '').toUpperCase();
    linha[k] = v === '' ? null : v;
  }
  return linha;
}
function possoEditar(p, cli) {
  return cli.corretor_id === p.id || souEquipe(p) || (p.papel === 'gestor_imobiliaria' && cli.imobiliaria_id && cli.imobiliaria_id === p.imobiliaria_id);
}
function statusDesde(c) {
  const h = (db().historico || []).filter((x) => x.cliente_id === c.id && x.para === c.status).map((x) => x.em).sort();
  return h.length ? h[h.length - 1] : (c.enviado_em || c.criado_em);
}
function naoLidas(p, c) {
  const d = db();
  const lida = (d.conversa_lida || []).find((x) => x.usuario_id === p.id && x.cliente_id === c.id)?.lida_em || '';
  return (d.conversa || []).filter((m) => m.cliente_id === c.id && m.autor_id !== p.id && m.criada_em > lida).length;
}
function participantesDe(cli) {
  return (db().participantes ||= []).filter((p) => p.cliente_id === cli.id).sort((a, b) => a.ordem - b.ordem);
}
function vendedorDe(cli) {
  return cli.vendedor_id ? (db().vendedores ||= []).find((v) => v.id === cli.vendedor_id) || null : null;
}
// Situação dos documentos do vendedor; o corretor não recebe o arquivo nem o nome de arquivos de outros
function documentosVendedorDe(cli, p = perfilAtual()) {
  const v = vendedorDe(cli);
  if (!v) return [];
  const atuais = {};
  for (const d of (db().documentos_vendedor ||= []).filter((x) => x.vendedor_id === v.id && x.situacao !== 'substituido')) {
    if (!atuais[d.tipo_codigo] || atuais[d.tipo_codigo].versao < d.versao) atuais[d.tipo_codigo] = d;
  }
  return Object.values(atuais).map((d) => ({ ...d, nome_original: p && (souEquipe(p) || d.enviado_por === p.id) ? d.nome_original : null, arquivo_path: p && (souEquipe(p) || d.enviado_por === p.id) ? `vendedores/${d.id}` : null }));
}
function necessariosDe(cli) {
  return R.documentosNecessarios(TIPOS_DOCUMENTO, cli, db().documentos.filter((x) => x.cliente_id === cli.id), participantesDe(cli),
    { vendedor: vendedorDe(cli), documentosVendedor: documentosVendedorDe(cli) });
}
function buscarVendedorPorDoc(doc) {
  const v = (db().vendedores ||= []).find((x) => x.cpf_cnpj === R.soDigitos(doc));
  if (!v) return null;
  const naCca = new Set((db().documentos_vendedor || []).filter((d) => d.vendedor_id === v.id && ['em_conferencia', 'aceito'].includes(d.situacao)).map((d) => d.tipo_codigo));
  return { ...v, documentos_na_cca: naCca.size };
}
function engDemo(eid) { const e = (db().engenharias || []).find((x) => x.id === eid); if (!e) throw new Error('Solicitação não encontrada'); return e; }
function iaLigada() { return ((db().parametros || []).find((x) => x.chave === 'ia_conferencia')?.valor ?? 'sim') !== 'nao'; }
function registrarUsoIa() { (db().ia_uso ||= []).push({ em: agora(), custo_usd: 0.0004, ok: true }); }
function registrar(acao, cliente_id, detalhes = {}) {
  const p = perfilAtual();
  db().acessos.unshift({ id: id(), usuario_id: p?.id, usuario_nome: p?.nome, acao, cliente_id, detalhes, em: agora() });
  db().acessos = db().acessos.slice(0, 300);
}
function enfileirarMensagem(cli, tipo, texto) {
  const d = db();
  const corretor = d.usuarios.find((u) => u.id === cli.corretor_id);
  const imob = cli.imobiliaria_id ? d.imobiliarias.find((i) => i.id === cli.imobiliaria_id) : null;
  const modo = imob?.avisos_para || 'corretor';
  const canal = (d.parametros || []).find((x) => x.chave === 'canal_avisos')?.valor || 'push';
  const base = { cliente_id: cli.id, tipo, situacao: 'enviada', canal, criada_em: agora() };
  if (!imob || modo !== 'imobiliaria') d.mensagens.unshift({ ...base, id: id(), destino_id: corretor.id, telefone: corretor.whatsapp, texto });
  if (imob && modo !== 'corretor') d.mensagens.unshift({ ...base, id: id(), destino_id: null, telefone: imob.whatsapp, texto: `[${imob.nome}] ${texto}` });
}

export const api = {
  demo: true,

  async sessao() { return perfilAtual(); },

  async entrar(email, senha) {
    await atraso();
    const d = db();
    const u = d.usuarios.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase() && x.senha && x.senha === senha);
    if (!u) throw new Error('E-mail ou senha incorretos');
    if (u.ativo === false) throw new Error('Seu acesso está desativado. Fale com a CCA.');
    d.sessao = u.id;
    registrar('login', null, {});
    gravar();
    return perfilAtual();
  },

  async sair() { db().sessao = null; gravar(); },

  // Link de convite / novo acesso (na demonstração, o "token" é o próprio id do usuário)
  async entrarComLink(token) {
    await atraso();
    const d = db();
    const u = d.usuarios.find((x) => x.id === token && x.link_pendente);
    if (!u) throw new Error('Este link expirou ou já foi usado. Peça um novo link à CCA.');
    u.link_pendente = false;
    d.sessao = u.id; gravar();
    return perfilAtual();
  },

  async definirSenha(senha) {
    const p = exigirLogin();
    db().usuarios.find((x) => x.id === p.id).senha = senha;
    registrar('login', null, {});
    gravar();
  },

  async convidar(dados) {
    await atraso();
    const p = exigirLogin();
    const d = db();
    const email = String(dados.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido');
    let u = d.usuarios.find((x) => x.email.toLowerCase() === email);
    if (dados.acao === 'novo_link') {
      if (!u) throw new Error('Não há usuário com este e-mail');
      if (['equipe_cca', 'admin'].includes(u.papel) && p.papel !== 'admin') throw new Error('Somente ADM gera link para a equipe');
    } else {
      const papel = dados.papel || 'corretor';
      if (['equipe_cca', 'admin'].includes(papel) && p.papel !== 'admin') throw new Error('Somente ADM convida pessoas da equipe');
      if (String(dados.nome || '').trim().split(/\s+/).length < 2) throw new Error('Digite o nome completo');
      if (!u) { u = { id: id(), email, senha: null }; d.usuarios.push(u); }
      Object.assign(u, { nome: dados.nome.trim(), whatsapp: dados.whatsapp ? R.celularInternacional(dados.whatsapp) : null, papel,
        imobiliaria_id: ['equipe_cca', 'admin'].includes(papel) ? null : (dados.imobiliaria_id || null), ativo: true, permissoes: u.permissoes || {} });
    }
    u.link_pendente = true;
    registrar(dados.acao === 'novo_link' ? 'novo_link' : 'convidar', null, { email, papel: u.papel });
    gravar();
    return { link: `${location.origin}${location.pathname}?demo#/acesso?token_hash=${u.id}&tipo=${u.senha ? 'recovery' : 'invite'}`, usuario_id: u.id };
  },

  // ---------- Convite por link (forma principal) ----------
  async gerarConvite({ tipo, nome, whatsapp, imobiliaria_id }) {
    await atraso();
    const p = exigirLogin();
    if (!R.tiposDeConvite(p).some(([t]) => t === tipo)) throw new Error('Seu perfil não pode fazer este tipo de convite');
    const d = db();
    const token = id().replace(/-/g, '');
    const cv = { id: id(), token, tipo, nome: nome || null, whatsapp: whatsapp ? R.celularInternacional(whatsapp) : null,
      imobiliaria_id: tipo === 'corretor' ? (imobiliaria_id || null) : null, criado_por: p.id, criado_em: agora(),
      expira_em: new Date(Date.now() + 7 * 864e5).toISOString(), usado_em: null, usado_por: null, cancelado_em: null };
    (d.convitesLink ||= []).push(cv);
    registrar('gerar_convite', null, { tipo });
    gravar();
    return { link: `${location.origin}${location.pathname}?demo#/convite?t=${token}`, id: cv.id, expira_em: cv.expira_em };
  },

  async listarConvites() {
    const d = db();
    return [...(d.convitesLink || [])].sort((a, b) => b.criado_em.localeCompare(a.criado_em)).slice(0, 50).map((c) => ({
      ...c, imobiliaria_nome: d.imobiliarias.find((i) => i.id === c.imobiliaria_id)?.nome || null,
      criado_por_nome: d.usuarios.find((u) => u.id === c.criado_por)?.nome || null,
      usado_nome: d.usuarios.find((u) => u.id === c.usado_por)?.nome || null }));
  },

  async cancelarConvite(idConvite) {
    const c = (db().convitesLink || []).find((x) => x.id === idConvite);
    if (c && !c.usado_em) c.cancelado_em = agora();
    gravar();
  },

  _convitePorToken(token) {
    const c = (db().convitesLink || []).find((x) => x.token === token);
    if (!c) throw new Error('Convite não encontrado. Peça um novo à CCA.');
    if (c.cancelado_em) throw new Error('Este convite foi cancelado. Peça um novo à CCA.');
    if (c.usado_em) throw new Error('Este convite já foi usado. Entre com o seu e-mail e senha.');
    if (new Date(c.expira_em) < new Date()) throw new Error('Este convite expirou. Peça um novo à CCA.');
    return c;
  },

  async verConvite(token) {
    await atraso();
    const c = this._convitePorToken(token);
    const rot = { corretor: 'Corretor', consumidor: 'Consumidor final', imobiliaria: 'Imobiliária', equipe_cca: 'Equipe da CCA', admin: 'Equipe da CCA (ADM)' };
    return { tipo: c.tipo, rotulo: rot[c.tipo], nome: c.nome, whatsapp: c.whatsapp, imobiliaria_nome: db().imobiliarias.find((i) => i.id === c.imobiliaria_id)?.nome || null, expira_em: c.expira_em };
  },

  async aceitarConvite(token, dados) {
    await atraso();
    const d = db();
    const c = this._convitePorToken(token);
    const email = String(dados.email || '').trim().toLowerCase();
    if (String(dados.nome || '').trim().split(/\s+/).length < 2) throw new Error('Digite o seu nome completo');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido');
    if (String(dados.senha || '').length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres');
    if (R.soDigitos(dados.whatsapp).length < 10) throw new Error('Informe o seu WhatsApp com DDD');
    if (d.usuarios.some((u) => u.email.toLowerCase() === email)) throw new Error('Este e-mail já tem acesso ao portal. Use Entrar, ou peça um novo link de acesso à CCA.');
    let imob = c.imobiliaria_id;
    if (c.tipo === 'imobiliaria') {
      const im = dados.imobiliaria || {};
      if (!R.cnpjValido(im.cnpj || '')) throw new Error('CNPJ da imobiliária inválido');
      const ja = d.imobiliarias.find((i) => i.cnpj === R.soDigitos(im.cnpj));
      if (ja) imob = ja.id;
      else {
        const nova = { id: id(), ...linhaImobiliaria({ ...im, whatsapp: im.whatsapp || dados.whatsapp }), ativo: true };
        if (!nova.nome) throw new Error('Informe o nome da imobiliária');
        d.imobiliarias.push(nova); imob = nova.id;
      }
    }
    if (c.tipo === 'consumidor' && !R.cpfValido(dados.cpf || '')) throw new Error('Informe o seu CPF');
    const papel = c.tipo === 'imobiliaria' ? 'gestor_imobiliaria' : c.tipo === 'consumidor' ? 'corretor' : c.tipo;
    const u = { id: id(), email, senha: dados.senha, nome: dados.nome.trim(), whatsapp: R.celularInternacional(dados.whatsapp), papel, cpf: R.soDigitos(dados.cpf || ''), consumidor: c.tipo === 'consumidor', identidade_verificada_em: null,
      imobiliaria_id: ['equipe_cca', 'admin'].includes(papel) ? null : (imob || null), ativo: true, permissoes: {} };
    d.usuarios.push(u);
    c.usado_em = agora(); c.usado_por = u.id;
    gravar();
    return { ok: true, email };
  },

  async novoLink(email) { return this.convidar({ acao: 'novo_link', email }); },

  async corretoresDaImobiliaria() {
    const p = exigirLogin();
    return db().usuarios.filter((u) => u.imobiliaria_id && u.imobiliaria_id === p.imobiliaria_id && u.ativo !== false && ['corretor', 'gestor_imobiliaria'].includes(u.papel))
      .map((u) => ({ id: u.id, nome: u.nome, papel: u.papel }));
  },

  async inscreverPush() { const p = exigirLogin(); db().usuarios.find((u) => u.id === p.id).push = true; gravar(); },

  async aceitarWhatsapp(aceita) { const p = exigirLogin(); db().usuarios.find((u) => u.id === p.id).aceita_whatsapp = !!aceita; gravar(); },

  async avisosAdmin(acao) {
    await atraso();
    if (acao === 'testar') return { ok: true, detalhe: 'Demonstração: nada é enviado de verdade.' };
    if (acao === 'criar_modelos' || acao === 'modelos') throw new Error('Demonstração: configure o WhatsApp no app real.');
    return {};
  },

  // ---------- Pré-conferência por IA (simulada) ----------
  async iaAdmin(acao) {
    await atraso();
    if (acao === 'testar') return { ok: true, detalhe: 'Demonstração: a chave não é testada de verdade.' };
    return {};
  },

  async iaConferir(tabela, idDoc) {
    await atraso(400);
    const d = db();
    const doc = (tabela === 'documentos_vendedor' ? (d.documentos_vendedor || []) : d.documentos).find((x) => x.id === idDoc);
    if (!doc) throw new Error('Documento não encontrado');
    doc.ia = iaSimulada(doc.nome_original, TIPOS_DOCUMENTO.find((t) => t.codigo === doc.tipo_codigo)?.nome || 'Documento'); doc.ia_em = agora();
    registrarUsoIa(); gravar();
    return doc.ia;
  },

  async iaUsoMes() {
    const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
    const uso = (db().ia_uso || []).filter((x) => new Date(x.em) >= ini);
    const limite = Number((db().parametros || []).find((x) => x.chave === 'ia_limite_mes')?.valor) || 3000;
    return { documentos: uso.filter((x) => x.ok).length, erros: uso.filter((x) => !x.ok).length, custo_usd: uso.reduce((s, x) => s + (x.custo_usd || 0), 0), limite };
  },

  async integracoes() {
    const d = db(); d.integracoes ||= [];
    for (const chave of ['meta_phone_id', 'meta_waba_id', 'meta_token', 'smtp_usuario', 'smtp_senha', 'anthropic_chave']) if (!d.integracoes.some((x) => x.chave === chave)) d.integracoes.push({ chave, configurado: false, final: null });
    return d.integracoes;
  },

  async salvarIntegracao(chave, valor) {
    const lista = await this.integracoes();
    const i = lista.find((x) => x.chave === chave);
    Object.assign(i, { configurado: !!valor, final: ['meta_token', 'anthropic_chave'].includes(chave) ? (valor ? `…${valor.slice(-4)}` : null) : chave === 'smtp_senha' ? (valor ? 'guardada' : null) : (valor || null), atualizado_em: agora() });
    gravar();
  },

  async atualizarImobiliaria(idImob, campos) {
    const i = db().imobiliarias.find((x) => x.id === idImob);
    Object.assign(i, linhaImobiliaria(campos));
    if (campos.avisos_para) i.avisos_para = campos.avisos_para;
    if ('premio_para' in campos) i.premio_para = String(campos.premio_para || '').trim() || null;
    gravar(); return { ...i };
  },

  // Demonstração: não consulta a Receita; devolve dados de exemplo
  async buscarCnpj(cnpj) {
    await atraso();
    if (!R.cnpjValido(cnpj)) throw new Error('CNPJ inválido.');
    return { cnpj: R.soDigitos(cnpj), razao_social: 'IMOBILIARIA EXEMPLO LTDA', nome_fantasia: 'Imobiliária Exemplo', situacao_cadastral: 'ATIVA',
      cep: '24020005', logradouro: 'RUA DA CONCEICAO', numero: '100', complemento: 'SALA 501', bairro: 'CENTRO', municipio: 'NITEROI', uf: 'RJ',
      telefone: '2126200000', email: 'contato@imobiliariaexemplo.com.br' };
  },

  async atualizarCorretor(idUsuario, { nome, whatsapp, imobiliaria_id, apelido, creci }) {
    const p = exigirLogin();
    if (!souEquipe(p)) throw new Error('Sem permissão');
    const u = db().usuarios.find((x) => x.id === idUsuario);
    Object.assign(u, { nome, apelido: (apelido || '').trim() || null, creci: (creci || '').trim() || null, whatsapp: whatsapp ? R.celularInternacional(whatsapp) : null, imobiliaria_id: imobiliaria_id || null });
    gravar();
  },

  async ativarUsuario(idUsuario, ativo) {
    const p = exigirLogin();
    const u = db().usuarios.find((x) => x.id === idUsuario);
    if (['equipe_cca', 'admin'].includes(u.papel) && p.papel !== 'admin') throw new Error('Somente administradores');
    if (idUsuario === p.id) throw new Error('Você não pode desativar o seu próprio acesso');
    u.ativo = ativo;
    registrar(ativo ? 'ativar_usuario' : 'desativar_usuario', null, { usuario: idUsuario });
    gravar();
  },

  async criarImobiliaria(campos) {
    exigirLogin();
    if (!String(campos.nome || '').trim()) throw new Error('Informe o nome da imobiliária');
    if (!R.cnpjValido(campos.cnpj || '')) throw new Error('CNPJ obrigatório e válido');
    const i = { id: id(), ...linhaImobiliaria(campos), ativo: true };
    db().imobiliarias.push(i); gravar();
    return i;
  },

  async listarVendedores() {
    const d = db();
    return (d.vendedores || []).map((v) => {
      const docs = (d.documentos_vendedor || []).filter((x) => x.vendedor_id === v.id);
      return { ...v, processos: d.clientes.filter((c) => c.vendedor_id === v.id).length,
        docs_aceitos: docs.filter((x) => x.situacao === 'aceito').length, docs_conferencia: docs.filter((x) => x.situacao === 'em_conferencia').length,
        docs_recusados: docs.filter((x) => x.situacao === 'recusado').length };
    });
  },

  async obterVendedor(idVend) {
    const d = db();
    const v = (d.vendedores || []).find((x) => x.id === idVend);
    return { vendedor: { ...v },
      documentos: (d.documentos_vendedor || []).filter((x) => x.vendedor_id === idVend && x.situacao !== 'substituido').map((x) => ({ ...x, do_vendedor: true, arquivo_path: `vendedores/${x.id}` })),
      clientes: d.clientes.filter((c) => c.vendedor_id === idVend).map((c) => ({ id: c.id, nome: c.nome, cpf: c.cpf, status: c.status, corretor: { nome: d.usuarios.find((u) => u.id === c.corretor_id)?.nome } })) };
  },

  async salvarVendedor(idVend, campos) {
    const v = (db().vendedores || []).find((x) => x.id === idVend);
    Object.assign(v, campos, { atualizado_em: agora() }); gravar();
    return { ...v };
  },

  async recuperarSenha() { await atraso(); },

  async configuracao() {
    const parametros = { ...PARAMETROS };
    for (const x of db().parametros || []) parametros[x.chave] = isNaN(Number(x.valor)) ? x.valor : Number(x.valor);
    return { tipos: TIPOS_DOCUMENTO, opcoes: OPCOES, status: [...R.STATUS, ...R.STATUS_REPROVADO], parametros };
  },

  async listarClientes() {
    await atraso();
    const p = exigirLogin();
    const d = db();
    return d.clientes.filter((c) => possoVer(p, c)).map((c) => {
      const n = necessariosDe(c);
      const r = R.resumoDocumentos(n);
      const corretor = d.usuarios.find((u) => u.id === c.corretor_id);
      const imob = d.imobiliarias.find((i) => i.id === c.imobiliaria_id);
      return {
        id: c.id, nome: c.nome, cpf: c.cpf, programa: c.programa, modalidade: c.modalidade, imovel: c.imovel,
        status: c.status, status_nome: R.nomeStatus(c.status), rascunho: c.rascunho,
        corretor_id: c.corretor_id, corretor_nome: corretor?.nome, corretor_consumidor: corretor?.consumidor === true, imobiliaria_nome: imob?.nome || 'Autônomo',
        atualizado_em: c.atualizado_em, docs_pendentes: r.pendente, docs_recusados: r.recusado,
        docs_em_conferencia: r.em_conferencia, pode_ir_para_analise: R.podeIrParaAnalise(n),
        imobiliaria_id: c.imobiliaria_id || null, criado_em: c.criado_em, enviado_em: c.enviado_em || null, status_desde: statusDesde(c),
        conversa_nao_lidas: naoLidas(p, c),
        data_nascimento: c.data_nascimento ?? null, celular: c.celular ?? null, valor_imovel: c.valor_imovel ?? null, imovel_municipio: c.imovel_municipio ?? null, desconto_cartorio: c.desconto_cartorio ?? null,
        grerj_numero: c.grerj_numero ?? null, grerj_valor: c.grerj_valor ?? null, grerj_pago_em: c.grerj_pago_em ?? null, requerimento_enviado_em: c.requerimento_enviado_em ?? null,
        conversa_ultima: (d.conversa || []).filter((m) => m.cliente_id === c.id).map((m) => m.criada_em).sort().pop() || null,
      };
    }).sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
  },

  async obterCliente(clienteId) {
    await atraso();
    const p = exigirLogin();
    const d = db();
    const cliente = d.clientes.find((c) => c.id === clienteId);
    if (!cliente || !possoVer(p, cliente)) throw new Error('Cliente não encontrado');
    registrar('ver_cliente', clienteId);
    gravar();
    return {
      cliente: { ...cliente },
      participantes: participantesDe(cliente).map((p) => ({ ...p })),
      vendedor: vendedorDe(cliente) ? { ...vendedorDe(cliente) } : null,
      necessarios: necessariosDe(cliente),
      historico: d.historico.filter((x) => x.cliente_id === clienteId),
      mensagens: d.mensagens.filter((m) => m.cliente_id === clienteId),
      corretor: d.usuarios.find((u) => u.id === cliente.corretor_id),
      imobiliaria: d.imobiliarias.find((i) => i.id === cliente.imobiliaria_id) || null,
    };
  },

  async buscarPorCpf(cpf) {
    const p = exigirLogin();
    return db().clientes.find((c) => c.corretor_id === p.id && R.soDigitos(c.cpf) === R.soDigitos(cpf)) || null;
  },

  async salvarCliente(dados) {
    await atraso(80);
    const p = exigirLogin();
    const d = db();
    if (p.consumidor && !dados.id) {
      if (!p.identidade_verificada_em) throw new Error('Sua identidade ainda não foi verificada pela CCA');
      if (d.clientes.some((x) => x.corretor_id === p.id)) throw new Error('Você já tem um cadastro. Abra o seu processo.');
    }
    const limpo = { ...dados, cpf: R.soDigitos(dados.cpf) };
    for (const k of Object.keys(limpo)) if (k.startsWith('_')) delete limpo[k];
    if (limpo.id) {
      const c = d.clientes.find((x) => x.id === limpo.id);
      if (!c || !possoEditar(p, c)) throw new Error('Sem permissão');
      const { status, corretor_id, vendedor_id, grerj_numero, grerj_valor, grerj_pago_em, requerimento_enviado_em, ...resto } = limpo; // status só muda pela equipe; vendedor pela vinculação
      if (p.papel === 'gestor_imobiliaria' && dados._corretor_responsavel) resto.corretor_id = dados._corretor_responsavel;
      Object.assign(c, resto, { atualizado_em: agora() });
      gravar();
      return { ...c };
    }
    if (d.clientes.some((x) => x.corretor_id === p.id && x.cpf === limpo.cpf)) throw new Error('Você já cadastrou um cliente com este CPF');
    const resp = p.papel === 'gestor_imobiliaria' && dados._corretor_responsavel
      ? d.usuarios.find((u) => u.id === dados._corretor_responsavel && u.imobiliaria_id === p.imobiliaria_id) : null;
    const novo = { extras: {}, dependentes: 0, ...limpo, id: id(), corretor_id: resp ? resp.id : p.id, imobiliaria_id: p.imobiliaria_id, status: 'cadastro_recebido', rascunho: true, criado_em: agora(), atualizado_em: agora() };
    d.clientes.push(novo);
    gravar();
    return { ...novo };
  },

  async salvarParticipantes(clienteId, lista) {
    await atraso(60);
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || !possoEditar(p, c)) throw new Error('Sem permissão');
    d.participantes = (d.participantes || []).filter((x) => x.cliente_id !== clienteId);
    const gravados = lista.map((x) => ({ ...x, id: x.id || id(), cliente_id: clienteId, cpf: R.soDigitos(x.cpf) }));
    d.participantes.push(...gravados);
    gravar();
    return gravados.map((x) => ({ ...x }));
  },

  async enviarCadastro(clienteId) {
    await atraso();
    const p = exigirLogin();
    const d = db();
    if (p.consumidor && !p.identidade_verificada_em) throw new Error('Sua identidade ainda não foi verificada pela CCA');
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || !possoEditar(p, c)) throw new Error('Cliente não encontrado');
    if (!c.autorizacao_lgpd_em) throw new Error('Falta a confirmação de autorização do cliente (LGPD)');
    const n = necessariosDe(c);
    const primeiroEnvio = c.rascunho;
    c.rascunho = false;
    c.enviado_em ||= agora();
    if (primeiroEnvio) c.status = R.podeIrParaAnalise(n) ? 'cadastro_recebido' : 'documentacao_pendente';
    c.atualizado_em = agora();
    if (primeiroEnvio) enfileirarMensagem(c, 'confirmacao', R.msgCadastroRecebido({ corretor: p, cliente: c, necessarios: n }));
    gravar();
  },

  async enviarDocumento(clienteId, tipoCodigo, arquivo, participanteId = null, dependenteOrdem = null, emitidoEm = null) {
    await atraso(300);
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || !possoEditar(p, c)) throw new Error('Sem permissão');
    const doTipo = d.documentos.filter((x) => x.cliente_id === clienteId && x.tipo_codigo === tipoCodigo);
    const anteriores = doTipo.filter((x) => (x.participante_id ?? null) === participanteId && (x.dependente_ordem ?? null) === dependenteOrdem);
    const versao = doTipo.reduce((m, x) => Math.max(m, x.versao), 0) + 1;
    const multiplo = TIPOS_DOCUMENTO.find((t) => t.codigo === tipoCodigo)?.multiplo;
    if (!multiplo) anteriores.forEach((x) => { if (x.situacao !== 'substituido') x.situacao = 'substituido'; });
    const novo = { id: id(), cliente_id: clienteId, participante_id: participanteId, dependente_ordem: dependenteOrdem, versao_pessoa: multiplo ? 1 : anteriores.length + 1, tipo_codigo: tipoCodigo, versao, situacao: 'em_conferencia', nome_original: arquivo.name, mime: arquivo.type, tamanho_bytes: arquivo.size, enviado_por: p.id, enviado_em: agora() };
    if (iaLigada()) { novo.ia = iaSimulada(arquivo.name, TIPOS_DOCUMENTO.find((t) => t.codigo === tipoCodigo)?.nome || 'Documento'); novo.ia_em = agora(); registrarUsoIa(); }
    if (emitidoEm) novo.emitido_em = emitidoEm;
    d.documentos.push(novo);
    arquivosNaMemoria.set(novo.id, URL.createObjectURL(arquivo));
    c.atualizado_em = agora();
    gravar();
    return novo;
  },

  async salvarMinhaFoto(dataUrl) {
    await atraso(); const p = exigirLogin(); const u = db().usuarios.find((x) => x.id === p.id);
    u.foto = dataUrl || null; gravar();
  },

  async buscarVendedor(doc) { await atraso(); exigirLogin(); return buscarVendedorPorDoc(doc); },

  // ---------- Engenharia (avaliação do imóvel pela Caixa) ----------
  async listarEngenharias() {
    await atraso();
    const p = exigirLogin(); const d = db();
    const imobDele = p.imobiliaria_id;
    return (d.engenharias || []).filter((e) => souEquipe(p) || e.criado_por === p.id || (p.papel === 'gestor_imobiliaria' && e.imobiliaria_id && e.imobiliaria_id === imobDele))
      .map((e) => {
        const v = (d.vendedores || []).find((x) => x.id === e.vendedor_id); const cr = d.usuarios.find((u) => u.id === e.criado_por);
        const im = e.imobiliaria_id ? d.imobiliarias.find((i) => i.id === e.imobiliaria_id) : null;
        return { ...e, validade_em: e.avaliacao_data ? validadeDoLaudo(e.avaliacao_data) : null,
          vendedor: v ? { id: v.id, nome: v.nome, tipo: v.tipo, cpf_cnpj: v.cpf_cnpj, responsavel_nome: v.responsavel_nome || null, telefone: v.telefone || null, email: v.email || null } : null,
          criado_por_nome: cr?.nome || '', criado_por_apelido: cr?.apelido || '', imobiliaria_nome: im?.nome || null,
          pepts: (d.engenharia_pepts || []).filter((t) => t.engenharia_id === e.id), docs: (d.engenharia_docs || []).filter((t) => t.engenharia_id === e.id) };
      }).sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
  },

  async cadastrarVendedorBasico({ cpf_cnpj, nome, responsavel_nome, telefone, email }) {
    await atraso(); const p = exigirLogin(); const d = db();
    const doc = R.soDigitos(cpf_cnpj || '');
    if (![11, 14].includes(doc.length)) throw new Error('CPF ou CNPJ do vendedor inválido');
    const tel = R.soDigitos(telefone || ''); const mail = String(email || '').trim().toLowerCase();
    if (tel.length < 10) throw new Error('Informe o telefone do vendedor com DDD');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new Error('Informe um e-mail válido do vendedor');
    let v = (d.vendedores ||= []).find((x) => x.cpf_cnpj === doc);
    if (!v) {
      if (!String(nome || '').trim()) throw new Error('Informe o nome do vendedor');
      v = { id: id(), tipo: doc.length === 11 ? 'PF' : 'PJ', cpf_cnpj: doc, nome: nome.trim(), responsavel_nome: (responsavel_nome || '').trim() || null, telefone: tel, email: mail, criado_por: p.id, criado_em: agora() }; d.vendedores.push(v); gravar();
    } else { v.telefone ||= tel; v.email ||= mail; gravar(); }
    return v.id;
  },

  async criarEngenharia(dados) {
    await atraso(); const p = exigirLogin(); const d = db();
    if (!['corretor', 'gestor_imobiliaria'].includes(p.papel)) throw new Error('Só corretor ou imobiliária pedem engenharia');
    const e = { id: id(), vendedor_id: dados.vendedor_id, criado_por: p.id, imobiliaria_id: p.imobiliaria_id || null, tipo: dados.tipo, codigo_servico: servicoDoTipo(dados.tipo),
      imovel_endereco: dados.imovel_endereco || null, imovel_cidade: dados.imovel_cidade || null, imovel_uf: (dados.imovel_uf || '').toUpperCase() || null, matricula: dados.matricula || null, cartorio_rgi: dados.cartorio_rgi || null,
      quem_paga: dados.quem_paga || null, etapa: 'documentacao', criado_em: agora(), atualizado_em: agora() };
    (d.engenharias ||= []).push(e); gravar();
    return e.id;
  },

  // ---------- Consumidor final: verificação de identidade por vídeo ----------
  async enviarVerificacao(arquivo) {
    await atraso(300); const p = exigirLogin(); const d = db();
    if (!p.consumidor) throw new Error('Sem permissão');
    if ((d.verificacoes || []).some((v) => v.perfil_id === p.id && ['em_analise', 'aprovada'].includes(v.status))) throw new Error('Já existe uma verificação enviada');
    const v = { id: id(), perfil_id: p.id, nome_arquivo: arquivo.name, status: 'em_analise', motivo: null, enviada_em: agora(), analisada_em: null };
    (d.verificacoes ||= []).push(v); arquivosNaMemoria.set(v.id, URL.createObjectURL(arquivo)); gravar();
  },
  async minhaVerificacao() {
    const p = exigirLogin();
    const v = (db().verificacoes || []).filter((x) => x.perfil_id === p.id).sort((a, b) => b.enviada_em.localeCompare(a.enviada_em))[0];
    return v ? { id: v.id, status: v.status, motivo: v.motivo, enviada_em: v.enviada_em, analisada_em: v.analisada_em } : null;
  },
  async listarVerificacoes() {
    await atraso(); const p = exigirLogin(); if (!souEquipe(p)) return [];
    const d = db();
    return (d.verificacoes || []).map((v) => { const u = d.usuarios.find((x) => x.id === v.perfil_id) || {};
      return { ...v, perfil_id: v.perfil_id, nome: u.nome, cpf: u.cpf, whatsapp: u.whatsapp, email: u.email }; })
      .sort((a, b) => (b.status === 'em_analise') - (a.status === 'em_analise') || b.enviada_em.localeCompare(a.enviada_em));
  },
  async analisarVerificacao(vid, aprovada, motivo) {
    await atraso(); const p = exigirLogin(); if (!souEquipe(p)) throw new Error('Sem permissão');
    const d = db(); const v = (d.verificacoes || []).find((x) => x.id === vid);
    if (!v || v.status !== 'em_analise') throw new Error('Verificação não encontrada ou já analisada');
    if (!aprovada && !String(motivo || '').trim()) throw new Error('Informe o motivo da recusa');
    v.status = aprovada ? 'aprovada' : 'recusada'; v.motivo = aprovada ? null : String(motivo).trim(); v.analisada_em = agora();
    const u = d.usuarios.find((x) => x.id === v.perfil_id); if (u) u.identidade_verificada_em = aprovada ? agora() : null;
    registrar('verificar_identidade', null, { perfil: v.perfil_id, aprovada }); gravar();
  },
  async abrirVerificacao(v) {
    const url = arquivosNaMemoria.get(v.id);
    if (!url) throw new Error('Neste modo de demonstração o vídeo só fica disponível na sessão em que foi enviado.');
    return url;
  },

  async editarEngenharia(eid, d) {
    await atraso(); const p = exigirLogin(); const e = engDemo(eid);
    if (!souEquipe(p) && !['documentacao', 'em_analise', 'boleto'].includes(e.etapa)) throw new Error('Depois que o boleto é pago, só a CCA altera os dados');
    if (d.tipo !== e.tipo && e.etapa !== 'documentacao' && !souEquipe(p)) e.docs_novos = true;
    Object.assign(e, { tipo: d.tipo, codigo_servico: servicoDoTipo(d.tipo), imovel_endereco: d.imovel_endereco || null, imovel_cidade: d.imovel_cidade || null, imovel_uf: (d.imovel_uf || '').toUpperCase() || null,
      matricula: d.matricula || null, cartorio_rgi: d.cartorio_rgi || null, quem_paga: d.quem_paga || null, atualizado_em: agora() });
    const v = (db().vendedores || []).find((x) => x.id === e.vendedor_id);
    if (v) { if (R.soDigitos(d.telefone || '').length >= 10) v.telefone = R.soDigitos(d.telefone); if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email || '')) v.email = d.email.toLowerCase(); }
    gravar();
  },

  async excluirEngenharia(eid) {
    await atraso(); const p = exigirLogin(); const e = engDemo(eid);
    if (!souEquipe(p) && !['documentacao', 'em_analise'].includes(e.etapa)) throw new Error('Depois que o boleto é emitido, só a CCA exclui o pedido. Fale com a equipe.');
    db().engenharias = db().engenharias.filter((x) => x.id !== eid); gravar();
  },

  async equipeEditarVendedor(vid, d) {
    await atraso(); const p = exigirLogin(); if (!souEquipe(p)) throw new Error('Só a equipe da CCA altera nome e CPF/CNPJ');
    const doc = R.soDigitos(d.cpf_cnpj || ''); if (![11, 14].includes(doc.length)) throw new Error('CPF ou CNPJ inválido');
    if (!String(d.nome || '').trim()) throw new Error('Informe o nome do vendedor');
    const lista = db().vendedores || []; if (lista.some((x) => x.cpf_cnpj === doc && x.id !== vid)) throw new Error('Já existe outro vendedor com esse CPF/CNPJ');
    const v = lista.find((x) => x.id === vid); if (!v) return;
    Object.assign(v, { nome: d.nome.trim(), cpf_cnpj: doc, tipo: doc.length === 11 ? 'PF' : 'PJ', responsavel_nome: (d.responsavel_nome || '').trim() || null }); gravar();
  },
  async verEngenharia(eid) { await atraso(); const e = engDemo(eid); if (e.docs_novos) { e.docs_novos = false; gravar(); } },

  async reenviarEngenharia(eid) { await atraso(); const e = engDemo(eid); e.atualizado_em = agora(); gravar(); },

  async enviarEngenharia(eid) { await atraso(); const e = engDemo(eid); if (e.etapa === 'documentacao') { e.etapa = 'em_analise'; e.atualizado_em = agora(); gravar(); } },

  async enviarDocEngenharia(eid, tipo, arquivo, peptId = null) {
    await atraso(300); const p = exigirLogin(); const e = engDemo(eid);
    const doc = { id: id(), engenharia_id: eid, tipo, pept_id: peptId, nome_original: arquivo.name, arquivo_path: `${eid}/${arquivo.name}`, enviado_por: p.id, enviado_em: agora() };
    (db().engenharia_docs ||= []).push(doc); if (!souEquipe(p) && e.etapa !== 'documentacao' && !['BOLETO', 'COMPROVANTE'].includes(tipo)) e.docs_novos = true; arquivosNaMemoria.set(doc.id, URL.createObjectURL(arquivo)); e.atualizado_em = agora(); gravar();
  },

  async abrirDocEngenharia(doc) { return this.abrirDocumento({ ...doc, cliente_id: null }, { silencioso: true }); },

  async engenhariaAvancar(eid, { etapa, os_numero, os_data }) {
    await atraso(); const p = exigirLogin(); if (!souEquipe(p)) throw new Error('Sem permissão');
    const e = engDemo(eid); e.etapa = etapa; if (os_numero) e.os_numero = os_numero; if (os_data) e.os_data = os_data; e.atualizado_em = agora(); gravar();
  },

  async engenhariaInformarPagamento(eid) { await atraso(); const e = engDemo(eid); if (e.etapa === 'boleto') { e.etapa = 'pago'; e.atualizado_em = agora(); gravar(); } },

  async engenhariaLancarLaudo(eid, { aprovado, valor, data, motivos }) {
    await atraso(); const p = exigirLogin(); if (!souEquipe(p)) throw new Error('Sem permissão');
    if (aprovado && (!valor || !data)) throw new Error('Informe o valor e a data da avaliação');
    const lista = (motivos || []).map((m) => String(m).trim()).filter(Boolean);
    if (!aprovado && !lista.length) throw new Error('Informe o motivo da reprovação (PEPT)');
    const e = engDemo(eid);
    Object.assign(e, { etapa: 'laudo', laudo_aprovado: !!aprovado, avaliacao_valor: aprovado ? Number(valor) : null, avaliacao_data: aprovado ? data : null, contestacao: null, links_anuncios: null, atualizado_em: agora() });
    if (!aprovado) lista.forEach((m) => (db().engenharia_pepts ||= []).push({ id: id(), engenharia_id: eid, motivo: m, registrada_em: agora(), resolvida_em: null }));
    gravar();
  },

  async engenhariaResolverPept(peptId, resolvida) {
    await atraso(); const p = exigirLogin(); if (!souEquipe(p)) throw new Error('Sem permissão');
    const t = (db().engenharia_pepts || []).find((x) => x.id === peptId); t.resolvida_em = resolvida ? agora() : null; gravar();
  },

  async engenhariaContestar(eid, { tipo, links }) {
    await atraso(); const e = engDemo(eid);
    if (e.laudo_aprovado !== true) throw new Error('Só dá para discordar de um valor aprovado');
    e.contestacao = tipo; e.links_anuncios = tipo === 'reavaliacao' ? links : null; e.atualizado_em = agora(); gravar();
  },

  async vincularVendedor(clienteId, dados) {
    await atraso();
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || !possoEditar(p, c)) throw new Error('Sem permissão');
    const doc = R.soDigitos(dados.cpf_cnpj);
    if (![11, 14].includes(doc.length)) throw new Error('CPF ou CNPJ do vendedor inválido');
    if (!String(dados.nome || '').trim()) throw new Error('Informe o nome do vendedor');
    let v = (d.vendedores ||= []).find((x) => x.cpf_cnpj === doc);
    if (!v) { v = { id: id(), tipo: doc.length === 11 ? 'PF' : 'PJ', cpf_cnpj: doc, criado_por: p.id, criado_em: agora() }; d.vendedores.push(v); }
    v.nome = dados.nome.trim();
    for (const k of ['pj_tipo', 'empreendimento', 'construtora_cnpj', 'construtora_nome', 'banco', 'agencia', 'operacao', 'conta', 'estado_civil', 'conjuge_nome', 'conjuge_cpf', 'regime_bens', 'natureza_juridica', 'data_nascimento', 'residencia_municipio', 'residencia_uf', 'telefone', 'email', 'responsavel_nome']) {
      const val = ['construtora_cnpj', 'conjuge_cpf'].includes(k) ? R.soDigitos(dados[k] || '') : String(dados[k] ?? '').trim();
      if (val) v[k] = val;
    }
    if (String(dados.conta ?? '').trim()) v.conta_digito = String(dados.conta_digito ?? '').trim() || null;
    if (v.estado_civil !== 'Casado(a)') { v.conjuge_nome = null; v.conjuge_cpf = null; }
    if (typeof dados.teve_alteracao_contratual === 'boolean') v.teve_alteracao_contratual = dados.teve_alteracao_contratual;
    c.vendedor_id = v.id;
    gravar();
    return buscarVendedorPorDoc(doc);
  },

  async enviarDocumentoVendedor(clienteId, vendedorId, tipoCodigo, arquivo, emitidoEm = null) {
    await atraso(300);
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || !possoEditar(p, c)) throw new Error('Sem permissão');
    if (!c.vendedor_id) throw new Error('Salve os dados do vendedor antes de anexar os documentos dele.');
    const lista = (d.documentos_vendedor ||= []);
    const anteriores = lista.filter((x) => x.vendedor_id === c.vendedor_id && x.tipo_codigo === tipoCodigo);
    anteriores.forEach((x) => { if (x.situacao !== 'substituido') x.situacao = 'substituido'; });
    const novo = { id: id(), vendedor_id: c.vendedor_id, tipo_codigo: tipoCodigo, versao: anteriores.reduce((m, x) => Math.max(m, x.versao), 0) + 1,
      situacao: 'em_conferencia', nome_original: arquivo.name, mime: arquivo.type, tamanho_bytes: arquivo.size, cliente_id: clienteId, enviado_por: p.id, enviado_em: agora(), ...(emitidoEm ? { emitido_em: emitidoEm } : {}) };
    if (iaLigada()) { novo.ia = iaSimulada(arquivo.name, TIPOS_DOCUMENTO.find((t) => t.codigo === tipoCodigo)?.nome || 'Documento'); novo.ia_em = agora(); registrarUsoIa(); }
    lista.push(novo);
    arquivosNaMemoria.set(novo.id, URL.createObjectURL(arquivo));
    c.atualizado_em = agora();
    gravar();
    return novo.id;
  },

  async definirEmissao(docId, doVendedor, data) {
    await atraso(150); exigirLogin();
    const d = db();
    const doc = (doVendedor ? (d.documentos_vendedor || []) : d.documentos).find((x) => x.id === docId);
    if (!doc) throw new Error('Documento não encontrado');
    doc.emitido_em = data; gravar();
  },

  async listarEmissoes() {
    await atraso(100); exigirLogin();
    const d = db();
    return [...d.documentos.filter((x) => x.emitido_em && x.situacao !== 'substituido').map((x) => ({ id: x.id, cliente_id: x.cliente_id, tipo_codigo: x.tipo_codigo, emitido_em: x.emitido_em, do_vendedor: false })),
      ...(d.documentos_vendedor || []).filter((x) => x.emitido_em && x.situacao !== 'substituido').map((x) => ({ id: x.id, cliente_id: x.cliente_id, tipo_codigo: x.tipo_codigo, emitido_em: x.emitido_em, do_vendedor: true }))];
  },

  async minhaPosicao() {
    await atraso(100); const p = exigirLogin(); const d = db();
    const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
    const corretores = d.usuarios.filter((u) => u.papel === 'corretor');
    const n = (u) => d.clientes.filter((c) => c.corretor_id === u.id && !c.rascunho && c.enviado_em && new Date(c.enviado_em) >= ini).length;
    const eu = corretores.find((u) => u.id === p.id); if (!eu) return null;
    const cont = corretores.map(n);
    return { posicao: 1 + cont.filter((x) => x > n(eu)).length, total: corretores.length, meus: n(eu), lider: Math.max(...cont) };
  },

  async listarMotivosRecusa() {
    await atraso(100); exigirLogin(); const d = db();
    return [...d.documentos, ...(d.documentos_vendedor || [])].filter((x) => x.motivo_recusa).map((x) => ({ motivo_recusa: x.motivo_recusa, conferido_em: x.conferido_em || x.enviado_em }));
  },

  async registrarGrerj(clienteId, { numero, valor, pagoEm, requerimentoEm }) {
    await atraso(150); const p = exigirLogin();
    if (!souEquipe(p)) throw new Error('Sem permissão');
    const c = db().clientes.find((x) => x.id === clienteId);
    if (!c) throw new Error('Cliente não encontrado');
    Object.assign(c, { grerj_numero: numero || null, grerj_valor: valor ?? null, grerj_pago_em: pagoEm || null, requerimento_enviado_em: requerimentoEm || null });
    gravar();
  },

  async bancos() {
    const d = await (await fetch('data/bancos.json')).json();
    const rot = Object.fromEntries(d.bancos.map(([c, n]) => [c, `${c} - ${n}`]));
    return { principais: d.principais.map((c) => rot[c]).filter(Boolean), todos: d.bancos.map(([c]) => rot[c]) };
  },

  async tetoMunicipio(uf, nome) {
    return tetoDoArquivo(uf, nome);
  },

  async municipios(uf) {
    if (!uf) return [];
    const dados = await (await fetch('data/municipios.json')).json();
    return (dados[uf] || []).map((m) => m[1]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  },

  async abrirDocumento(doc, { silencioso = false } = {}) {
    if (doc.do_vendedor && !doc.arquivo_path) throw new Error('Documento enviado por outro corretor: só a equipe da CCA abre o arquivo.');
    if (!silencioso) { registrar('baixar_documento', doc.cliente_id, { documento: doc.id }); gravar(); }
    if (arquivosNaMemoria.has(doc.id)) return arquivosNaMemoria.get(doc.id);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="#EFE8DA"/><text x="50%" y="46%" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#26323A">Arquivo de exemplo</text><text x="50%" y="52%" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#5A646B">${doc.nome_original || ''} · versão ${doc.versao}</text></svg>`;
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  },

  // ---------- Equipe ----------

  async agendarEntrevista(clienteId, { em, modalidade, local, mensagem, agencia, gerente, endereco }) {
    await atraso();
    const p = exigirLogin();
    if (!souEquipe(p) || !R.pode(p, 'mudar_status')) throw new Error('Sem permissão');
    const c = db().clientes.find((x) => x.id === clienteId);
    // agendar leva o processo para a etapa Entrevista; cancelar (sem resultado) volta para Cliente Aprovado
    const novo = em && c.status === 'cliente_aprovado' ? 'entrevista' : !em && c.status === 'entrevista' ? 'cliente_aprovado' : c.status;
    if (novo !== c.status) { db().historico.push({ cliente_id: c.id, de: c.status, para: novo, por: p.id, em: agora() }); c.status = novo; }
    Object.assign(c, { entrevista_em: em || null, entrevista_modalidade: em ? modalidade : null, entrevista_local: em ? (local || '').trim() || null : null,
      entrevista_agencia: em ? (agencia || '').trim() || null : null, entrevista_gerente: em ? (gerente || '').trim() || null : null, entrevista_endereco: em ? (endereco || '').trim() || null : null, atualizado_em: agora() });
    registrar('agendar_entrevista', c.id, { em, modalidade });
    if ((mensagem || '').trim()) enfileirarMensagem(c, 'status', mensagem.trim());
    gravar();
  },

  async listarEntrevistas() {
    await atraso();
    const d = db();
    return d.clientes.filter((c) => c.entrevista_em).sort((a, b) => a.entrevista_em.localeCompare(b.entrevista_em)).map((c) => {
      const cor = d.usuarios.find((u) => u.id === c.corretor_id); const im = c.imobiliaria_id ? d.imobiliarias.find((i) => i.id === c.imobiliaria_id) : null;
      return { id: c.id, nome: c.nome, status: c.status, entrevista_em: c.entrevista_em, entrevista_modalidade: c.entrevista_modalidade, entrevista_local: c.entrevista_local,
        entrevista_agencia: c.entrevista_agencia || null, entrevista_gerente: c.entrevista_gerente || null, entrevista_endereco: c.entrevista_endereco || null,
        corretor_nome: cor?.nome || '', corretor_apelido: cor?.apelido || '', corretor_consumidor: cor?.consumidor === true, imobiliaria_nome: im?.nome || 'Autônomo' };
    });
  },

  async mudarStatus(clienteId, status, mensagem = null) {
    await atraso();
    const p = exigirLogin();
    if (!souEquipe(p) || !R.pode(p, 'mudar_status')) throw new Error('Sem permissão para mudar status');
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    const de = c.status;
    c.status = status; c.atualizado_em = agora();
    d.historico.push({ cliente_id: c.id, de, para: status, por: p.id, em: agora() });
    registrar('mudar_status', c.id, { de, para: status });
    const corretor = d.usuarios.find((u) => u.id === c.corretor_id);
    enfileirarMensagem(c, 'status', mensagem || R.msgStatus({ corretor, cliente: c, novoStatus: status }));
    gravar();
  },

  async conferirDocumento(documentoId, aceito, motivo, observacao, doVendedor = false) {
    await atraso();
    const p = exigirLogin();
    if (!souEquipe(p) || !R.pode(p, 'conferir_documentos')) throw new Error('Sem permissão para conferir documentos');
    if (!aceito && !motivo) throw new Error('Escolha o motivo da recusa');
    const d = db();
    const doc = (doVendedor ? (d.documentos_vendedor || []) : d.documentos).find((x) => x.id === documentoId);
    if (!doc || doc.situacao !== 'em_conferencia') throw new Error('Documento não está em conferência');
    Object.assign(doc, { situacao: aceito ? 'aceito' : 'recusado', motivo_recusa: aceito ? null : motivo, observacao_recusa: aceito ? null : (observacao || null), conferido_por: p.id, conferido_em: agora() });
    const c = d.clientes.find((x) => x.id === doc.cliente_id);
    if (!c) { gravar(); return; }
    c.atualizado_em = agora();
    registrar('conferir_documento', c.id, { documento: doc.id, aceito, motivo });
    if (!aceito) {
      const tipo = TIPOS_DOCUMENTO.find((t) => t.codigo === doc.tipo_codigo);
      const corretor = d.usuarios.find((u) => u.id === c.corretor_id);
      enfileirarMensagem(c, 'recusa', R.msgRecusa({ corretor, cliente: c, documentoNome: tipo.nome, motivo, observacao, regra: tipo.regra }));
    }
    gravar();
  },

  async listarDocsParaConferir() {
    await atraso();
    const p = exigirLogin();
    if (!souEquipe(p)) return [];
    const d = db();
    return d.documentos.filter((x) => x.situacao === 'em_conferencia').map((doc) => {
      const c = d.clientes.find((x) => x.id === doc.cliente_id);
      const t = TIPOS_DOCUMENTO.find((x) => x.codigo === doc.tipo_codigo);
      const pe = doc.participante_id ? (d.participantes || []).find((x) => x.id === doc.participante_id) : null;
      return { documento: doc, cliente_id: c.id, cliente_nome: c.nome, tipo_nome: pe ? `${t?.nome} – ${R.primeiroNome(pe.nome)}` : t?.nome, regra: t?.regra || '' };
    }).concat((d.documentos_vendedor || []).filter((x) => x.situacao === 'em_conferencia').map((doc) => {
      const c = d.clientes.find((x) => x.id === doc.cliente_id);
      const v = (d.vendedores || []).find((x) => x.id === doc.vendedor_id);
      const t = TIPOS_DOCUMENTO.find((x) => x.codigo === doc.tipo_codigo);
      return { documento: { ...doc, do_vendedor: true }, cliente_id: c?.id, cliente_nome: c?.nome || '—', tipo_nome: `${t?.nome} – vendedor ${v?.nome || ''}`, regra: t?.regra || '' };
    }));
  },

  // ---------- Conversa por cliente ----------
  async listarConversa(clienteId) {
    await atraso(60);
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || !possoVer(p, c)) throw new Error('Cliente não encontrado');
    return (d.conversa || []).filter((m) => m.cliente_id === clienteId).sort((a, b) => a.criada_em.localeCompare(b.criada_em) || a.id - b.id).map((m) => {
      const u = d.usuarios.find((x) => x.id === m.autor_id);
      return { ...m, autor_nome: u?.nome || '—', da_equipe: souEquipe(u || {}), minha: m.autor_id === p.id };
    });
  },

  async enviarConversa(clienteId, texto) {
    await atraso(80);
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || !possoVer(p, c)) throw new Error('Cliente não encontrado');
    const t = String(texto || '').trim();
    if (!t) throw new Error('Escreva a mensagem antes de enviar.');
    if (t.length > 2000) throw new Error('Mensagem muito longa (até 2.000 letras).');
    d.conversa ||= [];
    d.conversa.push({ id: d.conversa.reduce((m, x) => Math.max(m, x.id), 0) + 1, cliente_id: clienteId, autor_id: p.id, texto: t, criada_em: agora() });
    this._marcarLida(p, clienteId);
    if (souEquipe(p)) enfileirarMensagem(c, 'conversa', `${R.primeiroNome(p.nome)} da CCA escreveu sobre ${c.nome}: "${t}"`);
    gravar();
  },

  _marcarLida(p, clienteId) {
    const d = db();
    d.conversa_lida ||= [];
    const l = d.conversa_lida.find((x) => x.usuario_id === p.id && x.cliente_id === clienteId);
    if (l) l.lida_em = agora(); else d.conversa_lida.push({ usuario_id: p.id, cliente_id: clienteId, lida_em: agora() });
  },

  async marcarConversaLida(clienteId) { const p = exigirLogin(); this._marcarLida(p, clienteId); gravar(); },

  async historicoStatus() {
    const p = exigirLogin();
    const d = db();
    return (d.historico || []).filter((x) => { const c = d.clientes.find((y) => y.id === x.cliente_id); return c && possoVer(p, c); })
      .sort((a, b) => a.cliente_id.localeCompare(b.cliente_id) || a.em.localeCompare(b.em));
  },

  async listarMensagens() {
    const p = exigirLogin();
    const d = db();
    return d.mensagens.filter((m) => souEquipe(p) || m.destino_id === p.id).map((m) => ({
      ...m, cliente_nome: d.clientes.find((c) => c.id === m.cliente_id)?.nome, destino_nome: d.usuarios.find((u) => u.id === m.destino_id)?.nome,
    }));
  },

  async listarImobiliarias() {
    const d = db();
    return d.imobiliarias.map((i) => ({ ...i, corretores: d.usuarios.filter((u) => u.imobiliaria_id === i.id).length, clientes: d.clientes.filter((c) => c.imobiliaria_id === i.id).length }));
  },

  async listarCorretores() {
    const d = db();
    return d.usuarios.filter((u) => ['corretor', 'gestor_imobiliaria'].includes(u.papel)).map(({ senha, ...u }) => ({
      ...u, ativo: u.ativo !== false, imobiliaria_nome: d.imobiliarias.find((i) => i.id === u.imobiliaria_id)?.nome || 'Autônomo', clientes: d.clientes.filter((c) => c.corretor_id === u.id).length,
    }));
  },

  async listarAcessos() {
    const d = db();
    return d.acessos.map((a) => {
      const u = d.usuarios.find((x) => x.id === a.usuario_id);
      const imob = u?.imobiliaria_id ? d.imobiliarias.find((i) => i.id === u.imobiliaria_id) : null;
      return { ...a, usuario_nome: u?.nome || a.usuario_nome, usuario_papel: u?.papel,
        imobiliaria_nome: ['equipe_cca', 'admin'].includes(u?.papel) ? 'Equipe CCA' : (imob?.nome || 'Autônomo'),
        cliente_nome: d.clientes.find((c) => c.id === a.cliente_id)?.nome || null };
    });
  },

  async listarEquipe() {
    return db().usuarios.filter((u) => ['equipe_cca', 'admin'].includes(u.papel)).map(({ senha, ...u }) => ({ ...u, ativo: u.ativo !== false, permissoes: u.permissoes || {} }));
  },

  async atualizarUsuario(idUsuario, { papel, ativo, permissoes }) {
    const p = exigirLogin();
    if (p.papel !== 'admin') throw new Error('Somente administradores');
    if (idUsuario === p.id && (papel !== 'admin' || !ativo)) throw new Error('Você não pode tirar o seu próprio acesso de administrador');
    const u = db().usuarios.find((x) => x.id === idUsuario);
    Object.assign(u, { papel, ativo, permissoes: permissoes || {} });
    registrar('alterar_usuario', null, { usuario: idUsuario, papel, ativo });
    gravar();
  },

  async listarParametros() {
    const d = db();
    d.parametros ||= [];
    for (const [chave, valor] of Object.entries(PARAMETROS)) if (!d.parametros.some((x) => x.chave === chave)) d.parametros.push({ chave, valor: String(valor), descricao: null });
    return d.parametros;
  },

  // ---------- Contrato: arquivos de cada passo ----------
  async listarContratoArquivos(clienteId) {
    await atraso();
    const p = exigirLogin();
    const c = db().clientes.find((x) => x.id === clienteId);
    if (!c || !possoVer(p, c)) throw new Error('Cliente não encontrado');
    return (db().contrato_arquivos || []).filter((a) => a.cliente_id === clienteId).map((a) => ({ ...a }));
  },

  async listarContratos() {
    await atraso();
    const p = exigirLogin();
    const d = db();
    return (d.contrato_arquivos || []).filter((a) => !a.substituido && possoVer(p, d.clientes.find((c) => c.id === a.cliente_id) || {})).map((a) => ({ ...a }));
  },

  async enviarContratoArquivo(clienteId, tipo, arquivo) {
    await atraso(300);
    const p = exigirLogin();
    const d = db();
    const c = d.clientes.find((x) => x.id === clienteId);
    if (!c || !possoVer(p, c)) throw new Error('Cliente não encontrado');
    const equipe = souEquipe(p);
    const t = KC.TIPOS_CONTRATO.find((x) => x.codigo === tipo);
    if (!t) throw new Error('Tipo de arquivo inválido');
    if (t.quem === 'cca' && !(equipe && R.pode(p, 'mudar_status'))) throw new Error('Somente a equipe da CCA anexa este arquivo');
    if (!equipe && tipo === 'minuta_assinada' && c.status !== 'minuta_em_maos') throw new Error('A minuta assinada só pode ser enviada na etapa Contrato');
    if (!equipe && ['contrato_registrado', 'talao_rgi', 'onus_reais'].includes(tipo) && c.status !== 'registro_cartorio') throw new Error('Estes documentos só podem ser enviados na etapa Registro');
    const lista = (d.contrato_arquivos ||= []);
    lista.filter((a) => a.cliente_id === clienteId && a.tipo === tipo && !a.substituido).forEach((a) => { a.substituido = true; });
    const novo = { id: id(), cliente_id: clienteId, tipo, nome_original: arquivo.name, mime: arquivo.type, tamanho_bytes: arquivo.size, enviado_por: p.id, enviado_por_nome: p.nome, enviado_em: agora(), substituido: false };
    lista.push(novo);
    arquivosNaMemoria.set(novo.id, URL.createObjectURL(arquivo));
    registrar('contrato_arquivo', clienteId, { tipo });
    const ativos = new Set(KC.arquivosAtuais(lista.filter((a) => a.cliente_id === clienteId)).keys());
    const ef = KC.efeitoDoArquivo({ status: c.status, tipo, ativos, nomeCliente: c.nome, equipe });
    const de = c.status;
    if (ef.irPara) {
      let ant = de;
      for (const st of ef.historico) { d.historico.push({ cliente_id: c.id, de: ant, para: st, por: p.id, em: agora() }); ant = st; }
      c.status = ef.irPara;
    }
    if (ef.mensagem) enfileirarMensagem(c, 'status', ef.mensagem);
    if (ef.conversa) { d.conversa ||= []; d.conversa.push({ id: d.conversa.reduce((m, x) => Math.max(m, x.id), 0) + 1, cliente_id: c.id, autor_id: p.id, texto: ef.conversa, criada_em: agora() }); }
    c.atualizado_em = agora();
    gravar();
    return novo;
  },

  async abrirContratoArquivo(a) {
    await atraso();
    if (arquivosNaMemoria.has(a.id)) return arquivosNaMemoria.get(a.id);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="#EFE8DA"/><text x="50%" y="46%" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#26323A">Arquivo de exemplo</text><text x="50%" y="52%" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#5A646B">${KC.nomeTipoContrato(a.tipo)}</text></svg>`;
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  },

  async definirRegraDocumento(codigo, regra) {
    const p = exigirLogin();
    if (p.papel !== 'admin') throw new Error('Somente administradores');
    if (!['', '*', '**'].includes(regra)) throw new Error('Regra inválida');
    const t = TIPOS_DOCUMENTO.find((x) => x.codigo === codigo);
    if (!t) throw new Error('Documento não encontrado');
    t.regra = regra;
    const d = db(); (d.regras_doc ||= {})[codigo] = regra;
    registrar('alterar_regra_documento', null, { codigo, regra });
    gravar();
  },

  async salvarParametro(chave, valor) {
    const p = exigirLogin();
    if (p.papel !== 'admin') throw new Error('Somente administradores');
    const lista = await this.listarParametros();
    const item = lista.find((x) => x.chave === chave);
    if (!item) throw new Error('Parâmetro não encontrado');
    item.valor = String(valor);
    registrar('alterar_parametro', null, { chave, valor });
    gravar();
  },

  // ---------- Campanhas e metas por mês ----------
  async listarCampanhas() {
    await atraso(80); const p = exigirLogin(); const d = db();
    return (d.campanhas || []).filter((c) => souEquipe(p) || c.ativa).map((c) => ({ ...c, premios: (c.premios || []).map((x) => ({ ...x })) }));
  },

  async rankingCampanha(campanhaId) {
    await atraso(80); const p = exigirLogin(); const d = db();
    const c = (d.campanhas || []).find((x) => x.id === campanhaId);
    if (!c || (!c.ativa && !souEquipe(p))) return [];
    const corretores = d.usuarios.filter((u) => u.papel === 'corretor' && u.ativo !== false && !u.consumidor);
    const linhas = placarCampanha(c, { clientes: d.clientes.filter((x) => !x.rascunho), historico: d.historico || [], corretores, imobiliarias: d.imobiliarias.filter((i) => i.ativo !== false), vendedores: d.vendedores || [], gestores: d.usuarios.filter((u) => u.papel === 'gestor_imobiliaria' && u.ativo !== false), euId: p.id, minhaImobiliariaId: p.imobiliaria_id || null });
    return placarVisivel(linhas, c, { equipe: souEquipe(p) });
  },

  async salvarCampanha(dados) {
    await atraso(120); const p = exigirLogin(); const d = db();
    if (p.papel !== 'admin') throw new Error('Somente administradores');
    if (!String(dados.nome || '').trim()) throw new Error('Dê um nome à campanha');
    if (!dados.inicio || !dados.fim) throw new Error('Informe o início e o fim');
    if (dados.fim < dados.inicio) throw new Error('O fim não pode ser antes do início');
    d.campanhas ||= [];
    let c = dados.id ? d.campanhas.find((x) => x.id === dados.id) : null;
    if (!c) { c = { id: id(), criado_em: agora(), apurada_em: null, arquivada: false, premios: [] }; d.campanhas.push(c); }
    Object.assign(c, { nome: dados.nome.trim(), descricao: dados.descricao || null, regulamento: dados.regulamento || null, metrica: dados.metrica || 'assinados', inicio: dados.inicio, fim: dados.fim,
      mostrar_nomes: dados.mostrar_nomes !== false, ativa: dados.ativa !== false,
      pontos_avulso: Number.isFinite(Number(dados.pontos_avulso)) ? Number(dados.pontos_avulso) : 2, pontos_empreendimento: Number.isFinite(Number(dados.pontos_empreendimento)) ? Number(dados.pontos_empreendimento) : 1 });
    for (const x of dados.premios || []) {
      if (!String(x.descricao || '').trim()) continue;
      const atual = x.id ? c.premios.find((y) => y.id === x.id) : null;
      if (atual) Object.assign(atual, { categoria: x.categoria, posicao: Number(x.posicao) || 1, descricao: x.descricao.trim() });
      else c.premios.push({ id: id(), categoria: x.categoria, posicao: Number(x.posicao) || 1, descricao: x.descricao.trim(), ganhador_id: null, ganhador_nome: null, entregue_em: null, removido: false });
    }
    for (const rid of dados.premiosRemovidos || []) { const x = c.premios.find((y) => y.id === rid); if (x) x.removido = true; }
    registrar('salvar_campanha', null, { campanha: c.id, nome: c.nome });
    gravar(); return c.id;
  },

  async arquivarCampanha(campanhaId, arquivada = true) {
    await atraso(80); const p = exigirLogin(); if (p.papel !== 'admin') throw new Error('Somente administradores');
    const c = (db().campanhas || []).find((x) => x.id === campanhaId); if (c) c.arquivada = !!arquivada; gravar();
  },

  // Congela os vencedores de cada prêmio no momento da apuração
  async apurarCampanha(campanhaId) {
    const p = exigirLogin(); if (p.papel !== 'admin') throw new Error('Somente administradores');
    const d = db(); const c = (d.campanhas || []).find((x) => x.id === campanhaId); if (!c) throw new Error('Campanha não encontrada');
    const placar = await this.rankingCampanha(campanhaId);
    for (const pr of c.premios) { const w = placar.find((l) => l.categoria === pr.categoria && l.posicao === pr.posicao); pr.ganhador_id = w?.ref_id || null; pr.ganhador_nome = w?.nome || null; pr.entregar_para = w ? entregarParaDoGanhador(w) : null; }
    c.apurada_em = agora(); registrar('apurar_campanha', null, { campanha: c.id }); gravar();
  },

  async entregarPremio(campanhaId, premioId, data) {
    await atraso(80); const p = exigirLogin(); if (p.papel !== 'admin') throw new Error('Somente administradores');
    const c = (db().campanhas || []).find((x) => x.id === campanhaId); const pr = c?.premios.find((x) => x.id === premioId);
    if (!pr) throw new Error('Prêmio não encontrado'); pr.entregue_em = data || null; gravar();
  },

  // Para quem vai o brinde de um prêmio (editável depois da apuração)
  async definirEntregaPara(campanhaId, premioId, texto) {
    await atraso(60); const p = exigirLogin(); if (p.papel !== 'admin') throw new Error('Somente administradores');
    const pr = (db().campanhas || []).find((x) => x.id === campanhaId)?.premios.find((x) => x.id === premioId);
    if (!pr) throw new Error('Prêmio não encontrado'); pr.entregar_para = String(texto || '').trim() || null; gravar();
  },

  async listarMetasMensais() {
    await atraso(60); const p = exigirLogin(); if (!souEquipe(p)) return [];
    return (db().metas_mensais || []).map((x) => ({ ...x }));
  },

  async salvarMetaMensal(mes, metrica, valor) {
    const p = exigirLogin(); if (p.papel !== 'admin') throw new Error('Somente administradores');
    const d = db(); d.metas_mensais ||= [];
    const chave = `${String(mes).slice(0, 7)}-01`;
    const i = d.metas_mensais.findIndex((x) => x.mes === chave && x.metrica === metrica);
    if (valor === null || valor === undefined || valor === '') { if (i >= 0) d.metas_mensais.splice(i, 1); }
    else if (i >= 0) d.metas_mensais[i].valor = Number(valor); else d.metas_mensais.push({ mes: chave, metrica, valor: Number(valor) });
    gravar();
  },

  async reiniciarDemo() { memoria = semente(); gravar(); },
};
