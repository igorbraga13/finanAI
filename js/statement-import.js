/** Importação compartilhada por Despesas e Receitas. */
window.StatementImport = {
    fold(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    },

    getItems(parsed) {
        if (Array.isArray(parsed)) return parsed;
        if (!parsed || typeof parsed !== 'object') return [];
        // Contêineres com os dois lados do extrato também são aceitos.
        const groups = [['expenses', 'expense'], ['despesas', 'expense'],
            ['incomes', 'income'], ['receitas', 'income']];
        const grouped = groups.flatMap(([key, direction]) => Array.isArray(parsed[key])
            ? parsed[key].map(item => ({ ...item, transactionType: direction })) : []);
        if (grouped.length) return grouped;
        for (const key of ['transactions', 'items', 'lancamentos', 'data']) {
            if (Array.isArray(parsed[key])) return parsed[key];
        }
        return [parsed];
    },

    number(value) {
        // Números JSON e textos monetários BRL/USD, incluindo vírgula decimal.
        if (typeof value === 'number') return value;
        let text = String(value ?? '').trim().replace(/R\$|US\$|\$|\s/g, '');
        if (!text) return NaN;
        if (text.includes(',') && text.includes('.')) {
            text = text.lastIndexOf(',') > text.lastIndexOf('.')
                ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
        } else if (text.includes(',')) text = text.replace(',', '.');
        if (/^\(.*\)$/.test(text)) text = '-' + text.slice(1, -1);
        return Number(text);
    },

    direction(item, fallback) {
        const explicit = this.fold(item.transactionType || item.direction || item.tipoMovimentacao || item.type || item.tipo);
        if (['expense', 'despesa', 'saida', 'debit', 'debito', 'outgoing'].includes(explicit)) return 'expense';
        if (['income', 'receita', 'entrada', 'credit', 'credito', 'incoming', 'recurrent', 'variable'].includes(explicit)) return 'income';
        const description = this.fold(item.description || item.descricao);
        if (/\b(recebid[oa]|entrada|credito|incoming)\b/.test(description)) return 'income';
        if (/\b(enviad[oa]|saida|debito|outgoing)\b/.test(description)) return 'expense';
        const amount = this.number(item.amountOriginal ?? item.amount ?? item.valor ?? item.amountBrl);
        return amount < 0 ? 'expense' : fallback;
    },

    category(item, direction) {
        const raw = item.category || item.categoria || '';
        const cat = this.fold(raw);
        const description = this.fold(item.description || item.descricao);
        const transfer = /transfer|\b(pix|ted|doc|zelle|ach|wire)\b/;
        const isTransfer = transfer.test(cat + ' ' + description + ' ' + this.fold(item.paymentMethod));
        const categories = direction === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
        const exact = categories.find(c => this.fold(c) === cat);
        if (direction === 'expense') return isTransfer ? 'Transferências' : (exact || 'Outros');
        // Uma natureza explícita (salário, dividendo etc.) prevalece sobre o meio de pagamento.
        const specific = exact && !['Transferências', 'Outras Receitas', 'Freelance / Serviços'].includes(exact);
        const payer = this.fold(item.payerType || item.counterpartyType || item.tipoPagador);
        if (!specific && (isTransfer || payer && payer !== 'unknown')) {
            if (['company', 'empresa', 'pj', 'pessoa juridica', 'business'].includes(payer)
                || /\b(cnpj|ltda|s\.a\.|llc|inc\.|empresa)\b/.test(description)) return 'Freelance / Serviços';
            if (['person', 'pessoa', 'pf', 'pessoa fisica', 'individual'].includes(payer)) return 'Transferências';
            return exact === 'Freelance / Serviços' ? exact : 'Transferências';
        }
        if (exact) return exact;
        if (/salario|pro.labore/.test(cat)) return 'Salário / Pró-labore';
        if (/dividendo|jcp/.test(cat)) return 'Dividendos / JCP';
        if (/fii/.test(cat)) return 'Rendimentos FIIs';
        if (/renda fixa|cdi/.test(cat)) return 'Renda Fixa / CDI';
        if (/freela|servi/.test(cat)) return 'Freelance / Serviços';
        if (/venda|cashback|reembolso|estorno/.test(cat)) return 'Vendas / Cashback';
        if (/alug/.test(cat)) return 'Aluguéis Recebidos';
        return 'Outras Receitas';
    },

    importJSON(jsonString, fileName, fallback = 'expense', method = 'Leitura JSON Local', source = {}) {
        try {
            const items = this.getItems(JSON.parse(jsonString));
            if (!items.length) throw new Error('Nenhum lançamento encontrado.');
            const sourceId = 'source_' + Date.now() + '_' + Math.random().toString(36).slice(2);
            const expenses = [], incomes = [];
            items.forEach((item, index) => {
                if (!item || typeof item !== 'object') throw new Error(`Lançamento ${index + 1} inválido.`);
                const amount = this.number(item.amountOriginal ?? item.amount ?? item.valor ?? item.amountBrl);
                const date = item.date || item.data;
                const parsedDate = new Date(date + 'T00:00:00Z');
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime())
                    || parsedDate.toISOString().slice(0, 10) !== date || !Number.isFinite(amount) || amount === 0) {
                    throw new Error(`Lançamento ${index + 1}: informe data AAAA-MM-DD e valor válido diferente de zero.`);
                }
                const direction = this.direction(item, fallback);
                const currency = String(item.currency || 'BRL').toUpperCase();
                if (!['BRL', 'USD'].includes(currency)) throw new Error(`Moeda não suportada: ${currency}.`);
                const amountBrl = item.amountBrl != null ? Math.abs(this.number(item.amountBrl))
                    : Math.abs(amount) * (currency === 'USD' ? AppState.exchangeRateUsdBrl : 1);
                if (!Number.isFinite(amountBrl) || amountBrl <= 0) throw new Error('Valor convertido inválido.');
                const normalized = {
                    id: sourceId + '_' + index, date,
                    description: item.description || item.descricao || item.establishment || item.fonte || 'Lançamento importado',
                    category: this.category(item, direction),
                    amountOriginal: Math.abs(amount), currency, amountBrl, sourceId
                };
                if (direction === 'income') {
                    normalized.type = (item.recurrence || item.type) === 'recurrent' ? 'recurrent' : 'variable';
                    normalized.monthlyAdjustments = {};
                    normalized.excludedMonths = [];
                    incomes.push(normalized);
                } else expenses.push(normalized);
            });
            const meta = {
                ...source, id: sourceId, name: fileName, type: source.type || 'json',
                dateUploaded: new Date().toISOString().slice(0, 10),
                rawText: source.rawText ?? jsonString, jsonResponse: jsonString, method
            };
            // Validação completa antes de alterar o estado.
            if (expenses.length) {
                AppState.transactions = [...expenses, ...AppState.transactions];
                AppState.uploadedFiles.push({ ...meta });
            }
            if (incomes.length) {
                AppState.incomes = [...incomes, ...AppState.incomes];
                AppState.uploadedIncomeFiles.push({ ...meta });
            }
            if (expenses.length) AppState.saveExpenses();
            if (incomes.length) AppState.saveIncomes();
            Utils.showNotification(`${expenses.length} despesa(s) e ${incomes.length} receita(s) importada(s) de "${fileName}".`, 'success');
            return true;
        } catch (error) {
            console.error('Erro ao importar lançamentos:', error);
            Utils.showNotification(error.message || 'Estrutura JSON inválida.', 'error');
            return false;
        }
    }
};
