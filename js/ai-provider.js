/** OpenAI Responses API e seleção do provedor de IA. */
window.OpenAIAPI = {
    DEFAULT_MODEL: 'gpt-4.1-mini',
    DEFAULT_FALLBACK_MODELS: ['gpt-5.4-nano', 'gpt-5.4-mini'],

    parseModels(value) {
        const models = Array.isArray(value) ? value : String(value || '').split(/[\s,;]+/);
        return [...new Set(models.map(model => String(model).trim()).filter(Boolean))].slice(0, 8);
    },
    getFallbackModels() {
        try {
            const saved = localStorage.getItem('finanai_openai_fallback_models');
            return saved === null ? [...this.DEFAULT_FALLBACK_MODELS] : this.parseModels(JSON.parse(saved));
        } catch { return [...this.DEFAULT_FALLBACK_MODELS]; }
    },
    isFallbackEnabled() {
        return localStorage.getItem('finanai_openai_fallback_enabled') !== 'false';
    },
    setFallback(models, enabled) {
        localStorage.setItem('finanai_openai_fallback_models', JSON.stringify(this.parseModels(models)));
        localStorage.setItem('finanai_openai_fallback_enabled', String(!!enabled));
    },
    getModelCandidates(primary = this.getModel(), alternatives = this.getFallbackModels(), enabled = this.isFallbackEnabled()) {
        return this.parseModels([primary, ...(enabled ? this.parseModels(alternatives) : [])]);
    },
    async requestWithFallback(payload, key = this.getApiKey(), models = this.getModelCandidates()) {
        for (let index = 0; index < models.length; index++) {
            const model = models[index];
            try {
                const data = await this.request({ ...payload, model }, key);
                this.lastSuccessfulModel = model;
                if (index > 0 && window.Utils) Utils.showNotification(`Modelo alternativo OpenAI utilizado: ${model}.`, 'info');
                return { data, model };
            } catch (error) {
                if (!error.retryable || index === models.length - 1) throw error;
                if (error.retryAfterMs > 10000) {
                    error.message += ` Aguarde ${Math.ceil(error.retryAfterMs / 1000)} segundos antes de tentar novamente.`;
                    throw error;
                }
                const delay = error.retryAfterMs ?? Math.min(500 * (2 ** index), 4000);
                if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw new Error('Nenhum modelo OpenAI foi configurado.');
    },

    getApiKey() {
        return (localStorage.getItem('openai_api_key') || '').trim();
    },

    setApiKey(key) {
        if (key && key.trim()) localStorage.setItem('openai_api_key', key.trim());
        else localStorage.removeItem('openai_api_key');
    },

    getModel() {
        return (localStorage.getItem('finanai_openai_model') || '').trim() || this.DEFAULT_MODEL;
    },

    setModel(model) {
        localStorage.setItem('finanai_openai_model', (model || '').trim() || this.DEFAULT_MODEL);
    },

    async request(payload, key = this.getApiKey()) {
        if (!key) throw Object.assign(new Error('Configure sua chave de API OpenAI nas configurações.'), { errorType: 'EMPTY' });
        let response;
        try {
            response = await fetch('https://api.openai.com/v1/responses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                body: JSON.stringify({ ...payload, store: false })
            });
        } catch (error) {
            throw Object.assign(new Error('Falha de conexão com a OpenAI. Verifique a rede e tente novamente.'), { errorType: 'NETWORK' });
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            let errorType = 'API_ERROR';
            let message = `Erro na API OpenAI (${response.status}).`;
            const code = data.error?.code || '';
            const billingError = data.error?.type === 'insufficient_quota' || [
                'insufficient_quota', 'billing_hard_limit_reached', 'billing_not_active',
                'organization_spend_limit_exceeded', 'project_spend_limit_exceeded',
                'organization_usage_limit_exceeded', 'usage_limit_exceeded'
            ].includes(code);
            let retryable = false;
            if (response.status === 401) {
                errorType = 'INVALID_KEY'; message = 'Chave de API OpenAI inválida ou revogada.';
            } else if (billingError) {
                errorType = 'QUOTA';
                message = 'Saldo ou limite de gastos da conta OpenAI atingido. Trocar de modelo não resolve: confira créditos e limites no faturamento da conta.';
            } else if (response.status === 429) {
                errorType = 'RATE_LIMIT'; retryable = true;
                message = 'Limite temporário de requisições da OpenAI atingido. Aguarde e tente novamente.';
            } else if (response.status === 404 || data.error?.code === 'model_not_found') {
                retryable = true;
                message = 'Modelo OpenAI indisponível para esta chave. Confira o modelo nas configurações.';
            } else if (response.status === 403) {
                message = 'Esta chave não tem permissão para acessar o recurso ou modelo OpenAI selecionado.';
            } else if ([500, 502, 503, 504].includes(response.status)) {
                retryable = true;
                message = 'Serviço OpenAI temporariamente indisponível. Tente novamente em instantes.';
            } else if (data.error?.message) {
                message += ' ' + data.error.message;
            }
            const retryHeader = response.headers?.get('retry-after');
            const retryAfterMs = retryHeader == null ? undefined : Math.max(0,
                Number.isFinite(Number(retryHeader)) ? Number(retryHeader) * 1000 : Date.parse(retryHeader) - Date.now());
            throw Object.assign(new Error(message), { errorType, statusCode: response.status, retryable,
                retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined });
        }
        if (data.status && data.status !== 'completed') {
            throw new Error('A OpenAI não concluiu a resposta. Tente um documento menor ou outro modelo.');
        }
        return data;
    },

    outputText(data) {
        const content = (data.output || []).flatMap(item => item.content || []);
        if (content.some(item => item.type === 'refusal')) throw new Error('A OpenAI recusou o processamento deste conteúdo.');
        const text = content.filter(item => item.type === 'output_text').map(item => item.text || '').join('');
        if (!text.trim()) throw new Error('A OpenAI retornou uma resposta sem texto.');
        return text;
    },

    async callJson(prompt, systemInstruction = '', inlineParts = []) {
        const content = [{ type: 'input_text', text: prompt || 'Analise o documento e retorne JSON.' }];
        for (const part of inlineParts) {
            const file = part.inlineData;
            if (!file) continue;
            const mime = file.mimeType || '';
            const dataUrl = `data:${mime};base64,${file.data}`;
            if (mime === 'application/pdf') {
                content.push({ type: 'input_file', filename: 'extrato.pdf', file_data: dataUrl });
            } else if (mime.startsWith('image/')) {
                content.push({ type: 'input_image', image_url: dataUrl });
            } else throw new Error('Formato de anexo não suportado pela integração OpenAI. Use PDF ou imagem.');
        }
        const { data } = await this.requestWithFallback({
            instructions: systemInstruction + '\n\nREGRA DE TRANSPORTE JSON: envolva o resultado solicitado em um objeto JSON com a chave "result". Se foi solicitado um array, use {"result":[...]}; se foi solicitado um objeto, use {"result":{...}}. Não inclua Markdown.',
            input: [{ role: 'user', content }],
            text: { format: { type: 'json_object' } }
        });
        let parsed;
        try { parsed = JSON.parse(this.outputText(data)); }
        catch (error) {
            if (error instanceof SyntaxError) throw new Error('A OpenAI retornou JSON inválido. Tente novamente.');
            throw error;
        }
        if (!parsed || !Object.prototype.hasOwnProperty.call(parsed, 'result')
            || !parsed.result || typeof parsed.result !== 'object') {
            throw new Error('A OpenAI retornou um resultado com formato inesperado.');
        }
        return parsed.result;
    },

    async testApiKey(customKey = null, customModel = null, alternatives = this.getFallbackModels(), enabled = this.isFallbackEnabled()) {
        try {
            const candidates = this.getModelCandidates((customModel || this.getModel()).trim(), alternatives, enabled);
            const { data, model } = await this.requestWithFallback({ input: 'Responda apenas OK.' }, (customKey ?? this.getApiKey()).trim(), candidates);
            this.outputText(data);
            return { ok: true, model, message: `Conexão bem-sucedida com OpenAI via ${model}.` };
        } catch (error) {
            return { ok: false, errorType: error.errorType || 'API_ERROR', message: error.message };
        }
    }
};

window.AIAPI = {
    getProvider() {
        return localStorage.getItem('finanai_ai_provider') === 'openai' ? 'openai' : 'gemini';
    },
    setProvider(provider) {
        localStorage.setItem('finanai_ai_provider', provider === 'openai' ? 'openai' : 'gemini');
    },
    getClient(provider = this.getProvider()) {
        return provider === 'openai' ? OpenAIAPI : GeminiAPI;
    },
    getProviderName() {
        return this.getProvider() === 'openai' ? 'OpenAI (ChatGPT)' : 'Gemini';
    },
    getFileMimeType(file) {
        if (file.type) return file.type;
        const extension = file.name.toLowerCase().split('.').pop();
        return { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            webp: 'image/webp', json: 'application/json', txt: 'text/plain', csv: 'text/csv' }[extension] || '';
    },
    getApiKey() { return this.getClient().getApiKey(); },
    hasApiKey() { return !!this.getApiKey(); },
    callJson(...args) {
        const client = this.getClient();
        return client === OpenAIAPI ? client.callJson(...args) : client.callGeminiJson(...args);
    },
    processStatementDocument(...args) { return GeminiAPI.processStatementDocument.apply(this, args); },
    processExpensesDocument(...args) { return this.processStatementDocument(...args); },
    processIncomesDocument(...args) { return this.processStatementDocument(...args); },
    generateExpensesDiagnosis(...args) { return GeminiAPI.generateExpensesDiagnosis.apply(this, args); },
    generateHealthDiagnosis(...args) { return GeminiAPI.generateHealthDiagnosis.apply(this, args); }
};
