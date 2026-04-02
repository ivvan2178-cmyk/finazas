/**
 * budget.js — Módulo de Presupuesto mensual por categoría
 */
const Budget = (() => {
  let _currentMonth = Storage.getCurrentMonth();

  /* ─── Render principal ─── */
  function render() {
    const container = document.getElementById('budget-content');
    if (!container) return;

    const budgets = Storage.getBudgetForMonth(_currentMonth);
    const expenseCats = Storage.getExpenseCategories();
    const txs = Storage.getTransactions().filter(t =>
      t.type === 'expense' && (t.date || '').startsWith(_currentMonth)
    );

    // Gasto por categoría
    const spent = {};
    txs.forEach(t => {
      spent[t.category] = (spent[t.category] || 0) + t.amount;
    });

    // Totales
    const totalBudgeted = Object.values(budgets).reduce((s, v) => s + v, 0);
    const totalSpent = txs.reduce((s, t) => s + t.amount, 0);
    const totalRemaining = totalBudgeted - totalSpent;

    // Selector de mes (6 meses atrás + 3 adelante)
    const months = [];
    for (let i = -5; i <= 3; i++) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() + i);
      months.push(d.toISOString().slice(0, 7));
    }

    // Categorías con presupuesto primero, luego el resto
    const withBudget  = expenseCats.filter(c => budgets[c] > 0);
    const noBudget    = expenseCats.filter(c => !(budgets[c] > 0));
    const orderedCats = [...withBudget, ...noBudget];

    container.innerHTML = `
      <!-- Controles -->
      <div class="budget-controls">
        <div class="form-group">
          <label style="font-size:.72rem">Mes</label>
          <select id="budget-month-select" class="form-input" onchange="Budget._onMonthChange(this.value)">
            ${months.map(m =>
              `<option value="${m}" ${m === _currentMonth ? 'selected' : ''}>${Storage.formatMonth(m)}</option>`
            ).join('')}
          </select>
        </div>
        <button class="btn btn-primary" onclick="Budget.openConfigModal()">
          <i class="fas fa-sliders"></i> Configurar límites
        </button>
      </div>

      <!-- Resumen totales -->
      <div class="budget-summary">
        <div class="budget-summary-card">
          <div class="budget-summary-label"><i class="fas fa-bullseye"></i> Presupuestado</div>
          <div class="budget-summary-value">${Storage.formatCurrency(totalBudgeted)}</div>
        </div>
        <div class="budget-summary-card danger">
          <div class="budget-summary-label"><i class="fas fa-arrow-up"></i> Gastado</div>
          <div class="budget-summary-value text-danger">${Storage.formatCurrency(totalSpent)}</div>
        </div>
        <div class="budget-summary-card ${totalRemaining >= 0 ? 'success' : 'danger'}">
          <div class="budget-summary-label"><i class="fas fa-wallet"></i> ${totalRemaining >= 0 ? 'Disponible' : 'Excedido'}</div>
          <div class="budget-summary-value ${totalRemaining >= 0 ? 'text-success' : 'text-danger'}">${Storage.formatCurrency(Math.abs(totalRemaining))}</div>
        </div>
      </div>

      <!-- Tarjetas por categoría -->
      ${withBudget.length === 0 && noBudget.length === 0 ? '' : `
        ${withBudget.length > 0 ? `<h3 class="section-subtitle">Con límite establecido</h3>` : ''}
      `}
      <div class="budget-grid">
        ${orderedCats.map(cat => _budgetCard(cat, budgets[cat] || 0, spent[cat] || 0)).join('')}
      </div>

      ${totalBudgeted === 0 ? `
        <div class="budget-hint">
          <i class="fas fa-lightbulb"></i>
          <div>
            <strong>Configura tu presupuesto</strong>
            <p>Haz clic en "Configurar límites" para establecer cuánto quieres gastar en cada categoría este mes.</p>
          </div>
        </div>
      ` : ''}
    `;
  }

  function _budgetCard(category, limit, spent) {
    const hasLimit = limit > 0;
    const pct = hasLimit ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
    const remaining = limit - spent;
    const barColor = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--yellow)' : 'var(--green)';
    const statusIcon = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : (hasLimit ? '🟢' : '⚪');

    return `
      <div class="budget-card ${pct >= 100 ? 'over' : pct >= 80 ? 'warn' : hasLimit ? 'ok' : 'no-limit'}">
        <div class="budget-card-top">
          <span class="budget-cat-icon">${statusIcon}</span>
          <span class="budget-cat-name">${_esc(category)}</span>
          ${hasLimit
            ? `<span class="budget-limit-badge">${Storage.formatCurrency(limit)}/mes</span>`
            : `<span class="budget-no-limit">Sin límite</span>`}
        </div>

        <div class="budget-bar-wrap">
          <div class="budget-bar">
            <div class="budget-bar-fill" style="width:${hasLimit ? pct : 0}%;background:${barColor}"></div>
          </div>
          ${hasLimit ? `<span class="budget-pct" style="color:${barColor}">${pct}%</span>` : ''}
        </div>

        <div class="budget-amounts">
          <div>
            <span class="budget-label">Gastado</span>
            <span class="budget-val text-danger">${Storage.formatCurrency(spent)}</span>
          </div>
          ${hasLimit ? `
          <div>
            <span class="budget-label">${remaining >= 0 ? 'Restante' : 'Excedido'}</span>
            <span class="budget-val ${remaining >= 0 ? 'text-success' : 'text-danger'}">${Storage.formatCurrency(Math.abs(remaining))}</span>
          </div>` : ''}
        </div>
      </div>`;
  }

  /* ─── Modal: Configurar límites ─── */
  function openConfigModal() {
    const budgets = Storage.getBudgetForMonth(_currentMonth);
    const expenseCats = Storage.getExpenseCategories();

    App.openModal(`Límites — ${Storage.formatMonth(_currentMonth)}`, `
      <p style="color:var(--text-muted);font-size:.83rem;margin-bottom:1.25rem;line-height:1.6">
        Establece el monto máximo mensual para cada categoría. Deja en blanco para no establecer límite.
      </p>
      <div class="form-grid" style="max-height:420px;overflow-y:auto;padding-right:.25rem">
        ${expenseCats.map(cat => `
          <div class="form-group">
            <label>${_esc(cat)}</label>
            <input type="number" class="form-input budget-limit-input"
              data-cat="${_esc(cat)}"
              value="${budgets[cat] || ''}"
              placeholder="Sin límite"
              min="0" step="0.01" />
          </div>
        `).join('')}
      </div>
      <div class="form-actions" style="margin-top:1.25rem">
        <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button type="button" class="btn btn-primary" onclick="Budget._saveLimits()">
          <i class="fas fa-check"></i> Guardar presupuesto
        </button>
      </div>
    `);
  }

  function _saveLimits() {
    const inputs = document.querySelectorAll('.budget-limit-input');
    const limits = {};
    inputs.forEach(inp => {
      const val = parseFloat(inp.value);
      if (!isNaN(val) && val > 0) limits[inp.dataset.cat] = val;
    });
    Storage.saveBudgetForMonth(_currentMonth, limits);
    App.closeModal();
    App.toast('Presupuesto guardado', 'success');
    render();
    App.renderDashboard && App.renderDashboard();
  }

  function _onMonthChange(month) {
    _currentMonth = month;
    render();
  }

  function getAlerts() {
    // For dashboard: categories close to or over budget
    const budgets = Storage.getBudgetForMonth(Storage.getCurrentMonth());
    const txs = Storage.getTransactions().filter(t =>
      t.type === 'expense' && (t.date || '').startsWith(Storage.getCurrentMonth())
    );
    const spent = {};
    txs.forEach(t => { spent[t.category] = (spent[t.category] || 0) + t.amount; });

    return Object.entries(budgets)
      .map(([cat, limit]) => ({ cat, limit, spent: spent[cat] || 0, pct: Math.round(((spent[cat] || 0) / limit) * 100) }))
      .filter(b => b.pct >= 80)
      .sort((a, b) => b.pct - a.pct);
  }

  function _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.Budget = { render, openConfigModal, _onMonthChange, _saveLimits, getAlerts };
  return window.Budget;
})();
