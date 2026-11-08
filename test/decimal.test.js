const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNumberList, sumDecimals } = require('../lib/decimal');

test('adds decimal values without floating-point rounding', () => {
  assert.equal(sumDecimals(['0.1', '0.2']), '0.3');
  assert.equal(sumDecimals(['1.005', '-0.005']), '1');
});

test('supports large integers, negative values, and Arabic digits', () => {
  assert.equal(sumDecimals(['999999999999999999999', '1']), '1000000000000000000000');
  assert.equal(sumDecimals(['١٢٫٥', '-2.25']), '10.25');
});

test('normalizes zero and trailing fractional zeros', () => {
  assert.equal(sumDecimals(['-0.00', '0']), '0');
  assert.equal(sumDecimals(['1.2300', '0']), '1.23');
});

test('parses a whitespace or comma separated WhatsApp message', () => {
  assert.deepEqual(parseNumberList('١٢٫٥, 3.25\n-1'), ['12.5', '3.25', '-1']);
});

test('rejects non-numeric and excessive input', () => {
  assert.throws(() => sumDecimals(['1', 'hello']));
  assert.throws(() => sumDecimals([]));
});