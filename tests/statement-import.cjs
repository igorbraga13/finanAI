// Execute com: node tests/statement-import.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
    const root = path.resolve(__dirname, '..');
    const storage = new Map();
    const nodes = new Map();
    function element() {
        return { innerHTML: '', children: [], appendChild(child) { this.children.push(child); } };
    }
    const notifications = [];
    const context = vm.createContext({
        console: { error() {}, warn() {} },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        document: {
            getElementById: id => nodes.get(id) || null,
            createElement: element, querySelectorAll: () => []
        },
        Utils: { showNotification: (...args) => notifications.push(args) }
    });
    context.window = context;
    for (const rel of ['js/state.js', 'js/api.js', 'js/ai-provider.js', 'js/statement-import.js', 'js/tabs/expenses.js', 'js/tabs/incomes.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), context, { filename: rel });
    }
    const { AppState: state, ExpensesTab: expenses, IncomesTab: incomes, StatementImport: importer, GeminiAPI: api } = context;
    state.init();
    const item = extra => ({ date: '2026-10-01', amountOriginal: 100, currency: 'BRL', description: 'Compra', ...extra });
    const mixed = [
        item({ transactionType: 'expense', description: 'Pix enviado' }),
        item({ transactionType: 'income', description: 'Pix recebido', payerType: 'person' }),
        item({ transactionType: 'income', description: 'ACH recebido', payerType: 'company', currency: 'USD' }),
        item({ transactionType: 'income', description: 'Salário via TED', category: 'Salário / Pró-labore', payerType: 'company' })
    ];
    for (const importJSON of [json => expenses.parseAndImportJSONContent(json), json => incomes.parseAndImportIncomeJSON(json)]) {
        state.transactions = []; state.incomes = []; state.uploadedFiles = []; state.uploadedIncomeFiles = [];
        assert.equal(importJSON(JSON.stringify(mixed)), true);
        assert.equal(state.transactions.length, 1);
        assert.equal(state.incomes.length, 3);
        assert.equal(state.transactions[0].category, 'Transferências');
        assert.equal(state.incomes[0].category, 'Transferências');
        assert.equal(state.incomes[1].category, 'Freelance / Serviços');
        assert.equal(state.incomes[1].amountBrl, 500);
        assert.equal(state.incomes[2].category, 'Salário / Pró-labore');
        assert.ok(state.incomes.every(i => i.type === 'variable'));
        assert.equal(state.getIncomesForMonth('2026-11').length, 0);
        assert.equal(JSON.parse(storage.get('finanai_transactions')).length, 1);
        assert.equal(JSON.parse(storage.get('finanai_incomes')).length, 3);
    }
    // Valores assinados, rótulos de direção e valores monetários locais.
    assert.equal(expenses.parseAndImportJSONContent(JSON.stringify([
        item({ amountOriginal: '-1.234,56', description: 'Compra no cartão' }),
        item({ direction: 'credit', category: 'Transferencia', payerType: 'person' }),
        item({ type: 'expense', description: 'Zelle enviado', amountOriginal: -25 }),
        item({ description: 'Pix recebido de Ana' })
    ])), true);
    assert.equal(state.transactions[0].amountOriginal, 1234.56);
    assert.equal(state.transactions[1].amountOriginal, 25);
    assert.equal(state.incomes[0].category, 'Transferências');
    assert.equal(state.incomes[1].category, 'Transferências');
    // JSONs antigos: despesas positivas sem direção e recorrência explícita de receitas.
    assert.equal(expenses.parseAndImportJSONContent(JSON.stringify({ transactions: [item({ category: 'Alimentação' })] })), true);
    assert.equal(state.transactions[0].category, 'Alimentação');
    assert.equal(incomes.parseAndImportIncomeJSON(JSON.stringify({ receitas: [item({ type: 'recurrent', category: 'Salário / Pró-labore' })] })), true);
    assert.equal(state.incomes[0].type, 'recurrent');
    assert.equal(state.getIncomesForMonth('2026-11').length, 1);
    // Contêiner misto preserva ambos os lados.
    assert.equal(expenses.parseAndImportJSONContent(JSON.stringify({ despesas: [item({})], receitas: [item({})] })), true);
    assert.equal(state.incomes[0].type, 'variable');
    // Rejeição de arquivo inválido não deixa uma importação parcial.
    const before = JSON.stringify([state.transactions, state.incomes, state.uploadedFiles, state.uploadedIncomeFiles]);
    for (const invalid of [null, [], [{}], [item({ amountOriginal: 'inválido' })], [item({}), item({ date: '2026-02-30' })]]) {
        assert.equal(expenses.parseAndImportJSONContent(JSON.stringify(invalid)), false);
        assert.equal(JSON.stringify([state.transactions, state.incomes, state.uploadedFiles, state.uploadedIncomeFiles]), before);
    }
    // A categoria aparece nas opções e no formulário de orçamento.
    for (const id of ['categoryFilter', 'incomeCategoryFilter', 'budgetInputsContainer']) nodes.set(id, element());
    expenses.populateCategoryFilter(); incomes.populateIncomeCategoryFilter(); expenses.renderBudgetInputs();
    for (const id of ['categoryFilter', 'incomeCategoryFilter']) {
        assert.ok(nodes.get(id).children.some(option => option.value === 'Transferências'));
    }
    assert.ok(nodes.get('budgetInputsContainer').children.some(row => row.innerHTML.includes('budget_input_Transferências')));
    // IA simulada: mesmo prompt em ambas as abas, anexo preservado e fluxo completo até a persistência.
    const calls = [];
    api.callGeminiJson = async (...args) => { calls.push(args); return mixed; };
    api.hasApiKey = () => true;
    api.setApiKey('gemini-test-key');
    await api.processExpensesDocument('extrato de teste');
    await api.processIncomesDocument('', 'BASE64', 'application/pdf');
    assert.equal(calls[0][1], calls[1][1]);
    assert.ok(calls[0][1].includes('transactionType'));
    assert.ok(calls[0][1].includes('Freelance / Serviços'));
    assert.equal(calls[1][2][0].inlineData.data, 'BASE64');
    await expenses.processTextWithAI('texto original', { name: 'extrato.pdf', type: 'application/pdf', rawText: 'texto original', method: 'Teste IA' });
    assert.equal(state.uploadedFiles.at(-1).rawText, 'texto original');
    const incomeFile = { name: 'extrato.txt', type: 'text/plain', text: async () => 'extrato de teste' };
    const count = state.transactions.length;
    await incomes.processMultipleIncomeFiles([incomeFile]);
    assert.equal(state.transactions.length, count + 1);
    assert.equal(state.uploadedIncomeFiles.at(-1).method, 'Extração via Gemini');
    // Compatibilidade com os dados de demonstração do projeto.
    assert.equal(incomes.parseAndImportIncomeJSON(fs.readFileSync(path.join(root, 'data/receitas_exemplo.json'), 'utf8')), true);
    assert.ok(notifications.some(([, type]) => type === 'success'));
    console.log('OK: importação pelas duas abas, classificação, câmbio, recorrência, validação, categorias e IA simulada.');
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = run;
