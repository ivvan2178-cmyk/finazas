/**
 * accounts.js — Gestión de cuentas (CRUD + modales)
 */
const Accounts = (() => {

  const ACCOUNT_COLORS = [
    '#7c3aed','#2563eb','#0891b2','#059669',
    '#d97706','#dc2626','#9333ea','#0284c7',
    '#16a34a','#b45309','#475569'
  ];

  const ACCOUNT_ICONS = {
    debit: 'fa-university',
    credit: 'fa-credit-card',
    cash: 'fa-money-bill-wave',
    savings: 'fa-piggy-bank'
  };

  /* ─── Render principal ─── */
  function render() {
    const accounts = Storage.getAccounts();
    const container = document.getElementById('accounts-grid');
    if (!container) return;

    if (!accounts.length) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <i class="fas fa-wallet"></i>
          <p>No tienes cuentas registradas.</p>
          <button class="btn btn-primary" onclick="Accounts.openAddModal()">
            <i class="fas fa-plus"></i> Agregar primera cuenta
          </button>
        </div>`;
      return;
    }

    container.innerHTML = accounts.map(a => _cardHTML(a)).join('');
  }

  function _cardHTML(a) {
    const isCredit = a.type === 'credit';
    const balance = isCredit ? a.balance : a.balance;
    const color = a.color || '#7c3aed';
    const icon = ACCOUNT_ICONS[a.type] || 'fa-wallet';

    let extra = '';
    if (isCredit && a.creditLimit) {
      const used = a.balance || 0;
      const available = a.creditLimit - used;
      const pct = Math.min(100, Math.round((used / a.creditLimit) * 100));
      const barColor = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#14b8a6';
      extra = `
        <div class="account-credit-info">
          <div class="credit-row">
            <span class="text-muted">Límite</span>
            <span>${Storage.formatCurrency(a.creditLimit)}</span>
          </div>
          <div class="credit-row">
            <span class="text-muted">Disponible</span>
            <span class="text-success">${Storage.formatCurrency(available)}</span>
          </div>
          <div class="utilization-bar">
            <div class="utilization-fill" style="width:${pct}%;background:${barColor}"></div>
          </div>
          <div class="utilization-label text-muted">${pct}% utilizado</div>
        </div>`;
    }

    return `
      <div class="account-card" style="--accent:${color}" onclick="Accounts.openEditModal('${a.id}')">
        <div class="account-card-header">
          <div class="account-icon" style="background:${color}22;color:${color}">
            <i class="fas ${icon}"></i>
          </div>
          <div class="account-type-badge">${Storage.accountTypeLabel(a.type)}</div>
        </div>
        <div class="account-name">${a.name}</div>
        <div class="account-balance ${isCredit ? 'text-danger' : ''}">
          ${isCredit ? '' : ''}${Storage.formatCurrency(balance)}
          ${isCredit ? '<span class="text-muted" style="font-size:.75rem;margin-left:4px">deuda</span>' : ''}
        </div>
        ${extra}
        <div class="account-actions" onclick="event.stopPropagation()">
          <button class="btn-icon" onclick="Accounts.openEditModal('${a.id}')" title="Editar">
            <i class="fas fa-pen"></i>
          </button>
          <button class="btn-icon btn-danger" onclick="Accounts.deleteAccount('${a.id}')" title="Eliminar">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>`;
  }

  /* ─── Resumen para dashboard ─── */
  function getSummary() {
    const accounts = Storage.getAccounts();
    let assets = 0, debt = 0;
    accounts.forEach(a => {
      if (a.type === 'credit') debt += (a.balance || 0);
      else assets += (a.balance || 0);
    });
    return { assets, debt, net: assets - debt };
  }

  /* ─── Modal: Agregar cuenta ─── */
  function openAddModal() {
    const colorOpts = ACCOUNT_COLORS.map((c, i) =>
      `<label class="color-opt"><input type="radio" name="acc-color" value="${c}" ${i===0?'checked':''}/><span style="background:${c}"></span></label>`
    ).join('');

    App.openModal('Nueva Cuenta', `
      <form id="account-form" class="form-grid">
        <div class="form-group">
          <label>Nombre de la cuenta</label>
          <input id="acc-name" type="text" class="form-input" placeholder="Ej. BBVA Nómina" required />
        </div>
        <div class="form-group">
          <label>Tipo de cuenta</label>
          <select id="acc-type" class="form-input" onchange="Accounts._onTypeChange()">
            <option value="debit">Débito / Banco</option>
            <option value="credit">Tarjeta de Crédito</option>
            <option value="cash">Efectivo</option>
            <option value="savings">Ahorro</option>
          </select>
        </div>
        <div class="form-group">
          <label id="acc-balance-label">Saldo inicial (MXN)</label>
          <input id="acc-balance" type="number" class="form-input" placeholder="0.00" min="0" step="0.01" value="0" />
        </div>
        <div class="form-group" id="acc-limit-group" style="display:none">
          <label>Límite de crédito (MXN)</label>
          <input id="acc-limit" type="number" class="form-input" placeholder="0.00" min="0" step="0.01" value="0" />
        </div>
        <div class="form-group" id="acc-cutoff-group" style="display:none">
          <label>Día de corte</label>
          <input id="acc-cutoff" type="number" class="form-input" placeholder="15" min="1" max="31" value="15" />
        </div>
        <div class="form-group" id="acc-payment-group" style="display:none">
          <label>Día de pago</label>
          <input id="acc-payment" type="number" class="form-input" placeholder="5" min="1" max="31" value="5" />
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Color identificador</label>
          <div class="color-picker">${colorOpts}</div>
        </div>
        <div class="form-actions" style="grid-column:1/-1">
          <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar Cuenta</button>
        </div>
      </form>
    `);

    document.getElementById('account-form').addEventListener('submit', (e) => {
      e.preventDefault();
      _saveAccount(null);
    });
  }

  function _onTypeChange() {
    const type = document.getElementById('acc-type').value;
    const isCredit = type === 'credit';
    document.getElementById('acc-limit-group').style.display = isCredit ? '' : 'none';
    document.getElementById('acc-cutoff-group').style.display = isCredit ? '' : 'none';
    document.getElementById('acc-payment-group').style.display = isCredit ? '' : 'none';
    document.getElementById('acc-balance-label').textContent = isCredit ? 'Deuda actual (MXN)' : 'Saldo inicial (MXN)';
  }

  /* ─── Modal: Editar cuenta ─── */
  function openEditModal(id) {
    const accounts = Storage.getAccounts();
    const a = accounts.find(x => x.id === id);
    if (!a) return;

    const colorOpts = ACCOUNT_COLORS.map(c =>
      `<label class="color-opt"><input type="radio" name="acc-color" value="${c}" ${a.color===c?'checked':''}/><span style="background:${c}"></span></label>`
    ).join('');

    const isCredit = a.type === 'credit';

    App.openModal('Editar Cuenta', `
      <form id="account-form" class="form-grid">
        <div class="form-group">
          <label>Nombre de la cuenta</label>
          <input id="acc-name" type="text" class="form-input" value="${_esc(a.name)}" required />
        </div>
        <div class="form-group">
          <label>Tipo de cuenta</label>
          <select id="acc-type" class="form-input" onchange="Accounts._onTypeChange()">
            <option value="debit" ${a.type==='debit'?'selected':''}>Débito / Banco</option>
            <option value="credit" ${a.type==='credit'?'selected':''}>Tarjeta de Crédito</option>
            <option value="cash" ${a.type==='cash'?'selected':''}>Efectivo</option>
            <option value="savings" ${a.type==='savings'?'selected':''}>Ahorro</option>
          </select>
        </div>
        <div class="form-group">
          <label id="acc-balance-label">${isCredit ? 'Deuda actual (MXN)' : 'Saldo (MXN)'}</label>
          <input id="acc-balance" type="number" class="form-input" value="${a.balance || 0}" min="0" step="0.01" />
        </div>
        <div class="form-group" id="acc-limit-group" style="display:${isCredit?'':'none'}">
          <label>Límite de crédito (MXN)</label>
          <input id="acc-limit" type="number" class="form-input" value="${a.creditLimit || 0}" min="0" step="0.01" />
        </div>
        <div class="form-group" id="acc-cutoff-group" style="display:${isCredit?'':'none'}">
          <label>Día de corte</label>
          <input id="acc-cutoff" type="number" class="form-input" value="${a.cutoffDay || 15}" min="1" max="31" />
        </div>
        <div class="form-group" id="acc-payment-group" style="display:${isCredit?'':'none'}">
          <label>Día de pago</label>
          <input id="acc-payment" type="number" class="form-input" value="${a.paymentDay || 5}" min="1" max="31" />
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Color identificador</label>
          <div class="color-picker">${colorOpts}</div>
        </div>
        <div class="form-actions" style="grid-column:1/-1">
          <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Actualizar</button>
        </div>
      </form>
    `);

    document.getElementById('account-form').addEventListener('submit', (e) => {
      e.preventDefault();
      _saveAccount(id);
    });
  }

  function _saveAccount(id) {
    const name = document.getElementById('acc-name').value.trim();
    const type = document.getElementById('acc-type').value;
    const balance = parseFloat(document.getElementById('acc-balance').value) || 0;
    const colorEl = document.querySelector('input[name="acc-color"]:checked');
    const color = colorEl ? colorEl.value : '#7c3aed';
    const isCredit = type === 'credit';

    if (!name) { App.toast('El nombre es requerido', 'error'); return; }

    const accounts = Storage.getAccounts();

    const accountData = {
      name,
      type,
      balance,
      color,
      creditLimit: isCredit ? (parseFloat(document.getElementById('acc-limit').value) || 0) : null,
      cutoffDay: isCredit ? (parseInt(document.getElementById('acc-cutoff').value) || 15) : null,
      paymentDay: isCredit ? (parseInt(document.getElementById('acc-payment').value) || 5) : null
    };

    if (id) {
      const idx = accounts.findIndex(a => a.id === id);
      if (idx > -1) accounts[idx] = { ...accounts[idx], ...accountData };
    } else {
      accountData.id = Storage.generateId();
      accounts.push(accountData);
    }

    Storage.saveAccounts(accounts);
    App.closeModal();
    App.toast(id ? 'Cuenta actualizada' : 'Cuenta creada', 'success');
    render();
    if (document.getElementById('section-dashboard').classList.contains('active')) {
      App.renderDashboard();
    }
  }

  function deleteAccount(id) {
    const transactions = Storage.getTransactions();
    const used = transactions.some(t => t.accountId === id || t.toAccountId === id);
    if (used) {
      App.toast('No puedes eliminar una cuenta con movimientos registrados.', 'error');
      return;
    }
    if (!confirm('¿Eliminar esta cuenta? Esta acción no se puede deshacer.')) return;
    const accounts = Storage.getAccounts().filter(a => a.id !== id);
    Storage.saveAccounts(accounts);
    App.toast('Cuenta eliminada', 'success');
    render();
    App.renderDashboard();
  }

  /* ─── Select options para otros módulos ─── */
  function buildOptions(selectedId, filterType) {
    const accounts = Storage.getAccounts();
    return accounts
      .filter(a => !filterType || a.type === filterType)
      .map(a => `<option value="${a.id}" ${a.id===selectedId?'selected':''}>${a.name}</option>`)
      .join('');
  }

  function buildAllOptions(selectedId, excludeId) {
    const accounts = Storage.getAccounts();
    return accounts
      .filter(a => a.id !== excludeId)
      .map(a => `<option value="${a.id}" ${a.id===selectedId?'selected':''}>${a.name} (${Storage.accountTypeLabel(a.type)})</option>`)
      .join('');
  }

  function getById(id) {
    return Storage.getAccounts().find(a => a.id === id) || null;
  }

  function getName(id) {
    const a = getById(id);
    return a ? a.name : 'Cuenta eliminada';
  }

  function _esc(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Expose _onTypeChange globally for inline onchange
  window.Accounts = { render, openAddModal, openEditModal, _onTypeChange, deleteAccount, getSummary, buildOptions, buildAllOptions, getById, getName };
  return window.Accounts;
})();
