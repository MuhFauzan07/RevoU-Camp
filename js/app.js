/* =====================================================
   EXPENSE & BUDGET VISUALIZER — app.js
   Vanilla JS · LocalStorage · Chart.js
   ===================================================== */

'use strict';

/* ─── Storage keys ───────────────────────────────────── */
const KEY_TX    = 'ebv_transactions';
const KEY_THEME = 'ebv_theme';

/* ─── Categories ─────────────────────────────────────── */
const CATEGORIES = [
  { value: 'Food',      label: 'Food',      color: '#2ecc71' },
  { value: 'Transport', label: 'Transport',  color: '#3498db' },
  { value: 'Fun',       label: 'Fun',        color: '#e67e22' },
];

/* ─── State ──────────────────────────────────────────── */
let transactions  = [];
let chartInstance = null;
let viewMonth     = null; // { year, month }

/* ─── DOM refs ───────────────────────────────────────── */
const form           = document.getElementById('transactionForm');
const itemNameInput  = document.getElementById('itemName');
const amountInput    = document.getElementById('amount');
const categorySelect = document.getElementById('category');
const totalBalanceEl = document.getElementById('totalBalance');
const txList         = document.getElementById('transactionList');
const listEmptyMsg   = document.getElementById('listEmptyMsg');
const chartCanvas    = document.getElementById('spendingChart');
const chartEmptyMsg  = document.getElementById('chartEmptyMsg');
const sortSelect     = document.getElementById('sortSelect');
const prevMonthBtn   = document.getElementById('prevMonth');
const nextMonthBtn   = document.getElementById('nextMonth');
const monthLabel     = document.getElementById('currentMonthLabel');
const summaryContent = document.getElementById('monthlySummaryContent');
const nameError      = document.getElementById('nameError');
const amountError    = document.getElementById('amountError');
const categoryError  = document.getElementById('categoryError');
const themeToggleBtn = document.getElementById('themeToggle');

/* ─── Theme ──────────────────────────────────────────── */

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark');
    themeToggleBtn.textContent = '☀️';
    themeToggleBtn.setAttribute('aria-label', 'Switch to light mode');
  } else {
    document.body.classList.remove('dark');
    themeToggleBtn.textContent = '🌙';
    themeToggleBtn.setAttribute('aria-label', 'Switch to dark mode');
  }
  // Redraw chart so legend text colour updates
  if (chartInstance) {
    const isDark = theme === 'dark';
    chartInstance.options.plugins.legend.labels.color = isDark ? '#e2e8f0' : '#222';
    chartInstance.data.datasets[0].borderColor = isDark ? '#1a1d27' : '#fff';
    chartInstance.update();
  }
}

themeToggleBtn.addEventListener('click', () => {
  const isDark = document.body.classList.contains('dark');
  const next   = isDark ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(KEY_THEME, next);
});

/* ─── Helpers ────────────────────────────────────────── */

function formatMoney(n) {
  return '$' + Number(n).toFixed(2);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getCatColor(value) {
  const cat = CATEGORIES.find(c => c.value === value);
  return cat ? cat.color : '#95a5a6';
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ─── LocalStorage ───────────────────────────────────── */

function saveTx() {
  localStorage.setItem(KEY_TX, JSON.stringify(transactions));
}

function loadAll() {
  const raw = localStorage.getItem(KEY_TX);
  transactions = raw ? JSON.parse(raw) : [];
}

/* ─── Validation ─────────────────────────────────────── */

function clearErrors() {
  [nameError, amountError, categoryError].forEach(e => { e.textContent = ''; });
  [itemNameInput, amountInput, categorySelect].forEach(e => e.classList.remove('invalid'));
}

function validate() {
  let ok = true;
  clearErrors();

  if (!itemNameInput.value.trim()) {
    nameError.textContent = 'Item name is required.';
    itemNameInput.classList.add('invalid');
    ok = false;
  }
  const amt = parseFloat(amountInput.value);
  if (!amountInput.value || isNaN(amt) || amt <= 0) {
    amountError.textContent = 'Enter a valid amount greater than 0.';
    amountInput.classList.add('invalid');
    ok = false;
  }
  if (!categorySelect.value) {
    categoryError.textContent = 'Please select a category.';
    categorySelect.classList.add('invalid');
    ok = false;
  }
  return ok;
}

/* ─── Add transaction ────────────────────────────────── */

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!validate()) return;

  transactions.push({
    id:       uid(),
    name:     itemNameInput.value.trim(),
    amount:   parseFloat(parseFloat(amountInput.value).toFixed(2)),
    category: categorySelect.value,
    date:     todayStr(),
  });
  saveTx();

  form.reset();
  clearErrors();
  renderAll();
});

/* ─── Delete ─────────────────────────────────────────── */

function deleteTx(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveTx();
  renderAll();
}

/* ─── Sort ───────────────────────────────────────────── */

