const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
    const elements = new Map();
    const element = () => ({ textContent: '', children: [], attributes: {},
        replaceChildren() { this.children = []; }, appendChild(child) { this.children.push(child); },
        setAttribute(key, value) { this.attributes[key] = value; } });
    for (const id of ['categoryIncreaseCards', 'categoryIncreaseSummary', 'categoryIncreaseNotice', 'categoryIncreasePeriod1', 'categoryIncreasePeriod3', 'categoryIncreasePeriod6']) elements.set(id, element());
    for (const suffix of ['Cards', 'Summary', 'Notice', 'Period1', 'Period3', 'Period6']) elements.set('categoryReduction' + suffix, element());
    const context = vm.createContext({ console, document: {
        getElementById: id => elements.get(id), createElement: element
    } });
    context.window = context;
    for (const file of ['js/state.js', 'js/utils.js', 'js/expense-comparison.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    }
    const state = context.AppState, comparison = context.ExpenseComparison;
    const tx = (month, category, value) => ({ date: month + '-10', category, amountBrl: value, amountOriginal: value, currency: 'BRL' });
    state.selectedReferenceMonth = '2026-04';
    state.transactions = [
        tx('2026-01', 'Alimentação', 100), tx('2026-01', 'Transporte', 50),
        tx('2026-02', 'Alimentação', 200), tx('2026-02', 'Transporte', 50),
        tx('2026-03', 'Alimentação', 300), tx('2026-03', 'Transporte', 50),
        tx('2026-04', 'Alimentação', 400), tx('2026-04', 'Transporte', 25),
        tx('2026-04', 'Lazer', 50), tx('2026-05', 'Alimentação', 9000)
    ];
    let result = comparison.calculate(state, 1);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].category, 'Alimentação');
    assert.equal(result.rows[0].increase, 100);
    assert.equal(result.rows[1].percent, null);
    result = comparison.calculate(state, 3);
    assert.equal(result.rows[0].baseline, 200);
    assert.equal(result.rows[0].increase, 200);
    assert.equal(result.rows[0].percent, 100);
    result = comparison.calculate(state, 6);
    assert.equal(result.available.length, 3);
    assert.equal(result.missing.length, 3);
    assert.equal(result.rows[0].baseline, 200, 'Meses ausentes não viram zero.');
    assert.equal(comparison.previousMonths('2026-01', 1)[0], '2025-12');
    state.displayCurrency = 'USD';
    result = comparison.calculate(state, 3);
    assert.equal(result.rows[0].increase, 40);
    assert.equal(result.rows[0].percent, 100);
    comparison.render();
    assert.equal(elements.get('categoryIncreaseCards').children.length, 2);
    for (const period of [1, 3, 6]) {
        comparison.setPeriod(period);
        assert.equal(elements.get('categoryIncreasePeriod' + period).attributes['aria-pressed'], 'true');
        assert.equal(elements.get('categoryIncreaseCards').children.length, 2);
    }
    assert.match(elements.get('categoryIncreaseNotice').textContent, /3 de 6/);
    comparison.setPeriod(1);
    const content = node => node.textContent + ' ' + node.children.map(content).join(' ');
    state.selectedReferenceMonth = '2026-06';
    comparison.render();
    assert.match(content(elements.get('categoryIncreaseCards').children[0]), /Sem despesas registradas/);
    state.selectedReferenceMonth = '2026-01';
    comparison.render();
    assert.match(content(elements.get('categoryIncreaseCards').children[0]), /Sem histórico/);
    state.transactions = [tx('2026-01', 'Alimentação', 100), tx('2026-02', 'Alimentação', 100)];
    state.selectedReferenceMonth = '2026-02';
    comparison.render();
    assert.match(content(elements.get('categoryIncreaseCards').children[0]), /Nenhuma categoria/);
    state.transactions = [];
    state.selectedReferenceMonth = null;
    comparison.render();
    assert.match(elements.get('categoryIncreaseSummary').textContent, /Adicione despesas/);
    assert.throws(() => comparison.calculate(state, 2));
    state.displayCurrency = 'BRL';
    state.selectedReferenceMonth = '2026-04';
    state.transactions = [
        tx('2026-03', 'Alimentação', 100), tx('2026-04', 'Alimentação', 110),
        tx('2026-03', 'Compras', 100), tx('2026-04', 'Compras', 500),
        tx('2026-03', 'Lazer', 100), tx('2026-04', 'Lazer', 300),
        tx('2026-03', 'Outros', 100), tx('2026-04', 'Outros', 250),
        tx('2026-03', 'Moradia', 1000), tx('2026-04', 'Moradia', 700),
        tx('2026-03', 'Saúde', 200),
        tx('2026-03', 'Transporte', 500), tx('2026-04', 'Transporte', 350),
        tx('2026-03', 'Assinaturas', 50), tx('2026-04', 'Assinaturas', 10)
    ];
    const increases = comparison.calculate(state, 1).rows;
    assert.equal(increases.length, 3);
    assert.equal(increases.map(row => row.category).join(','), 'Compras,Lazer,Outros');
    for (const period of [1, 3, 6]) {
        const reductions = comparison.calculate(state, period, 'reduction').rows;
        assert.equal(reductions.length, 3);
        assert.equal(reductions.map(row => row.category).join(','), 'Moradia,Saúde,Transporte');
        assert.equal(reductions[1].current, 0);
        assert.equal(reductions[1].percent, -100);
    }
    comparison.setPeriod(3, 'reduction');
    assert.equal(comparison.period, 1, 'Botões dos painéis são independentes.');
    assert.equal(elements.get('categoryReductionPeriod3').attributes['aria-pressed'], 'true');
    assert.equal(elements.get('categoryReductionCards').children.length, 3);
    assert.match(elements.get('categoryReductionCards').children[1].innerHTML, /Sem gasto registrado/);
    state.displayCurrency = 'USD';
    assert.equal(comparison.calculate(state, 1, 'reduction').rows[0].increase, -60);
    state.transactions = [tx('2026-03', 'Saúde', 200)];
    assert.equal(comparison.calculate(state, 1, 'reduction').rows.length, 0, 'Mês totalmente sem registros não gera falsa redução.');
    comparison.render();
    assert.match(elements.get('categoryReductionCards').children[0].textContent, /Sem despesas registradas/);
    console.log('OK: aumentos por categoria, média 1/3/6 meses, histórico parcial, BRL/USD e estados vazios.');
}
module.exports = run;
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
