// Execute: node tests/demo-incomes.cjs. Não acessa dados reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
    const storage = new Map();
    let blocked = false;
    function session() {
        const context = vm.createContext({
            console: { warn() {} },
            localStorage: {
                getItem: key => storage.get(key) ?? null,
                setItem(key, value) {
                    if (blocked) throw new Error('Storage unavailable');
                    storage.set(key, value);
                }
            }
        });
        context.window = context;
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/state.js'), 'utf8'), context);
        context.AppState.init();
        return context.AppState;
    }
    assert.equal(session().incomes.length, 0);
    storage.set('finanai_transactions', JSON.stringify([{ date: '2026-10-01', amountBrl: 100 }]));
    assert.equal(session().incomes.length, 0, 'Despesas não criam receitas automaticamente.');
    const salary = {
        id: 'inc_rec_salario', date: '2026-10-05', description: 'Salário Mensal',
        category: 'Salário / Pró-labore', amountOriginal: 7500, amountBrl: 7500,
        currency: 'BRL', type: 'recurrent', sourceId: 'seed_source',
        monthlyAdjustments: {}, excludedMonths: []
    };
    const fii = { ...salary, id: 'inc_rec_fii', description: 'Rendimentos FIIs (MXRF11 / HGLG11)',
        category: 'Rendimentos FIIs', amountOriginal: 480, amountBrl: 480 };
    const real = { ...salary, id: 'manual_salary', sourceId: 'manual_entry' };
    storage.set('finanai_incomes', JSON.stringify([salary, fii, real]));
    assert.equal(session().incomes.length, 1);
    assert.deepEqual(JSON.parse(storage.get('finanai_incomes')), [real]);
    assert.equal(session().incomes[0].id, real.id, 'Reabrir mantém a receita real.');
    for (const changes of [
        { amountOriginal: 8000, amountBrl: 8000 }, { description: 'Meu salário' },
        { monthlyAdjustments: { '2026-10': 8000 } }, { excludedMonths: ['2026-10'] }
    ]) {
        const edited = { ...salary, ...changes };
        storage.set('finanai_incomes', JSON.stringify([edited]));
        assert.equal(session().incomes.length, 1, 'Exemplo editado é preservado.');
        assert.deepEqual(JSON.parse(storage.get('finanai_incomes')), [edited]);
    }
    storage.set('finanai_incomes', JSON.stringify([salary, fii]));
    blocked = true;
    assert.equal(session().incomes.length, 0, 'Falha ao gravar não inclui exemplos nos cálculos.');
    blocked = false;
    assert.equal(session().incomes.length, 0);
    assert.deepEqual(JSON.parse(storage.get('finanai_incomes')), []);
    console.log('demo-incomes: OK');
}

module.exports = run;
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
