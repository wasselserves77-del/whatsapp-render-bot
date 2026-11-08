const { normalizeDigits } = require('./decimal');

function getEvolutionApiKey(env = process.env) {
  return String(env.EVOLUTION_API_KEY || env.AUTHENTICATION_API_KEY || '').trim();
}

function hasInstanceNameEnv(env = process.env) {
  return Boolean(String(env.INSTANCE_NAME || '').trim());
}

function getInstanceName(settings = {}, env = process.env) {
  return String(env.INSTANCE_NAME || settings.instanceName || 'mezan_bot').trim() || 'mezan_bot';
}

function hasAllowedNumbersEnv(env = process.env) {
  return Object.prototype.hasOwnProperty.call(env, 'ALLOWED_NUMBERS');
}

function parseAllowedNumbers(value) {
  return [...new Set(String(value || '')
    .split(/[\s,;]+/)
    .map((number) => normalizeDigits(number).replace(/\D/g, ''))
    .filter(Boolean))];
}

function resolveAllowedNumbers(settings, env = process.env) {
  if (hasAllowedNumbersEnv(env)) return parseAllowedNumbers(env.ALLOWED_NUMBERS);
  return Array.isArray(settings.allowedNumbers) ? settings.allowedNumbers : [];
}

module.exports = {
  getEvolutionApiKey,
  getInstanceName,
  hasAllowedNumbersEnv,
  hasInstanceNameEnv,
  parseAllowedNumbers,
  resolveAllowedNumbers
};