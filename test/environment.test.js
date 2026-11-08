const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getEvolutionApiKey,
  getInstanceName,
  hasAllowedNumbersEnv,
  hasInstanceNameEnv,
  parseAllowedNumbers,
  resolveAllowedNumbers
} = require('../lib/environment');

test('reads the bot API key from environment and prefers the dedicated variable', () => {
  assert.equal(getEvolutionApiKey({ EVOLUTION_API_KEY: ' bot-key ', AUTHENTICATION_API_KEY: 'auth-key' }), 'bot-key');
  assert.equal(getEvolutionApiKey({ AUTHENTICATION_API_KEY: 'auth-key' }), 'auth-key');
  assert.equal(getEvolutionApiKey({}), '');
});

test('parses allowed senders from commas, semicolons, lines, and Arabic digits', () => {
  assert.deepEqual(parseAllowedNumbers('+966500000001, 201000000002\n٩٦٦٥٠٠٠٠٠٠٠٣'), [
    '966500000001',
    '201000000002',
    '966500000003'
  ]);
});

test('environment allowlist overrides stored values, including an explicit empty list', () => {
  const stored = { allowedNumbers: ['966500000001'] };
  assert.deepEqual(resolveAllowedNumbers(stored, { ALLOWED_NUMBERS: '201000000002' }), ['201000000002']);
  assert.deepEqual(resolveAllowedNumbers(stored, { ALLOWED_NUMBERS: '' }), []);
  assert.deepEqual(resolveAllowedNumbers(stored, {}), ['966500000001']);
  assert.equal(hasAllowedNumbersEnv({ ALLOWED_NUMBERS: '' }), true);
});

test('instance name comes from the environment, stored setting, or mezan_bot default', () => {
  assert.equal(getInstanceName({}, { INSTANCE_NAME: 'evolution_instance' }), 'evolution_instance');
  assert.equal(getInstanceName({ instanceName: 'saved_instance' }, {}), 'saved_instance');
  assert.equal(getInstanceName({}, {}), 'mezan_bot');
  assert.equal(hasInstanceNameEnv({ INSTANCE_NAME: 'mezan_bot' }), true);
  assert.equal(hasInstanceNameEnv({ INSTANCE_NAME: ' ' }), false);
});