const { normalizeDigits } = require('./decimal');

function getEvolutionApiKey(env = process.env) {
  return String(env.EVOLUTION_API_KEY || env.AUTHENTICATION_API_KEY || '').trim();
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

module.exports = { getEvolutionApiKey, hasAllowedNumbersEnv, parseAllowedNumbers, resolveAllowedNumbers };