/**
 * loans.js — Préstamos / Cuentas por Cobrar
 */
const Loans = (() => {
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmt = n => Storage.formatCurrency(n);

  function _paid(loan)   { return (loan.payments || []).reduce((s,p) => s + p.amount, 0); }
  function _owed(loan)   { return Math.max(0, loan.amount - _paid(loan)); }
  function _pct(loan)    { return loan.amount > 0 ? Math.min(100, Math.round((_paid(loan) / loan.amount) * 100)) : 0; }
  function _done(loan)   { return _owed(loan) === 0; }

  /* ─── Render ─── */
  function render() {
    const el = document.getElementById('loans-content');
    if (!el) return;

    const loans  = Storage.getLoans();
    const active = loans.filter(l => !_done(l));
    const paid   = loans.filter(l =>  _done(l));
    const totalOwed = active.reduce((s,l) => s + _owed(l), 0);
    const totalLent = loans.reduce((s,l) => s + l.amount, 0);

    el.innerHTML = `
      <div class="loan-stats">
        <div class="loan-stat-box"><div class="lsb-label">Total prestado</div><div class="lsb-val">${fmt(totalLent)}</div></div>
        <div class="loan-stat-box accent"><div class="lsb-label">Por cobrar</div><div class="lsb-val text-danger">${fmt(totalOwed)}</div></div>
        <div class="loan-stat-box"><div class="lsb-label">Activos</div><div class="lsb-val">${active.length}</div></div>
        <div class="loan-stat-box"><div class="lsb-label">Liquidados</div><div class="lsb-val text-success">${paid.length}</div></div>
      </div>

      ${active.length ? `
        <p class="list-label">Pendientes de cobro</p>
        <div class="loans-list">${active.map(_card).join('')}</div>` : `
        <div class="empty-state">
          <i class="fas fa-handshake"></i>
          <p>Sin préstamos activos</p>
          <span>Usa el botón de arriba para registrar un préstamo</span>
        </div>`}

      ${paid.length ? `
        <p class="list-label" style="margin-top:2rem">Liquidados</p>
        <div class="loans-list">${paid.map(_card).join('')}</div>` : ''}
    `;
  }

  function _card(loan) {
    const paid  = _paid(loan);
    const owed  = _owed(loan);
    const pct   = _pct(loan);
    const done  = _done(loan);
    const accs  = Storage.getAccounts();
    const acc   = accs.find(a => a.id === loan.fromAccountId);

    return `
    <div class="loan-card ${done ? 'done' : ''}">
      <div class="loan-card-top">
        <div class="loan-avatar">${esc(loan.personName.charAt(0).toUpperCase())}</div>
        <div class="loan-info">
          <div class="loan-person-name">${esc(loan.personName)}</div>
          <div class="loan-person-meta">
            ${acc ? esc(acc.name) + ' · ' : ''}${Storage.formatDate(loan.date)}
            ${loan.dueDate ? ' · Vence ' + Storage.formatDate(loan.dueDate) : ''}
          </div>
          ${loan.description ? `<div class="loan-desc">${esc(loan.description)}</div>` : ''}
        </div>
        <div class="loan-right">
          <div class="loan-amount">${fmt(loan.amount)}</div>
          <span class="loan-badge ${done ? 'done' : 'pending'}">${done ? 'Liquidado' : 'Pendiente'}</span>
        </div>
      </div>

      ${!done ? `
        <div class="loan-bar-row">
          <div class="loan-bar"><div class="loan-bar-fill" style="width:${pct}%"></div></div>
          <span class="loan-pct">${pct}%</span>
        </div>
        <div class="loan-figures">
          <span class="loan-fig"><span class="lf-label">Abonado</span><span class="text-success">${fmt(paid)}</span></span>
          <span class="loan-fig"><span class="lf-label">Por cobrar</span><span class="text-danger">${fmt(owed)}</span></span>
        </div>` : `
        <div class="loan-figures">
          <span class="loan-fig"><span class="lf-label">Pagado en ${(loan.payments||[]).length} abono(s)</span><span class="text-success">${fmt(paid)}</span></span>
        </div>`}

      <div class="loan-actions">
        ${!done ? `<button class="btn btn-ghost btn-sm" onclick="Loans.openPaymentModal('${loan.id}')"><i class="fas fa-plus"></i> Registrar pago</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="Loans.openDetailModal('${loan.id}')"><i class="fas fa-list"></i> Historial</button>
        <button class="btn-icon btn-danger" onclick="Loans._del('${loan.id}')"><i class="fas fa-trash-can"></i></button>
      </div>
    </div>`;
  }

  /* ─── Add Modal ─── */
  function openAddModal() {
    const accs = Storage.getAccounts();

    App.openModal('Nuevo préstamo', `
      ${!accs.length ? `
        <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:6px;padding:.75rem 1rem;margin-bottom:1rem;font-size:.82rem;color:var(--red);display:flex;align-items:center;gap:.5rem">
          <i class="fas fa-triangle-exclamation"></i>
          Necesitas tener al menos una cuenta. <a href="#" onclick="App.closeModal();App.navigate('accounts')" style="color:var(--red);text-decoration:underline;margin-left:.25rem">Crear cuenta</a>
        </div>` : ''}
      <div class="form-grid">
        <div class="form-group">
          <label>Persona / Nombre</label>
          <input id="l-person" type="text" class="form-input" placeholder="Ej: Juan Pérez" autocomplete="off" />
        </div>
        <div class="form-group">
          <label>Fecha</label>
          <input id="l-date" type="date" class="form-input" value="${new Date().toISOString().slice(0,10)}" />
        </div>
        <div class="form-group">
          <label>Monto (MXN)</label>
          <input id="l-amount" type="number" class="form-input" placeholder="0.00" min="0.01" step="0.01" />
        </div>
        <div class="form-group">
          <label>Cuenta origen</label>
          <select id="l-account" class="form-input">
            <option value="">Seleccionar...</option>
            ${accs.map(a => `<option value="${a.id}">${esc(a.name)} (${Storage.accountTypeLabel(a.type)})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Descripción (opcional)</label>
          <input id="l-desc" type="text" class="form-input" placeholder="Motivo del préstamo..." autocomplete="off" />
        </div>
        <div class="form-group">
          <label>Fecha de vencimiento (opcional)</label>
          <input id="l-due" type="date" class="form-input" />
        </div>
        <div class="form-group" style="grid-column:span 2">
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

  function _create() {
    const personName    = document.getElementById('l-person')?.value.trim();
    const amount        = parseFloat(document.getElementById('l-amount')?.value);
    const fromAccountId = document.getElementById('l-account')?.value;
    const date          = document.getElementById('l-date')?.value;
    const description   = document.getElementById('l-desc')?.value.trim();
    const dueDate       = document.getElementById('l-due')?.value || '';
    const note          = document.getElementById('l-note')?.value.trim();

    if (!personName)      { App.toast('Escribe el nombre', 'error'); return; }
    if (!amount || amount <= 0) { App.toast('El monto debe ser mayor a 0', 'error'); return; }
    if (!fromAccountId)   { App.toast('Selecciona la cuenta origen', 'error'); return; }
    if (!date)            { App.toast('Selecciona la fecha', 'error'); return; }

    // Decrease source account balance
    const accs = Storage.getAccounts();
    const idx  = accs.findIndex(a => a.id === fromAccountId);
    if (idx !== -1) {
      const a = accs[idx];
      a.balance = a.type === 'credit'
        ? (a.balance || 0) + amount   // more debt
        : (a.balance || 0) - amount;  // less funds
      Storage.saveAccounts(accs);
    }

    const loans = Storage.getLoans();
    loans.unshift({ id: uid(), personName, amount, fromAccountId, date, dueDate, description, note, payments: [], createdAt: new Date().toISOString() });
    Storage.saveLoans(loans);

    App.closeModal();
    App.toast(`Préstamo de ${fmt(amount)} a ${personName} registrado`, 'success');
    render();
  }

  /* ─── Payment Modal ─── */
  function openPaymentModal(loanId) {
    const loan = Storage.getLoans().find(l => l.id === loanId);
    if (!loan) return;
    const owed = _owed(loan);
    const accs = Storage.getAccounts();

    App.openModal(`Registrar pago — ${esc(loan.personName)}`, `
      <div class="loan-modal-info">
        Por cobrar: <strong class="text-danger">${fmt(owed)}</strong>
        &nbsp;·&nbsp; Préstamo total: <strong>${fmt(loan.amount)}</strong>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>Monto recibido</label>
          <input id="p-amount" type="number" class="form-input" min="0.01" max="${owed}" step="0.01" value="${owed}" />
        </div>
        <div class="form-group">
          <label>Fecha</label>
          <input id="p-date" type="date" class="form-input" value="${new Date().toISOString().slice(0,10)}" />
        </div>
        <div class="form-group" style="grid-column:span 2">
          <label>Cuenta donde recibes el pago</label>
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
        <button type="button" class="btn btn-primary" onclick="Loans._pay('${loanId}', ${owed})">
          <i class="fas fa-check"></i> Confirmar pago
        </button>
      </div>`);
  }

  function _pay(loanId, maxOwed) {
    const amount      = parseFloat(document.getElementById('p-amount')?.value);
    const date        = document.getElementById('p-date')?.value;
    const toAccountId = document.getElementById('p-account')?.value;
    const note        = document.getElementById('p-note')?.value.trim();

    if (!amount || amount <= 0)     { App.toast('El monto debe ser mayor a 0', 'error'); return; }
    if (amount > maxOwed + 0.001)   { App.toast(`No puede exceder ${fmt(maxOwed)}`, 'error'); return; }
    if (!date)                      { App.toast('Selecciona la fecha', 'error'); return; }

    // Increase target account balance
    if (toAccountId) {
      const accs = Storage.getAccounts();
      const idx  = accs.findIndex(a => a.id === toAccountId);
      if (idx !== -1) {
        const a = accs[idx];
        a.balance = a.type === 'credit'
          ? Math.max(0, (a.balance || 0) - amount)
          : (a.balance || 0) + amount;
        Storage.saveAccounts(accs);
      }
    }

    const loans = Storage.getLoans();
    const li = loans.findIndex(l => l.id === loanId);
    if (li !== -1) {
      loans[li].payments = loans[li].payments || [];
      loans[li].payments.push({ id: uid(), amount, date, toAccountId: toAccountId || null, note });
      Storage.saveLoans(loans);
    }

    App.closeModal();
    App.toast(`Pago de ${fmt(amount)} registrado`, 'success');
    render();
  }

  /* ─── Detail Modal ─── */
  function openDetailModal(loanId) {
    const loan = Storage.getLoans().find(l => l.id === loanId);
    if (!loan) return;
    const accs = Storage.getAccounts();
    const payments = loan.payments || [];

    App.openModal(`Historial — ${esc(loan.personName)}`, `
      <div class="loan-modal-info" style="margin-bottom:1rem">
        Préstamo: <strong>${fmt(loan.amount)}</strong> &nbsp;·&nbsp;
        Abonado: <strong class="text-success">${fmt(_paid(loan))}</strong> &nbsp;·&nbsp;
        Por cobrar: <strong class="text-danger">${fmt(_owed(loan))}</strong>
        ${loan.description ? `<br><span style="color:var(--text-muted);font-size:.82rem">${esc(loan.description)}</span>` : ''}
      </div>
      ${payments.length
        ? `<div class="loan-payment-list">
            ${payments.map(p => {
              const a = accs.find(x => x.id === p.toAccountId);
              return `<div class="loan-payment-row">
                <div class="lpr-amount text-success">${fmt(p.amount)}</div>
                <div class="lpr-meta">${Storage.formatDate(p.date)}${a ? ' · ' + esc(a.name) : ''}${p.note ? ' · ' + esc(p.note) : ''}</div>
              </div>`;
            }).join('')}
          </div>`
        : `<p style="color:var(--text-muted);text-align:center;padding:1.5rem 0;font-size:.85rem">Sin pagos registrados</p>`}
      <div class="form-actions"><button class="btn btn-ghost" onclick="App.closeModal()">Cerrar</button></div>`);
  }

  /* ─── Delete ─── */
  function _del(loanId) {
    const loan = Storage.getLoans().find(l => l.id === loanId);
    if (!loan) return;
    if (!confirm(`¿Eliminar el préstamo a ${loan.personName} por ${fmt(loan.amount)}?\n\nSe revertirán los efectos en los saldos de las cuentas.`)) return;

    const accs = Storage.getAccounts();
    const src  = accs.findIndex(a => a.id === loan.fromAccountId);
    if (src !== -1) {
      const a = accs[src];
      const netOwed = _owed(loan); // amount not yet paid back
      a.balance = a.type === 'credit'
        ? Math.max(0, (a.balance || 0) - loan.amount)
        : (a.balance || 0) + netOwed;
    }
    // Reverse payment effects
    (loan.payments || []).forEach(p => {
      if (!p.toAccountId) return;
      const i = accs.findIndex(a => a.id === p.toAccountId);
      if (i !== -1) {
        const a = accs[i];
        a.balance = a.type === 'credit'
          ? (a.balance || 0) + p.amount
          : (a.balance || 0) - p.amount;
      }
    });
    Storage.saveAccounts(accs);

    Storage.saveLoans(Storage.getLoans().filter(l => l.id !== loanId));
    App.toast('Préstamo eliminado', 'success');
    render();
  }

  /* ─── Dashboard helper ─── */
  function getTotalOwed() {
    return Storage.getLoans().reduce((s, l) => s + _owed(l), 0);
  }

  window.Loans = { render, openAddModal, openPaymentModal, openDetailModal, _create, _pay, _del, getTotalOwed };
  return window.Loans;
})();
