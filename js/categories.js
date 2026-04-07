/**
 * categories.js — Gestión dinámica de categorías de gastos e ingresos
 */
const Categories = (() => {

  /* ─── Render ─── */
  function render() {
    const container = document.getElementById('settings-content');
    if (!container) return;

    const expenseCats = Storage.getExpenseCategories();
    const incomeCats  = Storage.getIncomeCategories();

    container.innerHTML = `
      <div class="settings-grid">

        <!-- GASTOS -->
        <div class="settings-card">
          <div class="settings-card-header">
            <span class="settings-card-title">
              <i class="fas fa-arrow-up" style="color:var(--red)"></i> Categorías de Gastos
            </span>
            <span class="settings-card-count">${expenseCats.length}</span>
          </div>
          <div class="cat-list" id="expense-cat-list">
            ${expenseCats.map((c, i) => _catChip(c, 'expense', i)).join('')}
          </div>
          <div class="add-cat-row">
            <input id="new-expense-cat" type="text" class="form-input"
              placeholder="Nueva categoría de gasto..."
              onkeydown="if(event.key==='Enter')Categories.addCategory('expense')" />
            <button class="btn btn-primary btn-sm" onclick="Categories.addCategory('expense')">
              <i class="fas fa-plus"></i>
            </button>
          </div>
        </div>

        <!-- INGRESOS -->
        <div class="settings-card">
          <div class="settings-card-header">
            <span class="settings-card-title">
              <i class="fas fa-arrow-down" style="color:var(--green)"></i> Categorías de Ingresos
            </span>
            <span class="settings-card-count">${incomeCats.length}</span>
          </div>
          <div class="cat-list" id="income-cat-list">
            ${incomeCats.map((c, i) => _catChip(c, 'income', i)).join('')}
          </div>
          <div class="add-cat-row">
            <input id="new-income-cat" type="text" class="form-input"
              placeholder="Nueva categoría de ingreso..."
              onkeydown="if(event.key==='Enter')Categories.addCategory('income')" />
            <button class="btn btn-primary btn-sm" onclick="Categories.addCategory('income')">
              <i class="fas fa-plus"></i>
            </button>
          </div>
        </div>

      </div>

      <div class="settings-note">
        <i class="fas fa-circle-info"></i>
        <p>Solo puedes eliminar categorías que no tengan movimientos registrados. Las categorías se usan en Movimientos y Presupuesto.</p>
      </div>
    `;

    // Event delegation para botones de eliminar (evita XSS via onclick)
    container.querySelectorAll('.cat-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteCategory(btn.dataset.type, btn.dataset.name));
    });
  }

  function _catChip(name, type, idx) {
    return `
      <div class="cat-chip" id="cat-chip-${type}-${idx}">
        <span class="cat-chip-text">${_esc(name)}</span>
        <button class="cat-delete"
          data-type="${_esc(type)}"
          data-name="${_esc(name)}"
          title="Eliminar categoría">
          <i class="fas fa-xmark"></i>
        </button>
      </div>`;
  }

  /* ─── Agregar categoría ─── */
  function addCategory(type) {
    const inputId = type === 'expense' ? 'new-expense-cat' : 'new-income-cat';
    const input = document.getElementById(inputId);
    const name = (input?.value || '').trim();

    if (!name) { App.toast('Escribe el nombre de la categoría', 'error'); return; }

    if (type === 'expense') {
      const cats = Storage.getExpenseCategories();
      if (cats.some(c => c.toLowerCase() === name.toLowerCase())) {
        App.toast('Esta categoría ya existe', 'error'); return;
      }
      cats.push(name);
      Storage.saveExpenseCategories(cats);
    } else {
      const cats = Storage.getIncomeCategories();
      if (cats.some(c => c.toLowerCase() === name.toLowerCase())) {
        App.toast('Esta categoría ya existe', 'error'); return;
      }
      cats.push(name);
      Storage.saveIncomeCategories(cats);
    }

    if (input) input.value = '';
    App.toast(`Categoría "${name}" agregada`, 'success');
    render();
  }

  /* ─── Eliminar categoría ─── */
  function deleteCategory(type, name) {
    const txs = Storage.getTransactions();
    const inUse = txs.some(t => t.category === name);
    if (inUse) {
      App.toast(`No puedes eliminar "${name}": tiene movimientos registrados.`, 'error');
      return;
    }

    if (!confirm(`¿Eliminar la categoría "${name}"?`)) return;

    if (type === 'expense') {
      Storage.saveExpenseCategories(Storage.getExpenseCategories().filter(c => c !== name));
    } else {
      Storage.saveIncomeCategories(Storage.getIncomeCategories().filter(c => c !== name));
    }

    App.toast(`Categoría eliminada`, 'success');
    render();
  }

  function _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.Categories = { render, addCategory, deleteCategory };
  return window.Categories;
})();
