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
          <button class="btn-icon" onclick="Accounts.openDetailModal('${a.id}')" title="Ver movimientos">
            <i class="fas fa-list-ul"></i>
          </button>
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
    const allTxs = Storage.getTransactions();
    let assets = 0, debt = 0;

    accounts.forEach(a => {
      if (a.type === 'credit') {
        // Deuda personal: solo plazos + gastos directos, sin contar préstamos otorgados
        const personalEffect = allTxs.reduce((sum, t) => {
          if (t.category === 'Préstamos') return sum;   // ignorar préstamos otorgados
          if (t.category === 'Pago préstamo') return sum; // ignorar pagos de deuda ajena
          const src = t.accountId === a.id;
          const dst = t.toAccountId === a.id;
          if (!src && !dst) return sum;
          if (src) {
            if (t.type === 'expense')  return sum + t.amount;
            if (t.type === 'income')   return sum - t.amount;
            if (t.type === 'transfer') return sum + t.amount;
          }
          if (dst && t.type === 'transfer') return sum - t.amount;
          return sum;
        }, 0);
        debt += Math.max(0, (a.initialBalance || 0) + personalEffect);
      } else {
        assets += (a.balance || 0);
      }
    });

    // Por cobrar (solo préstamos desde cuentas de capital) suma al patrimonio
    const owed = typeof Loans !== 'undefined' ? Loans.getTotalOwed() : 0;
    return { assets, debt, net: assets - debt + owed };
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
          <input id="acc-balance" type="number" class="form-input" value="${parseFloat((a.initialBalance ?? a.balance ?? 0).toFixed(2))}" min="0" step="0.01" />
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
      initialBalance: balance,
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

  /* ─── Modal: Detalle de movimientos de la cuenta ─── */
  function openDetailModal(id) {
    const a = Storage.getAccounts().find(x => x.id === id);
    if (!a) return;
    const isCredit = a.type === 'credit';
    const color = a.color || '#7c3aed';

    const allTxs = Storage.getTransactions();

    // Transacciones que afectan directamente el saldo de esta cuenta
    const directIds = new Set();
    allTxs.forEach(t => { if (t.accountId === id || t.toAccountId === id) directIds.add(t.id); });

    // Cobros de préstamos cuyo préstamo salió de esta cuenta, aunque el cobro
    // haya llegado a otra cuenta (solo para mostrar, no afectan el saldo aquí)
    const relatedIds = new Set();
    if (typeof Storage.getLoans === 'function') {
      const loans = Storage.getLoans().filter(l => l.fromAccountId === id);
      const cobroTxs = allTxs.filter(t => t.category === 'Préstamos' && t.type === 'income');
      loans.forEach(loan => {
        const pays = (loan.payments || []).filter(p => !p._plan);
        pays.forEach(p => {
          const match = cobroTxs.find(t =>
            Math.abs(t.amount - p.amount) < 0.01 && t.date === p.date && !directIds.has(t.id)
          );
          if (match) relatedIds.add(match.id);
        });
      });
    }

    const txs = allTxs
      .filter(t => directIds.has(t.id) || relatedIds.has(t.id))
      .sort((x, y) => (x.date || '').localeCompare(y.date || '') || (x.id || '').localeCompare(y.id || ''));

    // Calcular efecto acumulado (solo transacciones directas afectan el saldo)
    let running = a.initialBalance || 0;
    const rows = txs.map(t => {
      const isDirect = directIds.has(t.id);
      const src = t.accountId === id;
      let effect = 0;
      if (isDirect) {
        if (src) {
          if (t.type === 'income')   effect = isCredit ? -t.amount :  t.amount;
          if (t.type === 'expense')  effect = isCredit ?  t.amount : -t.amount;
          if (t.type === 'transfer') effect = isCredit ?  t.amount : -t.amount;
        } else {
          effect = isCredit ? -t.amount : t.amount;
        }
        running = Math.round((running + effect) * 100) / 100;
      }

      const typeIcon = t.type === 'income' ? 'fa-arrow-down' : t.type === 'expense' ? 'fa-arrow-up' : 'fa-arrows-left-right';
      const effectClass = effect > 0 ? (isCredit ? 'text-danger' : 'text-success') : effect < 0 ? (isCredit ? 'text-success' : 'text-danger') : 'text-muted';
      const effectSign = effect > 0 ? '+' : '';
      const label = t.isLoan ? 'Préstamo' : (t.isLoanPayment || (t.category === 'Préstamos' && t.type === 'income')) ? 'Cobro' : t.isDebt ? 'Plazo' : (t.description || Storage.typeLabel(t.type));
      const destAccount = !isDirect ? `<span class="text-muted" style="font-size:.7rem"> → ${_esc(Accounts.getName(t.accountId))}</span>` : '';
      const saldoCell = isDirect ? Storage.formatCurrency(running) : `<span class="text-muted">—</span>`;

      return `
        <tr class="acc-detail-row${!isDirect ? ' acc-detail-related' : ''}">
          <td class="text-muted" style="white-space:nowrap">${Storage.formatDate(t.date)}</td>
          <td>
            <i class="fas ${typeIcon}" style="font-size:.7rem;margin-right:.3rem;opacity:.6"></i>
            ${_esc(label)}${destAccount}
            ${t.category ? `<span class="tx-category" style="margin-left:.35rem">${_esc(t.category)}</span>` : ''}
          </td>
          <td class="${effectClass}" style="text-align:right;white-space:nowrap">
            ${isDirect ? `${effectSign}${Storage.formatCurrency(Math.abs(effect))}` : `<span class="text-muted">${Storage.formatCurrency(t.amount)}</span>`}
          </td>
          <td style="text-align:right;white-space:nowrap">${saldoCell}</td>
        </tr>`;
    });

    const finalBalance = a.balance ?? running;

    App.openModal(`Movimientos · ${_esc(a.name)}`, `
      <div class="acc-detail-summary" style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin-bottom:1.25rem">
        <div class="stat-card-mini">
          <div class="text-muted" style="font-size:.72rem">Saldo inicial</div>
          <div style="font-weight:700">${Storage.formatCurrency(a.initialBalance || 0)}</div>
        </div>
        <div class="stat-card-mini">
          <div class="text-muted" style="font-size:.72rem">${directIds.size} mov. directos · ${relatedIds.size} cobros</div>
          <div style="font-weight:700">${Storage.formatCurrency(Storage.getTxEffect(id, a.type))}</div>
        </div>
        <div class="stat-card-mini" style="border-color:${color}44">
          <div class="text-muted" style="font-size:.72rem">Saldo actual</div>
          <div style="font-weight:700;color:${color}">${Storage.formatCurrency(finalBalance)}</div>
        </div>
      </div>
      ${rows.length ? `
      <div style="overflow-x:auto">
        <table class="acc-detail-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Descripción</th>
              <th style="text-align:right">Efecto</th>
              <th style="text-align:right">Saldo</th>
            </tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>
      <p class="text-muted" style="font-size:.72rem;margin-top:.75rem"><i class="fas fa-circle-info"></i> Las filas en gris son cobros recibidos en otra cuenta.</p>
      ` : `<div class="empty-state"><i class="fas fa-receipt"></i><p>Sin movimientos registrados.</p></div>`}
    `);
  }

  function _esc(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Expose _onTypeChange globally for inline onchange
  window.Accounts = { render, openAddModal, openEditModal, openDetailModal, _onTypeChange, deleteAccount, getSummary, buildOptions, buildAllOptions, getById, getName };
  return window.Accounts;
})();
