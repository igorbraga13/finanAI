// Dados fictícios; não acessa arquivos financeiros nem APIs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
    const storage = new Map();
    function session() {
        const context = vm.createContext({ console, localStorage: {
            getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)
        } });
        context.window = context;
        for (const file of ['js/state.js', 'js/tabs/projections.js', 'js/backup.js']) {
            vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
        }
        context.AppState.init();
        return context;
    }
    const { AppState: state, ProjectionsTab: tab, Backup: backup } = session();
    const tx = (date, amount) => ({ id: 't_' + date, date, description: 'Teste', category: 'Outros', amountOriginal: amount, amountBrl: amount, currency: 'BRL', sourceId: 'manual_entry' });
    state.transactions = [tx('2026-07-10', 100), tx('2026-08-10', 200), tx('2026-09-10', 300), tx('2026-10-10', 999999)];
    state.incomes = [{ ...tx('2026-07-05', 1000), category: 'Outras Receitas', type: 'recurrent', monthlyAdjustments: { '2026-09': { amountOriginal: 2000, amountBrl: 2000 } }, excludedMonths: ['2026-08'] }];
    state.selectedReferenceMonth = '2026-10';
    let result = tab.calculate(state, '2026-10');
    assert.equal(result.income, 1500);
    assert.equal(result.expense, 200);
    assert.equal(result.history.income.count, 2);
    assert.equal(result.history.start, '2026-11');
    assert.equal(result.history.months.join(','), '2026-07,2026-08,2026-09');
    state.selectedReferenceMonth = '2026-08';
    result = tab.calculate(state, '2026-10');
    assert.equal(result.history.start, '2026-09');
    assert.equal(result.expense, 150);
    state.selectedReferenceMonth = '2026-10';
    state.projectionSettings = { months: 3, basis: 6, initial: 10000, income: 6000, expense: 4200, contribution: 1000, rate: 0,
        extras: [{ type: 'expense', name: 'Curso', amount: 300, duration: 2 }, { type: 'income', name: 'Trabalho', amount: 500, duration: 1 }] };
    const before = JSON.stringify({ expenses: state.transactions, incomes: state.incomes });
    result = tab.calculate(state, '2026-10');
    assert.equal(result.rows.map(row => row.extra).join(','), '200,-300,0');
    assert.equal(result.rows.at(-1).cash, 12300);
    assert.equal(result.rows.at(-1).invested, 12300);
    assert.equal(JSON.stringify({ expenses: state.transactions, incomes: state.incomes }), before);
    state.displayCurrency = 'USD';
    assert.equal(tab.calculate(state, '2026-10').rows.at(-1).cash, 12300, 'O modelo continua em BRL.');
    state.projectionSettings = { ...state.projectionSettings, months: 12, income: 0, expense: 0, contribution: 0, extras: [], rate: 5 };
    result = tab.calculate(state, '2026-10');
    assert.ok(Math.abs(result.rows.at(-1).invested - 10500) < 0.0001);
    assert.equal(result.income, 0, 'Zero manual não usa a média.');
    state.projectionSettings.initial = 0;
    state.projectionSettings.expense = 100;
    result = tab.calculate(state, '2026-10');
    assert.equal(result.rows.at(-1).invested, -1200, 'Não simula rendimentos ou juros sobre saldo negativo.');
    state.projectionSettings.income = null;
    state.incomes = [];
    assert.equal(tab.calculate(state, '2026-10').missing.join(','), 'receita');
    state.projectionSettings.income = 0;
    state.persistFinancialSetting('finanai_projection_settings', state.projectionSettings, false);
    assert.deepEqual(JSON.parse(JSON.stringify(session().AppState.projectionSettings)), JSON.parse(JSON.stringify(state.projectionSettings)));
    const copy = backup.create();
    state.projectionSettings.initial = 800;
    backup.restore(copy);
    assert.equal(state.projectionSettings.initial, 0);
    delete copy.data.projectionSettings;
    backup.restore(copy);
    assert.equal(state.projectionSettings.rate, 5, 'Backup antigo restaura premissas padrão.');
    for (const invalid of [{ months: 5 }, { income: -1 }, { rate: Infinity }, { extras: [{ type: 'income', name: 'Teste', amount: 10, duration: 1.5 }] }]) {
        assert.throws(() => state.normalizeProjectionSettings({ ...state.projectionSettings, ...invalid }));
    }
    console.log('OK: projeções, médias reais, recorrências, extras, juros compostos, backup e persistência.');
}
module.exports = run;
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
