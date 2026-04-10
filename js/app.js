/**
 * app.js — Router principal, dashboard y coordinación general
 */
const App = (() => {

  let _toastTimer = null;
  let _appInitialized = false;

  /* ─── Init ─── */
  async function init() {
    try {
      Storage.setup(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch(e) {
      console.error('[App] Storage.setup() ERROR:', e);
      document.getElementById('app-loading').style.display = 'none';
      _showLogin();
      return;
    }

    // Mantener loading visible, login oculto mientras se verifica sesión
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-loading').style.display = 'flex';

    // Siempre escuchar cambios de sesión (login, logout, refresco)
    Storage.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        await _bootApp();
      }
      if (event === 'SIGNED_OUT') {
        document.getElementById('app-loading').style.display = 'none';
        _showLogin();
      }
    });

    // Verificar sesión existente directamente (evita el flash del login al refrescar)
    const existingSession = await Storage.getSession();
    if (existingSession) {
      await _bootApp();
      return;
    }

    // Sin sesión activa → mostrar login
    document.getElementById('app-loading').style.display = 'none';
    _showLogin();
  }

  /* ─── Boot (carga datos y muestra la app) ─── */
  async function _bootApp() {
    const loadingEl = document.getElementById('app-loading');

    if (_appInitialized) {
      loadingEl.style.display = 'none';
      navigate('dashboard');
      return;
    }

    loadingEl.style.display = 'flex';

    try {
      await Storage.loadAll();
      if (!localStorage.getItem('fz_migrated_v2')) {
        const count = await Storage.migrateFromLocalStorage();
        if (count > 0) console.info(`[Migration] ${count} registros migrados`);
      }
    } catch (err) {
      console.error('[App] Error al cargar datos:', err);
      // Si es error de autenticación, limpiar sesión y mostrar login
      if (err?.status === 401 || err?.message?.includes('401') || err?.message?.includes('JWT')) {
        await Storage.signOut().catch(() => {});
        loadingEl.style.display = 'none';
        _showLogin();
        return;
      }
      loadingEl.innerHTML = `
        <div style="text-align:center;padding:2rem;max-width:420px">
          <i class="fas fa-triangle-exclamation" style="font-size:2rem;color:var(--red);margin-bottom:1rem;display:block"></i>
          <p style="font-weight:700;color:var(--white);margin-bottom:.5rem">Error de conexión</p>
          <p style="font-size:.83rem;color:var(--text-muted);line-height:1.6">
            No se pudo conectar con Supabase.<br>
            Verifica que las credenciales en <code>js/config.js</code> sean correctas.
          </p>
        </div>`;
      return;
    }

    loadingEl.style.display = 'none';
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    // Mostrar email del usuario en el sidebar
    Storage.getUser().then(user => {
      const el = document.getElementById('sidebar-user-email');
      if (el && user) el.textContent = user.email;
    });

    _setupNav();
    _setupGlobalListeners();
    _appInitialized = true;
    navigate('dashboard');
  }

  /* ─── Login ─── */
  function _showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    _setupLoginListeners();
  }

  function _setupLoginListeners() {
    let isSignUp = false;

    // Clonar botones para limpiar listeners previos
    ['auth-submit-btn', 'auth-toggle-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.replaceWith(el.cloneNode(true));
    });

    document.getElementById('auth-submit-btn').addEventListener('click', async () => {
      const email    = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      const btn      = document.getElementById('auth-submit-btn');
      const errorEl  = document.getElementById('auth-error');
      const successEl = document.getElementById('auth-success');

      if (!email || !password) { _showAuthMsg('error', 'Completa todos los campos'); return; }

      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${isSignUp ? 'Creando...' : 'Entrando...'}`;
      if (errorEl)   errorEl.style.display   = 'none';
      if (successEl) successEl.style.display = 'none';

      try {
        if (isSignUp) {
          await Storage.signUp(email, password);
          _showAuthMsg('success', 'Cuenta creada. Revisa tu correo para confirmarla.');
        } else {
          await Storage.signIn(email, password);
          // onAuthStateChange se encarga del resto
        }
      } catch (err) {
        _showAuthMsg('error', _translateAuthError(err.message));
      } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-right-to-bracket"></i> ${isSignUp ? 'Crear cuenta' : 'Entrar'}`;
      }
    });

    document.getElementById('auth-toggle-btn').addEventListener('click', () => {
      isSignUp = !isSignUp;
      document.getElementById('auth-heading').textContent = isSignUp ? 'Crear cuenta' : 'Iniciar sesión';
      document.getElementById('auth-submit-btn').innerHTML = `<i class="fas fa-right-to-bracket"></i> ${isSignUp ? 'Crear cuenta' : 'Entrar'}`;
      document.getElementById('auth-toggle-btn').innerHTML = isSignUp
        ? '¿Ya tienes cuenta? <strong>Iniciar sesión</strong>'
        : '¿No tienes cuenta? <strong>Crear cuenta</strong>';
      document.getElementById('auth-error').style.display   = 'none';
      document.getElementById('auth-success').style.display = 'none';
    });

    document.getElementById('auth-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('auth-submit-btn').click();
    });
  }

  function _showAuthMsg(type, msg) {
    const el = document.getElementById(type === 'error' ? 'auth-error' : 'auth-success');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function _translateAuthError(msg) {
    if (msg.includes('Invalid login'))          return 'Correo o contraseña incorrectos';
    if (msg.includes('Email not confirmed'))    return 'Confirma tu correo antes de entrar';
    if (msg.includes('User already registered'))return 'Ya existe una cuenta con ese correo';
    if (msg.includes('Password should be'))     return 'La contraseña debe tener al menos 6 caracteres';
    return msg;
  }

  async function signOut() {
    try {
      await Storage.signOut();
      window.location.reload();
    } catch (err) {
      toast('Error al cerrar sesión', 'error');
    }
  }

  function _setupNav() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        if (section) navigate(section);
      });
    });
  }

  function _setupGlobalListeners() {
    // Close modal on overlay click
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') closeModal();
    });

    // ESC to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Transaction filters
    document.getElementById('filter-month')?.addEventListener('change', (e) => {
      Transactions._renderList && Transactions._renderList();
    });

    // Credit card selects
    document.getElementById('credit-account-select')?.addEventListener('change', () => {
      Installments.renderCreditStatement();
    });
    document.getElementById('credit-month-select')?.addEventListener('change', () => {
      Installments.renderCreditStatement();
    });

    // Sidebar toggle for mobile
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });
  }

  /* ─── Navigation ─── */
  function navigate(section) {
    // Update nav links
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.dataset.section === section);
    });

    // Hide all sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    // Show target section
    const target = document.getElementById(`section-${section}`);
    if (target) target.classList.add('active');

    // Close sidebar on mobile
    document.getElementById('sidebar')?.classList.remove('open');

    // Render section content
    Charts.destroyAll();
    switch (section) {
      case 'dashboard':    renderDashboard(); break;
      case 'accounts':    Accounts.render(); break;
      case 'transactions':
        Transactions.render({ month: Storage.getCurrentMonth() });
        break;
      case 'credit':      _initCreditSection(); break;
      case 'installments':Installments.render(); break;
      case 'budget':      Budget.render(); break;
      case 'settings':    Categories.render(); break;
      case 'loans':       Loans.render(); break;
      case 'export':      _renderExportSection(); break;
    }
  }

  /* ─── Dashboard ─── */
  function renderDashboard() {
    const summary = Accounts.getSummary();
    const transactions = Storage.getTransactions();
    const currentMonth = Storage.getCurrentMonth();
    const monthTxs = Transactions.getForMonth(currentMonth);

    const monthIncome = monthTxs.filter(t => t.type === 'income' && !t.skipBudget).reduce((s, t) => s + t.amount, 0);
    const monthExpense = monthTxs.filter(t => t.type === 'expense' && !t.skipBudget).reduce((s, t) => s + t.amount, 0);

    // Stat cards
    _setEl('db-assets', Storage.formatCurrency(summary.assets));
    _setEl('db-debt', Storage.formatCurrency(summary.debt));
    _setEl('db-net', Storage.formatCurrency(summary.net));
    _setEl('db-income', '+' + Storage.formatCurrency(monthIncome));
    _setEl('db-expense', '-' + Storage.formatCurrency(monthExpense));

    const balance = monthIncome - monthExpense;
    const balEl = document.getElementById('db-balance');
    if (balEl) {
      balEl.textContent = (balance >= 0 ? '+' : '') + Storage.formatCurrency(balance);
      balEl.className = balance >= 0 ? 'stat-value text-success' : 'stat-value text-danger';
    }

    // Por cobrar (préstamos)
    const loansOwed = typeof Loans !== 'undefined' ? Loans.getTotalOwed() : 0;
    _setEl('db-due', Storage.formatCurrency(loansOwed));

    // Recent transactions
    const recent = Transactions.getRecent(6);
    const recentEl = document.getElementById('db-recent');
    if (recentEl) {
      if (!recent.length) {
        recentEl.innerHTML = `<div class="empty-state-sm"><i class="fas fa-receipt"></i><p>Sin movimientos recientes</p></div>`;
      } else {
        const icons = { income: 'fa-arrow-down', expense: 'fa-arrow-up', transfer: 'fa-arrows-left-right' };
        const colors = { income: 'var(--green)', expense: 'var(--red)', transfer: 'var(--blue)' };
        const signs = { income: '+', expense: '-', transfer: '' };
        const amtCls = { income: 'text-success', expense: 'text-danger', transfer: 'text-blue' };
        recentEl.innerHTML = recent.map(t => `
          <div class="recent-tx">
            <div class="recent-tx-icon" style="background:${colors[t.type]}22;color:${colors[t.type]}">
              <i class="fas ${icons[t.type]}"></i>
            </div>
            <div class="recent-tx-info">
              <span>${_esc(t.description || Storage.typeLabel(t.type))}</span>
              <span class="text-muted" style="font-size:.75rem">${Storage.formatDate(t.date)}</span>
            </div>
            <div class="recent-tx-amount ${amtCls[t.type]}">${signs[t.type]}${Storage.formatCurrency(t.amount)}</div>
          </div>`).join('');
      }
    }

    // Upcoming installments
    const upcoming = Installments.getUpcomingInstallments();
    const upEl = document.getElementById('db-upcoming');
    if (upEl) {
      if (!upcoming.length) {
        upEl.innerHTML = `<div class="empty-state-sm"><i class="fas fa-calendar-check"></i><p>Sin pagos este mes</p></div>`;
      } else {
        upEl.innerHTML = upcoming.map(i => `
          <div class="upcoming-item">
            <div class="upcoming-info">
              <span class="upcoming-name">${_esc(i.description)}</span>
              <span class="text-muted" style="font-size:.75rem">${Accounts.getName(i.accountId)}</span>
            </div>
            <span class="upcoming-amount text-danger">${Storage.formatCurrency(i.dueAmount)}</span>
          </div>`).join('');
      }
    }

    // Budget alerts
    const alerts = Budget.getAlerts ? Budget.getAlerts() : [];
    const alertsEl = document.getElementById('db-budget-alerts');
    if (alertsEl) {
      if (!alerts.length) {
        alertsEl.innerHTML = `<div class="empty-state-sm"><i class="fas fa-check-circle" style="color:var(--green)"></i><p>Todo dentro del presupuesto</p></div>`;
      } else {
        alertsEl.innerHTML = alerts.map(a => `
          <div class="budget-alert-item ${a.pct >= 100 ? 'over' : 'warn'}">
            <div class="budget-alert-info">
              <span>${a.cat}</span>
              <span class="text-muted" style="font-size:.72rem">${Storage.formatCurrency(a.spent)} / ${Storage.formatCurrency(a.limit)}</span>
            </div>
            <span class="budget-alert-pct ${a.pct >= 100 ? 'text-danger' : 'text-warning'}">${a.pct}%</span>
          </div>`).join('');
      }
    }

    // Charts (with slight delay to ensure DOM is ready)
    setTimeout(() => {
      Charts.renderExpenseDonut('chart-donut', monthTxs);
      Charts.renderMonthlyBar('chart-bar', transactions);
    }, 50);
  }

  /* ─── Credit Section Init ─── */
  function _initCreditSection() {
    const creditAccounts = Storage.getAccounts().filter(a => a.type === 'credit');

    // Populate account select
    const accSel = document.getElementById('credit-account-select');
    if (accSel) {
      accSel.innerHTML = creditAccounts.length
        ? creditAccounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('')
        : `<option value="">Sin tarjetas</option>`;
    }

    // Month navigation
    const monthSel = document.getElementById('credit-month-select');
    if (monthSel) {
      // Build last 12 + next 6 months
      const months = [];
      for (let i = -3; i <= 12; i++) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() + i);
        months.push(d.toISOString().slice(0, 7));
      }
      const current = Storage.getCurrentMonth();
      monthSel.innerHTML = months.map(m =>
        `<option value="${m}" ${m===current?'selected':''}>${Storage.formatMonth(m)}</option>`
      ).join('');
    }

    Installments.renderCreditStatement();
  }

  /* ─── Export Section ─── */
  function _renderExportSection() {
    const transactions = Storage.getTransactions();
    const accounts = Storage.getAccounts();
    const installments = Storage.getInstallments();

    const statsEl = document.getElementById('export-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="export-stat"><i class="fas fa-receipt"></i><span>${transactions.length} transacciones</span></div>
        <div class="export-stat"><i class="fas fa-wallet"></i><span>${accounts.length} cuentas</span></div>
        <div class="export-stat"><i class="fas fa-calendar-check"></i><span>${installments.length} plazos</span></div>
      `;
    }
  }

  /* ─── Modal ─── */
  function openModal(title, bodyHTML) {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    if (!overlay || !titleEl || !bodyEl) return;

    titleEl.textContent = title;
    bodyEl.innerHTML = bodyHTML;
    overlay.classList.remove('hidden');
    overlay.offsetHeight; // force reflow so CSS transition fires
    overlay.classList.add('visible');

    // Focus first input
    setTimeout(() => {
      const firstInput = bodyEl.querySelector('input, select, textarea');
      firstInput?.focus();
    }, 50);
  }

  function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 200);
  }

  /* ─── Toast Notifications ─── */
  function toast(message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const t = document.createElement('div');
    t.className = `toast toast-${type || 'info'}`;
    const icon = type === 'success' ? 'fa-check-circle'
                : type === 'error' ? 'fa-exclamation-circle'
                : 'fa-info-circle';
    t.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    container.appendChild(t);

    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, 3500);
  }

  /* ─── Export / Import handlers ─── */
  function exportCSV() {
    const count = Storage.exportCSV();
    toast(`${count} transacciones exportadas`, 'success');
  }

  function triggerImport() {
    document.getElementById('csv-import-input')?.click();
  }

  function handleImport(input) {
    const file = input.files[0];
    if (!file) return;
    Storage.importCSV(file,
      (count) => {
        toast(`${count} transacciones importadas`, 'success');
        input.value = '';
        navigate('transactions');
      },
      (err) => {
        toast(`Error al importar: ${err}`, 'error');
        input.value = '';
      }
    );
  }

  /* ─── Filter handlers ─── */
  function applyFilters() {
    Transactions.render({
      type: document.getElementById('filter-type')?.value || 'all',
      month: document.getElementById('filter-month')?.value || 'all',
      account: document.getElementById('filter-account')?.value || 'all',
      category: document.getElementById('filter-category')?.value || 'all',
      search: document.getElementById('filter-search')?.value || ''
    });
  }

  function clearFilters() {
    Transactions.render({
      type: 'all',
      month: Storage.getCurrentMonth(),
      account: 'all',
      category: 'all',
      search: ''
    });
  }

  /* ─── Helpers ─── */
  function _setEl(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  window.App = {
    init, navigate, renderDashboard,
    openModal, closeModal, toast,
    exportCSV, triggerImport, handleImport,
    applyFilters, clearFilters, signOut
  };
  return window.App;
})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
