/** Backup versionado, com lista explícita de campos e sem credenciais. */
window.Backup = {
    pending: null,
    fields: {
        projectionSettings: 'finanai_projection_settings',
        transactions: 'finanai_transactions', incomes: 'finanai_incomes',
        uploadedFiles: 'finanai_files', uploadedIncomeFiles: 'finanai_income_files',
        categoryBudgetLimits: 'finanai_budget_limits', emergencyFund: 'finanai_emergency_fund',
        displayCurrency: 'finanai_display_currency', exchangeRateUsdBrl: 'finanai_exchange_rate'
    },
    date(value) {
        return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
            && value >= '1900-01-01' && value <= '2200-12-31'
            && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    },
    validate(input) {
        const fail = () => { throw new Error('Backup inválido ou incompatível. Nenhum dado foi substituído.'); };
        const num = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
        const text = value => typeof value === 'string' && value.length <= 10000;
        const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
        const month = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
        if (!input || input.format !== 'finanai-backup' || input.version !== 1
            || !text(input.createdAt) || !Number.isFinite(Date.parse(input.createdAt)) || !input.data) fail();
        const d = input.data;
        const money = item => {
            if (!item || !num(item.amountOriginal) || !num(item.amountBrl)
                || !['BRL', 'USD'].includes(item.currency)) fail();
            return { amountOriginal: item.amountOriginal, amountBrl: item.amountBrl, currency: item.currency };
        };
        const entries = (items, income) => {
            if (!Array.isArray(items) || items.length > 100000) fail();
            const seen = new Set();
            return items.map(item => {
                if (!item || !id(item.id) || seen.has(item.id) || !this.date(item.date)
                    || !text(item.description) || !(income ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).includes(item.category)
                    || (item.sourceId != null && !id(item.sourceId))) fail();
                seen.add(item.id);
                const result = { id: item.id, date: item.date, description: item.description,
                    category: item.category, ...money(item), sourceId: item.sourceId || 'manual_entry' };
                if (income) {
                    if (!['variable', 'recurrent'].includes(item.type)) fail();
                    result.type = item.type;
                    result.monthlyAdjustments = {};
                    if (!item.monthlyAdjustments || typeof item.monthlyAdjustments !== 'object' || Array.isArray(item.monthlyAdjustments)) fail();
                    for (const [key, adjustment] of Object.entries(item.monthlyAdjustments)) {
                        if (!month(key) || !adjustment || typeof adjustment !== 'object') fail();
                        const clean = {};
                        for (const field of ['amountOriginal', 'amountBrl']) {
                            if (adjustment[field] !== undefined) {
                                if (!num(adjustment[field])) fail();
                                clean[field] = adjustment[field];
                            }
                        }
                        if (adjustment.currency !== undefined) {
                            if (!['BRL', 'USD'].includes(adjustment.currency)) fail();
                            clean.currency = adjustment.currency;
                        }
                        if (adjustment.date !== undefined) {
                            if (!this.date(adjustment.date)) fail();
                            clean.date = adjustment.date;
                        }
                        for (const field of ['description', 'category']) {
                            if (adjustment[field] !== undefined) {
                                if (!text(adjustment[field]) || (field === 'category' && !INCOME_CATEGORIES.includes(adjustment[field]))) fail();
                                clean[field] = adjustment[field];
                            }
                        }
                        result.monthlyAdjustments[key] = clean;
                    }
                    if (!Array.isArray(item.excludedMonths) || !item.excludedMonths.every(month)) fail();
                    result.excludedMonths = [...new Set(item.excludedMonths)];
                }
                return result;
            });
        };
        const sources = files => {
            if (!Array.isArray(files) || files.length > 100000) fail();
            return files.map(file => {
                if (!file || !id(file.id) || !text(file.name)) fail();
                return { id: file.id, name: file.name, type: 'json',
                    dateUploaded: this.date(file.dateUploaded) ? file.dateUploaded : input.createdAt.slice(0, 10),
                    method: 'Restaurado de backup (sem extrato bruto)' };
            });
        };
        const limits = {};
        if (!d.categoryBudgetLimits || typeof d.categoryBudgetLimits !== 'object') fail();
        for (const category of EXPENSE_CATEGORIES) {
            if (!num(d.categoryBudgetLimits[category])) fail();
            limits[category] = d.categoryBudgetLimits[category];
        }
        const fund = d.emergencyFund;
        if (!fund || ![3, 6, 12].includes(fund.targetMonths) || !num(fund.currentSavings)
            || !num(fund.customMonthlyExpense) || !['BRL', 'USD'].includes(d.displayCurrency)
            || !num(d.exchangeRateUsdBrl) || d.exchangeRateUsdBrl === 0) fail();
        return { format: 'finanai-backup', version: 1, createdAt: input.createdAt, data: {
            projectionSettings: AppState.normalizeProjectionSettings(d.projectionSettings),
            transactions: entries(d.transactions, false), incomes: entries(d.incomes, true),
            uploadedFiles: sources(d.uploadedFiles), uploadedIncomeFiles: sources(d.uploadedIncomeFiles),
            categoryBudgetLimits: limits, emergencyFund: { targetMonths: fund.targetMonths,
                currentSavings: fund.currentSavings, customMonthlyExpense: fund.customMonthlyExpense },
            displayCurrency: d.displayCurrency, exchangeRateUsdBrl: d.exchangeRateUsdBrl
        } };
    },
    create() {
        return this.validate({ format: 'finanai-backup', version: 1, createdAt: new Date().toISOString(), data: AppState });
    },
    download() {
        try {
            const backup = this.create();
            Utils.downloadFile(`finanai_backup_${backup.createdAt.slice(0, 10)}.json`, JSON.stringify(backup, null, 2), 'application/json');
            Utils.showNotification('Backup gerado. Guarde o arquivo em um local seguro.', 'success');
        } catch (error) { Utils.showNotification(error.message, 'error'); }
    },
    async preview(file) {
        const token = {};
        this.previewToken = token;
        this.pending = null;
        document.getElementById('restoreConfirm').disabled = true;
        const preview = document.getElementById('restorePreview');
        preview.textContent = '';
        if (!file) return;
        try {
            if (file.size > 25 * 1024 * 1024) throw new Error('O backup deve ter no máximo 25 MB.');
            const backup = this.validate(JSON.parse(await file.text()));
            if (this.previewToken !== token) return;
            this.pending = backup;
            const dates = [...backup.data.transactions, ...backup.data.incomes].map(item => item.date).sort();
            preview.textContent = `Criado em ${new Date(backup.createdAt).toLocaleString('pt-BR')}. `
                + `${backup.data.transactions.length} despesas e ${backup.data.incomes.length} receitas/regras de recorrência. `
                + (dates.length ? `Datas cadastradas: ${dates[0]} a ${dates[dates.length - 1]}. ` : 'Sem lançamentos. ')
                + 'Inclui orçamentos, reserva, projeções e moeda. A restauração substituirá os dados atuais; não mescla lançamentos.';
            document.getElementById('restoreConfirm').disabled = false;
        } catch (error) {
            if (this.previewToken === token) preview.textContent = 'Não foi possível ler este backup. ' + error.message;
        }
    },
    restore(backup) {
        const clean = this.validate(backup).data;
        const previous = new Map();
        const written = [];
        // Lê tudo antes de gravar; uma falha de acesso não inicia a substituição.
        for (const key of Object.values(this.fields)) previous.set(key, localStorage.getItem(key));
        try {
            for (const [field, key] of Object.entries(this.fields)) {
                const value = field === 'displayCurrency' ? clean[field] : JSON.stringify(clean[field]);
                localStorage.setItem(key, value);
                written.push(key);
            }
        } catch (error) {
            let rollbackFailed = false;
            for (const key of written.reverse()) {
                try {
                    if (previous.get(key) === null) localStorage.removeItem(key);
                    else localStorage.setItem(key, previous.get(key));
                } catch (_) { rollbackFailed = true; }
            }
            throw new Error(rollbackFailed
                ? 'Falha no armazenamento e na recuperação dos dados anteriores. Não feche a página; baixe um backup dos dados ainda em memória.'
                : 'Não foi possível salvar o backup neste navegador. Os dados anteriores foram mantidos.');
        }
        Object.assign(AppState, clean);
        AppState.updateAvailableMonths();
        AppState.notify();
    },
    confirmRestore() {
        if (!this.pending || !confirm('Substituir despesas, receitas, orçamentos, reserva e moeda pelo backup selecionado? Baixe seu backup atual antes de continuar.')) return;
        try {
            this.restore(this.pending);
            this.pending = null;
            document.getElementById('restoreConfirm').disabled = true;
            document.getElementById('backupFile').value = '';
            document.getElementById('restorePreview').textContent = 'Backup restaurado com sucesso.';
            const rate = document.getElementById('exchangeRateInput');
            if (rate) rate.value = AppState.exchangeRateUsdBrl;
            Utils.showNotification('Dados restaurados. Suas chaves de API foram mantidas.', 'success');
        } catch (error) { Utils.showNotification(error.message, 'error'); }
    }
};
