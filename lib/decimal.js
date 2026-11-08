const DIGIT_MAP = new Map([
  ...Array.from('٠١٢٣٤٥٦٧٨٩', (digit, index) => [digit, String(index)]),
  ...Array.from('۰۱۲۳۴۵۶۷۸۹', (digit, index) => [digit, String(index)])
]);

function normalizeDigits(value) {
  return String(value)
    .replace(/[٠-٩۰-۹]/g, (digit) => DIGIT_MAP.get(digit))
    .replace(/٫/g, '.')
    .replace(/[−﹣－]/g, '-');
}

function parseDecimal(value) {
  const normalized = normalizeDigits(value).trim();
  if (normalized.length === 0 || normalized.length > 256) {
    throw new Error('أدخل رقمًا صالحًا لا يتجاوز 256 خانة.');
  }

  const match = normalized.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/);
  if (!match) {
    throw new Error('استخدم أرقامًا صحيحة أو عشرية، واجعل النقطة فاصل الكسور.');
  }

  const fraction = match[3] ?? match[4] ?? '';
  const whole = match[2] ?? '0';
  const sign = match[1] === '-' ? -1n : 1n;
  const coefficient = BigInt(`${whole}${fraction}` || '0') * sign;
  return { coefficient, scale: fraction.length };
}

function formatDecimal(coefficient, scale) {
  if (coefficient === 0n) return '0';

  const negative = coefficient < 0n;
  let digits = (negative ? -coefficient : coefficient).toString();
  if (scale > 0) {
    digits = digits.padStart(scale + 1, '0');
    const splitAt = digits.length - scale;
    digits = `${digits.slice(0, splitAt)}.${digits.slice(splitAt)}`;
    digits = digits.replace(/0+$/, '').replace(/\.$/, '');
  }

  return `${negative ? '-' : ''}${digits}`;
}

function sumDecimals(values) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 200) {
    throw new Error('أدخل رقمًا واحدًا على الأقل، وبحد أقصى 200 رقم.');
  }

  const parsed = values.map(parseDecimal);
  const scale = Math.max(...parsed.map((value) => value.scale));
  const coefficient = parsed.reduce((total, value) => {
    return total + value.coefficient * 10n ** BigInt(scale - value.scale);
  }, 0n);

  return formatDecimal(coefficient, scale);
}

function parseNumberList(text) {
  const normalized = normalizeDigits(text).replace(/٫/g, '.');
  const values = normalized.trim().split(/[\s,،;]+/).filter(Boolean);
  return values.map((value) => {
    parseDecimal(value);
    return value;
  });
}

module.exports = { normalizeDigits, parseDecimal, parseNumberList, sumDecimals };