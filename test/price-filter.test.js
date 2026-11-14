const test = require('node:test');
const assert = require('node:assert/strict');
const { extractPriceCandidates } = require('../lib/price-filter');

test('accepts standalone prices and excludes international phone numbers', () => {
  const result = extractPriceCandidates('+966 55 705 6628\n23\n14.50');
  assert.deepEqual(result.accepted, ['23', '14.50']);
  assert.deepEqual(result.ambiguous, []);
});

test('asks for confirmation for numbers embedded beside product text', () => {
  const result = extractPriceCandidates('1 خبز\n2 ميرندا برتقال');
  assert.deepEqual(result.accepted, []);
  assert.deepEqual(result.ambiguous, ['1', '2']);
});

test('accepts explicit currency prices and asks about quantity-like numbers', () => {
  const result = extractPriceCandidates('عدد 3 خبز\n16 ريال\n2 حبات');
  assert.deepEqual(result.accepted, ['16']);
  assert.deepEqual(result.ambiguous, ['3', '2']);
  assert.deepEqual(result.ignored, []);
});

test('accepts a comma-separated numeric-only list and filters long identifiers', () => {
  const result = extractPriceCandidates('14.50, 6، 9.5, 123456789012345');
  assert.deepEqual(result.accepted, ['14.50', '6', '9.5']);
  assert.deepEqual(result.ambiguous, []);
  assert.deepEqual(result.ignored, ['123456789012345']);
});

test('filters a product receipt like the provided chat examples', () => {
  const receipt = [
    '14.50\n6\n9.5\n11.50\n12.50\n12\n13\n27\n20',
    'طلب جديد\n103\nكرتون مويه ودبه وثلج واغراض واحد',
    '+966 55 705 6628\n23\n1 خبز',
    '16\n1 خبز',
    '+966 55 068 8275\n14\n2 ميرندا برتقال قزاز من السحاب',
    '+966 50 122 2344\n13'
  ].join('\n');
  const result = extractPriceCandidates(receipt);

  assert.deepEqual(result.accepted, [
    '14.50', '6', '9.5', '11.50', '12.50', '12', '13', '27', '13'
  ]);
  assert.deepEqual(result.ambiguous, ['20', '103', '23', '1', '16', '1', '14', '2']);
});