const { normalizeDigits, parseDecimal } = require('./decimal');

const PHONE_PATTERNS = [
  /(?:\+|00)\s*\d(?:[ \t().-]*\d){7,14}/g,
  /\b966[ \t()-]+\d{1,3}(?:[ \t()-]+\d{2,4}){2,3}\b/g
];

const CURRENCY_PATTERN = /(?:\bSAR\b|\bSR\b|ريال(?:\s+سعودي)?|ر\.?\s?س|﷼)/iu;
const QUANTITY_BEFORE_PATTERN = /(?:^|\s)(?:عدد|كمية|qty|quantity)\s*$/iu;
const QUANTITY_AFTER_PATTERN = /^(?:حبة|حبات|قطعة|قطع|كرتون|كراتين|علبة|علب|صندوق|صناديق|دستة|وحدة|وحدات)(?=\s|$|[،,.;:])/iu;
const NUMBER_PATTERN = /(?<![\p{L}\d])[+-]?\d+(?:\.\d+)?(?![\p{L}\d])/gu;
const LARGE_NUMBER_PATTERN = /(?<![\p{L}\d])\d{9,}(?![\p{L}\d])/g;

function maskPhones(text) {
  let masked = text;
  for (const pattern of PHONE_PATTERNS) {
    masked = masked.replace(pattern, (phone) => phone.replace(/[^\n]/g, ' '));
  }
  return masked;
}

function digitsIn(value) {
  return (value.match(/\d/g) || []).length;
}

function isNumericOnlyLine(line) {
  return line
    .replace(NUMBER_PATTERN, '')
    .replace(/[\s,،;:+()[\]{}-]/g, '')
    .length === 0;
}

function extractPriceCandidates(input) {
  const normalized = normalizeDigits(input).replace(/٫/g, '.');
  const maskedPhones = maskPhones(normalized);
  const longNumbers = maskedPhones.match(LARGE_NUMBER_PATTERN) || [];
  const text = maskedPhones.replace(LARGE_NUMBER_PATTERN, (number) => ' '.repeat(number.length));
  const accepted = [];
  const ambiguous = [];
  const ignored = [...longNumbers];

  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const value = match[0];
    const start = match.index;
    const end = start + value.length;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = text.indexOf('\n', end);
    const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
    const lineOffset = start - lineStart;
    const before = line.slice(0, lineOffset).trimEnd();
    const after = line.slice(lineOffset + value.length).trimStart();

    try {
      parseDecimal(value);
    } catch {
      ignored.push(value);
      continue;
    }

    if (digitsIn(value) >= 9 || LARGE_NUMBER_PATTERN.test(value)) {
      LARGE_NUMBER_PATTERN.lastIndex = 0;
      ignored.push(value);
      continue;
    }
    LARGE_NUMBER_PATTERN.lastIndex = 0;

    if (QUANTITY_BEFORE_PATTERN.test(before) || QUANTITY_AFTER_PATTERN.test(after)) {
      ignored.push(value);
      continue;
    }

    const currencyContext = `${line.slice(Math.max(0, lineOffset - 10), lineOffset)}${line.slice(lineOffset + value.length, lineOffset + value.length + 14)}`;
    if (CURRENCY_PATTERN.test(currencyContext) || isNumericOnlyLine(line)) {
      accepted.push(value);
    } else {
      ambiguous.push(value);
    }
  }

  return { accepted, ambiguous, ignored, hadNumericTokens: /\d/.test(normalized) };
}

module.exports = { extractPriceCandidates };