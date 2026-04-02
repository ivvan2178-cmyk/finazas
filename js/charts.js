/**
 * charts.js — Gráficas con Chart.js
 */
const Charts = (() => {
  const _instances = {};

  const PALETTE = [
    '#7c3aed','#2563eb','#0891b2','#059669','#d97706',
    '#dc2626','#9333ea','#0284c7','#16a34a','#b45309','#64748b'
  ];

  function _destroy(id) {
    if (_instances[id]) {
      _instances[id].destroy();
      delete _instances[id];
    }
  }

  function renderExpenseDonut(canvasId, transactions) {
    _destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const expenses = transactions.filter(t => t.type === 'expense');
    if (!expenses.length) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin gastos este mes', canvas.width / 2, canvas.height / 2);
      return;
    }

    const catTotals = {};
    expenses.forEach(t => {
      const cat = t.category || 'Otros';
      catTotals[cat] = (catTotals[cat] || 0) + t.amount;
    });

    const labels = Object.keys(catTotals);
    const data = labels.map(l => catTotals[l]);

    _instances[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: PALETTE.slice(0, labels.length),
          borderColor: '#0d0d18',
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: '#94a3b8',
              font: { size: 11, family: 'Inter, sans-serif' },
              padding: 10,
              boxWidth: 12,
              boxHeight: 12
            }
          },
          tooltip: {
            backgroundColor: '#1a1a2e',
            titleColor: '#e2e8f0',
            bodyColor: '#94a3b8',
            borderColor: '#2a2a45',
            borderWidth: 1,
            callbacks: {
              label: (ctx) => ` ${Storage.formatCurrency(ctx.raw)}`
            }
          }
        }
      }
    });
  }

  function renderMonthlyBar(canvasId, allTransactions) {
    _destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Build last 6 months
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().slice(0, 7));
    }

    const incomeData = months.map(m => {
      return allTransactions
        .filter(t => t.type === 'income' && (t.date || '').startsWith(m))
        .reduce((s, t) => s + t.amount, 0);
    });

    const expenseData = months.map(m => {
      return allTransactions
        .filter(t => t.type === 'expense' && (t.date || '').startsWith(m))
        .reduce((s, t) => s + t.amount, 0);
    });

    const labels = months.map(m => {
      const [y, mo] = m.split('-');
      const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      return `${names[parseInt(mo)-1]} ${y.slice(2)}`;
    });

    _instances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Ingresos',
            data: incomeData,
            backgroundColor: 'rgba(20, 184, 166, 0.75)',
            borderColor: '#14b8a6',
            borderWidth: 1.5,
            borderRadius: 6,
            borderSkipped: false
          },
          {
            label: 'Gastos',
            data: expenseData,
            backgroundColor: 'rgba(239, 68, 68, 0.65)',
            borderColor: '#ef4444',
            borderWidth: 1.5,
            borderRadius: 6,
            borderSkipped: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#94a3b8',
              font: { size: 12, family: 'Inter, sans-serif' },
              padding: 16,
              boxWidth: 14,
              boxHeight: 14
            }
          },
          tooltip: {
            backgroundColor: '#1a1a2e',
            titleColor: '#e2e8f0',
            bodyColor: '#94a3b8',
            borderColor: '#2a2a45',
            borderWidth: 1,
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${Storage.formatCurrency(ctx.raw)}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#6b7280', font: { size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#6b7280',
              font: { size: 11 },
              callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v)
            }
          }
        }
      }
    });
  }

  function renderSavingsLine(canvasId, account, transactions) {
    _destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().slice(0, 7));
    }

    // Compute running balance per month
    let running = account.balance;
    const txSorted = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const balanceByMonth = {};
    // Start from current balance and go backwards
    const currentMonth = Storage.getCurrentMonth();
    balanceByMonth[currentMonth] = running;

    for (let i = 1; i < months.length; i++) {
      // Not implementing full reconstruction, just show static
      balanceByMonth[months[months.length - 1 - i]] = running;
    }

    const data = months.map(m => balanceByMonth[m] || 0);
    const labels = months.map(m => {
      const [y, mo] = m.split('-');
      const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      return `${names[parseInt(mo)-1]}`;
    });

    _instances[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: account.name,
          data,
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124, 58, 237, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#7c3aed',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#6b7280', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', font: { size: 11 }, callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v) } }
        }
      }
    });
  }

  function destroyAll() {
    Object.keys(_instances).forEach(_destroy);
  }

  return { renderExpenseDonut, renderMonthlyBar, renderSavingsLine, destroyAll };
})();
