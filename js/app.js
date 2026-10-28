/**
 * FinanAI - Aplicação Principal e Orquestrador de Abas
 */

window.App = {
    init() {
        // Registrar plugin ChartDataLabels globalmente se disponível
        if (typeof ChartDataLabels !== 'undefined' && window.Chart) {
            Chart.register(ChartDataLabels);
        }

        // Inicializar Estado
        window.AppState.init();

        // Inicializar Módulos das Abas
        window.ExpensesTab.init();
        window.IncomesTab.init();
        window.HealthTab.init();

        // Configurar UI Geral
        this.updateMonthSelector();
        this.updateCurrencyToggleUI();
        this.checkApiKeyBadge();

        const rateInput = document.getElementById('exchangeRateInput');
        if (rateInput) rateInput.value = window.AppState.exchangeRateUsdBrl;

        // Ouvir alterações do estado
        window.AppState.subscribe(() => {
            this.updateMonthSelector();
            this.updateCurrencyToggleUI();
            this.updateNavBadges();
            this.renderActiveTab();
        });

        // Configurar a aba padrão
        this.switchTab('expenses');
        this.updateNavBadges();

        if (window.lucide) window.lucide.createIcons();
    },

    switchTab(tabName) {
        window.AppState.activeTab = tabName;

        const tabs = ['expenses', 'incomes', 'health'];
        tabs.forEach(t => {
            const content = document.getElementById(`tab-${t}-content`);
            const btn = document.getElementById(`tab-btn-${t}`);

            if (t === tabName) {
                if (content) {
                    content.classList.remove('hidden');
                    content.classList.add('fade-in');
                }
                if (btn) {
                    btn.classList.add('active', 'bg-slate-800', 'text-white', 'shadow-sm');
                    btn.classList.remove('text-slate-400');
                    if (t === 'expenses') btn.classList.add('border-emerald-500/40');
                    else if (t === 'incomes') btn.classList.add('border-cyan-500/40');
                    else if (t === 'health') btn.classList.add('border-purple-500/40');
                }
            } else {
                if (content) {
                    content.classList.add('hidden');
                    content.classList.remove('fade-in');
                }
                if (btn) {
                    btn.classList.remove('active', 'bg-slate-800', 'text-white', 'shadow-sm', 'border-emerald-500/40', 'border-cyan-500/40', 'border-purple-500/40');
                    btn.classList.add('text-slate-400');
                }
            }
        });

        this.renderActiveTab();
        if (window.lucide) window.lucide.createIcons();
    },

    renderActiveTab() {
        const tab = window.AppState.activeTab;
        if (tab === 'expenses') {
            window.ExpensesTab.render();
        } else if (tab === 'incomes') {
            window.IncomesTab.render();
        } else if (tab === 'health') {
            window.HealthTab.render();
        }
    },

    updateNavBadges() {
        const curr = window.AppState.displayCurrency;

        // Badge Despesas
        const expBadge = document.getElementById('navExpenseBadge');
        if (expBadge) {
            const expTotal = window.AppState.getCurrentMonthExpenses().reduce((acc, t) => acc + window.AppState.convertAmount(t, curr), 0);
            expBadge.innerText = Utils.formatCurrency(expTotal, curr);
        }

        // Badge Receitas
        const incBadge = document.getElementById('navIncomeBadge');
        if (incBadge) {
            const incTotal = window.AppState.getCurrentMonthIncomes().reduce((acc, i) => acc + window.AppState.convertAmount(i, curr), 0);
            incBadge.innerText = Utils.formatCurrency(incTotal, curr);
        }

        // Badge Saúde
        const healthBadge = document.getElementById('navHealthBadge');
        if (healthBadge) {
            const metrics = window.HealthTab.calculateHealthMetrics();
            healthBadge.innerText = `Score ${metrics.overallScore}`;
        }
    },

    updateMonthSelector() {
        const select = document.getElementById('selectedMonthSelect');
        if (!select) return;

        const months = window.AppState.getAllMonths();
        select.innerHTML = '';

        if (months.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.innerText = 'Sem dados';
            select.appendChild(opt);
            return;
        }

        months.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.ym;
            opt.innerText = m.label;
            select.appendChild(opt);
        });

        if (window.AppState.selectedReferenceMonth) {
            select.value = window.AppState.selectedReferenceMonth;
        }
    },

    onSelectedMonthChange(val) {
        if (!val) return;
        window.AppState.setSelectedMonth(val);
    },

    setDisplayCurrency(currency) {
        window.AppState.setDisplayCurrency(currency);
    },

    updateCurrencyToggleUI() {
        const curr = window.AppState.displayCurrency;
        const btnBrl = document.getElementById('currencyBrlBtn');
        const btnUsd = document.getElementById('currencyUsdBtn');

        if (curr === 'BRL') {
            if (btnBrl) btnBrl.className = "px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white transition flex items-center gap-1 font-bold";
            if (btnUsd) btnUsd.className = "px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white transition flex items-center gap-1 font-normal";
        } else {
            if (btnUsd) btnUsd.className = "px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white transition flex items-center gap-1 font-bold";
            if (btnBrl) btnBrl.className = "px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white transition flex items-center gap-1 font-normal";
        }

        const headerElem = document.getElementById('tableHeaderCurrency');
        if (headerElem) {
            headerElem.innerText = `Valor (${curr === 'BRL' ? 'R$' : '$'})`;
        }
        const incomeHeaderElem = document.getElementById('incomeTableHeaderCurrency');
        if (incomeHeaderElem) {
            incomeHeaderElem.innerText = `Valor (${curr === 'BRL' ? 'R$' : '$'})`;
        }
    },

    checkApiKeyBadge() {
        const badge = document.getElementById('apiKeyBadge');
        const notice = document.getElementById('apiKeyNotice');
        const ready = AIAPI.hasApiKey();
        if (badge) {
            badge.classList.toggle('bg-red-500', !ready);
            badge.classList.toggle('bg-emerald-500', ready);
            badge.title = AIAPI.getProviderName();
        }
        if (notice) notice.classList.toggle('hidden', ready);
        const values = {
            aiProviderInput: AIAPI.getProvider(), apiKeyInput: GeminiAPI.getApiKey(),
            openaiApiKeyInput: OpenAIAPI.getApiKey(), openaiModelInput: OpenAIAPI.getModel(),
            openaiFallbackModelsInput: OpenAIAPI.getFallbackModels().join('\n')
        };
        Object.entries(values).forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input) input.value = value;
        });
        const fallbackCheckbox = document.getElementById('openaiFallbackEnabled');
        if (fallbackCheckbox) fallbackCheckbox.checked = OpenAIAPI.isFallbackEnabled();
        this.onAiProviderChange();
    },

    onAiProviderChange() {
        const provider = document.getElementById('aiProviderInput')?.value || AIAPI.getProvider();
        document.getElementById('geminiSettings')?.classList.toggle('hidden', provider === 'openai');
        document.getElementById('openaiSettings')?.classList.toggle('hidden', provider !== 'openai');
        document.getElementById('apiKeyTestFeedback')?.classList.add('hidden');
        const link = document.getElementById('apiKeyHelpLink');
        if (link) {
            link.href = provider === 'openai' ? 'https://platform.openai.com/api-keys' : 'https://aistudio.google.com/app/apikey';
            link.textContent = provider === 'openai' ? 'Obter chave OpenAI' : 'Obter chave Gemini';
        }
    },

    async testApiKey() {
        const provider = document.getElementById('aiProviderInput')?.value || AIAPI.getProvider();
        const input = document.getElementById(provider === 'openai' ? 'openaiApiKeyInput' : 'apiKeyInput');
        const key = input?.value.trim() || '';
        const model = document.getElementById('openaiModelInput')?.value.trim() || OpenAIAPI.DEFAULT_MODEL;
        const feedback = document.getElementById('apiKeyTestFeedback');
        const button = document.getElementById('testApiKeyButton');
        if (!key) {
            Utils.showNotification('Insira a chave de API do provedor selecionado antes de testar.', 'warning');
            return;
        }
        const token = {};
        this.apiKeyTestToken = token;
        if (button) button.disabled = true;
        if (feedback) {
            feedback.className = 'p-3 rounded-xl text-xs bg-cyan-500/10 text-cyan-300';
            feedback.textContent = 'Testando a conexão com ' + (provider === 'openai' ? 'OpenAI' : 'Gemini') + '...';
        }
        try {
            const alternatives = document.getElementById('openaiFallbackModelsInput')?.value ?? OpenAIAPI.getFallbackModels();
            const enabled = document.getElementById('openaiFallbackEnabled')?.checked ?? OpenAIAPI.isFallbackEnabled();
            const result = await AIAPI.getClient(provider).testApiKey(key, model, alternatives, enabled);
            if (this.apiKeyTestToken !== token || (document.getElementById('aiProviderInput')?.value || AIAPI.getProvider()) !== provider) return;
            if (feedback) {
                feedback.className = result.ok
                    ? 'p-3 rounded-xl text-xs bg-emerald-500/10 text-emerald-300'
                    : 'p-3 rounded-xl text-xs bg-red-500/10 text-red-300';
                feedback.textContent = result.message;
            }
            Utils.showNotification(result.ok ? 'Chave e modelo validados com sucesso!' : 'Falha no teste da chave de API.', result.ok ? 'success' : 'error');
        } catch (error) {
            if (this.apiKeyTestToken === token && feedback) {
                feedback.className = 'p-3 rounded-xl text-xs bg-red-500/10 text-red-300';
                feedback.textContent = 'Não foi possível testar a chave. Verifique a conexão e tente novamente.';
            }
        } finally {
            if (this.apiKeyTestToken === token && button) button.disabled = false;
        }
    },
    saveSettings() {
        const keyInput = document.getElementById('apiKeyInput');
        const rateInput = document.getElementById('exchangeRateInput');
        const providerInput = document.getElementById('aiProviderInput');
        const openaiKeyInput = document.getElementById('openaiApiKeyInput');
        const modelInput = document.getElementById('openaiModelInput');
        if (providerInput) AIAPI.setProvider(providerInput.value);
        if (openaiKeyInput) OpenAIAPI.setApiKey(openaiKeyInput.value);
        if (modelInput) OpenAIAPI.setModel(modelInput.value);
        const fallbackInput = document.getElementById('openaiFallbackModelsInput');
        const fallbackEnabled = document.getElementById('openaiFallbackEnabled');
        if (fallbackInput && fallbackEnabled) OpenAIAPI.setFallback(fallbackInput.value, fallbackEnabled.checked);

        if (keyInput) {
            GeminiAPI.setApiKey(keyInput.value);
        }

        if (rateInput) {
            const newRate = parseFloat(rateInput.value);
            if (!isNaN(newRate) && newRate > 0) {
                window.AppState.setExchangeRate(newRate);
            }
        }

        this.checkApiKeyBadge();
        Utils.toggleModal('configModal');
        Utils.showNotification('Configurações salvas com sucesso!', 'success');
    }
};

window.addEventListener('DOMContentLoaded', () => {
    window.App.init();
});
