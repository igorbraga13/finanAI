// Execute: node tests/financial-settings.cjs. Usa apenas armazenamento fictício.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
    const root = path.resolve(__dirname, '..');
    const storage = new Map();
    let storageBlocked = false;
    function session() {
        const nodes = new Map();
        function element() {
            const el = { children: [], value: '', defaultValue: '', style: {}, validity: {}, handlers: {},
                appendChild(child) { this.children.push(child); },
                addEventListener(type, callback) { this.handlers[type] = callback; },
                contains(target) { return this === target || this.children.some(child => child.contains(target)); },
                querySelector() { return this.input; },
                get innerHTML() { return this.html || ''; },
                set innerHTML(html) {
                    this.html = html; this.children = [];
                    const match = html.match(/<input[^>]*id="([^"]+)"[^>]*value="([^"]*)"/);
                    if (match) {
                        this.input = element(); this.input.value = match[2]; this.input.defaultValue = match[2];
                        nodes.set(match[1], this.input); this.children.push(this.input);
                    }
                }
            };
            return el;
        }
        for (const id of ['budgetInputsContainer', 'budgetSaveStatus', 'emergencySaveStatus', 'emergencyTargetMonths',
            'emergencyCurrentSavings', 'emergencyCustomExpense', 'simTotalTarget', 'simCurrentSaved', 'simRemaining',
            'simProgressPercent', 'simProgressBar', 'simTimeToTarget']) nodes.set(id, element());
        const context = vm.createContext({
            console: { warn() {}, error() {} },
            localStorage: {
                getItem(key) { if (storageBlocked) throw new Error('blocked'); return storage.get(key) ?? null; },
                setItem(key, value) { if (storageBlocked) throw new Error('blocked'); storage.set(key, value); }
            },
            document: { activeElement: null, getElementById: id => nodes.get(id) || null,
                createElement: element, querySelectorAll: () => [] }
        });
        context.window = context;
        for (const file of ['js/state.js', 'js/utils.js', 'js/tabs/expenses.js', 'js/tabs/health.js']) {
            vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
        }
        context.Utils.showNotification = () => {};
        context.Utils.toggleModal = () => {};
        context.AppState.init();
        context.HealthTab.renderHealthScore = () => {};
        context.HealthTab.renderHealthKPIs = () => {};
        context.HealthTab.setupEventListeners();
        context.ExpensesTab.renderBudgetInputs();
        context.HealthTab.renderEmergencySimulator();
        return { ...context, nodes, document: context.document };
    }
    let current = session();
    const input = current.nodes.get('budget_input_Alimentação');
    current.document.activeElement = input;
    input.value = '2345.67'; input.handlers.input();
    assert.equal(JSON.parse(storage.get('finanai_budget_limits'))['Alimentação'], 2345.67);
    assert.ok(current.nodes.get('budgetSaveStatus').textContent.includes('salvas'));
    // Uma atualização de estado durante a edição conserva o campo e seu conteúdo.
    current.ExpensesTab.renderBudgetInputs();
    assert.equal(current.nodes.get('budget_input_Alimentação'), input);
    assert.equal(input.value, '2345.67');
    function edit(id, value, event = 'input') {
        const input = current.nodes.get(id);
        current.document.activeElement = input; input.value = value; input.handlers[event]();
    }
    edit('emergencyCurrentSavings', '34567.89');
    edit('emergencyCustomExpense', '2800.75');
    edit('emergencyTargetMonths', '12', 'change');
    let fund = JSON.parse(storage.get('finanai_emergency_fund'));
    assert.equal(fund.currentSavings, 34567.89);
    assert.equal(fund.customMonthlyExpense, 2800.75);
    assert.equal(fund.targetMonths, 12);
    // Nova sessão reproduz fechar e abrir a página com o mesmo armazenamento.
    current = session();
    assert.equal(Number(current.nodes.get('budget_input_Alimentação').value), 2345.67);
    assert.equal(Number(current.nodes.get('emergencyCurrentSavings').value), 34567.89);
    assert.equal(Number(current.nodes.get('emergencyCustomExpense').value), 2800.75);
    assert.equal(Number(current.nodes.get('emergencyTargetMonths').value), 12);
    // Valores são mantidos em BRL e os campos em USD mostram a conversão.
    current.AppState.displayCurrency = 'USD';
    current.AppState.exchangeRateUsdBrl = 5;
    current.HealthTab.renderEmergencySimulator();
    assert.equal(Number(current.nodes.get('emergencyCurrentSavings').value), 6913.58);
    assert.equal(Number(current.nodes.get('emergencyCustomExpense').value), 560.15);
    edit('emergencyTargetMonths', '6', 'change');
    assert.equal(current.AppState.emergencyFund.currentSavings, 34567.89, 'Alterar só os meses não reconverte o saldo arredondado.');
    edit('emergencyCurrentSavings', '8000.25');
    assert.equal(current.AppState.emergencyFund.currentSavings, 40001.25);
    assert.equal(current.AppState.emergencyFund.customMonthlyExpense, 2800.75);
    current.document.activeElement = null;
    current.ExpensesTab.renderBudgetInputs();
    current.ExpensesTab.saveBudgetSettings();
    assert.equal(current.AppState.categoryBudgetLimits['Alimentação'], 2345.67, 'Salvar sem editar não arredonda o valor em BRL.');
    current.ExpensesTab.updateBudgetLimit('Alimentação', '100.25');
    assert.equal(current.AppState.categoryBudgetLimits['Alimentação'], 501.25);
    edit('emergencyCustomExpense', '');
    assert.equal(current.AppState.emergencyFund.customMonthlyExpense, 0);
    current.ExpensesTab.resetBudgetLimits();
    const reset = current.AppState.categoryBudgetLimits['Alimentação'];
    current = session();
    assert.equal(current.AppState.categoryBudgetLimits['Alimentação'], reset);
    assert.equal(current.AppState.emergencyFund.currentSavings, 40001.25);
    assert.equal(current.AppState.emergencyFund.customMonthlyExpense, 0);
    // Indicador e simulador usam a mesma base, mesmo com despesas reais maiores.
    current.AppState.transactions = [{ date: '2026-10-01', category: 'Moradia', amountOriginal: 8000, amountBrl: 8000, currency: 'BRL' }];
    current.AppState.selectedReferenceMonth = '2026-10';
    current.AppState.emergencyFund = { currentSavings: 5000, customMonthlyExpense: 5000, targetMonths: 6 };
    current.document.activeElement = null;
    current.HealthTab.renderEmergencySimulator();
    assert.equal(current.HealthTab.calculateHealthMetrics().coverageMonths, 1);
    assert.equal(current.HealthTab.getEmergencyReserveMetrics().totalTarget, 30000);
    assert.equal(current.nodes.get('simProgressPercent').innerText, '16.7%');
    assert.equal(current.HealthTab.calculateHealthMetrics().scores.fundScore, 45);
    current.AppState.displayCurrency = 'USD';
    current.AppState.exchangeRateUsdBrl = 5;
    current.HealthTab.renderEmergencySimulator();
    assert.equal(current.HealthTab.calculateHealthMetrics().coverageMonths, 1);
    assert.equal(Number(current.nodes.get('emergencyCustomExpense').value), 1000);
    assert.equal(current.HealthTab.getEmergencyReserveMetrics().totalTarget, 6000);
    // Sem custo personalizado, usa as despesas reais do mês selecionado.
    current.AppState.emergencyFund.customMonthlyExpense = 0;
    assert.equal(current.HealthTab.calculateHealthMetrics().coverageMonths, 0.625);
    current.AppState.emergencyFund.currentSavings = 0;
    assert.equal(current.HealthTab.calculateHealthMetrics().coverageMonths, 0);
    // Sem despesas, a base provisória de R$ 2.500 não muda de valor ao alternar a moeda.
    current.AppState.transactions = [];
    current.AppState.emergencyFund.currentSavings = 5000;
    assert.equal(current.HealthTab.calculateHealthMetrics().coverageMonths, 2);
    assert.equal(current.HealthTab.getEmergencyReserveMetrics().monthlyCost, 500);
    current.AppState.displayCurrency = 'BRL';
    assert.equal(current.HealthTab.calculateHealthMetrics().coverageMonths, 2);
    assert.equal(current.HealthTab.getEmergencyReserveMetrics().monthlyCost, 2500);
    // Falha de armazenamento é sinalizada e não é apresentada como salvamento bem-sucedido.
    storageBlocked = true;
    current.ExpensesTab.updateBudgetLimit('Alimentação', '300');
    assert.ok(current.nodes.get('budgetSaveStatus').textContent.includes('Não foi possível salvar'));
    edit('emergencyCurrentSavings', '100');
    assert.ok(current.nodes.get('emergencySaveStatus').textContent.includes('Não foi possível salvar'));
    assert.doesNotThrow(() => session());
    console.log('OK: salvamento automático, restauração após reabertura, BRL/USD, centavos, valores padrão e armazenamento bloqueado.');
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = run;