function sorted() {
  const arr = [...transactions];
  switch (sortSelect.value) {
    case 'date-asc':     return arr.sort((a, b) => a.date.localeCompare(b.date));
    case 'amount-desc':  return arr.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':   return arr.sort((a, b) => a.amount - b.amount);
    case 'category-asc': return arr.sort((a, b) => a.category.localeCompare(b.category));
    default:             return arr.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }
}

sortSelect.addEventListener('change', renderTxList);

/* ─── Render: balance ────────────────────────────────── */

function renderBalance() {
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  totalBalanceEl.textContent = formatMoney(total);
}

/* ─── Render: transaction list ───────────────────────── */

function renderTxList() {
  txList.innerHTML = '';
  const list = sorted();

  if (!list.length) {
    listEmptyMsg.style.display = 'block';
    return;
  }
  listEmptyMsg.style.display = 'none';

  list.forEach(tx => {
    const li = document.createElement('li');
    li.className = 'transaction-item';
    li.innerHTML = `
      <div class="tx-info">
        <p class="tx-name">${escHtml(tx.name)}</p>
        <p class="tx-amount">${formatMoney(tx.amount)}</p>
        <span class="tx-category">${escHtml(tx.category)}</span>
      </div>
      <button class="btn-delete" aria-label="Delete ${escHtml(tx.name)}">Delete</button>
    `;
    li.querySelector('.btn-delete').addEventListener('click', () => deleteTx(tx.id));
    txList.appendChild(li);
  });
}

/* ─── Render: chart ──────────────────────────────────── */

function renderChart() {
  const totals = {};
  transactions.forEach(tx => {
    totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
  });
  const labels = Object.keys(totals);
  const data   = Object.values(totals);

  if (!labels.length) {
    chartEmptyMsg.style.display = 'block';
    chartCanvas.style.display   = 'none';
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }
  chartEmptyMsg.style.display = 'none';
  chartCanvas.style.display   = 'block';

  const colors = labels.map(getCatColor);

  if (chartInstance) {
    chartInstance.data.labels                      = labels;
    chartInstance.data.datasets[0].data            = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.update();
    return;
  }

  chartInstance = new Chart(chartCanvas, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: document.body.classList.contains('dark') ? '#1a1d27' : '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: document.body.classList.contains('dark') ? '#e2e8f0' : '#222',
            padding: 14,
            font: { size: 12 },
            usePointStyle: true,
            pointStyle: 'rect',
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = data.reduce((a, b) => a + b, 0);
              const pct   = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${formatMoney(ctx.parsed)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* ─── Monthly summary ────────────────────────────────── */

function initViewMonth() {
  const n = new Date();
  viewMonth = { year: n.getFullYear(), month: n.getMonth() };
}

prevMonthBtn.addEventListener('click', () => {
  let { year, month } = viewMonth;
  month--;
  if (month < 0) { month = 11; year--; }
  viewMonth = { year, month };
  renderSummary();
});

nextMonthBtn.addEventListener('click', () => {
  let { year, month } = viewMonth;
  month++;
  if (month > 11) { month = 0; year++; }
  viewMonth = { year, month };
  renderSummary();
});

function renderSummary() {
  const { year, month } = viewMonth;
  monthLabel.textContent = new Date(year, month, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const mTx    = transactions.filter(t => t.date.startsWith(prefix));
  summaryContent.innerHTML = '';

  if (!mTx.length) {
    summaryContent.innerHTML = '<p class="summary-empty">No transactions this month.</p>';
    return;
  }

  const monthTotal = mTx.reduce((s, t) => s + t.amount, 0);
  summaryContent.appendChild(makeSummaryTile('Total', monthTotal, mTx.length, '#3b9fe8'));

  const totals = {};
  mTx.forEach(tx => { totals[tx.category] = (totals[tx.category] || 0) + tx.amount; });
  Object.entries(totals).forEach(([cat, amt]) => {
    const count = mTx.filter(t => t.category === cat).length;
    summaryContent.appendChild(makeSummaryTile(cat, amt, count, getCatColor(cat)));
  });
}

function makeSummaryTile(label, amount, count, color) {
  const div = document.createElement('div');
  div.className = 'summary-item';
  div.innerHTML = `
    <p class="summary-item-cat" style="color:${color}">${escHtml(label)}</p>
    <p class="summary-item-amount">${formatMoney(amount)}</p>
    <p class="summary-item-count">${count} item${count !== 1 ? 's' : ''}</p>
  `;
  return div;
}

/* ─── Render all ─────────────────────────────────────── */

function renderAll() {
  renderBalance();
  renderTxList();
  renderChart();
  renderSummary();
}

/* ─── Init ───────────────────────────────────────────── */
(function init() {
  // Apply saved theme before rendering to avoid flash
  const savedTheme = localStorage.getItem(KEY_THEME) || 'light';
  applyTheme(savedTheme);

  loadAll();
  initViewMonth();
  renderAll();
})();
