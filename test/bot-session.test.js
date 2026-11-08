const test = require('node:test');
const assert = require('node:assert/strict');
const { handleSessionMessage } = require('../lib/bot-session');

test('welcomes a sender and explains the session commands', () => {
  const sessions = new Map();
  const result = handleSessionMessage(sessions, '966500000001', 'مرحبا');

  assert.equal(result.action, 'started');
  assert.match(result.reply, /olso/);
  assert.match(result.reply, /oslo_d/);
  assert.deepEqual(sessions.get('966500000001').values, []);
});

test('silently accumulates numbers from separate messages until olso', () => {
  const sessions = new Map();
  handleSessionMessage(sessions, '966500000001', 'ابدأ');

  assert.equal(handleSessionMessage(sessions, '966500000001', '0.1, 0.2').reply, null);
  assert.equal(handleSessionMessage(sessions, '966500000001', '١٫٢٥').reply, null);

  const result = handleSessionMessage(sessions, '966500000001', 'olso');
  assert.equal(result.total, '1.55');
  assert.match(result.reply, /oslo_d/);
});

test('supports separate rows and numbers in the initial message', () => {
  const sessions = new Map();
  const result = handleSessionMessage(sessions, '966500000001', '1\n2.5، 3');

  assert.equal(result.action, 'started-with-values');
  assert.deepEqual(sessions.get('966500000001').values, ['1', '2.5', '3']);
  assert.equal(handleSessionMessage(sessions, '966500000001', 'olso').total, '6.5');
});

test('oslo_d clears only the requesting sender session', () => {
  const sessions = new Map();
  handleSessionMessage(sessions, '966500000001', '1');
  handleSessionMessage(sessions, '966500000002', '2');

  const result = handleSessionMessage(sessions, '966500000001', 'OSLO_D');
  assert.equal(result.action, 'cleared');
  assert.deepEqual(sessions.get('966500000001').values, []);
  assert.deepEqual(sessions.get('966500000002').values, ['2']);
});

test('repeating olso keeps values until the user clears the session', () => {
  const sessions = new Map();
  handleSessionMessage(sessions, '966500000001', '4.125');

  assert.equal(handleSessionMessage(sessions, '966500000001', 'olso').total, '4.125');
  assert.equal(handleSessionMessage(sessions, '966500000001', 'olso').total, '4.125');
});