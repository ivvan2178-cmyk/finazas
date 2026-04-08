/**
 * storage.js — Caché local + sincronización con Supabase
 *
 * API pública idéntica a la anterior (síncrona desde la vista de los módulos).
 * Los get*() leen del caché en memoria.
 * Los save*() actualizan el caché inmediatamente y sincronizan con Supabase
 * en background (fire-and-forget con manejo de errores).
 */
const Storage = (() => {

  let _db = null;
  let _pending = 0;   // saves en vuelo

  /* ─── Valores por defecto ─── */
  const DEFAULT_EXPENSE_CATS = [
    'Comida / Restaurante', 'Servicios', 'Transporte', 'Salud',
    'Salida / Entretenimiento', 'Super / Despensa', 'Ropa / Moda',
    'Educación', 'Hogar / Mantenimiento', 'Suscripciones', 'Plazos / MSI', 'Otros Gastos'
  ];
  const DEFAULT_INCOME_CATS = [
    'Salario', 'Inversión / Rendimientos', 'Dinero Extra', 'Otros Ingresos'
  ];

  /* ─── Caché en memoria ─── */
  const _cache = {
    accounts:     [],
    transactions: [],
    installments: [],
    loans:        [],
    expenseCats:  null,
    incomeCats:   null,
    budgets:      {}
  };

  /* ══════════════════════════════════════
     Init & carga inicial
  ══════════════════════════════════════ */

  /** Llamar antes de loadAll() con las credenciales de config.js */
  function setup(url, key) {
    _db = window.supabase.createClient(url, key);
  }

  /** Carga todos los datos desde Supabase al caché. Async. */
  async function loadAll() {
    const _timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('loadAll timeout: Supabase no respondió en 15s')), 15000)
    );

    const results = await Promise.race([
      Promise.all([
        _db.from('accounts').select('*'),
        _db.from('transactions').select('*'),
        _db.from('installments').select('*'),
        _db.from('loans').select('*'),
        _db.from('settings').select('*')
      ]),
      _timeout
    ]);

    const [
      { data: accounts,     error: e1 },
      { data: transactions, error: e2 },
      { data: installments, error: e3 },
      { data: loans,        error: e4 },
      { data: settingsRows, error: e5 }
    ] = results;

    const authError = [e1, e2, e3, e4, e5].find(e => e && (e.status === 401 || e.message?.includes('JWT') || e.message?.includes('not authorized')));
    if (authError) throw authError;
    // Errores no-auth: loguear pero no bloquear la carga (ej. schema cache desactualizado)
    [e1, e2, e3, e4, e5].forEach(e => e && console.warn('[Storage] loadAll warning:', e.message));

    _cache.accounts     = accounts     || [];
    _cache.transactions = (transactions || []).map(_unpackMeta);
    _cache.installments = (installments || []).map(_unpackMeta);
    _cache.loans        = loans        || [];

    // settings → categorías y presupuestos
    const settings = {};
    (settingsRows || []).forEach(r => { settings[r.key] = r.value; });

    _cache.expenseCats = settings.expense_cats  || [...DEFAULT_EXPENSE_CATS];
    _cache.incomeCats  = settings.income_cats   || [...DEFAULT_INCOME_CATS];
    _cache.budgets     = settings.budgets       || {};

    // Sembrar categorías por defecto si es la primera vez
    if (!settings.expense_cats) {
      _save(async () => {
        await _db.from('settings').upsert([
          { key: 'expense_cats', value: DEFAULT_EXPENSE_CATS },
          { key: 'income_cats',  value: DEFAULT_INCOME_CATS  }
        ]);
      });
    }
  }

  /* ══════════════════════════════════════
     Migración desde localStorage
  ══════════════════════════════════════ */
  async function migrateFromLocalStorage() {
    const LS = {
      accounts:     'fz_accounts',
      transactions: 'fz_transactions',
      installments: 'fz_installments',
      loans:        'fz_loans',
      expenseCats:  'fz_expense_cats',
      incomeCats:   'fz_income_cats',
      budgets:      'fz_budgets'
    };

    const hasData = Object.values(LS).some(k => localStorage.getItem(k));
    if (!hasData) return 0;

    let migrated = 0;

    const accounts = JSON.parse(localStorage.getItem(LS.accounts) || '[]');
    if (accounts.length) {
      const { error } = await _db.from('accounts').upsert(accounts);
      if (!error) { _cache.accounts = accounts; migrated += accounts.length; }
      else console.error('[Migration] accounts:', error.message);
    }

    const transactions = JSON.parse(localStorage.getItem(LS.transactions) || '[]');
    if (transactions.length) {
      const { error } = await _db.from('transactions').upsert(transactions);
      if (!error) { _cache.transactions = transactions; migrated += transactions.length; }
      else console.error('[Migration] transactions:', error.message);
    }

    const installments = JSON.parse(localStorage.getItem(LS.installments) || '[]');
    if (installments.length) {
      const { error } = await _db.from('installments').upsert(installments);
      if (!error) { _cache.installments = installments; migrated += installments.length; }
      else console.error('[Migration] installments:', error.message);
    }

    const loans = JSON.parse(localStorage.getItem(LS.loans) || '[]');
    if (loans.length) {
      const { error } = await _db.from('loans').upsert(loans);
      if (!error) { _cache.loans = loans; migrated += loans.length; }
      else console.error('[Migration] loans:', error.message);
    }

    const expenseCats = JSON.parse(localStorage.getItem(LS.expenseCats) || 'null');
    const incomeCats  = JSON.parse(localStorage.getItem(LS.incomeCats)  || 'null');
    const budgets     = JSON.parse(localStorage.getItem(LS.budgets)     || 'null');

    const settingsUpsert = [];
    if (expenseCats) { _cache.expenseCats = expenseCats; settingsUpsert.push({ key: 'expense_cats', value: expenseCats }); }
    if (incomeCats)  { _cache.incomeCats  = incomeCats;  settingsUpsert.push({ key: 'income_cats',  value: incomeCats  }); }
    if (budgets)     { _cache.budgets     = budgets;     settingsUpsert.push({ key: 'budgets',      value: budgets     }); }
    if (settingsUpsert.length) await _db.from('settings').upsert(settingsUpsert);

    // Marcar como migrado y limpiar localStorage
    Object.values(LS).forEach(k => localStorage.removeItem(k));
    localStorage.setItem('fz_migrated_v2', '1');

    return migrated;
  }

  /* ══════════════════════════════════════
     Helper de persistencia
  ══════════════════════════════════════ */

  /** Ejecuta fn() async; actualiza el indicador de sincronización */
  function _save(fn) {
    _pending++;
    _syncUI(true);
    fn()
      .catch(err => {
        const msg = err?.message || String(err);
        console.error('[Storage] sync error:', msg);
        // Mostrar error visible al usuario para debugging
        if (typeof App !== 'undefined' && App.toast) {
          App.toast('Error al guardar: ' + msg, 'error');
        }
      })
      .finally(() => { _pending--; _syncUI(_pending > 0); });
  }

  function _syncUI(saving) {
    const el = document.getElementById('sync-indicator');
    if (el) el.style.display = saving ? 'flex' : 'none';
  }

  function isSyncing() { return _pending > 0; }

  /* ══════════════════════════════════════
     Cuentas
  ══════════════════════════════════════ */
  function getAccounts() { return [..._cache.accounts]; }

  function saveAccounts(newData) {
    const deleted = _cache.accounts.map(a => a.id).filter(id => !newData.some(a => a.id === id));
    _cache.accounts = [...newData];
    _save(async () => {
      if (deleted.length) await _db.from('accounts').delete().in('id', deleted);
      if (newData.length) {
        const { error } = await _db.from('accounts').upsert(newData);
        if (error) throw error;
      }
    });
  }

  /* ══════════════════════════════════════
     Meta helpers — campos extra en jsonb
  ══════════════════════════════════════ */

  // Campos que NO son columnas nativas de la tabla y se guardan en meta jsonb
  const _TX_META   = ['skipBudget','isDebt','isLoan','isLoanPayment','loanId','installmentId'];
  const _INST_META = ['paidMonths','date'];

  // Antes de enviar a Supabase: mueve campos extra a { meta: {...} }
  function _packMeta(obj, metaFields) {
    const meta = {};
    const row  = {};
    Object.entries(obj).forEach(([k, v]) => {
      if (metaFields.includes(k)) {
        if (v !== undefined && v !== null && v !== false && !(Array.isArray(v) && v.length === 0))
          meta[k] = v;
      } else {
        row[k] = v;
      }
    });
    row.meta = Object.keys(meta).length ? meta : null;
    return row;
  }

  // Al cargar desde Supabase: expande meta de vuelta al objeto
  function _unpackMeta(row) {
    if (!row) return row;
    const { meta, ...rest } = row;
    return meta ? { ...rest, ...meta } : rest;
  }

  /* ══════════════════════════════════════
     Transacciones
  ══════════════════════════════════════ */
  function getTransactions() { return [..._cache.transactions]; }

  function saveTransactions(newData) {
    const deleted = _cache.transactions.map(t => t.id).filter(id => !newData.some(t => t.id === id));
    _cache.transactions = [...newData];
    _save(async () => {
      if (deleted.length) await _db.from('transactions').delete().in('id', deleted);
      if (newData.length) {
        const rows = newData.map(t => _packMeta(t, _TX_META));
        const { error } = await _db.from('transactions').upsert(rows);
        if (error) throw error;
      }
    });
  }

  /* ══════════════════════════════════════
     Plazos (MSI)
  ══════════════════════════════════════ */
  function getInstallments() { return [..._cache.installments]; }

  function saveInstallments(newData) {
    const deleted = _cache.installments.map(i => i.id).filter(id => !newData.some(i => i.id === id));
    _cache.installments = [...newData];
    _save(async () => {
      if (deleted.length) await _db.from('installments').delete().in('id', deleted);
      if (newData.length) {
        const rows = newData.map(i => _packMeta(i, _INST_META));
        const { error } = await _db.from('installments').upsert(rows);
        if (error) throw error;
      }
    });
  }

  /* ══════════════════════════════════════
     Préstamos
  ══════════════════════════════════════ */
  function getLoans() { return [..._cache.loans]; }

  function saveLoans(newData) {
    const deleted = _cache.loans.map(l => l.id).filter(id => !newData.some(l => l.id === id));
    _cache.loans = [...newData];
    _save(async () => {
      if (deleted.length) await _db.from('loans').delete().in('id', deleted);
      if (newData.length) {
        const { error } = await _db.from('loans').upsert(newData);
        if (error) throw error;
      }
    });
  }

  /* ══════════════════════════════════════
     Categorías
  ══════════════════════════════════════ */
  function getExpenseCategories() { return [...(_cache.expenseCats || DEFAULT_EXPENSE_CATS)]; }
  function getIncomeCategories()  { return [...(_cache.incomeCats  || DEFAULT_INCOME_CATS)];  }

  function saveExpenseCategories(cats) {
    _cache.expenseCats = [...cats];
    _save(async () => {
      const { error } = await _db.from('settings').upsert({ key: 'expense_cats', value: cats });
      if (error) throw error;
    });
  }

  function saveIncomeCategories(cats) {
    _cache.incomeCats = [...cats];
    _save(async () => {
      const { error } = await _db.from('settings').upsert({ key: 'income_cats', value: cats });
      if (error) throw error;
    });
  }

  /* ══════════════════════════════════════
     Presupuesto
  ══════════════════════════════════════ */
  function getBudgetForMonth(monthStr) {
    return { ...(_cache.budgets[monthStr] || {}) };
  }

  function saveBudgetForMonth(monthStr, limits) {
    _cache.budgets = { ..._cache.budgets, [monthStr]: { ...limits } };
    const snapshot = { ..._cache.budgets };
    _save(async () => {
      const { error } = await _db.from('settings').upsert({ key: 'budgets', value: snapshot });
      if (error) throw error;
    });
  }

  /* ══════════════════════════════════════
     Utilidades (sin cambios)
  ══════════════════════════════════════ */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'MXN',
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(parseFloat(amount) || 0);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
  }

  function formatMonth(monthStr) {
    if (!monthStr) return '—';
    const [y, m] = monthStr.split('-');
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `${months[parseInt(m)-1]} ${y}`;
  }

  function getCurrentDate()  { return new Date().toISOString().slice(0, 10); }
  function getCurrentMonth() { return new Date().toISOString().slice(0, 7); }

  function typeLabel(type) {
    return { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia' }[type] || type;
  }

  function accountTypeLabel(type) {
    return { debit: 'Débito / Banco', credit: 'Tarjeta de Crédito', cash: 'Efectivo', savings: 'Ahorro' }[type] || type;
  }

  /* ══════════════════════════════════════
     Export / Import CSV (sin cambios)
  ══════════════════════════════════════ */
  function exportCSV() {
    const transactions = getTransactions();
    const aMap = {};
    getAccounts().forEach(a => aMap[a.id] = a.name);

    const headers = ['Fecha','Tipo','Categoría','Descripción','Nota','Monto (MXN)','Cuenta','Cuenta Destino'];
    const rows = transactions.map(t => [
      t.date || '', typeLabel(t.type), t.category || '',
      t.description || '', t.nota || '', t.amount || 0,
      aMap[t.accountId] || '',
      t.toAccountId ? (aMap[t.toAccountId] || '') : ''
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `finanzas_${getCurrentDate()}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    return transactions.length;
  }

  function importCSV(file, onSuccess, onError) {
    const reader = new FileReader();
    reader.onerror = () => onError('No se pudo leer el archivo.');
    reader.onload = (e) => {
      try {
        const text  = e.target.result.replace(/^\uFEFF/, '');
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) throw new Error('El archivo está vacío o no tiene datos.');

        const aByName = {};
        getAccounts().forEach(a => aByName[a.name.toLowerCase().trim()] = a.id);

        const typeMap = { 'ingreso': 'income', 'gasto': 'expense', 'transferencia': 'transfer' };
        const existing = getTransactions();
        const added = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = _parseCSVRow(lines[i]);
          if (cols.length < 6) continue;
          const [date, typeStr, category, description, nota, amountStr, accountName, toAccountName] = cols;
          const type = typeMap[typeStr.toLowerCase().trim()];
          if (!type) continue;
          const accountId = aByName[accountName.toLowerCase().trim()];
          if (!accountId) continue;
          added.push({
            id: generateId(), date: date.trim(), type,
            category: (category || '').trim(), description: (description || '').trim(),
            nota: (nota || '').trim(),
            amount: parseFloat((amountStr || '0').replace(/[^0-9.-]/g, '')) || 0,
            accountId,
            toAccountId: toAccountName ? (aByName[toAccountName.toLowerCase().trim()] || null) : null,
            installmentId: null
          });
        }

        existing.push(...added);
        saveTransactions(existing);
        onSuccess(added.length);
      } catch (err) { onError(err.message); }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function _parseCSVRow(row) {
    const result = []; let cur = '', inQ = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') { if (inQ && row[i+1] === '"') { cur += '"'; i++; } else { inQ = !inQ; } }
      else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur); return result;
  }

  /* ══════════════════════════════════════
     Auth
  ══════════════════════════════════════ */
  async function signIn(email, password) {
    const { error } = await _db.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email, password) {
    const { error } = await _db.auth.signUp({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await _db.auth.signOut();
    if (error) throw error;
  }

  async function getUser() {
    const { data: { user } } = await _db.auth.getUser();
    return user;
  }

  function onAuthStateChange(callback) {
    return _db.auth.onAuthStateChange(callback);
  }

  /* ── Expose ── */
  return {
    setup, loadAll, isSyncing, migrateFromLocalStorage,
    signIn, signUp, signOut, getUser, onAuthStateChange,
    getAccounts, saveAccounts,
    getTransactions, saveTransactions,
    getInstallments, saveInstallments,
    getLoans, saveLoans,
    getExpenseCategories, saveExpenseCategories,
    getIncomeCategories, saveIncomeCategories,
    getBudgetForMonth, saveBudgetForMonth,
    generateId, formatCurrency, formatDate, formatMonth,
    getCurrentDate, getCurrentMonth,
    typeLabel, accountTypeLabel,
    EXPENSE_CATEGORIES: DEFAULT_EXPENSE_CATS,
    INCOME_CATEGORIES:  DEFAULT_INCOME_CATS,
    exportCSV, importCSV
  };
})();
