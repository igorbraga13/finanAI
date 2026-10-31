// Execute: node tests/backup-report.cjs. Todos os dados são fictícios.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PDFLib = require('../vendor/pdf-lib/pdf-lib-1.17.1.min.js');

async function run() {
    const root = path.resolve(__dirname, '..');
    const storage = new Map([['openai_api_key', 'FAKE-KEY-DO-NOT-EXPORT']]);
    let failKey = null;
    const context = vm.createContext({ console, Uint8Array, ArrayBuffer, setTimeout,
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem(key, value) {
                if (key === failKey) { failKey = null; throw new Error('Quota'); }
                storage.set(key, value);
            }, removeItem: key => storage.delete(key)
        }
    });
    context.window = context;
    for (const file of ['vendor/pdf-lib/pdf-lib-1.17.1.min.js', 'js/state.js', 'js/backup.js', 'js/report.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    }
    const { AppState: state, Backup: backup, Report: report } = context;
    state.init();
    const expense = { id: 'expense_1', date: '2026-02-15', description: 'Alimentação (teste) \\ café',
        category: 'Alimentação', amountOriginal: 100, amountBrl: 500, currency: 'USD', sourceId: 'source_1' };
    const income = { id: 'income_1', date: '2026-01-31', description: 'Salário de teste', category: 'Salário / Pró-labore',
        amountOriginal: 2000, amountBrl: 2000, currency: 'BRL', type: 'recurrent', sourceId: 'manual_entry',
        monthlyAdjustments: { '2026-02': { amountOriginal: 3000, amountBrl: 3000, description: 'Bônus' } },
        excludedMonths: ['2026-03'] };
    state.transactions = [expense]; state.incomes = [income];
    state.uploadedFiles = [{ id: 'source_1', name: 'extrato-teste.pdf', rawText: 'PRIVATE-RAW-TEXT', jsonResponse: 'PRIVATE-JSON' }];
    state.emergencyFund = { targetMonths: 6, currentSavings: 5000, customMonthlyExpense: 5000 };
    state.selectedReferenceMonth = '2026-02';
    const original = backup.create();
    const json = JSON.stringify(original);
    for (const secret of ['FAKE-KEY', 'PRIVATE-RAW-TEXT', 'PRIVATE-JSON']) assert.ok(!json.includes(secret));
    assert.equal(original.data.uploadedFiles[0].name, 'extrato-teste.pdf');
    backup.restore(original);
    assert.equal(storage.get('openai_api_key'), 'FAKE-KEY-DO-NOT-EXPORT');
    assert.equal(state.getIncomesForMonth('2026-02')[0].amountBrl, 3000);
    assert.equal(state.getIncomesForMonth('2026-03').length, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(backup.create().data)), JSON.parse(JSON.stringify(original.data)));
    const before = JSON.stringify([...storage]);
    const altered = JSON.parse(json); altered.data.transactions[0].amountBrl = 999;
    failKey = 'finanai_income_files';
    assert.throws(() => backup.restore(altered), /anteriores foram mantidos/);
    assert.equal(JSON.stringify([...storage]), before);
    assert.equal(state.transactions[0].amountBrl, 500);
    for (const mutate of [
        b => { b.version = 2; }, b => { b.data.transactions[0].date = '2026-02-30'; },
        b => { b.data.transactions[0].id = "x');alert(1);//"; },
        b => { b.data.exchangeRateUsdBrl = 0; }, b => { b.data.transactions[0].amountBrl = -1; },
        b => { b.data.incomes[0].monthlyAdjustments = { '__bad__': {} }; }
    ]) {
        const invalid = JSON.parse(json); mutate(invalid);
        assert.throws(() => backup.restore(invalid));
        assert.equal(JSON.stringify([...storage]), before);
    }
    const options = { period: 'custom', from: '2026-01-01', to: '2026-03-31', currency: 'BRL',
        tabs: ['expenses', 'incomes', 'health'], details: true, charts: true, budgets: true, reserve: true };
    const data = report.collect(options);
    assert.equal(data.totalExpenses, 500); assert.equal(data.totalIncomes, 5000);
    assert.equal(data.incomes[1].date, '2026-02-28');
    assert.equal(report.collect({ ...options, currency: 'USD' }).totalIncomes, 1000);
    assert.equal(report.collect({ ...options, from: '2026-02-01', to: '2026-02-15' }).totalIncomes, 0);
    assert.throws(() => report.collect({ ...options, tabs: [] }));
    assert.throws(() => report.collect({ ...options, from: '2026-04-01' }));
    const savedState = JSON.stringify(state);
    const result = await report.build(options);
    const loaded = await PDFLib.PDFDocument.load(result.bytes);
    assert.ok(loaded.getPageCount() >= 2);
    assert.equal(JSON.stringify(state), savedState, 'Gerar relatório não altera o mês, a moeda ou os dados.');
    // Fixture opcional para inspeção visual fora do repositório.
    if (process.env.FINANAI_TEST_PDF) fs.writeFileSync(process.env.FINANAI_TEST_PDF, result.bytes);
    state.transactions = Array.from({ length: 100 }, (_, i) => ({ ...expense, id: 'row_' + i,
        description: i === 0 ? 'Descrição longa '.repeat(200) : 'Compra ' + i }));
    const many = await report.build({ ...options, tabs: ['expenses'], budgets: false });
    assert.ok((await PDFLib.PDFDocument.load(many.bytes)).getPageCount() > 3);
    if (process.env.FINANAI_LONG_PDF) fs.writeFileSync(process.env.FINANAI_LONG_PDF, many.bytes);
    state.transactions = []; state.incomes = [];
    assert.ok((await report.build({ ...options, tabs: ['health'] })).bytes.length > 0);
    console.log('OK: backup sem credenciais, restauração, validação, recuperação em falha, recorrências, BRL/USD e PDFs paginados.');
}
module.exports = run;
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
