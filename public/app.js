const rowsContainer = document.querySelector('#number-rows');
const addRowButton = document.querySelector('#add-row');
const calculateButton = document.querySelector('#calculate');
const clearButton = document.querySelector('#clear-all');
const messageElement = document.querySelector('#form-message');
const resultElement = document.querySelector('#result');
const resultDetail = document.querySelector('#result-detail');
const historyList = document.querySelector('#history-list');
const emptyHistory = document.querySelector('#empty-history');
const arabicDigits = new Intl.NumberFormat('ar', { useGrouping: false });
const STORAGE_KEY = 'mizan-calculation-history-v1';
const MAX_ROWS = 200;

function readHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(stored) ? stored.slice(0, 20) : [];
  } catch {
    return [];
  }
}

let history = readHistory();

function addRow(value = '') {
  if (rowsContainer.children.length >= MAX_ROWS) return;
  const index = rowsContainer.children.length + 1;
  const row = document.createElement('label');
  row.className = 'number-row';
  row.innerHTML = `
    <span class="row-index">${String(index).padStart(2, '0')}</span>
    <span class="input-wrap">
      <span class="input-prefix" aria-hidden="true">#</span>
      <input class="number-input" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="العدد ${index}">
    </span>
    <button class="remove-row" type="button" aria-label="حذف الخانة ${index}" title="حذف الخانة">×</button>
  `;
  const input = row.querySelector('input');
  input.value = value;
  row.querySelector('.remove-row').addEventListener('click', () => {
    if (rowsContainer.children.length === 1) {
      input.value = '';
      input.focus();
      return;
    }
    row.remove();
    renumberRows();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      calculate();
    }
  });
  rowsContainer.append(row);
  renumberRows();
  if (value === '') input.focus();
}

function renumberRows() {
  const rows = [...rowsContainer.querySelectorAll('.number-row')];
  rows.forEach((row, index) => {
    const number = index + 1;
    row.querySelector('.row-index').textContent = String(number).padStart(2, '0');
    row.querySelector('input').setAttribute('aria-label', `العدد ${number}`);
    row.querySelector('.remove-row').setAttribute('aria-label', `حذف الخانة ${number}`);
  });
  document.querySelector('#entry-count').textContent = `${arabicDigits.format(rows.length)} خانات`;
}

function renderHistory() {
  historyList.replaceChildren();
  emptyHistory.hidden = history.length > 0;
  document.querySelector('#history-total').textContent = arabicDigits.format(history.length);
  history.forEach((operation) => {
    const item = document.createElement('li');
    item.className = 'history-item';
    const numbers = document.createElement('span');
    numbers.className = 'history-inputs';
    numbers.textContent = operation.values.join(' + ');
    const total = document.createElement('strong');
    total.className = 'history-result';
    total.textContent = operation.total;
    item.append(numbers, total);
    historyList.append(item);
  });
}

async function calculate() {
  const values = [...rowsContainer.querySelectorAll('input')]
    .map((input) => input.value.trim())
    .filter(Boolean);
  messageElement.textContent = '';
  if (values.length === 0) {
    messageElement.textContent = 'أدخل عددًا واحدًا على الأقل.';
    return;
  }

  calculateButton.disabled = true;
  calculateButton.querySelector('span').textContent = 'جارٍ الحساب';
  try {
    const response = await fetch('/api/sum', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'تعذر حساب المجموع.');

    resultElement.textContent = payload.total;
    resultElement.classList.remove('is-placeholder');
    resultDetail.textContent = `${arabicDigits.format(values.length)} أعداد في هذه العملية`;
    history.unshift({ values, total: payload.total, at: Date.now() });
    history = history.slice(0, 20);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    renderHistory();
  } catch (error) {
    messageElement.textContent = error.message || 'تعذر الاتصال بالخادم.';
  } finally {
    calculateButton.disabled = false;
    calculateButton.querySelector('span').textContent = 'احسب المجموع';
  }
}

function clearAll() {
  history = [];
  localStorage.removeItem(STORAGE_KEY);
  rowsContainer.replaceChildren();
  addRow();
  addRow();
  resultElement.textContent = '—';
  resultElement.classList.add('is-placeholder');
  resultDetail.textContent = 'أدخل الأعداد لبدء الحساب';
  messageElement.textContent = '';
  renderHistory();
}

addRowButton.addEventListener('click', () => addRow());
calculateButton.addEventListener('click', calculate);
clearButton.addEventListener('click', clearAll);
addRow();
addRow();
renderHistory();