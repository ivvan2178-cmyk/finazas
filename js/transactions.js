/**
 * transactions.js — Gestión de transacciones (ingresos, gastos, transferencias)
 */
const Transactions = (() => {

  let _currentFilters = {
    type: 'all',
    month: Storage.getCurrentMonth(),
    account: 'all',
    category: 'all',
    search: ''
  };

  /* ─── Render lista de transacciones ─── */
  function render(filters) {
    if (filters) _currentFilters = { ..._currentFilters, ...filters };
    _renderFilters();
    _renderList();
  }

  function _renderFilters() {
    const f = _currentFilters;
    const monthEl = document.getElementById('filter-month');
    const typeEl = document.getElementById('filter-type');
    const accEl = document.getElementById('filter-account');
    const catEl = document.getElementById('filter-category');
    const searchEl = document.getElementById('filter-search');

    if (monthEl) monthEl.value = f.month;
    if (typeEl) typeEl.value = f.type;
    if (accEl) {
      const accounts = Storage.getAccounts();
      accEl.innerHTML = `<option value="all">Todas las cuentas</option>` +
        accounts.map(a => `<option value="${a.id}" ${a.id===f.account?'selected':''}>${a.name}</option>`).join('');
    }
    if (catEl) {
      const cats = [...Storage.getExpenseCategories(), ...Storage.getIncomeCategories()];
      catEl.innerHTML = `<option value="all">Todas las categorías</option>` +
        cats.map(c => `<option value="${c}" ${c===f.category?'selected':''}>${c}</option>`).join('');
    }
    if (searchEl) searchEl.value = f.search;
  }

  function _renderList() {
    const container = document.getElementById('transactions-list');
    if (!container) return;

    let txs = Storage.getTransactions();
    const f = _currentFilters;

    if (f.month && f.month !== 'all') txs = txs.filter(t => (t.date || '').startsWith(f.month));
    if (f.type !== 'all') txs = txs.filter(t => t.type === f.type);
    if (f.account !== 'all') txs = txs.filter(t => t.accountId === f.account || t.toAccountId === f.account);
    if (f.category !== 'all') txs = txs.filter(t => t.category === f.category);
    if (f.search) {
      const q = f.search.toLowerCase();
      txs = txs.filter(t => (t.description||'').toLowerCase().includes(q) || (t.nota||'').toLowerCase().includes(q));
    }

    txs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''));

    // Totals
    const totalIncome = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const totalExpense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    const totalTransfer = txs.filter(t=>t.type==='transfer').reduce((s,t)=>s+t.amount,0);

    const summary = document.getElementById('tx-summary');
    if (summary) {
      summary.innerHTML = `
        <div class="stat-pill income"><i class="fas fa-arrow-down"></i> ${Storage.formatCurrency(totalIncome)}</div>
        <div class="stat-pill expense"><i class="fas fa-arrow-up"></i> ${Storage.formatCurrency(totalExpense)}</div>
        <div class="stat-pill transfer"><i class="fas fa-arrows-left-right"></i> ${Storage.formatCurrency(totalTransfer)}</div>
        <div class="stat-pill neutral"><i class="fas fa-list"></i> ${txs.length} movimientos</div>
      `;
    }

    if (!txs.length) {
      container.innerHTML = `<div class="empty-state"><i class="fas fa-receipt"></i><p>No hay movimientos para este período.</p></div>`;
      return;
    }

    // Group by date
    const byDate = {};
    txs.forEach(t => {
      const d = t.date || 'Sin fecha';
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(t);
    });

    container.innerHTML = Object.entries(byDate)
      .map(([date, items]) => `
        <div class="tx-date-group">
          <div class="tx-date-label">${Storage.formatDate(date)}</div>
          ${items.map(t => _txItemHTML(t)).join('')}
        </div>`)
      .join('');
  }

  function _txItemHTML(t) {
    const accountName = Accounts.getName(t.accountId);
    const toAccountName = t.toAccountId ? Accounts.getName(t.toAccountId) : null;
    const icons = { income: 'fa-arrow-down', expense: 'fa-arrow-up', transfer: 'fa-arrows-left-right' };
    const colors = { income: 'var(--green)', expense: 'var(--red)', transfer: 'var(--blue)' };
    const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '';
    const amtClass = t.type === 'income' ? 'text-success' : t.type === 'expense' ? 'text-danger' : 'text-blue';

    return `
      <div class="tx-item" onclick="Transactions.openEditModal('${t.id}')">
        <div class="tx-icon" style="background:${colors[t.type]}22;color:${colors[t.type]}">
          <i class="fas ${icons[t.type]}"></i>
        </div>
        <div class="tx-info">
          <div class="tx-description">${_esc(t.description || Storage.typeLabel(t.type))}</div>
          <div class="tx-meta">
            <span class="tx-account"><i class="fas fa-wallet"></i> ${_esc(accountName)}</span>
            ${toAccountName ? `<span class="tx-account"><i class="fas fa-arrow-right"></i> ${_esc(toAccountName)}</span>` : ''}
            ${t.category ? `<span class="tx-category">${_esc(t.category)}</span>` : ''}
            ${t.installmentId ? `<span class="tx-badge">MSI</span>` : ''}
          </div>
          ${t.nota ? `<div class="tx-nota"><i class="fas fa-note-sticky"></i> ${_esc(t.nota)}</div>` : ''}
        </div>
        <div class="tx-amount ${amtClass}">${sign}${Storage.formatCurrency(t.amount)}</div>
        <button class="btn-icon btn-danger" onclick="event.stopPropagation();Transactions.deleteTransaction('${t.id}')" title="Eliminar">
          <i class="fas fa-trash"></i>
        </button>
      </div>`;
  }

  /* ─── Modal: Añadir transacción ─── */
  function openAddModal(defaultType) {
    const type = defaultType || 'expense';
    _renderModal(null, type);
  }

  function openEditModal(id) {
    const t = Storage.getTransactions().find(x => x.id === id);
    if (!t) return;
    _renderModal(t, t.type);
  }

  function _renderModal(t, activeType) {
    const isEdit = !!t;
    const title = isEdit ? 'Editar Movimiento' : 'Nuevo Movimiento';

    App.openModal(title, `
      <div class="tab-bar">
        <button id="tab-expense" class="tab-btn ${activeType==='expense'?'active':''}" onclick="Transactions._switchTab('expense')">
          <i class="fas fa-arrow-up"></i> Gasto
        </button>
        <button id="tab-income" class="tab-btn ${activeType==='income'?'active':''}" onclick="Transactions._switchTab('income')">
          <i class="fas fa-arrow-down"></i> Ingreso
        </button>
        <button id="tab-transfer" class="tab-btn ${activeType==='transfer'?'active':''}" onclick="Transactions._switchTab('transfer')">
          <i class="fas fa-arrows-left-right"></i> Transferencia
        </button>
      </div>
      <form id="tx-form" class="form-grid" style="margin-top:1.25rem">
        <input type="hidden" id="tx-type" value="${activeType}" />
        <input type="hidden" id="tx-id" value="${t ? t.id : ''}" />

        <div class="form-group">
          <label>Fecha</label>
          <input id="tx-date" type="date" class="form-input" value="${t ? t.date : Storage.getCurrentDate()}" required />
        </div>

        <div class="form-group">
          <label>Monto (MXN)</label>
          <input id="tx-amount" type="number" class="form-input" placeholder="0.00" value="${t ? t.amount : ''}" min="0.01" step="0.01" required />
        </div>

        <div class="form-group" id="tx-cat-group">
          <label>Categoría</label>
          <select id="tx-category" class="form-input">
            ${_buildCategoryOptions(activeType, t ? t.category : null)}
          </select>
        </div>

        <div class="form-group" id="tx-account-group">
          <label id="tx-account-label">${activeType==='transfer'?'Cuenta origen':'Cuenta'}</label>
          <select id="tx-account" class="form-input">
            ${Accounts.buildAllOptions(t ? t.accountId : '', '')}
          </select>
        </div>

        <div class="form-group" id="tx-toaccount-group" style="display:${activeType==='transfer'?'':'none'}">
          <label>Cuenta destino</label>
          <select id="tx-toaccount" class="form-input">
            ${Accounts.buildAllOptions(t ? t.toAccountId : '', '')}
          </select>
        </div>

        <div class="form-group" style="grid-column:1/-1">
          <label>Descripción</label>
          <input id="tx-description" type="text" class="form-input" placeholder="Ej. Super Walmart, Telmex..." value="${t ? _esc(t.description) : ''}" />
        </div>

        <div class="form-group" style="grid-column:1/-1">
          <label><i class="fas fa-note-sticky"></i> Nota</label>
          <textarea id="tx-nota" class="form-input" rows="2" placeholder="Nota adicional (opcional)...">${t ? _esc(t.nota) : ''}</textarea>
        </div>

        <div class="form-actions" style="grid-column:1/-1">
          <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">${isEdit ? 'Actualizar' : 'Guardar'}</button>
        </div>
      </form>
    `);

    document.getElementById('tx-form').addEventListener('submit', (e) => {
      e.preventDefault();
      _save();
    });
  }

  function _switchTab(type) {
    document.getElementById('tx-type').value = type;
    ['expense','income','transfer'].forEach(t => {
      document.getElementById(`tab-${t}`)?.classList.toggle('active', t === type);
    });
    // Update category options
    const catSel = document.getElementById('tx-category');
    if (catSel) catSel.innerHTML = _buildCategoryOptions(type, null);
    // Show/hide fields
    document.getElementById('tx-toaccount-group').style.display = type === 'transfer' ? '' : 'none';
    document.getElementById('tx-cat-group').style.display = type === 'transfer' ? 'none' : '';
    document.getElementById('tx-account-label').textContent = type === 'transfer' ? 'Cuenta origen' : 'Cuenta';
  }

  function _buildCategoryOptions(type, selected) {
    const cats = type === 'income' ? Storage.getIncomeCategories() : Storage.getExpenseCategories();
    return cats.map(c => `<option value="${c}" ${c===selected?'selected':''}>${c}</option>`).join('');
  }

  function _save() {
    const idVal = document.getElementById('tx-id').value;
    const type = document.getElementById('tx-type').value;
    const date = document.getElementById('tx-date').value;
    const amount = parseFloat(document.getElementById('tx-amount').value) || 0;
    const accountId = document.getElementById('tx-account').value;
    const toAccountId = type === 'transfer' ? document.getElementById('tx-toaccount').value : null;
    const category = type !== 'transfer' ? document.getElementById('tx-category').value : '';
    const description = document.getElementById('tx-description').value.trim();
    const nota = document.getElementById('tx-nota').value.trim();

    if (!date || !amount || !accountId) { App.toast('Completa los campos requeridos', 'error'); return; }
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      App.toast('Selecciona cuentas distintas para la transferencia', 'error'); return;
    }

    const accounts = Storage.getAccounts();
    const transactions = Storage.getTransactions();
    const txData = { type, date, amount, accountId, toAccountId, category, description, nota, installmentId: null };

    if (idVal) {
      // Edit: undo old effect first
      const old = transactions.find(x => x.id === idVal);
      if (old) _undoEffect(old, accounts);
      const idx = transactions.findIndex(x => x.id === idVal);
      if (idx > -1) transactions[idx] = { ...transactions[idx], ...txData };
    } else {
      txData.id = Storage.generateId();
      transactions.push(txData);
    }

    // Apply balance effect
    _applyEffect(txData, accounts);
    Storage.saveAccounts(accounts);
    Storage.saveTransactions(transactions);

    App.closeModal();
    App.toast(idVal ? 'Movimiento actualizado' : 'Movimiento guardado', 'success');
    _renderList();
    App.renderDashboard();
  }

  function _applyEffect(t, accounts) {
    const src = accounts.find(a => a.id === t.accountId);
    const dst = t.toAccountId ? accounts.find(a => a.id === t.toAccountId) : null;

    if (!src) return;
    if (t.type === 'income') {
      if (src.type === 'credit') src.balance -= t.amount; // paying credit with income
      else src.balance += t.amount;
    } else if (t.type === 'expense') {
      if (src.type === 'credit') src.balance += t.amount; // credit: increases debt
      else src.balance -= t.amount;
    } else if (t.type === 'transfer' && dst) {
      // Source loses money (or credit debt increases)
      if (src.type === 'credit') src.balance += t.amount;
      else src.balance -= t.amount;
      // Destination gains money (or credit debt decreases)
      if (dst.type === 'credit') dst.balance -= t.amount;
      else dst.balance += t.amount;
    }
  }

  function _undoEffect(t, accounts) {
    const src = accounts.find(a => a.id === t.accountId);
    const dst = t.toAccountId ? accounts.find(a => a.id === t.toAccountId) : null;

    if (!src) return;
    if (t.type === 'income') {
      if (src.type === 'credit') src.balance += t.amount;
      else src.balance -= t.amount;
    } else if (t.type === 'expense') {
      if (src.type === 'credit') src.balance -= t.amount;
      else src.balance += t.amount;
    } else if (t.type === 'transfer' && dst) {
      if (src.type === 'credit') src.balance -= t.amount;
      else src.balance += t.amount;
      if (dst.type === 'credit') dst.balance += t.amount;
      else dst.balance -= t.amount;
    }
  }

  function deleteTransaction(id) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    const transactions = Storage.getTransactions();
    const t = transactions.find(x => x.id === id);
    if (!t) return;
    const accounts = Storage.getAccounts();
    _undoEffect(t, accounts);
    Storage.saveAccounts(accounts);
    Storage.saveTransactions(transactions.filter(x => x.id !== id));
    App.toast('Movimiento eliminado', 'success');
    _renderList();
    App.renderDashboard();
  }

  /* ─── Recent transactions for dashboard ─── */
  function getRecent(n) {
    return Storage.getTransactions()
      .sort((a, b) => (b.date||'').localeCompare(a.date||'') || (b.id||'').localeCompare(a.id||''))
      .slice(0, n || 5);
  }

  function getForMonth(monthStr) {
    return Storage.getTransactions().filter(t => (t.date||'').startsWith(monthStr));
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  window.Transactions = {
    render, openAddModal, openEditModal, deleteTransaction,
    getRecent, getForMonth, _switchTab, _renderList
  };
  return window.Transactions;
})();
