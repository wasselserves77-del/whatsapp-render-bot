const test = require('node:test');
const assert = require('node:assert/strict');
const { SESSION_TTL_MS, clearSessionTimer, scheduleSessionExpiry } = require('../lib/session-expiry');

test('expires a sender session after six hours and notifies once', async () => {
  const sender = '966500000001';
  const session = { values: ['12.5'], pending: [{ value: '1', prompted: true }] };
  const sessions = new Map([[sender, session]]);
  let expireCallback;
  let notifiedSender;
  let scheduledDelay;
  const timer = { unref() {} };

  assert.equal(scheduleSessionExpiry(sessions, sender, async (value) => { notifiedSender = value; }, {
    setTimeoutFn(callback, delay) {
      expireCallback = callback;
      scheduledDelay = delay;
      return timer;
    }
  }), true);

  assert.equal(scheduledDelay, SESSION_TTL_MS);
  await expireCallback();
  assert.equal(notifiedSender, sender);
  assert.equal(sessions.has(sender), false);
  assert.deepEqual(session.values, []);
  assert.deepEqual(session.pending, []);
});

test('resets the six-hour inactivity timer and allows manual clear to cancel it', () => {
  const sender = '966500000001';
  const session = { values: ['5'], pending: [], expiryTimer: null };
  const sessions = new Map([[sender, session]]);
  let scheduled = 0;
  const timers = [];
  const cleared = [];
  const options = {
    setTimeoutFn() {
      scheduled += 1;
      const timer = { unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn(value) { cleared.push(value); }
  };

  assert.equal(scheduleSessionExpiry(sessions, sender, () => {}, options), true);
  assert.equal(scheduleSessionExpiry(sessions, sender, () => {}, options), true);
  clearSessionTimer(session, options.clearTimeoutFn);
  assert.equal(scheduled, 2);
  assert.deepEqual(cleared, [timers[0], timers[1]]);
  assert.equal(session.expiryTimer, null);
});

test('does not schedule an expiry for a session with no values or pending decisions', () => {
  const sender = '966500000001';
  const sessions = new Map([[sender, { values: [], pending: [] }]]);
  assert.equal(scheduleSessionExpiry(sessions, sender, () => {}, { setTimeoutFn() { throw new Error('unexpected timer'); } }), false);
});