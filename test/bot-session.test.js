const test = require('node:test');
const assert = require('node:assert/strict');
const { handleSessionMessage } = require('../lib/bot-session');

test('welcomes a sender and explains the session commands', () => {
  const sessions = new Map();
  const result = handleSessionMessage(sessions, '966500000001', 'مرحبا');

  assert.equal(result.action, 'started');
  assert.match(result.reply, /mezan_ ميزان/);
  assert.match(result.reply, /الأمر \*oslo\*/);
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
  assert.ok(result.reply.startsWith('\u200f'));
  assert.match(result.reply, /\*〔 1\.55 〕\*/);
  assert.match(result.reply, /mezan_ ميزان/);
  assert.match(result.reply, /oslo_d/);
});

test('accepts the requested oslo command and the earlier olso spelling', () => {
  const sessions = new Map();
  handleSessionMessage(sessions, '966500000001', '5');
  assert.equal(handleSessionMessage(sessions, '966500000001', 'OSLO').total, '5');
  assert.equal(handleSessionMessage(sessions, '966500000001', 'olso').total, '5');
});

test('supports separate rows and standalone prices in the initial message', () => {
  const sessions = new Map();
  const result = handleSessionMessage(sessions, '966500000001', '1\n2.5، 3');

  assert.equal(result.action, 'started-with-prices');
  assert.deepEqual(sessions.get('966500000001').values, ['1', '2.5', '3']);
  assert.equal(handleSessionMessage(sessions, '966500000001', 'olso').total, '6.5');
});

test('stores clear prices, asks about a product-adjacent number, and skips it on request', () => {
  const sessions = new Map();
  handleSessionMessage(sessions, '966500000001', 'ابدأ');

  const receipt = handleSessionMessage(sessions, '966500000001', '+966 55 705 6628\n23\n1 خبز');
  assert.equal(receipt.action, 'confirmation-required');
    assert.deepEqual(sessions.get('966500000001').values, []);
    assert.deepEqual(sessions.get('966500000001').pending.map(({ value }) => value), ['23', '1']);
    assert.match(receipt.reply, /هل أعتمد الرقم \*〔 23 〕\* كسعر/);

    const morePrices = handleSessionMessage(sessions, '966500000001', '12.5\n27');
    assert.equal(morePrices.reply, null);
    assert.deepEqual(sessions.get('966500000001').values, ['12.5', '27']);

    const blockedSum = handleSessionMessage(sessions, '966500000001', 'oslo');
    assert.equal(blockedSum.action, 'confirmation-required');
    assert.match(blockedSum.reply, /لا يمكن إكمال الجمع/);
    assert.doesNotMatch(blockedSum.reply, /أحتاج تأكيدك/);

    const skipped = handleSessionMessage(sessions, '966500000001', 'تخطي');
    assert.equal(skipped.action, 'price-skipped');
    assert.match(skipped.reply, /هل أعتمد الرقم \*〔 1 〕\* كسعر/);
    assert.equal(handleSessionMessage(sessions, '966500000001', '14').reply, null);
    assert.equal(handleSessionMessage(sessions, '966500000001', 'اعتمد').action, 'price-confirmed');
    assert.equal(handleSessionMessage(sessions, '966500000001', 'oslo').total, '54.5');
});

test('requires a decision for an ambiguous number before summing', () => {
  const sessions = new Map();
  handleSessionMessage(sessions, '966500000001', '14');
  handleSessionMessage(sessions, '966500000001', '1 خبز');

    const blockedSum = handleSessionMessage(sessions, '966500000001', 'oslo');
    assert.equal(blockedSum.action, 'confirmation-required');
    assert.match(blockedSum.reply, /اعتمد/);
    assert.equal(handleSessionMessage(sessions, '966500000001', 'اعتمد').action, 'price-confirmed');
    assert.equal(handleSessionMessage(sessions, '966500000001', 'oslo').total, '15');
});

  test('does not repeat a confirmation when text and more numbers arrive before a decision', () => {
    const sessions = new Map();
    const firstPrompt = handleSessionMessage(sessions, '966500000001', '1 خبز');
    assert.equal(firstPrompt.action, 'confirmation-required');

    assert.equal(handleSessionMessage(sessions, '966500000001', 'طلب جديد').reply, null);
    assert.equal(handleSessionMessage(sessions, '966500000001', '2 كرتون').reply, null);
    assert.deepEqual(sessions.get('966500000001').pending.map(({ value }) => value), ['1', '2']);

    const blockedSum = handleSessionMessage(sessions, '966500000001', 'oslo');
    assert.match(blockedSum.reply, /لا يمكن إكمال الجمع/);
    assert.doesNotMatch(blockedSum.reply, /هل أعتمد الرقم/);

    const firstDecision = handleSessionMessage(sessions, '966500000001', 'تخطي');
    assert.match(firstDecision.reply, /هل أعتمد الرقم \*〔 2 〕\* كسعر/);
    assert.equal(handleSessionMessage(sessions, '966500000001', 'اعتمد').action, 'price-confirmed');
    assert.equal(handleSessionMessage(sessions, '966500000001', 'oslo').total, '2');
  });

test('clearing a session also discards unresolved candidates', () => {
  const sessions = new Map();
  handleSessionMessage(sessions, '966500000001', '1 خبز');

  handleSessionMessage(sessions, '966500000001', 'oslo_d');
  assert.deepEqual(sessions.get('966500000001').values, []);
  assert.deepEqual(sessions.get('966500000001').pending, []);
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