/**
 * loans.js — Préstamos / Cuentas por Cobrar
 */
const Loans = (() => {
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmt = n => Storage.formatCurrency(n);

  /* ─── Helpers ─── */
  function _getPlan(loan)  { return (loan.payments || []).find(p => p._plan) || null; }
  function _realPays(loan) { return (loan.payments || []).filter(p => !p._plan); }
  function _paid(loan)     { return _realPays(loan).reduce((s,p) => s + p.amount, 0); }
  function _owed(loan)     { return Math.max(0, loan.amount - _paid(loan)); }
  function _pct(loan)      { return loan.amount > 0 ? Math.min(100, Math.round((_paid(loan) / loan.amount) * 100)) : 0; }
  function _done(loan)     { return _owed(loan) === 0; }

  let _showArchived = false;
  const _expandedPersons = new Set();

  /* ─── Render principal — agrupado por persona ─── */
  function render() {
    const el = document.getElementById('loans-content');
    if (!el) return;

    const loans = Storage.getLoans();
    const totalOwed = loans.reduce((s,l) => s + _owed(l), 0);
    const totalLent = loans.reduce((s,l) => s + l.amount, 0);
    const activeCount = loans.filter(l => !_done(l)).length;
    const paidCount   = loans.filter(l =>  _done(l)).length;

    // Agrupar por persona (case-insensitive)
    const byPerson = {};
    loans.forEach(l => {
      const key = (l.personName || '').toLowerCase().trim();
      if (!byPerson[key]) byPerson[key] = { personName: l.personName, loans: [] };
      byPerson[key].loans.push(l);
    });

    // Separar grupos activos (al menos un préstamo pendiente) de archivados (todos liquidados)
    const allGroups = Object.values(byPerson).sort((a, b) => {
      const ao = a.loans.reduce((s,l) => s + _owed(l), 0);
      const bo = b.loans.reduce((s,l) => s + _owed(l), 0);
      return bo - ao;
    });
    const activeGroups   = allGroups.filter(g => g.loans.some(l => !_done(l)));
    const archivedGroups = allGroups.filter(g => g.loans.every(l =>  _done(l)));

    const archivedSection = archivedGroups.length ? `
      <div class="loans-archive-toggle" onclick="Loans._toggleArchived()">
        <i class="fas fa-${_showArchived ? 'chevron-up' : 'chevron-down'}"></i>
        ${_showArchived ? 'Ocultar archivados' : `Ver archivados (${archivedGroups.length})`}
      </div>
      ${_showArchived ? `<div class="loans-archived">${archivedGroups.map(_personSection).join('')}</div>` : ''}
    ` : '';

    el.innerHTML = `
      <div class="loan-stats">
        <div class="loan-stat-box"><div class="lsb-label">Total prestado</div><div class="lsb-val">${fmt(totalLent)}</div></div>
        <div class="loan-stat-box accent"><div class="lsb-label">Por cobrar</div><div class="lsb-val text-danger">${fmt(totalOwed)}</div></div>
        <div class="loan-stat-box"><div class="lsb-label">Activos</div><div class="lsb-val">${activeCount}</div></div>
        <div class="loan-stat-box"><div class="lsb-label">Liquidados</div><div class="lsb-val text-success">${paidCount}</div></div>
      </div>

      ${activeGroups.length ? activeGroups.map(_personSection).join('') : `
        <div class="empty-state">
          <i class="fas fa-handshake"></i>
          <p>${loans.length ? 'Todos los préstamos están liquidados' : 'Sin préstamos registrados'}</p>
          <span>Usa el botón de arriba para registrar un préstamo</span>
        </div>`}

      ${archivedSection}
    `;

    // Event delegation
    el.querySelectorAll('[data-toggle-person]').forEach(btn =>
      btn.addEventListener('click', () => _togglePerson(btn.dataset.togglePerson)));
    el.querySelectorAll('[data-pay-loan]').forEach(btn =>
      btn.addEventListener('click', () => openPaymentModal(btn.dataset.payLoan)));
    el.querySelectorAll('[data-detail-loan]').forEach(btn =>
      btn.addEventListener('click', () => openDetailModal(btn.dataset.detailLoan)));
    el.querySelectorAll('[data-edit-loan]').forEach(btn =>
      btn.addEventListener('click', () => openEditModal(btn.dataset.editLoan)));
    el.querySelectorAll('[data-del-loan]').forEach(btn =>
      btn.addEventListener('click', () => _del(btn.dataset.delLoan)));
  }

  function _toggleArchived() {
    _showArchived = !_showArchived;
    render();
  }

  function _togglePerson(key) {
    if (_expandedPersons.has(key)) {
      _expandedPersons.delete(key);
    } else {
      _expandedPersons.add(key);
    }
    render();
  }

  function _personSection(group) {
    const key      = (group.personName || '').toLowerCase().trim();
    const expanded = _expandedPersons.has(key);
    const totalOwed = group.loans.reduce((s,l) => s + _owed(l), 0);
    const count = group.loans.length;
    return `
      <div class="loan-person-group">
        <div class="loan-person-header loan-person-toggle" data-toggle-person="${esc(key)}">
          <div class="loan-avatar">${esc(group.personName.charAt(0).toUpperCase())}</div>
          <div class="loan-person-header-info">
            <div class="loan-person-name">${esc(group.personName)}</div>
            <div class="loan-person-meta">
              ${count} préstamo${count !== 1 ? 's' : ''}
              &nbsp;·&nbsp;
              ${totalOwed > 0
                ? `Por cobrar: <strong class="text-danger">${fmt(totalOwed)}</strong>`
                : '<span class="text-success">Liquidado</span>'}
            </div>
          </div>
          <i class="fas fa-chevron-${expanded ? 'up' : 'down'} loan-chevron"></i>
        </div>
        ${expanded ? `<div class="loan-person-cards">${group.loans.map(_card).join('')}</div>` : ''}
      </div>`;
  }

  function _card(loan) {
    const paid  = _paid(loan);
    const owed  = _owed(loan);
    const pct   = _pct(loan);
    const done  = _done(loan);
    const plan  = _getPlan(loan);
    const pays  = _realPays(loan);
    const accs  = Storage.getAccounts();
    const acc   = accs.find(a => a.id === loan.fromAccountId);
    const nextPayNum = pays.length + 1;

    return `
      <div class="loan-card ${done ? 'done' : ''}">
        <div class="loan-card-top">
          <div class="loan-info">
            <div class="loan-amount">${fmt(loan.amount)}</div>
            <div class="loan-person-meta">
              ${acc ? esc(acc.name) + ' &nbsp;·&nbsp; ' : ''}${Storage.formatDate(loan.date)}
              ${loan.dueDate ? ' &nbsp;·&nbsp; Vence ' + Storage.formatDate(loan.dueDate) : ''}
            </div>
            ${loan.description ? `<div class="loan-desc">${esc(loan.description)}</div>` : ''}
            ${plan ? `
              <div class="loan-plan-badge">
                <i class="fas fa-calendar-alt"></i>
                ${plan.months} meses &nbsp;·&nbsp; ${fmt(plan.monthlyAmount)}/mes
                &nbsp;·&nbsp; Cobro ${pays.length}/${plan.months}
              </div>` : ''}
          </div>
          <span class="loan-badge ${done ? 'done' : 'pending'}">${done ? 'Liquidado' : 'Pendiente'}</span>
        </div>

        ${!done ? `
          <div class="loan-bar-row">
            <div class="loan-bar"><div class="loan-bar-fill" style="width:${pct}%"></div></div>
            <span class="loan-pct">${pct}%</span>
          </div>
          <div class="loan-figures">
            <span class="loan-fig"><span class="lf-label">Cobrado</span><span class="text-success">${fmt(paid)}</span></span>
            <span class="loan-fig"><span class="lf-label">Por cobrar</span><span class="text-danger">${fmt(owed)}</span></span>
            ${plan ? `<span class="loan-fig"><span class="lf-label">Próximo</span><span class="text-purple">Cobro ${nextPayNum}</span></span>` : ''}
          </div>` : `
          <div class="loan-figures">
            <span class="loan-fig"><span class="lf-label">Pagado en ${pays.length} pago(s)</span><span class="text-success">${fmt(paid)}</span></span>
          </div>`}

        <div class="loan-actions">
          ${!done ? `<button class="btn btn-ghost btn-sm" data-pay-loan="${loan.id}">
            <i class="fas fa-hand-holding-dollar"></i>
            ${plan ? `Cobro ${nextPayNum}/${plan.months}` : 'Registrar cobro'}
          </button>` : ''}
          <button class="btn btn-ghost btn-sm" data-detail-loan="${loan.id}">
            <i class="fas fa-list"></i> Historial
          </button>
          <button class="btn-icon" data-edit-loan="${loan.id}" title="Editar">
            <i class="fas fa-pen"></i>
          </button>
          <button class="btn-icon btn-danger" data-del-loan="${loan.id}">
            <i class="fas fa-trash-can"></i>
          </button>
        </div>
      </div>`;
  }

  /* ─── Modal: Agregar préstamo ─── */
  function openAddModal() {
    const accs = Storage.getAccounts();
    const today = new Date().toISOString().slice(0,10);
    const curMonth = Storage.getCurrentMonth();

    App.openModal('Nuevo préstamo', `
      ${!accs.length ? `
        <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:6px;padding:.75rem 1rem;margin-bottom:1rem;font-size:.82rem;color:var(--red);display:flex;align-items:center;gap:.5rem">
          <i class="fas fa-triangle-exclamation"></i>
          Necesitas al menos una cuenta.
        </div>` : ''}
      <div class="form-grid">
        <div class="form-group">
          <label>Persona / Nombre</label>
          <input id="l-person" type="text" class="form-input" placeholder="Ej: Juan Pérez" autocomplete="off" />
        </div>
        <div class="form-group">
          <label>Fecha del préstamo</label>
          <input id="l-date" type="date" class="form-input" value="${today}" />
        </div>
        <div class="form-group">
          <label>Monto (MXN)</label>
          <input id="l-amount" type="number" class="form-input" placeholder="0.00" min="0.01" step="0.01"
            oninput="Loans._calcLoanMonthly()" />
        </div>
        <div class="form-group">
          <label>Cuenta origen</label>
          <select id="l-account" class="form-input">
            <option value="">Seleccionar...</option>
            ${accs.map(a => `<option value="${a.id}">${esc(a.name)} (${Storage.accountTypeLabel(a.type)})</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="grid-column:span 2">
          <label>Descripción (opcional)</label>
          <input id="l-desc" type="text" class="form-input" placeholder="Motivo del préstamo..." autocomplete="off" />
        </div>
        <div class="form-group">
          <label>Fecha de vencimiento (opcional)</label>
          <input id="l-due" type="date" class="form-input" />
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:.6rem;margin-top:.3rem">
          <input type="checkbox" id="l-has-plan" style="width:1.1rem;height:1.1rem;cursor:pointer;accent-color:var(--purple)"
            onchange="Loans._togglePlan(this.checked)" />
          <label for="l-has-plan" style="cursor:pointer;font-size:.85rem;color:var(--text-muted)">
            Cobrar en plazos
          </label>
        </div>

        <div id="l-plan-section" style="display:none;grid-column:1/-1">
          <div class="form-grid" style="padding:0;margin-top:-.5rem">
            <div class="form-group">
              <label>Número de meses</label>
              <select id="l-plan-months" class="form-input" onchange="Loans._calcLoanMonthly()">
                ${[2,3,4,5,6,8,10,12,15,18,24].map(m=>`<option value="${m}">${m} meses</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Primer mes de cobro</label>
              <input id="l-plan-start" type="month" class="form-input" value="${curMonth}"
                onchange="Loans._calcLoanMonthly()" />
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <div class="monthly-preview" id="l-plan-preview">
                <i class="fas fa-calculator"></i> Ingresa el monto para calcular
              </div>
            </div>
          </div>
        </div>

        <div class="form-group" style="grid-column:1/-1">
          <label>Nota</label>
          <textarea id="l-note" class="form-input" rows="2" placeholder="Notas adicionales..."></textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button type="button" class="btn btn-primary" onclick="Loans._create()">
          <i class="fas fa-handshake"></i> Registrar préstamo
        </button>
      </div>`);
  }

  function _togglePlan(checked) {
    const section = document.getElementById('l-plan-section');
    if (section) section.style.display = checked ? 'block' : 'none';
    if (checked) _calcLoanMonthly();
  }

  function _calcLoanMonthly() {
    const amount = parseFloat(document.getElementById('l-amount')?.value) || 0;
    const months = parseInt(document.getElementById('l-plan-months')?.value) || 1;
    const preview = document.getElementById('l-plan-preview');
    if (!preview) return;
    if (amount > 0) {
      const monthly = amount / months;
      preview.innerHTML = `<span class="monthly-amount">${fmt(monthly)}</span> <span class="text-muted">por mes × ${months} meses</span>`;
    } else {
      preview.innerHTML = `<i class="fas fa-calculator"></i> Ingresa el monto para calcular`;
    }
  }

  function _create() {
    const personName    = document.getElementById('l-person')?.value.trim();
    const amount        = parseFloat(document.getElementById('l-amount')?.value);
    const fromAccountId = document.getElementById('l-account')?.value;
    const date          = document.getElementById('l-date')?.value;
    const description   = document.getElementById('l-desc')?.value.trim();
    const dueDate       = document.getElementById('l-due')?.value || '';
    const note          = document.getElementById('l-note')?.value.trim();
    const hasPlan       = document.getElementById('l-has-plan')?.checked;

    if (!personName)           { App.toast('Escribe el nombre', 'error'); return; }
    if (!amount || amount <= 0){ App.toast('El monto debe ser mayor a 0', 'error'); return; }
    if (!fromAccountId)        { App.toast('Selecciona la cuenta origen', 'error'); return; }
    if (!date)                 { App.toast('Selecciona la fecha', 'error'); return; }

    const loanId = uid();
    let payments = [];

    if (hasPlan) {
      const planMonths  = parseInt(document.getElementById('l-plan-months')?.value) || 3;
      const planStart   = document.getElementById('l-plan-start')?.value || Storage.getCurrentMonth();
      const planMonthly = Math.round((amount / planMonths) * 100) / 100;
      payments.push({ _plan: true, months: planMonths, startMonth: planStart, monthlyAmount: planMonthly });
    }

    const loans = Storage.getLoans();
    loans.unshift({ id: loanId, personName, amount, fromAccountId, date, dueDate, description, note, payments, createdAt: new Date().toISOString() });
    Storage.saveLoans(loans);

    // Movimiento: préstamo otorgado
    const txs = Storage.getTransactions();
    txs.push({
      id: uid(), date, type: 'expense', category: 'Préstamos',
      description: `Préstamo a ${personName}`,
      nota: description || note || '',
      amount, accountId: fromAccountId, toAccountId: null,
      installmentId: null, loanId
    });
    Storage.saveTransactions(txs);

    App.closeModal();
    App.toast(`Préstamo de ${fmt(amount)} a ${personName} registrado`, 'success');
    render();
    App.renderDashboard();
  }

  /* ─── Modal: Editar préstamo ─── */
  function openEditModal(loanId) {
    const loan = Storage.getLoans().find(l => l.id === loanId);
    if (!loan) return;
    const accs = Storage.getAccounts();
    const plan = _getPlan(loan);

    App.openModal(`Editar préstamo — ${esc(loan.personName)}`, `
      <div class="form-grid">
        <div class="form-group">
          <label>Persona / Nombre</label>
          <input id="le-person" type="text" class="form-input" value="${esc(loan.personName)}" autocomplete="off" />
        </div>
        <div class="form-group">
          <label>Fecha del préstamo</label>
          <input id="le-date" type="date" class="form-input" value="${loan.date || ''}" />
        </div>
        <div class="form-group">
          <label>Monto (MXN)</label>
          <input id="le-amount" type="number" class="form-input" value="${loan.amount}" min="0.01" step="0.01" />
        </div>
        <div class="form-group">
          <label>Cuenta origen</label>
          <select id="le-account" class="form-input">
            ${accs.map(a => `<option value="${a.id}" ${a.id === loan.fromAccountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="grid-column:span 2">
          <label>Descripción (opcional)</label>
          <input id="le-desc" type="text" class="form-input" value="${esc(loan.description || '')}" autocomplete="off" />
        </div>
        <div class="form-group">
          <label>Fecha de vencimiento (opcional)</label>
          <input id="le-due" type="date" class="form-input" value="${loan.dueDate || ''}" />
        </div>
        ${plan ? `
        <div class="form-group" style="grid-column:1/-1">
          <label>Plan de cobro en plazos</label>
          <div class="form-grid" style="padding:0">
            <div class="form-group">
              <label>Número de meses</label>
              <select id="le-plan-months" class="form-input" onchange="Loans._calcEditMonthly()">
                ${[2,3,4,5,6,8,10,12,15,18,24].map(m=>`<option value="${m}" ${m===plan.months?'selected':''}>${m} meses</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Primer mes de cobro</label>
              <input id="le-plan-start" type="month" class="form-input" value="${plan.startMonth}" onchange="Loans._calcEditMonthly()" />
            </div>
          </div>
        </div>` : ''}
        <div class="form-group" style="grid-column:1/-1">
          <label>Nota</label>
          <textarea id="le-note" class="form-input" rows="2">${esc(loan.note || '')}</textarea>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button type="button" class="btn btn-primary" onclick="Loans._update('${loanId}')">
          <i class="fas fa-check"></i> Guardar cambios
        </button>
      </div>`);
  }

  function _calcEditMonthly() {
    const amount = parseFloat(document.getElementById('le-amount')?.value) || 0;
    const months = parseInt(document.getElementById('le-plan-months')?.value) || 1;
    // solo recalcular para vista, el guardado lo hace _update
    _ = { amount, months }; // noop — cálculo se hace en _update
  }

  function _update(loanId) {
    const personName    = document.getElementById('le-person')?.value.trim();
    const amount        = parseFloat(document.getElementById('le-amount')?.value);
    const fromAccountId = document.getElementById('le-account')?.value;
    const date          = document.getElementById('le-date')?.value;
    const description   = document.getElementById('le-desc')?.value.trim();
    const dueDate       = document.getElementById('le-due')?.value || '';
    const note          = document.getElementById('le-note')?.value.trim();

    if (!personName)           { App.toast('Escribe el nombre', 'error'); return; }
    if (!amount || amount <= 0){ App.toast('El monto debe ser mayor a 0', 'error'); return; }
    if (!fromAccountId)        { App.toast('Selecciona la cuenta origen', 'error'); return; }

    const loans = Storage.getLoans();
    const idx   = loans.findIndex(l => l.id === loanId);
    if (idx === -1) return;

    const oldLoan  = loans[idx];
    const plan     = _getPlan(oldLoan);

    // Actualizar plan si existe
    let payments = oldLoan.payments || [];
    if (plan) {
      const planMonths = parseInt(document.getElementById('le-plan-months')?.value) || plan.months;
      const planStart  = document.getElementById('le-plan-start')?.value || plan.startMonth;
      const planMonthly = Math.round((amount / planMonths) * 100) / 100;
      payments = payments.map(p => p._plan
        ? { _plan: true, months: planMonths, startMonth: planStart, monthlyAmount: planMonthly }
        : p);
    }

    loans[idx] = { ...oldLoan, personName, amount, fromAccountId, date, dueDate, description, note, payments };
    Storage.saveLoans(loans);

    // Actualizar la transacción de gasto original para reflejar los cambios en movimientos y saldos
    const oldPersonLower = (oldLoan.personName || '').toLowerCase();
    const txs = Storage.getTransactions();
    const loanTxs = txs.filter(t => t.category === 'Préstamos' && t.type === 'expense');
    console.log('[loans._update] txs de préstamo encontradas:', loanTxs.map(t => ({ desc: t.description, amount: t.amount, loanId: t.loanId })));
    console.log('[loans._update] buscando por loanId:', loanId, '| por nombre:', oldPersonLower);
    const txIdx = loanTxs.findIndex(t => t.loanId === loanId) !== -1
      ? txs.findIndex(t => t.category === 'Préstamos' && t.type === 'expense' && t.loanId === loanId)
      : txs.findIndex(t =>
          t.category === 'Préstamos' &&
          t.type === 'expense' &&
          (t.description || '').toLowerCase().includes(oldPersonLower)
        );
    console.log('[loans._update] txIdx encontrado:', txIdx);
    if (txIdx !== -1) {
      txs[txIdx] = {
        ...txs[txIdx],
        date,
        amount,
        accountId: fromAccountId,
        description: `Préstamo a ${personName}`,
        nota: description || note || ''
      };
      Storage.saveTransactions(txs);
    } else {
      App.toast('⚠ No se encontró la transacción original del préstamo', 'error');
    }

    App.closeModal();
    App.toast('Préstamo actualizado', 'success');
    render();
    App.renderDashboard();
  }

  /* ─── Modal: Registrar cobro ─── */
  function openPaymentModal(loanId) {
    const loan = Storage.getLoans().find(l => l.id === loanId);
    if (!loan) return;

    const owed      = _owed(loan);
    const plan      = _getPlan(loan);
    const pays      = _realPays(loan);
    const nextNum   = pays.length + 1;
    const accs      = Storage.getAccounts();
    const defaultAmt = plan ? plan.monthlyAmount : owed;

    const headerInfo = plan
      ? `<div class="loan-modal-info">
           Cobro <strong>${nextNum} de ${plan.months}</strong>
           &nbsp;·&nbsp; Mensualidad: <strong class="text-purple">${fmt(plan.monthlyAmount)}</strong>
           &nbsp;·&nbsp; Por cobrar: <strong class="text-danger">${fmt(owed)}</strong>
         </div>`
      : `<div class="loan-modal-info">
           Por cobrar: <strong class="text-danger">${fmt(owed)}</strong>
           &nbsp;·&nbsp; Préstamo total: <strong>${fmt(loan.amount)}</strong>
         </div>`;

    App.openModal(`Registrar cobro — ${esc(loan.personName)}`, `
      ${headerInfo}
      <div class="form-grid">
        <div class="form-group">
          <label>Monto recibido</label>
          <input id="p-amount" type="number" class="form-input"
            min="0.01" max="${owed}" step="0.01" value="${defaultAmt}" />
        </div>
        <div class="form-group">
          <label>Fecha</label>
          <input id="p-date" type="date" class="form-input" value="${new Date().toISOString().slice(0,10)}" />
        </div>
        <div class="form-group" style="grid-column:span 2">
          <label>Cuenta donde recibes el cobro</label>
          <select id="p-account" class="form-input">
            <option value="">Ninguna (externo)</option>
            ${accs.map(a => `<option value="${a.id}" ${a.id===loan.fromAccountId?'selected':''}>${esc(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="grid-column:span 2">
          <label>Nota</label>
          <input id="p-note" type="text" class="form-input" placeholder="Ej: Transferencia SPEI..." />
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button type="button" class="btn btn-primary" onclick="Loans._pay('${loanId}', ${owed}, ${nextNum})">
          <i class="fas fa-check"></i> Confirmar cobro
        </button>
      </div>`);
  }

  function _pay(loanId, maxOwed, nextNum) {
    const amount      = parseFloat(document.getElementById('p-amount')?.value);
    const date        = document.getElementById('p-date')?.value;
    const toAccountId = document.getElementById('p-account')?.value;
    const note        = document.getElementById('p-note')?.value.trim();

    if (!amount || amount <= 0)   { App.toast('El monto debe ser mayor a 0', 'error'); return; }
    if (amount > maxOwed + 0.001) { App.toast(`No puede exceder ${fmt(maxOwed)}`, 'error'); return; }
    if (!date)                    { App.toast('Selecciona la fecha', 'error'); return; }

    const loans = Storage.getLoans();
    const li = loans.findIndex(l => l.id === loanId);
    if (li !== -1) {
      loans[li].payments = loans[li].payments || [];
      loans[li].payments.push({ id: uid(), amount, date, toAccountId: toAccountId || null, note });
      Storage.saveLoans(loans);
    }

    const loan = loans[li];
    const plan = _getPlan(loan);

    // Movimiento: cobro recibido
    const txs = Storage.getTransactions();
    const desc = plan
      ? `Cobro préstamo: ${esc(loan.personName)} (${nextNum}/${plan.months})`
      : `Cobro préstamo: ${esc(loan.personName)}`;
    txs.push({
      id: uid(), date, type: 'income', category: 'Préstamos',
      description: desc,
      nota: note || '',
      amount,
      accountId: toAccountId || loan.fromAccountId,
      toAccountId: null,
      installmentId: null
    });
    Storage.saveTransactions(txs);

    App.closeModal();
    App.toast(`Cobro de ${fmt(amount)} registrado`, 'success');
    render();
    App.renderDashboard();
  }

  /* ─── Modal: Historial de cobros ─── */
  function openDetailModal(loanId) {
    const loan = Storage.getLoans().find(l => l.id === loanId);
    if (!loan) return;
    const accs  = Storage.getAccounts();
    const pays  = _realPays(loan);
    const plan  = _getPlan(loan);

    App.openModal(`Historial — ${esc(loan.personName)}`, `
      <div class="loan-modal-info" style="margin-bottom:1rem">
        Préstamo: <strong>${fmt(loan.amount)}</strong>
        &nbsp;·&nbsp; Cobrado: <strong class="text-success">${fmt(_paid(loan))}</strong>
        &nbsp;·&nbsp; Por cobrar: <strong class="text-danger">${fmt(_owed(loan))}</strong>
        ${plan ? `<br><span style="color:var(--purple-lt);font-size:.82rem">
          <i class="fas fa-calendar-alt"></i> Plan: ${plan.months} meses · ${fmt(plan.monthlyAmount)}/mes
          · Inicio: ${Storage.formatMonth(plan.startMonth)}
        </span>` : ''}
        ${loan.description ? `<br><span style="color:var(--text-muted);font-size:.82rem">${esc(loan.description)}</span>` : ''}
      </div>
      ${pays.length
        ? `<div class="loan-payment-list">
            ${pays.map((p, i) => {
              const a = accs.find(x => x.id === p.toAccountId);
              const label = plan ? `Cobro ${i+1}/${plan.months}` : `Pago ${i+1}`;
              return `<div class="loan-payment-row">
                <div class="lpr-num">${label}</div>
                <div class="lpr-amount text-success">${fmt(p.amount)}</div>
                <div class="lpr-meta">
                  ${Storage.formatDate(p.date)}
                  ${a ? ' · ' + esc(a.name) : ''}
                  ${p.note ? ' · ' + esc(p.note) : ''}
                </div>
              </div>`;
            }).join('')}
          </div>`
        : `<p style="color:var(--text-muted);text-align:center;padding:1.5rem 0;font-size:.85rem">Sin cobros registrados</p>`}
      <div class="form-actions">
        <button class="btn btn-ghost" onclick="App.closeModal()">Cerrar</button>
      </div>`);
  }

  /* ─── Eliminar ─── */
  function _del(loanId) {
    const loan = Storage.getLoans().find(l => l.id === loanId);
    if (!loan) return;
    if (!confirm(`¿Eliminar el préstamo a ${loan.personName} por ${fmt(loan.amount)}?\nSe revertirán los efectos en los saldos y se eliminarán los movimientos.`)) return;

    const allTxs = Storage.getTransactions();
    const personLower = loan.personName.toLowerCase();

    const loanTxs = allTxs.filter(t => {
      if (t.category !== 'Préstamos') return false;
      const desc = (t.description || '').toLowerCase();
      if (t.type === 'expense' && Math.abs(t.amount - loan.amount) < 0.01 && desc.includes(personLower)) return true;
      if (t.type === 'income' && desc.includes(personLower)) return true;
      return false;
    });

    // saveTransactions recomputa saldos automáticamente
    Storage.saveTransactions(allTxs.filter(t => !loanTxs.includes(t)));
    Storage.saveLoans(Storage.getLoans().filter(l => l.id !== loanId));

    App.toast('Préstamo eliminado', 'success');
    render();
    App.renderDashboard();
  }

  /* ─── Helpers para dashboard ─── */
  function getTotalOwed() {
    const accs = Storage.getAccounts();
    return Storage.getLoans().reduce((s, l) => {
      const src = accs.find(a => a.id === l.fromAccountId);
      if (src && src.type === 'credit') return s;
      return s + _owed(l);
    }, 0);
  }

  window.Loans = {
    render, openAddModal, openEditModal, openPaymentModal, openDetailModal,
    _create, _update, _pay, _del, getTotalOwed,
    _togglePlan, _calcLoanMonthly, _calcEditMonthly, _toggleArchived, _togglePerson
  };
  return window.Loans;
})();
