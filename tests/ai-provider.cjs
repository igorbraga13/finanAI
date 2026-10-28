// Execute com: node tests/ai-provider.cjs (sem chamadas reais ou credenciais).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
    const root = path.resolve(__dirname, '..');
    const storage = new Map([['gemini_api_key', 'saved-gemini-test-key']]);
    const nodes = new Map();
    function node(value = '') {
        const classes = new Set();
        return { value, textContent: '', disabled: false, className: '', classList: {
            add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
            toggle(c, force) { const add = force ?? !classes.has(c); if (add) classes.add(c); else classes.delete(c); }
        } };
    }
    for (const id of ['aiProviderInput', 'apiKeyInput', 'openaiApiKeyInput', 'openaiModelInput', 'apiKeyBadge',
        'apiKeyNotice', 'geminiSettings', 'openaiSettings', 'apiKeyHelpLink', 'apiKeyTestFeedback', 'testApiKeyButton',
        'openaiFallbackEnabled', 'openaiFallbackModelsInput']) nodes.set(id, node());
    const requests = [];
    const responseQueue = [], delays = [];
    let answer = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"result":[]}' }] }] };
    let status = 200;
    const context = vm.createContext({
        console: { error() {}, warn() {} },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        document: { getElementById: id => nodes.get(id) || null },
        Utils: { showNotification() {}, toggleModal() {}, fileToBase64: async () => 'TESTPDF' },
        setTimeout: (resolve, delay) => { delays.push(delay); resolve(); },
        fetch: async (url, options) => {
            requests.push({ url, headers: options.headers, body: JSON.parse(options.body) });
            const queued = responseQueue.shift() || { status, data: answer };
            return { ok: queued.status === 200, status: queued.status,
                headers: { get: () => queued.retryAfter ?? null }, json: async () => queued.data };
        },
        addEventListener() {}
    });
    context.window = context;
    for (const rel of ['js/state.js', 'js/api.js', 'js/ai-provider.js', 'js/statement-import.js', 'js/tabs/expenses.js', 'js/tabs/incomes.js', 'js/app.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), context, { filename: rel });
    }
    const { AIAPI: ai, OpenAIAPI: openai, GeminiAPI: gemini, App: app } = context;
    assert.equal(ai.getProvider(), 'gemini');
    assert.equal(ai.getApiKey(), 'saved-gemini-test-key');
    app.checkApiKeyBadge();
    assert.equal(nodes.get('apiKeyInput').value, 'saved-gemini-test-key');
    assert.ok(nodes.get('openaiSettings').classList.contains('hidden'));
    nodes.get('aiProviderInput').value = 'openai'; app.onAiProviderChange();
    assert.ok(nodes.get('geminiSettings').classList.contains('hidden'));
    assert.equal(nodes.get('apiKeyHelpLink').href, 'https://platform.openai.com/api-keys');
    assert.equal(ai.getProvider(), 'gemini', 'Seleção em edição ainda não deve persistir.');
    nodes.get('openaiApiKeyInput').value = 'openai-test-key';
    nodes.get('openaiModelInput').value = 'gpt-4.1-mini';
    app.saveSettings();
    assert.equal(ai.getProvider(), 'openai');
    assert.equal(openai.getApiKey(), 'openai-test-key');
    assert.equal(gemini.getApiKey(), 'saved-gemini-test-key');
    assert.equal(ai.hasApiKey(), true);
    assert.ok(nodes.get('apiKeyBadge').classList.contains('bg-emerald-500'));
    assert.equal(ai.getFileMimeType({ name: 'extrato.PDF', type: '' }), 'application/pdf');
    // Requisição de texto: autenticação correta, sem chave na URL, sem armazenamento de resposta.
    assert.equal((await ai.processExpensesDocument('extrato de teste')).length, 0);
    let last = requests.at(-1);
    assert.equal(last.url, 'https://api.openai.com/v1/responses');
    assert.equal(last.headers.Authorization, 'Bearer openai-test-key');
    assert.equal(last.body.store, false);
    assert.equal(last.body.model, 'gpt-4.1-mini');
    assert.equal(last.body.text.format.type, 'json_object');
    assert.ok(last.body.instructions.includes('Transferência'));
    assert.ok(last.body.input[0].content[0].text.includes('extrato de teste'));
    // Anexos PDF e imagem usam os tipos próprios da Responses API.
    await ai.processIncomesDocument('', 'TESTPDF', 'application/pdf');
    last = requests.at(-1);
    assert.equal(last.body.input[0].content[1].type, 'input_file');
    assert.equal(last.body.input[0].content[1].file_data, 'data:application/pdf;base64,TESTPDF');
    await ai.processExpensesDocument('', 'TESTIMAGE', 'image/png');
    assert.equal(requests.at(-1).body.input[0].content[1].image_url, 'data:image/png;base64,TESTIMAGE');
    // Importação completa pelas duas abas usando o transporte OpenAI simulado.
    const mixed = [
        { date: '2026-10-01', amountOriginal: 50, transactionType: 'expense', description: 'Pix enviado' },
        { date: '2026-10-02', amountOriginal: 100, transactionType: 'income', description: 'Pix recebido', payerType: 'company' }
    ];
    answer = { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ result: mixed }) }] }] };
    await context.ExpensesTab.processTextWithAI('extrato', { name: 'teste.txt' });
    assert.equal(context.AppState.transactions.length, 1);
    assert.equal(context.AppState.incomes[0].category, 'Freelance / Serviços');
    assert.equal(context.AppState.incomes[0].type, 'variable');
    await context.IncomesTab.processMultipleIncomeFiles([{ name: 'extrato.pdf', type: '' }]);
    assert.equal(context.AppState.transactions.length, 2);
    assert.equal(context.AppState.incomes.length, 2);
    assert.equal(context.AppState.uploadedIncomeFiles.at(-1).method, 'Extração via OpenAI (ChatGPT)');
    // Leitura do REST funciona com itens de raciocínio antes da mensagem e texto fragmentado.
    answer = { status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', content: [
        { type: 'output_text', text: '{"result":{"summary":' }, { type: 'output_text', text: '"OK","diagnosis":"Saúde OK"}}' }
    ] }] };
    assert.equal((await ai.generateExpensesDiagnosis({})).summary, 'OK');
    assert.equal((await ai.generateHealthDiagnosis({})).diagnosis, 'Saúde OK');
    assert.ok(requests.at(-1).body.input[0].content[0].text.includes('saúde financeira'));
    // Teste de conexão usa chave/modelo em edição, sem sobrescrever as chaves salvas.
    answer = { status: 'completed', output: [{ content: [{ type: 'output_text', text: 'OK' }] }] };
    nodes.get('openaiApiKeyInput').value = 'draft-key'; nodes.get('openaiModelInput').value = 'draft-model';
    await app.testApiKey();
    assert.equal(requests.at(-1).headers.Authorization, 'Bearer draft-key');
    assert.equal(requests.at(-1).body.model, 'draft-model');
    assert.equal(openai.getApiKey(), 'openai-test-key');
    assert.equal(nodes.get('testApiKeyButton').disabled, false);
    assert.ok(nodes.get('apiKeyTestFeedback').textContent.includes('draft-model'));
    for (const [code, errorCode, type] of [[401, 'invalid_api_key', 'INVALID_KEY'], [429, 'insufficient_quota', 'QUOTA'], [404, 'model_not_found', 'API_ERROR']]) {
        status = code; answer = { error: { code: errorCode } };
        const result = await openai.testApiKey('bad-test-key');
        assert.equal(result.ok, false); assert.equal(result.errorType, type);
    }
    status = 200;
    for (const [data, pattern] of [
        [{ status: 'incomplete', output: [] }, /concluiu/],
        [{ output: [{ content: [{ type: 'refusal' }] }] }, /recusou/],
        [{ output: [{ content: [{ type: 'output_text', text: 'invalid JSON' }] }] }, /JSON inválido/],
        [{ output: [{ content: [{ type: 'output_text', text: '{}' }] }] }, /formato inesperado/]
    ]) {
        answer = data; await assert.rejects(ai.generateExpensesDiagnosis({}), pattern);
    }
    const count = requests.length;
    openai.setApiKey('');
    assert.equal(ai.hasApiKey(), false, 'Uma chave Gemini salva não habilita a OpenAI.');
    await assert.rejects(ai.processExpensesDocument('extrato'), /chave de API OpenAI/);
    assert.equal(requests.length, count, 'Não há envio ao outro provedor quando falta a chave selecionada.');
    context.fetch = async () => { throw new Error('offline'); };
    assert.equal((await openai.testApiKey('test-key')).errorType, 'NETWORK');
    // Seleção Gemini reutiliza os prompts comuns e o transporte original.
    ai.setProvider('gemini');
    let geminiCalls = 0;
    gemini.callGeminiJson = async () => { geminiCalls++; return []; };
    await ai.processIncomesDocument('extrato');
    await ai.generateExpensesDiagnosis({});
    await ai.generateHealthDiagnosis({});
    assert.equal(geminiCalls, 3);
    assert.equal(gemini.getApiKey(), 'saved-gemini-test-key');
    // Configurações da lista sobrevivem ao salvamento e mantêm o primário.
    context.fetch = async (url, options) => {
        requests.push({ url, headers: options.headers, body: JSON.parse(options.body) });
        const queued = responseQueue.shift() || { status, data: answer };
        return { ok: queued.status === 200, status: queued.status,
            headers: { get: () => queued.retryAfter ?? null }, json: async () => queued.data };
    };
    nodes.get('aiProviderInput').value = 'openai';
    nodes.get('openaiModelInput').value = 'model-a';
    nodes.get('openaiFallbackModelsInput').value = 'model-b\nmodel-c\nmodel-b';
    nodes.get('openaiFallbackEnabled').checked = true;
    nodes.get('openaiApiKeyInput').value = 'openai-test-key';
    app.saveSettings();
    assert.equal(openai.getModelCandidates().join(','), 'model-a,model-b,model-c');
    const success = { status: 'completed', output: [{ content: [{ type: 'output_text', text: '{"result":[]}' }] }] };
    const start = requests.length;
    responseQueue.push({ status: 404, data: { error: { code: 'model_not_found' } } },
        { status: 429, retryAfter: '0', data: { error: { code: 'rate_limit_exceeded' } } },
        { status: 200, data: success });
    await ai.processExpensesDocument('', 'TESTPDF', 'application/pdf');
    assert.equal(requests.slice(start).map(r => r.body.model).join(','), 'model-a,model-b,model-c');
    assert.equal(openai.lastSuccessfulModel, 'model-c');
    assert.equal(openai.getModel(), 'model-a');
    assert.ok(requests.slice(start).every(r => r.body.input[0].content[1].file_data.endsWith('TESTPDF')));
    // Erros de conta/chave não devem consumir tentativas nos demais modelos.
    for (const code of ['insufficient_quota', 'project_spend_limit_exceeded', 'organization_spend_limit_exceeded', 'organization_usage_limit_exceeded', 'usage_limit_exceeded']) {
        const previous = requests.length;
        responseQueue.push({ status: 429, data: { error: { code } } });
        await assert.rejects(ai.processExpensesDocument('extrato'), /Trocar de modelo não resolve/);
        assert.equal(requests.length, previous + 1);
    }
    // Retry-After longo interrompe a sequência sem antecipar a próxima chamada.
    let previous = requests.length;
    responseQueue.push({ status: 429, retryAfter: '60', data: { error: { code: 'rate_limit_exceeded' } } });
    await assert.rejects(ai.processExpensesDocument('extrato'), /Aguarde 60 segundos/);
    assert.equal(requests.length, previous + 1);
    // Limite temporário com espera curta respeita o servidor e passa ao próximo.
    responseQueue.push({ status: 503, retryAfter: '2', data: { error: { code: 'server_is_overloaded' } } }, { status: 200, data: success });
    await ai.processExpensesDocument('extrato');
    assert.equal(delays.at(-1), 2000);
    assert.equal(openai.lastSuccessfulModel, 'model-b');
    // Desabilitar a sequência restringe a execução ao modelo principal.
    openai.setFallback(['model-b'], false);
    previous = requests.length;
    responseQueue.push({ status: 404, data: { error: { code: 'model_not_found' } } });
    await assert.rejects(ai.processExpensesDocument('extrato'), /Modelo OpenAI indisponível/);
    assert.equal(requests.length, previous + 1);
    openai.setFallback([], true);
    assert.equal(openai.getModelCandidates().join(','), 'model-a');
    console.log('OK: provedores, importação, diagnósticos, configurações, alternativas ordenadas, limites e saldo esgotado.');
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = run;
