/**
 * installments.js — Pagos a plazos (MSI) y Estado de Cuenta de Tarjetas
 */
const Installments = (() => {

  /* ─── Render lista de plazos ─── */
  function render() {
    const container = document.getElementById('installments-list');
    if (!container) return;

    const installments = Storage.getInstallments();
    const active = installments.filter(i => !i.archived);
    const finished = installments.filter(i => i.archived);

    if (!active.length && !finished.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-calendar-check"></i>
          <p>No tienes compras a plazos registradas.</p>
          <button class="btn btn-primary" onclick="Installments.openAddModal()">
            <i class="fas fa-plus"></i> Registrar nuevo plazo
          </button>
        </div>`;
      return;
    }

    const currentMonth = Storage.getCurrentMonth();

    container.innerHTML = `
      ${active.length ? `
        <h3 class="section-subtitle">Activos</h3>
        <div class="installments-grid">
          ${active.map(i => _installmentCardHTML(i, currentMonth)).join('')}
        </div>
      ` : ''}
      ${finished.length ? `
        <h3 class="section-subtitle" style="margin-top:2rem">Finalizados</h3>
        <div class="installments-grid">
          ${finished.map(i => _installmentCardHTML(i, currentMonth)).join('')}
        </div>
      ` : ''}
    `;

    // Event delegation
    container.querySelectorAll('[data-pay-inst]').forEach(btn => {
      btn.addEventListener('click', () => openPayModal(btn.dataset.payInst, btn.dataset.payMonth));
    });
    container.querySelectorAll('[data-schedule-inst]').forEach(btn => {
      btn.addEventListener('click', () => openScheduleModal(btn.dataset.scheduleInst));
    });
    container.querySelectorAll('[data-edit-inst]').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.editInst));
    });
    container.querySelectorAll('[data-delete-inst]').forEach(btn => {
      btn.addEventListener('click', () => deleteInstallment(btn.dataset.deleteInst));
    });
  }

  function _installmentCardHTML(inst, currentMonth) {
    const paidMonths = inst.paidMonths || [];
    const paid = paidMonths.length;
    const remaining = inst.months - paid;
    const pct = Math.min(100, Math.round((paid / inst.months) * 100));
    const account = Accounts.getById(inst.accountId);
    const accountName = account ? account.name : 'Cuenta eliminada';
    const accountColor = account ? account.color : '#7c3aed';
    const isActive = !inst.archived;
    const dueThisMonth = _amountDueInMonth(inst, currentMonth);
    const currentMonthPaid = paidMonths.includes(currentMonth);
    const canPayThisMonth = isActive && dueThisMonth > 0 && !currentMonthPaid;
    const totalPaid = paid * inst.monthlyAmount;
    const totalPending = Math.max(0, inst.totalAmount - totalPaid);

    // Contar meses vencidos sin pagar
    const [sy, sm] = inst.startMonth.split('-').map(Number);
    const [cy, cm] = currentMonth.split('-').map(Number);
    let overdueCount = 0;
    for (let i = 0; i < inst.months; i++) {
      const d = new Date(sy, sm - 1 + i, 1);
      const ms = d.toISOString().slice(0, 7);
      const [my, mm2] = ms.split('-').map(Number);
      const diff = (my - cy) * 12 + (mm2 - cm);
      if (diff < 0 && !paidMonths.includes(ms)) overdueCount++;
    }

    return `
      <div class="installment-card ${inst.archived ? 'archived' : ''}">
        <div class="install-header">
          <div>
            <div class="install-name">${_esc(inst.description)}</div>
            <div class="install-account" style="color:${accountColor}">
              <i class="fas fa-credit-card"></i> ${_esc(accountName)}
            </div>
          </div>
          <div class="install-monthly">${Storage.formatCurrency(inst.monthlyAmount)}<span>/mes</span></div>
        </div>

        <div class="install-detail-row">
          <span class="text-muted">Total</span>
          <span>${Storage.formatCurrency(inst.totalAmount)}</span>
        </div>
        <div class="install-detail-row">
          <span class="text-muted">Abonado</span>
          <span class="text-success">${Storage.formatCurrency(totalPaid)}</span>
        </div>
        <div class="install-detail-row">
          <span class="text-muted">Por pagar</span>
          <span class="${totalPending > 0 ? 'text-danger' : 'text-success'}">${Storage.formatCurrency(totalPending)}</span>
        </div>
        <div class="install-detail-row">
          <span class="text-muted">Plazo</span>
          <span>${inst.months} meses</span>
        </div>
        ${isActive && dueThisMonth > 0 ? `
        <div class="install-detail-row highlight">
          <span>💳 Pago este mes</span>
          <span class="${currentMonthPaid ? 'text-success' : 'text-danger'}">
            ${currentMonthPaid ? '<i class="fas fa-check-circle"></i> Pagado' : Storage.formatCurrency(dueThisMonth)}
          </span>
        </div>` : ''}
        ${overdueCount > 0 ? `
        <div class="install-detail-row overdue-alert">
          <span><i class="fas fa-exclamation-triangle"></i> Meses vencidos</span>
          <span class="text-danger">${overdueCount} sin pagar</span>
        </div>` : ''}

        <div class="install-progress-section">
          <div class="install-progress-label">
            <span>${paid} de ${inst.months} pagos</span>
            <span>${remaining > 0 ? `${remaining} restantes` : '✓ Completado'}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%;background:${pct===100?'#14b8a6':'#7c3aed'}"></div>
          </div>
        </div>

        <div class="install-actions">
          ${canPayThisMonth ? `
            <button class="btn btn-sm btn-primary" data-pay-inst="${inst.id}" data-pay-month="${currentMonth}">
              <i class="fas fa-money-bill-transfer"></i> Registrar pago
            </button>
          ` : ''}
          <button class="btn btn-sm btn-ghost" data-schedule-inst="${inst.id}">
            <i class="fas fa-calendar"></i> Ver calendario
          </button>
          ${!inst.archived ? `
            <button class="btn btn-sm btn-ghost" data-edit-inst="${inst.id}">
              <i class="fas fa-pen"></i>
            </button>
            <button class="btn btn-sm btn-danger" data-delete-inst="${inst.id}">
              <i class="fas fa-trash"></i>
            </button>
          ` : ''}
        </div>
      </div>`;
  }

  function _amountDueInMonth(inst, monthStr) {
    const [iy, im] = inst.startMonth.split('-').map(Number);
    const [my, mm] = monthStr.split('-').map(Number);
    const diff = (my - iy) * 12 + (mm - im);
    if (diff >= 0 && diff < inst.months) return inst.monthlyAmount;
    return 0;
  }

  /* ─── Modal: Agregar plazo ─── */
  function openAddModal() {
    const creditAccounts = Storage.getAccounts().filter(a => a.type === 'credit');
    if (!creditAccounts.length) {
      App.toast('Primero agrega una tarjeta de crédito.', 'error');
      return;
    }

    App.openModal('Nuevo Plazo / MSI', `
      <form id="install-form" class="form-grid">
        <div class="form-group" style="grid-column:1/-1">
          <label>Descripción de la compra</label>
          <input id="inst-desc" type="text" class="form-input" placeholder="Ej. iPhone 16 Pro, Samsung TV..." required />
        </div>

        <div class="form-group">
          <label>Monto total (MXN)</label>
          <input id="inst-total" type="number" class="form-input" placeholder="0.00" min="1" step="0.01" required
            oninput="Installments._calcMonthly()" />
        </div>

        <div class="form-group">
          <label>Número de meses</label>
          <select id="inst-months" class="form-input" onchange="Installments._calcMonthly()">
            ${[3,6,9,12,18,24,36,48].map(m=>`<option value="${m}">${m} meses</option>`).join('')}
          </select>
        </div>

        <div class="form-group" style="grid-column:1/-1">
          <label>Pago mensual</label>
          <div class="monthly-preview" id="inst-monthly-preview">
            <i class="fas fa-calculator"></i> Ingresa el monto total para calcular
          </div>
        </div>

        <div class="form-group">
          <label>Tarjeta de crédito</label>
          <select id="inst-account" class="form-input">
            ${creditAccounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label>Fecha de la compra</label>
          <input id="inst-date" type="date" class="form-input" value="${Storage.getCurrentDate()}" required />
        </div>

        <div class="form-group" style="grid-column:1/-1">
          <label>Primer mes de pago</label>
          <input id="inst-start" type="month" class="form-input" value="${Storage.getCurrentMonth()}" required />
        </div>

        <div class="form-group" style="grid-column:1/-1">
          <label><i class="fas fa-note-sticky"></i> Nota</label>
          <textarea id="inst-nota" class="form-input" rows="2" placeholder="Nota adicional (opcional)..."></textarea>
        </div>

        <div class="form-actions" style="grid-column:1/-1">
          <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Registrar Plazo</button>
        </div>
      </form>
    `);

    document.getElementById('install-form').addEventListener('submit', (e) => {
      e.preventDefault();
      _save(null);
    });
  }

  function _calcMonthly() {
    const total = parseFloat(document.getElementById('inst-total')?.value) || 0;
    const months = parseInt(document.getElementById('inst-months')?.value) || 1;
    const preview = document.getElementById('inst-monthly-preview');
    if (!preview) return;
    if (total > 0) {
      const monthly = total / months;
      preview.innerHTML = `<span class="monthly-amount">${Storage.formatCurrency(monthly)}</span> <span class="text-muted">por mes × ${months} meses</span>`;
    } else {
      preview.innerHTML = `<i class="fas fa-calculator"></i> Ingresa el monto total para calcular`;
    }
  }

  function openEditModal(id) {
    const inst = Storage.getInstallments().find(x => x.id === id);
    if (!inst) return;
    const creditAccounts = Storage.getAccounts().filter(a => a.type === 'credit');

    App.openModal('Editar Plazo', `
      <form id="install-form" class="form-grid">
        <div class="form-group" style="grid-column:1/-1">
          <label>Descripción de la compra</label>
          <input id="inst-desc" type="text" class="form-input" value="${_esc(inst.description)}" required />
        </div>
        <div class="form-group">
          <label>Monto total (MXN)</label>
          <input id="inst-total" type="number" class="form-input" value="${inst.totalAmount}" min="1" step="0.01"
            oninput="Installments._calcMonthly()" />
        </div>
        <div class="form-group">
          <label>Número de meses</label>
          <select id="inst-months" class="form-input" onchange="Installments._calcMonthly()">
            ${[3,6,9,12,18,24,36,48].map(m=>`<option value="${m}" ${m==inst.months?'selected':''}>${m} meses</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Pago mensual</label>
          <div class="monthly-preview" id="inst-monthly-preview">
            <span class="monthly-amount">${Storage.formatCurrency(inst.monthlyAmount)}</span>
            <span class="text-muted">por mes × ${inst.months} meses</span>
          </div>
        </div>
        <div class="form-group">
          <label>Tarjeta de crédito</label>
          <select id="inst-account" class="form-input">
            ${creditAccounts.map(a=>`<option value="${a.id}" ${a.id===inst.accountId?'selected':''}>${a.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Fecha de la compra</label>
          <input id="inst-date" type="date" class="form-input" value="${inst.date || inst.startMonth + '-01'}" required />
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Primer mes de pago</label>
          <input id="inst-start" type="month" class="form-input" value="${inst.startMonth}" required />
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label><i class="fas fa-note-sticky"></i> Nota</label>
          <textarea id="inst-nota" class="form-input" rows="2">${_esc(inst.nota || '')}</textarea>
        </div>
        <div class="form-actions" style="grid-column:1/-1">
          <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Actualizar</button>
        </div>
      </form>
    `);

    document.getElementById('install-form').addEventListener('submit', (e) => {
      e.preventDefault();
      _save(id);
    });
  }

  function _save(id) {
    const description = document.getElementById('inst-desc').value.trim();
    const totalAmount = parseFloat(document.getElementById('inst-total').value) || 0;
    const months = parseInt(document.getElementById('inst-months').value) || 12;
    const accountId = document.getElementById('inst-account').value;
    const date = document.getElementById('inst-date').value;
    const startMonth = document.getElementById('inst-start').value;
    const nota = document.getElementById('inst-nota').value.trim();

    if (!description || !totalAmount || !accountId || !date || !startMonth) {
      App.toast('Completa todos los campos requeridos', 'error'); return;
    }

    const monthlyAmount = Math.round((totalAmount / months) * 100) / 100;
    const installments = Storage.getInstallments();
    const data = { description, totalAmount, months, monthlyAmount, accountId, date, startMonth, nota, archived: false };

    if (id) {
      const idx = installments.findIndex(x => x.id === id);
      if (idx > -1) {
        const old = installments[idx];
        const oldTotal = old.totalAmount;
        const oldAccountId = old.accountId;
        installments[idx] = { ...old, ...data };

        // Si cambió el monto o la cuenta, actualizar las transacciones del plazo
        const amountChanged  = Math.abs(totalAmount - oldTotal) > 0.001;
        const accountChanged = accountId !== oldAccountId;

        if (amountChanged || accountChanged) {
          const txs = Storage.getTransactions();
          txs.forEach(t => {
            if (t.installmentId !== id) return;
            // Solo el cargo inicial (isDebt) y los abonos (isInternalAbono) pertenecen
            // a la TC — los pagos mensuales (expense con categoría no Plazos/MSI)
            // pertenecen a la cuenta de débito y no deben moverse.
            const isTCTx = (t.type === 'expense' && t.category === 'Plazos / MSI') ||
                           (t.type === 'income'  && t.category === 'Plazos / MSI');
            if (accountChanged && isTCTx) t.accountId = accountId;
            // Actualizar monto solo en el cargo inicial
            if (amountChanged && t.type === 'expense' && t.category === 'Plazos / MSI' && Math.abs(t.amount - oldTotal) < 0.01) {
              t.amount = totalAmount;
            }
          });
          Storage.saveTransactions(txs); // recomputa saldos automáticamente
        }
      }
    } else {
      data.id = Storage.generateId();
      data.paidMonths = [];
      installments.push(data);

      // Cargo inicial en la TC: gasto por el total, categoría "Plazos / MSI"
      // (no cuenta en presupuesto — solo refleja la deuda adquirida)
      const txDate = date;
      const tx = {
        id: Storage.generateId(),
        date: txDate,
        type: 'expense',
        category: 'Plazos / MSI',
        description: description,
        nota: nota,
        amount: totalAmount,
        accountId: accountId,
        toAccountId: null,
        installmentId: data.id,
        skipBudget: true,   // no cuenta en presupuesto ni stats del mes
        isDebt: true        // se muestra en movimientos como "Deuda"
      };
      const transactions = Storage.getTransactions();
      transactions.push(tx);
      Storage.saveTransactions(transactions);
    }

    Storage.saveInstallments(installments);
    App.closeModal();
    App.toast(id ? 'Plazo actualizado' : 'Plazo registrado', 'success');
    render();
    App.renderDashboard();
  }

  function deleteInstallment(id) {
    if (!confirm('¿Eliminar este plazo? También se eliminará el cargo inicial en la tarjeta.')) return;

    const inst = Storage.getInstallments().find(x => x.id === id);
    if (!inst) return;

    // Eliminar todas las transacciones del plazo (recomputa saldos automáticamente)
    const txs = Storage.getTransactions().filter(t => t.installmentId !== id);
    Storage.saveTransactions(txs);

    Storage.saveInstallments(Storage.getInstallments().filter(x => x.id !== id));
    App.toast('Plazo eliminado', 'success');
    render();
    App.renderDashboard();
  }

  /* ─── Modal: Registrar pago de mensualidad ─── */
  function openPayModal(instId, monthStr) {
    const inst = Storage.getInstallments().find(x => x.id === instId);
    if (!inst) return;

    const [iy, im] = inst.startMonth.split('-').map(Number);
    const [my, mm] = monthStr.split('-').map(Number);
    const payNum = (my - iy) * 12 + (mm - im) + 1;

    const nonCreditAccounts = Storage.getAccounts().filter(a => a.type !== 'credit');
    const expenseCats = Storage.getExpenseCategories().filter(c => c !== 'Plazos / MSI');

    App.openModal(`Registrar pago — ${Storage.formatMonth(monthStr)}`, `
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1">
          <div class="install-pay-summary">
            <div class="install-pay-name">${_esc(inst.description)}</div>
            <div class="install-pay-detail">Pago <strong>${payNum} de ${inst.months}</strong> &bull;
              <span class="text-danger">${Storage.formatCurrency(inst.monthlyAmount)}</span>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>Cuenta de origen (de donde sale el dinero)</label>
          <select id="pay-account" class="form-input">
            ${nonCreditAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label>Categoría (para el presupuesto de este mes)</label>
          <select id="pay-category" class="form-input">
            ${expenseCats.map(c => `<option value="${_esc(c)}">${_esc(c)}</option>`).join('')}
          </select>
        </div>

        <div class="form-group" style="grid-column:1/-1">
          <label><i class="fas fa-note-sticky"></i> Nota (opcional)</label>
          <input id="pay-nota" type="text" class="form-input" placeholder="Ej. Pago BBVA online..." />
        </div>

        <div class="form-actions" style="grid-column:1/-1">
          <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
          <button type="button" class="btn btn-primary" id="pay-confirm-btn">
            <i class="fas fa-check"></i> Confirmar pago
          </button>
        </div>
      </div>
    `);

    document.getElementById('pay-confirm-btn').addEventListener('click', () => {
      _savePayment(instId, monthStr, payNum);
    });
  }

  function _savePayment(instId, monthStr, payNum) {
    const fromAccountId = document.getElementById('pay-account').value;
    const category      = document.getElementById('pay-category').value;
    const nota          = document.getElementById('pay-nota').value.trim();

    const inst = Storage.getInstallments().find(x => x.id === instId);
    if (!inst || !fromAccountId || !category) {
      App.toast('Completa todos los campos', 'error'); return;
    }

    const amount = inst.monthlyAmount;
    const date   = monthStr + '-01';
    const transactions = Storage.getTransactions();

    // 1. Gasto en cuenta de origen (cuenta en presupuesto ese mes)
    const txGasto = {
      id: Storage.generateId(),
      date, type: 'expense', category,
      description: `Plazo: ${inst.description} (${payNum}/${inst.months})`,
      nota, amount,
      accountId: fromAccountId,
      toAccountId: null,
      installmentId: instId
    };

    // 2. Ingreso en la TC (reduce la deuda)
    const txAbono = {
      id: Storage.generateId(),
      date, type: 'income', category: 'Plazos / MSI',
      description: `Abono plazo: ${inst.description} (${payNum}/${inst.months})`,
      nota, amount,
      accountId: inst.accountId,
      toAccountId: null,
      installmentId: instId,
      skipBudget: true    // no cuenta como ingreso real
    };

    transactions.push(txGasto, txAbono);
    Storage.saveTransactions(transactions);

    // Marcar mes como pagado en el plazo
    const installments = Storage.getInstallments();
    const idx = installments.findIndex(x => x.id === instId);
    if (idx > -1) {
      installments[idx].paidMonths = [...(installments[idx].paidMonths || []), monthStr];
      // Archivar si ya se pagaron todos los meses
      if (installments[idx].paidMonths.length >= inst.months) {
        installments[idx].archived = true;
      }
    }
    Storage.saveInstallments(installments);

    App.closeModal();
    App.toast(`Pago ${payNum}/${inst.months} registrado`, 'success');
    render();
    App.renderDashboard();
  }

  /* ─── Modal: Calendario de pagos ─── */
  function openScheduleModal(id) {
    const inst = Storage.getInstallments().find(x => x.id === id);
    if (!inst) return;
    _renderScheduleModal(inst);
  }

  function _renderScheduleModal(inst) {
    const currentMonth = Storage.getCurrentMonth();
    const paidMonths = inst.paidMonths || [];
    const [sy, sm] = inst.startMonth.split('-').map(Number);
    const [cy, cm] = currentMonth.split('-').map(Number);
    const totalPaid = paidMonths.length * inst.monthlyAmount;

    const rows = [];
    for (let i = 0; i < inst.months; i++) {
      const d = new Date(sy, sm - 1 + i, 1);
      const monthStr = d.toISOString().slice(0, 7);
      const [my, mm] = monthStr.split('-').map(Number);
      const diff = (my - cy) * 12 + (mm - cm);
      const isPaid    = paidMonths.includes(monthStr);
      const isCurrent = diff === 0;
      const isOverdue = diff < 0 && !isPaid;

      let rowClass = isPaid ? 'paid' : isCurrent ? 'current' : isOverdue ? 'overdue' : 'pending';
      let statusHtml;
      if (isPaid) {
        statusHtml = `<span class="text-success"><i class="fas fa-check-circle"></i> Pagado</span>
          <button class="btn-icon-xs" data-unpay-month="${monthStr}" data-inst-id="${inst.id}" title="Deshacer pago">
            <i class="fas fa-rotate-left"></i>
          </button>`;
      } else if (isOverdue) {
        statusHtml = `<span class="text-danger"><i class="fas fa-exclamation-circle"></i> Vencido</span>
          <button class="btn btn-xs btn-danger" data-pay-inst="${inst.id}" data-pay-month="${monthStr}">
            Pagar
          </button>`;
      } else if (isCurrent) {
        statusHtml = `<span class="text-warning"><i class="fas fa-clock"></i> Este mes</span>
          <button class="btn btn-xs btn-primary" data-pay-inst="${inst.id}" data-pay-month="${monthStr}">
            Pagar
          </button>`;
      } else {
        statusHtml = `<span class="text-muted"><i class="fas fa-circle"></i> Pendiente</span>`;
      }

      rows.push(`
        <div class="schedule-row ${rowClass}">
          <div class="schedule-num">${i + 1}</div>
          <div class="schedule-month">${Storage.formatMonth(monthStr)}</div>
          <div class="schedule-amount">${Storage.formatCurrency(inst.monthlyAmount)}</div>
          <div class="schedule-status">${statusHtml}</div>
        </div>`);
    }

    App.openModal(`Calendario: ${_esc(inst.description)}`, `
      <div class="schedule-header">
        <div class="schedule-summary">
          <div><span class="text-muted">Total:</span> <strong>${Storage.formatCurrency(inst.totalAmount)}</strong></div>
          <div><span class="text-muted">Mensualidad:</span> <strong class="text-purple">${Storage.formatCurrency(inst.monthlyAmount)}</strong></div>
          <div><span class="text-muted">Abonado:</span> <strong class="text-success">${Storage.formatCurrency(totalPaid)}</strong></div>
          <div><span class="text-muted">Por pagar:</span> <strong class="text-danger">${Storage.formatCurrency(Math.max(0, inst.totalAmount - totalPaid))}</strong></div>
        </div>
      </div>
      <div class="schedule-list">
        <div class="schedule-header-row">
          <div>#</div><div>Mes</div><div>Monto</div><div>Estado</div>
        </div>
        ${rows.join('')}
      </div>
    `);

    // Event delegation dentro del modal
    const modalBody = document.getElementById('modal-body');
    modalBody.querySelectorAll('[data-pay-inst]').forEach(btn =>
      btn.addEventListener('click', () => openPayModal(btn.dataset.payInst, btn.dataset.payMonth))
    );
    modalBody.querySelectorAll('[data-unpay-month]').forEach(btn =>
      btn.addEventListener('click', () => _undoPayment(btn.dataset.instId, btn.dataset.unpayMonth))
    );
  }

  /* ─── Deshacer un pago de mensualidad ─── */
  function _undoPayment(instId, monthStr) {
    if (!confirm(`¿Deshacer el pago de ${Storage.formatMonth(monthStr)}?\nSe revertirán los saldos.`)) return;

    const installments = Storage.getInstallments();
    const idx = installments.findIndex(x => x.id === instId);
    if (idx === -1) return;

    // Eliminar las transacciones (gasto origen + abono TC) de ese mes
    const txs = Storage.getTransactions();

    // Buscar el gasto (origen) y el abono (TC) de ese mes específicamente
    const gastoTx = txs.find(t =>
      t.installmentId === instId &&
      t.type === 'expense' &&
      t.category !== 'Plazos / MSI' &&
      (t.date || '').startsWith(monthStr)
    );
    const abonoTx = txs.find(t =>
      t.installmentId === instId &&
      t.type === 'income' &&
      (t.date || '').startsWith(monthStr)
    );

    // saveTransactions recomputa saldos automáticamente
    Storage.saveTransactions(txs.filter(t => t !== gastoTx && t !== abonoTx));

    // Quitar mes de paidMonths
    installments[idx].paidMonths = (installments[idx].paidMonths || []).filter(m => m !== monthStr);
    installments[idx].archived = false; // reactivar si estaba archivado
    Storage.saveInstallments(installments);

    App.toast(`Pago de ${Storage.formatMonth(monthStr)} deshecho`, 'success');
    // Reabrir el modal con datos actualizados
    const updated = Storage.getInstallments().find(x => x.id === instId);
    if (updated) _renderScheduleModal(updated);
    render();
    App.renderDashboard();
  }

  /* ─── Estado de Cuenta (tarjeta + mes) ─── */
  let _statementFilter = 'all';

  function _setStatementFilter(f) { _statementFilter = f; renderCreditStatement(); }

  function renderCreditStatement() {
    const container = document.getElementById('credit-statement');
    if (!container) return;

    const creditAccounts = Storage.getAccounts().filter(a => a.type === 'credit');
    if (!creditAccounts.length) {
      container.innerHTML = `<div class="empty-state"><i class="fas fa-credit-card"></i><p>No tienes tarjetas de crédito registradas.</p></div>`;
      return;
    }

    const selectedAccountId = document.getElementById('credit-account-select')?.value || creditAccounts[0].id;
    const selectedMonth     = document.getElementById('credit-month-select')?.value  || Storage.getCurrentMonth();
    const account           = creditAccounts.find(a => a.id === selectedAccountId) || creditAccounts[0];
    const period            = _getBillingPeriod(account, selectedMonth);
    const paymentMonth      = period.paymentDue.slice(0, 7);

    // ── Gastos directos (excluye préstamos) dentro del periodo de corte ──
    const directExpenses = Storage.getTransactions().filter(t =>
      t.type === 'expense' &&
      t.accountId === selectedAccountId &&
      t.date >= period.start &&
      t.date <= period.end &&
      !t.installmentId &&
      t.category !== 'Préstamos'
    );

    // ── Plazos MSI: cuota que cae en el mes de pago ──
    const installmentPayments = Storage.getInstallments()
      .filter(i => i.accountId === selectedAccountId)
      .map(i => {
        const due = _amountDueInMonth(i, paymentMonth);
        if (due <= 0) return null;
        const [iy, im] = i.startMonth.split('-').map(Number);
        const [py, pm] = paymentMonth.split('-').map(Number);
        const payNum = (py - iy) * 12 + (pm - im) + 1;
        return { ...i, dueAmount: due, paymentNumber: payNum, sortDate: i.startMonth + '-01' };
      })
      .filter(Boolean);

    // ── Préstamos de esta tarjeta: cuota que cae en el mes de pago ──
    const loanEntries = _getLoanEntriesForStatement(selectedAccountId, paymentMonth, period);

    // ── Lista unificada ordenada por fecha desc ──
    const allItems = [
      ...directExpenses.map(t => ({
        type: 'direct', date: t.date, amount: t.amount,
        html: `<div class="statement-row">
          <div class="statement-row-icon statement-icon-direct"><i class="fas fa-arrow-up"></i></div>
          <div class="statement-row-info">
            <div class="statement-row-name">${_esc(t.description || t.category || 'Gasto')}</div>
            <div class="statement-row-meta">${Storage.formatDate(t.date)} &bull; ${_esc(t.category)}</div>
            ${t.nota ? `<div class="tx-nota"><i class="fas fa-note-sticky"></i> ${_esc(t.nota)}</div>` : ''}
          </div>
          <div class="statement-row-amount text-danger">${Storage.formatCurrency(t.amount)}</div>
        </div>`
      })),
      ...installmentPayments.map(i => ({
        type: 'msi', date: i.sortDate, amount: i.dueAmount,
        html: `<div class="statement-row">
          <div class="statement-row-icon statement-icon-msi"><i class="fas fa-credit-card"></i></div>
          <div class="statement-row-info">
            <div class="statement-row-name">${_esc(i.description)}</div>
            <div class="statement-row-meta">MSI &bull; Pago ${i.paymentNumber} de ${i.months}</div>
            ${i.nota ? `<div class="tx-nota"><i class="fas fa-note-sticky"></i> ${_esc(i.nota)}</div>` : ''}
          </div>
          <div class="statement-row-amount text-danger">${Storage.formatCurrency(i.dueAmount)}</div>
        </div>`
      })),
      ...loanEntries.map(e => ({
        type: 'loan', date: e.sortDate, amount: e.amount,
        html: `<div class="statement-row">
          <div class="statement-row-icon statement-icon-loan"><i class="fas fa-hand-holding-dollar"></i></div>
          <div class="statement-row-info">
            <div class="statement-row-name">${_esc(e.label)}</div>
            <div class="statement-row-meta">${_esc(e.meta)}</div>
            ${e.loan.description ? `<div class="tx-nota"><i class="fas fa-note-sticky"></i> ${_esc(e.loan.description)}</div>` : ''}
          </div>
          <div class="statement-row-amount text-danger">${Storage.formatCurrency(e.amount)}</div>
        </div>`
      }))
    ].sort((a, b) => b.date.localeCompare(a.date));

    const filtered = _statementFilter === 'all' ? allItems : allItems.filter(i => i.type === _statementFilter);

    const totalDirect  = directExpenses.reduce((s, t) => s + t.amount, 0);
    const totalInstall = installmentPayments.reduce((s, i) => s + i.dueAmount, 0);
    const totalLoans   = loanEntries.reduce((s, e) => s + e.amount, 0);
    const grandTotal   = totalDirect + totalInstall + totalLoans;

    const filterBtn = (id, label, count) => count === 0 ? '' :
      `<button class="stmt-filter-btn ${_statementFilter === id ? 'active' : ''}"
         onclick="Installments._setStatementFilter('${id}')">${label} <span class="stmt-filter-count">${count}</span></button>`;

    container.innerHTML = `
      <div class="statement-period-info">
        <span><i class="fas fa-calendar-alt"></i> Periodo de corte: <strong>${Storage.formatDate(period.start)}</strong> — <strong>${Storage.formatDate(period.end)}</strong></span>
        <span><i class="fas fa-clock"></i> Fecha límite de pago: <strong class="text-danger">${Storage.formatDate(period.paymentDue)}</strong></span>
      </div>

      <div class="statement-total-card">
        <div class="statement-total-label">Total a pagar — ${Storage.formatMonth(paymentMonth)}</div>
        <div class="statement-total-amount">${Storage.formatCurrency(grandTotal)}</div>
        <div class="statement-breakdown">
          ${totalDirect  > 0 ? `<span>Gastos: <strong>${Storage.formatCurrency(totalDirect)}</strong></span>` : ''}
          ${totalInstall > 0 ? `<span>MSI: <strong>${Storage.formatCurrency(totalInstall)}</strong></span>` : ''}
          ${totalLoans   > 0 ? `<span>Préstamos: <strong>${Storage.formatCurrency(totalLoans)}</strong></span>` : ''}
        </div>
      </div>

      ${allItems.length ? `
        <div class="stmt-filters">
          ${filterBtn('all',    'Todos',      allItems.length)}
          ${filterBtn('msi',   'MSI',         installmentPayments.length)}
          ${filterBtn('loan',  'Préstamos',   loanEntries.length)}
          ${filterBtn('direct','Gastos',      directExpenses.length)}
        </div>
        <div class="statement-list">
          ${filtered.length
            ? filtered.map(i => i.html).join('')
            : `<p style="text-align:center;color:var(--text-muted);padding:1.5rem 0;font-size:.85rem">Sin resultados para este filtro</p>`}
        </div>
      ` : `
        <div class="empty-state" style="margin-top:2rem">
          <i class="fas fa-check-circle"></i>
          <p>Sin movimientos en este periodo.</p>
        </div>
      `}
    `;
  }

  function _getBillingPeriod(account, selectedMonth) {
    const cutoffDay = account.cutoffDay || 15;
    const [y, m] = selectedMonth.split('-').map(Number);

    // Fecha de corte: día de corte del mes seleccionado (ajustado al último día del mes si aplica)
    const endDay = Math.min(cutoffDay, new Date(y, m, 0).getDate());
    const endDate = new Date(y, m - 1, endDay);

    // Inicio: día siguiente al corte del mes anterior
    const prevY = m === 1 ? y - 1 : y;
    const prevM = m === 1 ? 12 : m - 1;
    const prevMaxDay = new Date(prevY, prevM, 0).getDate();
    const startDay = Math.min(cutoffDay + 1, prevMaxDay + 1);
    const startDate = startDay > prevMaxDay
      ? new Date(y, m - 1, 1)              // desbordó: primer día del mes actual
      : new Date(prevY, prevM - 1, startDay);

    // Fecha límite de pago
    const isPalacio = (account.name || '').toLowerCase().includes('palacio');
    const paymentDue = isPalacio
      ? new Date(endDate)
      : new Date(endDate.getTime() + 20 * 24 * 60 * 60 * 1000);

    const fmt = d => {
      const yy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yy}-${mm}-${dd}`;
    };

    return { start: fmt(startDate), end: fmt(endDate), paymentDue: fmt(paymentDue) };
  }

  // paymentMonth = mes en que se paga el estado de cuenta (corte + 20 días)
  function _getLoanEntriesForStatement(accountId, paymentMonth, period) {
    const loans = Storage.getLoans().filter(l => l.fromAccountId === accountId);
    const entries = [];

    loans.forEach(loan => {
      const plan = (loan.payments || []).find(p => p._plan) || null;

      if (plan) {
        // Préstamo con plazos: mostrar la cuota que cae en el mes de pago
        const [sy, sm] = plan.startMonth.split('-').map(Number);
        const [py, pm] = paymentMonth.split('-').map(Number);
        const payIdx = (py - sy) * 12 + (pm - sm);
        if (payIdx >= 0 && payIdx < plan.months) {
          entries.push({
            loan,
            amount: plan.monthlyAmount,
            sortDate: loan.date,
            label: `Préstamo a ${loan.personName}`,
            meta: `Plazo ${payIdx + 1} de ${plan.months} · ${Storage.formatDate(loan.date)}`
          });
        }
      } else {
        // Sin plazos: usar fecha límite si existe, si no la fecha del préstamo.
        // Se muestra si aún hay saldo pendiente de abonar a la TC (pagos recibidos
        // en otras cuentas no reducen la deuda de la tarjeta).
        const refDate = loan.dueDate || loan.date;
        const owedOnCard = _loanOweOnCard(loan, accountId);
        if (owedOnCard > 0 && refDate >= period.start && refDate <= period.end) {
          entries.push({
            loan,
            amount: owedOnCard,
            sortDate: refDate,
            label: `Préstamo a ${loan.personName}`,
            meta: loan.dueDate
              ? `Vence: ${Storage.formatDate(loan.dueDate)}`
              : `Fecha: ${Storage.formatDate(loan.date)}`
          });
        }
      }
    });

    return entries;
  }

  function _loanOwe(loan) {
    const paid = (loan.payments || []).filter(p => !p._plan).reduce((s, p) => s + p.amount, 0);
    return Math.max(0, loan.amount - paid);
  }

  // Solo resta los pagos que llegaron a la propia tarjeta de crédito.
  // Si el cobro se recibió en otra cuenta, la TC sigue debiendo ese monto.
  function _loanOweOnCard(loan, accountId) {
    const paid = (loan.payments || [])
      .filter(p => !p._plan && p.toAccountId === accountId)
      .reduce((s, p) => s + p.amount, 0);
    return Math.max(0, loan.amount - paid);
  }

  /* ─── Para el dashboard: total a pagar este mes en todas las tarjetas ─── */
  function getTotalDueThisMonth() {
    const currentMonth = Storage.getCurrentMonth();
    const creditAccounts = Storage.getAccounts().filter(a => a.type === 'credit');
    let total = 0;

    creditAccounts.forEach(acc => {
      // Direct expenses
      total += Storage.getTransactions()
        .filter(t => t.type === 'expense' && t.accountId === acc.id && (t.date||'').startsWith(currentMonth))
        .reduce((s, t) => s + t.amount, 0);
      // Installments
      Storage.getInstallments()
        .filter(i => i.accountId === acc.id)
        .forEach(i => { total += _amountDueInMonth(i, currentMonth); });
    });

    return total;
  }

  function getUpcomingInstallments() {
    const currentMonth = Storage.getCurrentMonth();
    return Storage.getInstallments()
      .filter(i => !i.archived && _amountDueInMonth(i, currentMonth) > 0)
      .map(i => ({ ...i, dueAmount: _amountDueInMonth(i, currentMonth) }));
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  window.Installments = {
    render, openAddModal, openEditModal, deleteInstallment,
    openPayModal, openScheduleModal, renderCreditStatement,
    getTotalDueThisMonth, getUpcomingInstallments,
    _calcMonthly, _setStatementFilter
  };
  return window.Installments;
})();
