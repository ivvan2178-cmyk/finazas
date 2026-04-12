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

    let txs = Storage.getTransactions().filter(t => !t.skipBudget || t.isDebt || t.isLoan || t.isLoanPayment || t.isInternalAbono);
    const f = _currentFilters;

    if (f.month && f.month !== 'all') txs = txs.filter(t => (t.date || '').startsWith(f.month));
    if (f.type === 'loan') txs = txs.filter(t => t.isLoan || t.isLoanPayment);
    else if (f.type !== 'all') txs = txs.filter(t => t.type === f.type);
    if (f.account !== 'all') txs = txs.filter(t => t.accountId === f.account || t.toAccountId === f.account);
    if (f.category !== 'all') txs = txs.filter(t => t.category === f.category);
    if (f.search) {
      const q = f.search.toLowerCase();
      txs = txs.filter(t => (t.description||'').toLowerCase().includes(q) || (t.nota||'').toLowerCase().includes(q));
    }

    txs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''));

    // Totals (cobros de préstamos no cuentan como ingreso presupuestal)
    const totalIncome   = txs.filter(t=>t.type==='income' && !t.isLoanPayment && !t.isLoan).reduce((s,t)=>s+t.amount,0);
    const totalExpense  = txs.filter(t=>t.type==='expense' && !t.skipBudget).reduce((s,t)=>s+t.amount,0);
    const totalTransfer = txs.filter(t=>t.type==='transfer').reduce((s,t)=>s+t.amount,0);
    const totalLoans    = txs.filter(t=>t.isLoan || t.isLoanPayment).reduce((s,t)=>s+t.amount,0);

    const summary = document.getElementById('tx-summary');
    if (summary) {
      summary.innerHTML = `
        <div class="stat-pill income"><i class="fas fa-arrow-down"></i> ${Storage.formatCurrency(totalIncome)}</div>
        <div class="stat-pill expense"><i class="fas fa-arrow-up"></i> ${Storage.formatCurrency(totalExpense)}</div>
        <div class="stat-pill transfer"><i class="fas fa-arrows-left-right"></i> ${Storage.formatCurrency(totalTransfer)}</div>
        ${totalLoans ? `<div class="stat-pill loan"><i class="fas fa-handshake"></i> ${Storage.formatCurrency(totalLoans)}</div>` : ''}
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

    // Préstamo otorgado
    if (t.isLoan) {
      return `
        <div class="tx-item tx-item-loan" onclick="Transactions.openEditModal('${t.id}')" style="cursor:pointer">
          <div class="tx-icon" style="background:rgba(14,165,233,.12);color:#38bdf8">
            <i class="fas fa-handshake"></i>
          </div>
          <div class="tx-info">
            <div class="tx-description">${_esc(t.description)}</div>
            <div class="tx-meta">
              <span class="tx-account"><i class="fas fa-wallet"></i> ${_esc(Accounts.getName(t.accountId))}</span>
              <span class="tx-badge tx-badge-loan">Préstamo</span>
            </div>
            ${t.nota ? `<div class="tx-nota"><i class="fas fa-note-sticky"></i> ${_esc(t.nota)}</div>` : ''}
          </div>
          <div class="tx-amount text-blue">-${Storage.formatCurrency(t.amount)}</div>
          <button class="btn-icon btn-danger" onclick="event.stopPropagation();Transactions.deleteTransaction('${t.id}')" title="Eliminar">
            <i class="fas fa-trash"></i>
          </button>
        </div>`;
    }

    // Cobro de préstamo
    if (t.isLoanPayment || (t.category === 'Préstamos' && t.type === 'income')) {
      return `
        <div class="tx-item tx-item-loan" onclick="Transactions.openEditModal('${t.id}')" style="cursor:pointer">
          <div class="tx-icon" style="background:rgba(14,165,233,.12);color:#38bdf8">
            <i class="fas fa-hand-holding-dollar"></i>
          </div>
          <div class="tx-info">
            <div class="tx-description">${_esc(t.description)}</div>
            <div class="tx-meta">
              <span class="tx-account"><i class="fas fa-wallet"></i> ${_esc(Accounts.getName(t.accountId))}</span>
              <span class="tx-badge tx-badge-loan">Cobro</span>
            </div>
            ${t.nota ? `<div class="tx-nota"><i class="fas fa-note-sticky"></i> ${_esc(t.nota)}</div>` : ''}
          </div>
          <div class="tx-amount text-success">+${Storage.formatCurrency(t.amount)}</div>
          <button class="btn-icon btn-danger" onclick="event.stopPropagation();Transactions.deleteTransaction('${t.id}')" title="Eliminar">
            <i class="fas fa-trash"></i>
          </button>
        </div>`;
    }

    // Deuda de plazo: estilo especial, no es gasto ni ingreso
    if (t.isDebt) {
      return `
        <div class="tx-item tx-item-debt" onclick="Transactions.openEditModal('${t.id}')" style="cursor:pointer">
          <div class="tx-icon" style="background:#7c3aed22;color:#a78bfa">
            <i class="fas fa-credit-card"></i>
          </div>
          <div class="tx-info">
            <div class="tx-description">${_esc(t.description)}</div>
            <div class="tx-meta">
              <span class="tx-account"><i class="fas fa-credit-card"></i> ${_esc(accountName)}</span>
              <span class="tx-category">${_esc(t.category)}</span>
              <span class="tx-badge tx-badge-debt">Deuda plazo</span>
            </div>
            ${t.nota ? `<div class="tx-nota"><i class="fas fa-note-sticky"></i> ${_esc(t.nota)}</div>` : ''}
          </div>
          <div class="tx-amount text-purple">-${Storage.formatCurrency(t.amount)}</div>
          <button class="btn-icon btn-danger" onclick="event.stopPropagation();Transactions.deleteTransaction('${t.id}')" title="Eliminar">
            <i class="fas fa-trash"></i>
          </button>
        </div>`;
    }

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
    // Cobro de préstamo
    if (t.isLoanPayment || (t.category === 'Préstamos' && t.type === 'income')) {
      _renderLoanPaymentModal(t); return;
    }
    // Cargo inicial, abono o pago mensual de plazo
    if (t.installmentId) {
      _renderInstallmentTxModal(t); return;
    }
    _renderModal(t, t.type);
  }

  function _renderInstallmentTxModal(t) {
    const isDebt   = t.isDebt;           // cargo inicial en TC
    const isAbono  = t.isInternalAbono;  // abono que reduce deuda en TC
    // pago mensual desde cuenta débito: ni isDebt ni isAbono

    let title, hint;
    if (isDebt)  { title = 'Cargo inicial de plazo';  hint = 'Edita el monto o fecha del cargo en la tarjeta.'; }
    else if (isAbono) { title = 'Abono de plazo a TC'; hint = 'Edita el monto, fecha o cuenta donde se abona.'; }
    else { title = 'Pago mensual de plazo'; hint = 'Edita el monto, fecha, cuenta o categoría del pago.'; }

    App.openModal(title, `
      <p class="text-muted" style="font-size:.82rem;margin-bottom:1rem"><i class="fas fa-circle-info"></i> ${hint}</p>
      <div class="form-grid">
        <div class="form-group">
          <label>Fecha</label>
          <input id="it-date" type="date" class="form-input" value="${t.date}" />
        </div>
        <div class="form-group">
          <label>Monto (MXN)</label>
          <input id="it-amount" type="number" class="form-input" value="${t.amount}" min="0.01" step="0.01" />
        </div>
        ${!isDebt && !isAbono ? `
        <div class="form-group" style="grid-column:1/-1">
          <label>Cuenta</label>
          <select id="it-account" class="form-input">
            ${Accounts.buildAllOptions(t.accountId, '')}
          </select>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Categoría</label>
          <select id="it-category" class="form-input">
            ${Storage.getExpenseCategories().map(c => `<option value="${c}" ${c===t.category?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="form-group" style="grid-column:1/-1">
          <label>Nota</label>
          <textarea id="it-nota" class="form-input" rows="2">${_esc(t.nota)}</textarea>
        </div>
        <div class="form-actions" style="grid-column:1/-1">
          <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
          <button type="button" class="btn btn-primary" onclick="Transactions._saveInstallmentTx('${t.id}')">Actualizar</button>
        </div>
      </div>
    `);
  }

  function _saveInstallmentTx(txId) {
    const date   = document.getElementById('it-date').value;
    const amount = parseFloat(document.getElementById('it-amount').value) || 0;
    const nota   = document.getElementById('it-nota').value.trim();
    const accountEl  = document.getElementById('it-account');
    const categoryEl = document.getElementById('it-category');

    if (!date || !amount) { App.toast('Completa los campos requeridos', 'error'); return; }

    const txs = Storage.getTransactions();
    const idx = txs.findIndex(x => x.id === txId);
    if (idx === -1) return;

    const old = txs[idx];
    txs[idx] = {
      ...old,
      date, amount, nota,
      accountId: accountEl  ? accountEl.value  : old.accountId,
      category:  categoryEl ? categoryEl.value : old.category,
    };
    Storage.saveTransactions(txs);

    App.closeModal();
    App.toast('Movimiento actualizado', 'success');
    _renderList();
    App.renderDashboard();
    if (typeof Installments !== 'undefined') Installments.render();
  }

  function _renderLoanPaymentModal(t) {
    App.openModal('Editar cobro de préstamo', `
      <div class="form-grid">
        <div class="form-group">
          <label>Fecha</label>
          <input id="lp-date" type="date" class="form-input" value="${t.date}" required />
        </div>
        <div class="form-group">
          <label>Monto (MXN)</label>
          <input id="lp-amount" type="number" class="form-input" value="${t.amount}" min="0.01" step="0.01" required />
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Cuenta donde se recibió</label>
          <select id="lp-account" class="form-input">
            ${Accounts.buildAllOptions(t.accountId, '')}
          </select>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Descripción</label>
          <input id="lp-description" type="text" class="form-input" value="${_esc(t.description)}" />
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Nota</label>
          <textarea id="lp-nota" class="form-input" rows="2">${_esc(t.nota)}</textarea>
        </div>
        <div class="form-actions" style="grid-column:1/-1">
          <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
          <button type="button" class="btn btn-primary" onclick="Transactions._saveLoanPayment('${t.id}')">Actualizar</button>
        </div>
      </div>
    `);
  }

  function _saveLoanPayment(txId) {
    const date        = document.getElementById('lp-date').value;
    const amount      = parseFloat(document.getElementById('lp-amount').value) || 0;
    const accountId   = document.getElementById('lp-account').value;
    const description = document.getElementById('lp-description').value.trim();
    const nota        = document.getElementById('lp-nota').value.trim();

    if (!date || !amount || !accountId) { App.toast('Completa los campos requeridos', 'error'); return; }

    // Actualizar la transacción preservando sus flags
    const txs = Storage.getTransactions();
    const idx = txs.findIndex(x => x.id === txId);
    if (idx === -1) return;
    const old = txs[idx];
    txs[idx] = { ...old, date, amount, accountId, description, nota };
    Storage.saveTransactions(txs);

    // Sincronizar el pago correspondiente en loans[]
    const loans = Storage.getLoans();
    const loan = loans.find(l => (old.description || '').includes(l.personName));
    if (loan) {
      const loanIdx = loans.findIndex(l => l.id === loan.id);
      const payIdx = (loans[loanIdx].payments || []).findIndex(p =>
        !p._plan && Math.abs(p.amount - old.amount) < 0.01 && p.date === old.date
      );
      if (payIdx !== -1) {
        loans[loanIdx].payments[payIdx] = {
          ...loans[loanIdx].payments[payIdx],
          amount, date, toAccountId: accountId, note: nota
        };
        Storage.saveLoans(loans);
      }
    }

    App.closeModal();
    App.toast('Cobro actualizado', 'success');
    _renderList();
    App.renderDashboard();
    if (typeof Loans !== 'undefined') Loans.render();
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

    const transactions = Storage.getTransactions();
    const txData = { type, date, amount, accountId, toAccountId, category, description, nota, installmentId: null };

    if (idVal) {
      const idx = transactions.findIndex(x => x.id === idVal);
      if (idx > -1) transactions[idx] = { ...transactions[idx], ...txData };
    } else {
      txData.id = Storage.generateId();
      transactions.push(txData);
    }

    // saveTransactions recomputa saldos automáticamente
    Storage.saveTransactions(transactions);

    App.closeModal();
    App.toast(idVal ? 'Movimiento actualizado' : 'Movimiento guardado', 'success');
    _renderList();
    App.renderDashboard();
  }

  function deleteTransaction(id) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    const transactions = Storage.getTransactions();
    const tx = transactions.find(x => x.id === id);
    if (!tx) return;

    // Si es un cobro de préstamo, quitar el pago del arreglo del préstamo
    if (tx.isLoanPayment || (tx.category === 'Préstamos' && tx.type === 'income')) {
      const loans = Storage.getLoans();
      // Buscar el préstamo cuyo personName aparece en la descripción
      const loan = loans.find(l => (tx.description || '').includes(l.personName));
      if (loan) {
        const realPays = (loan.payments || []).filter(p => !p._plan);
        // Encontrar el pago que coincida en monto y fecha
        const matchIdx = realPays.findIndex(p => Math.abs(p.amount - tx.amount) < 0.01 && p.date === tx.date);
        if (matchIdx !== -1) {
          const payId = realPays[matchIdx].id;
          const loanIdx = loans.findIndex(l => l.id === loan.id);
          loans[loanIdx].payments = (loans[loanIdx].payments || []).filter(p => p.id !== payId);
          Storage.saveLoans(loans);
        }
      }
    }

    Storage.saveTransactions(transactions.filter(x => x.id !== id));
    App.toast('Movimiento eliminado', 'success');
    _renderList();
    App.renderDashboard();

    // Si era pago de plazo, refrescar plazos
    if (tx.installmentId && typeof Installments !== 'undefined') {
      Installments.render();
    }
    // Si era cobro de préstamo, refrescar préstamos
    if ((tx.isLoanPayment || (tx.category === 'Préstamos' && tx.type === 'income')) && typeof Loans !== 'undefined') {
      Loans.render();
    }
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
    getRecent, getForMonth, _switchTab, _renderList, _saveLoanPayment, _saveInstallmentTx
  };
  return window.Transactions;
})();
