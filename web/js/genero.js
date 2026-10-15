// Regra do Modelo 2: quando o texto fala de uma pessoa (corretor, gestor, vendedor, comprador, cliente, gerente…),
// o gênero vai entre parênteses: "o(a) corretor(a)", "do(a) cliente", "pelo(a) gestor(a)".
// Aplicado no texto que aparece na tela (não mexe no que a pessoa digita nem em e-mails/logins).

// Substantivos que mudam no feminino (singular e plural)
const NOMES = { corretor: 'a', gestor: 'a', vendedor: 'a', comprador: 'a', corretores: 'as', gestores: 'as', vendedores: 'as', compradores: 'as' };
// Substantivos iguais nos dois gêneros: só o artigo ganha o parênteses
const NEUTROS = ['cliente', 'clientes', 'gerente', 'gerentes'];
// Artigos e palavras que concordam: masculino -> forma com parênteses
const ARTIGOS = {
  o: 'o(a)', os: 'os(as)', do: 'do(a)', dos: 'dos(as)', ao: 'ao(à)', aos: 'aos(às)', pelo: 'pelo(a)', pelos: 'pelos(as)',
  no: 'no(a)', nos: 'nos(as)', um: 'um(a)', seu: 'seu(sua)', seus: 'seus(suas)', este: 'este(a)', esse: 'esse(a)', nenhum: 'nenhum(a)', outro: 'outro(a)',
};
const capital = (orig, novo) => (orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase() ? novo[0].toUpperCase() + novo.slice(1) : novo);
const SUBST = [...Object.keys(NOMES), ...NEUTROS].sort((a, b) => b.length - a.length).join('|');
// artigo + espaço + substantivo (o artigo só muda quando vem antes de uma pessoa)
const RE_ARTIGO = new RegExp(`(?<![\\p{L}@.(])(${Object.keys(ARTIGOS).join('|')})(\\s+)(?=(?:${SUBST})(?![\\p{L}@_]))`, 'giu');
// substantivo que muda no feminino, sem parênteses ainda, fora de e-mail/login
const RE_NOME = new RegExp(`(?<![\\p{L}@._-])(${Object.keys(NOMES).join('|')})(?![\\p{L}@_(]|\\.\\p{L})`, 'giu');

export function generoNeutro(texto) {
  if (!texto || !/corretor|gestor|vendedor|comprador|cliente|gerente/i.test(texto)) return texto;
  return texto
    .replace(RE_ARTIGO, (m, art, esp) => capital(art, ARTIGOS[art.toLowerCase()]) + esp)
    .replace(RE_NOME, (m) => `${m}(${NOMES[m.toLowerCase()]})`);
}

// Não mexe no que a pessoa escreve (campos, conversas) nem em código
const PULAR = 'script,style,textarea,input,select,option,code,pre,[contenteditable],.sem-genero,.balao,.conversa-texto,.mural-item p,.mural-mini-item p';
function tratarNo(no) {
  if (no.nodeType === 3) {
    const pai = no.parentElement;
    if (!pai || pai.closest(PULAR)) return;
    const novo = generoNeutro(no.data);
    if (novo !== no.data) no.data = novo;
    return;
  }
  if (no.nodeType !== 1 || no.closest?.(PULAR)) return;
  if (no.placeholder) { const p = generoNeutro(no.placeholder); if (p !== no.placeholder) no.placeholder = p; }
  const w = document.createTreeWalker(no, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) tratarNo(t);
  no.querySelectorAll?.('input[placeholder],textarea[placeholder]').forEach((el) => { const p = generoNeutro(el.placeholder); if (p !== el.placeholder) el.placeholder = p; });
}
export function ligarGeneroNeutro(raiz = document.body) {
  if (typeof MutationObserver === 'undefined' || !raiz) return;
  tratarNo(raiz);
  new MutationObserver((lista) => {
    for (const m of lista) {
      if (m.type === 'characterData') tratarNo(m.target);
      else m.addedNodes.forEach(tratarNo);
    }
  }).observe(raiz, { childList: true, subtree: true, characterData: true });
}
