import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/regras.js';
import { itensGuarda } from '../js/inicio-dados.js';

test('uso do armazenamento em % do plano', () => {
  assert.equal(R.usoArmazenamento({ limite_gb: 1, bytes: 0.8 * 1024 ** 3 }), 80);
  assert.equal(R.usoArmazenamento({ limite_gb: 100, bytes: 1024 ** 3 }), 1);
  assert.equal(R.usoArmazenamento(null), null);
  assert.equal(R.PARAMETROS_PADRAO.anos_guarda_documentos, 5);
});

test('Início: alerta de 80% e aviso 7 dias antes de apagar', () => {
  const agora = new Date('2026-10-24T12:00:00');
  const vazio = itensGuarda({ anos: 5, limite_gb: 1, bytes: 0.5 * 1024 ** 3, proximos: [] }, agora);
  assert.equal(vazio.fazer.length + vazio.prazos.length, 0);
  const r = itensGuarda({ anos: 5, limite_gb: 1, bytes: 0.85 * 1024 ** 3, proximos: [{ cliente_id: 'c1', nome: 'Ana', apagar_em: '2026-10-29T10:00:00' }] }, agora);
  assert.equal(r.fazer[0].tipo, 'armazenamento');
  assert.match(r.fazer[0].detalhe, /85%/);
  assert.equal(r.prazos[0].dias, 5);
  assert.match(r.prazos[0].titulo, /Ana/);
  assert.equal(r.prazos[0].href, '#/painel/clientes/c1');
  assert.deepEqual(itensGuarda(null), { fazer: [], prazos: [] });
});
