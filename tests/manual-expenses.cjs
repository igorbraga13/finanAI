// Execute: node tests/manual-expenses.cjs. Sem dados pessoais ou chamadas de API.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
    const root = path.resolve(__dirname, '..');
    const storage = new Map();
    let storageBlocked = false;
    const nodes = new Map();
    const notifications = [];
    function element() {
        const classes = new Set(['hidden']);
        return { value: '', innerHTML: '', focus() {}, classList: {
            add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c)
        } };
    }
    for (const id of ['expenseForm', 'expenseModal', 'expenseModalTitle', 'expenseEditId', 'expenseDateInput',
        'expenseDescInput', 'expenseCategoryInput', 'expenseCurrencyInput', 'expenseAmountInput']) nodes.set(id, element());
    nodes.get('expenseForm').reset = () => {
        for (const [id, el] of nodes) if (id.endsWith('Input') || id === 'expenseEditId') el.value = '';
    };
    const context = vm.createContext({
        console,
        confirm: () => true,
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem(key, value) { if (storageBlocked) throw new Error('blocked'); storage.set(key, value); }
        },
        document: { getElementById: id => nodes.get(id) || null },
        Utils: { showNotification: (...args) => notifications.push(args) }
    });
    context.window = context;
    for (const file of ['js/state.js', 'js/tabs/expenses.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    }
    const { AppState: state, ExpensesTab: tab } = context;
    state.init();
    let changed = 0;
    state.subscribe(() => changed++);
    state.selectedReferenceMonth = '2026-02';
    tab.openExpenseModal();
    assert.equal(nodes.get('expenseDateInput').value, '2026-02-01');
    assert.equal(nodes.get('expenseCurrencyInput').value, 'BRL');
    assert.ok(nodes.get('expenseCategoryInput').innerHTML.includes('Transferências'));
    assert.equal(nodes.get('expenseModal').classList.contains('hidden'), false);
    assert.equal(state.transactions.length, 0, 'Abrir o formulário não cria lançamentos.');
    function fill(extra = {}) {
        const values = { expenseDateInput: '2026-02-10', expenseDescInput: '  Mercado de exemplo  ',
            expenseCategoryInput: 'Alimentação', expenseCurrencyInput: 'BRL', expenseAmountInput: '123.45', ...extra };
        for (const [id, value] of Object.entries(values)) nodes.get(id).value = value;
    }
    fill();
    let prevented = false;
    tab.saveExpenseFromModal({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(state.transactions.length, 1);
    assert.equal(state.transactions[0].description, 'Mercado de exemplo');
    assert.equal(state.transactions[0].amountOriginal, 123.45);
    assert.equal(state.transactions[0].amountBrl, 123.45);
    assert.equal(state.transactions[0].sourceId, 'manual_entry');
    assert.equal(tab.getSourceName('manual_entry'), 'Lançamento manual');
    assert.equal(state.uploadedFiles.length, 0);
    assert.equal(state.getCurrentMonthExpenses().length, 1);
    assert.equal(state.incomes.length, 0);
    assert.equal(changed, 1);
    assert.equal(JSON.parse(storage.get('finanai_transactions')).length, 1);
    assert.equal(nodes.get('expenseModal').classList.contains('hidden'), true);
    const id = state.transactions[0].id;
    tab.openExpenseModal(id);
    assert.equal(nodes.get('expenseAmountInput').value, 123.45);
    fill({ expenseCurrencyInput: 'USD', expenseAmountInput: '25.50', expenseDateInput: '2026-03-12' });
    tab.saveExpenseFromModal();
    assert.equal(state.transactions.length, 1, 'Editar não duplica a despesa.');
    assert.equal(state.transactions[0].id, id);
    assert.equal(state.transactions[0].amountBrl, 127.5);
    assert.equal(state.selectedReferenceMonth, '2026-03');
    assert.equal(state.getCurrentMonthExpenses().length, 1);
    tab.openExpenseModal();
    assert.equal(nodes.get('expenseEditId').value, '');
    assert.equal(nodes.get('expenseDescInput').value, '');
    // Dados inválidos não alteram o estado nem fecham o formulário.
    for (const invalid of [
        { expenseDescInput: ' ' }, { expenseAmountInput: '' }, { expenseAmountInput: '-1' },
        { expenseAmountInput: 'Infinity' }, { expenseDateInput: '2026-02-30' },
        { expenseCategoryInput: 'Categoria inválida' }, { expenseCurrencyInput: 'EUR' }
    ]) {
        fill(invalid);
        tab.saveExpenseFromModal();
        assert.equal(state.transactions.length, 1);
        assert.equal(nodes.get('expenseModal').classList.contains('hidden'), false);
    }
    // Editar uma despesa importada mantém a associação ao arquivo original.
    state.transactions[0].sourceId = 'imported-source';
    tab.openExpenseModal(id); fill(); tab.saveExpenseFromModal();
    assert.equal(state.transactions[0].sourceId, 'imported-source');
    // Vários lançamentos recebem IDs distintos e sobrevivem à restauração do estado.
    tab.openExpenseModal(); fill(); tab.saveExpenseFromModal();
    assert.equal(new Set(state.transactions.map(t => t.id)).size, 2);
    const restored = JSON.stringify(state.transactions);
    state.transactions = []; state.init();
    assert.equal(JSON.stringify(state.transactions), restored);
    // Bloqueio do armazenamento mantém o formulário aberto e avisa o usuário.
    tab.openExpenseModal(); fill(); storageBlocked = true;
    const before = JSON.stringify(state.transactions);
    tab.saveExpenseFromModal();
    assert.equal(JSON.stringify(state.transactions), before);
    assert.equal(nodes.get('expenseModal').classList.contains('hidden'), false);
    assert.equal(notifications.at(-1)[1], 'error');
    storageBlocked = false;
    tab.clearAllSources();
    assert.equal(state.transactions.length, 1, 'Limpar os arquivos importados preserva a despesa manual.');
    assert.equal(state.transactions[0].sourceId, 'manual_entry');
    console.log('OK: cadastro e edição de despesas, persistência, BRL/USD, validação e seleção de mês.');
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = run;
