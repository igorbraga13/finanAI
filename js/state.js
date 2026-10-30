/**
 * FinanAI - Gerenciador de Estado Global
 */

const EXPENSE_CATEGORIES = [
    'Alimentação', 'Moradia', 'Transporte', 'Lazer', 
    'Saúde', 'Assinaturas', 'Compras', 'Dívidas/Investimentos', 'Transferências', 'Outros'
];

const EXPENSE_COLORS = {
    'Alimentação': '#f59e0b',
    'Moradia': '#ef4444',
    'Transporte': '#3b82f6',
    'Lazer': '#ec4899',
    'Saúde': '#10b981',
    'Assinaturas': '#8b5cf6',
    'Compras': '#06b6d4',
    'Dívidas/Investimentos': '#6366f1',
    'Transferências': '#a855f7',
    'Outros': '#64748b'
};

const DEFAULT_BUDGET_LIMITS_BRL = {
    'Alimentação': 1200,
    'Moradia': 2800,
    'Transporte': 500,
    'Lazer': 400,
    'Saúde': 300,
    'Assinaturas': 200,
    'Compras': 600,
    'Dívidas/Investimentos': 1000,
    'Transferências': 0,
    'Outros': 300
};

const INCOME_CATEGORIES = [
    'Salário / Pró-labore',
    'Dividendos / JCP',
    'Rendimentos FIIs',
    'Renda Fixa / CDI',
    'Freelance / Serviços',
    'Vendas / Cashback',
    'Aluguéis Recebidos',
    'Transferências',
    'Outras Receitas'
];

const INCOME_COLORS = {
    'Salário / Pró-labore': '#10b981',
    'Dividendos / JCP': '#06b6d4',
    'Rendimentos FIIs': '#3b82f6',
    'Renda Fixa / CDI': '#8b5cf6',
    'Freelance / Serviços': '#f59e0b',
    'Vendas / Cashback': '#14b8a6',
    'Aluguéis Recebidos': '#6366f1',
    'Transferências': '#a855f7',
    'Outras Receitas': '#64748b'
};

// Mapeamento da Regra 50/30/20 para despesas
const EXPENSE_RULE_MAP = {
    'Moradia': 'needs', // 50%
    'Alimentação': 'needs',
    'Transporte': 'needs',
    'Saúde': 'needs',
    'Lazer': 'wants', // 30%
    'Assinaturas': 'wants',
    'Compras': 'wants',
    'Dívidas/Investimentos': 'savings', // 20%
    'Transferências': 'wants',
    'Outros': 'wants'
};

window.AppState = {
    transactions: [],       // Despesas
    incomes: [],            // Receitas
    uploadedFiles: [],      // Fontes de Despesas
    uploadedIncomeFiles: [],// Fontes de Receitas
    categoryBudgetLimits: { ...DEFAULT_BUDGET_LIMITS_BRL },
    emergencyFund: {
        targetMonths: 6,
        customMonthlyExpense: 0,
        currentSavings: 0
    },
    displayCurrency: 'BRL',
    exchangeRateUsdBrl: 5.00,
    selectedReferenceMonth: null,
    activeTab: 'expenses',

    // Modos de visualização
    timelineMode: 'geral',
    monthlyMode: 'geral',
    weekdayMode: 'avg',
    incomeTimelineMode: 'geral',
    incomeMonthlyMode: 'geral',

    listeners: [],

    init() {
        try {
            this.displayCurrency = localStorage.getItem('finanai_display_currency') || 'BRL';
            this.exchangeRateUsdBrl = parseFloat(localStorage.getItem('finanai_exchange_rate')) || 5.00;
        } catch (error) {
            this.displayCurrency = 'BRL';
            this.exchangeRateUsdBrl = 5.00;
        }
        
        try {
            const savedLimits = localStorage.getItem('finanai_budget_limits');
            if (savedLimits) {
                this.categoryBudgetLimits = { ...DEFAULT_BUDGET_LIMITS_BRL, ...JSON.parse(savedLimits) };
            }
        } catch (e) {
            this.categoryBudgetLimits = { ...DEFAULT_BUDGET_LIMITS_BRL };
        }

        try {
            const savedFund = localStorage.getItem('finanai_emergency_fund');
            if (savedFund) {
                this.emergencyFund = { ...this.emergencyFund, ...JSON.parse(savedFund) };
            }
        } catch (e) {}

        try {
            const savedTx = localStorage.getItem('finanai_transactions');
            this.transactions = savedTx ? JSON.parse(savedTx) : [];
        } catch (e) {
            this.transactions = [];
        }

        try {
            const savedInc = localStorage.getItem('finanai_incomes');
            this.incomes = savedInc ? JSON.parse(savedInc) : [];
        } catch (e) {
            this.incomes = [];
        }

        try {
            const savedFiles = localStorage.getItem('finanai_files');
            this.uploadedFiles = savedFiles ? JSON.parse(savedFiles) : [];
        } catch (e) {
            this.uploadedFiles = [];
        }

        try {
            const savedIncFiles = localStorage.getItem('finanai_income_files');
            this.uploadedIncomeFiles = savedIncFiles ? JSON.parse(savedIncFiles) : [];
        } catch (e) {
            this.uploadedIncomeFiles = [];
        }

        // Se não houver receitas e houver despesas, sugerir receita padrão recorrente
        if (this.incomes.length === 0 && this.transactions.length > 0) {
            this.seedInitialIncomesIfEmpty();
        }

        this.updateAvailableMonths();
    },

    seedInitialIncomesIfEmpty() {
        const allMonths = this.getAllMonths();
        const startMonth = allMonths.length > 0 ? allMonths[allMonths.length - 1].ym : new Date().toISOString().substring(0, 7);
        
        // Criar uma receita recorrente inicial a partir do mês mais antigo
        this.incomes = [
            {
                id: 'inc_rec_salario',
                date: `${startMonth}-05`,
                description: 'Salário Mensal',
                category: 'Salário / Pró-labore',
                amountOriginal: 7500.00,
                currency: 'BRL',
                amountBrl: 7500.00,
                type: 'recurrent',
                monthlyAdjustments: {},
                excludedMonths: [],
                sourceId: 'seed_source'
            },
            {
                id: 'inc_rec_fii',
                date: `${startMonth}-15`,
                description: 'Rendimentos FIIs (MXRF11 / HGLG11)',
                category: 'Rendimentos FIIs',
                amountOriginal: 480.00,
                currency: 'BRL',
                amountBrl: 480.00,
                type: 'recurrent',
                monthlyAdjustments: {},
                excludedMonths: [],
                sourceId: 'seed_source'
            }
        ];
        this.saveIncomes();
    },

    subscribe(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
        }
    },

    notify() {
        this.listeners.forEach(cb => {
            try { cb(this); } catch(err) { console.error('Error in state listener:', err); }
        });
    },

    saveExpenses() {
        localStorage.setItem('finanai_transactions', JSON.stringify(this.transactions));
        localStorage.setItem('finanai_files', JSON.stringify(this.uploadedFiles));
        this.updateAvailableMonths();
        this.notify();
    },

    saveIncomes() {
        localStorage.setItem('finanai_incomes', JSON.stringify(this.incomes));
        localStorage.setItem('finanai_income_files', JSON.stringify(this.uploadedIncomeFiles));
        this.updateAvailableMonths();
        this.notify();
    },

    persistFinancialSetting(key, value, notify = true) {
        let saved = false;
        try {
            localStorage.setItem(key, JSON.stringify(value));
            saved = true;
        } catch (error) {
            console.warn('Não foi possível salvar a configuração financeira no navegador.');
        }
        if (notify) this.notify();
        return saved;
    },

    saveBudgetLimits(notify = true) {
        return this.persistFinancialSetting('finanai_budget_limits', this.categoryBudgetLimits, notify);
    },

    saveEmergencyFund() {
        return this.persistFinancialSetting('finanai_emergency_fund', this.emergencyFund);
    },

    setDisplayCurrency(curr) {
        this.displayCurrency = curr;
        localStorage.setItem('finanai_display_currency', curr);
        this.notify();
    },

    setExchangeRate(rate) {
        if (rate && rate > 0) {
            this.exchangeRateUsdBrl = rate;
            localStorage.setItem('finanai_exchange_rate', rate);
            this.notify();
        }
    },

    setSelectedMonth(ym) {
        this.selectedReferenceMonth = ym;
        this.notify();
    },

    convertAmount(item, targetCurrency = this.displayCurrency) {
        let baseBrl = item.amountBrl;
        if (!baseBrl && item.currency === 'USD') {
            baseBrl = item.amountOriginal * this.exchangeRateUsdBrl;
        } else if (!baseBrl) {
            baseBrl = item.amountOriginal || 0;
        }

        if (targetCurrency === 'USD') {
            return baseBrl / this.exchangeRateUsdBrl;
        }
        return baseBrl;
    },

    /**
     * Retorna a lista contínua de todos os meses desde o mais antigo até o mais recente
     */
    getAllMonths() {
        const rawDates = [
            ...this.transactions.map(t => t.date),
            ...this.incomes.map(i => i.date)
        ].filter(Boolean);

        if (rawDates.length === 0) return [];

        const monthKeys = Array.from(new Set(rawDates.map(d => d.substring(0, 7)))).sort();
        if (monthKeys.length === 0) return [];

        const minMonth = monthKeys[0];
        const maxMonth = monthKeys[monthKeys.length - 1];

        const [minY, minM] = minMonth.split('-').map(Number);
        const [maxY, maxM] = maxMonth.split('-').map(Number);

        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const continuousMonths = [];

        let current = new Date(minY, minM - 1, 1);
        const end = new Date(maxY, maxM - 1, 1);

        while (current <= end) {
            const ym = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
            const label = `${monthNames[current.getMonth()]}/${current.getFullYear()}`;
            continuousMonths.push({ ym, label });
            current.setMonth(current.getMonth() + 1);
        }

        return continuousMonths.reverse();
    },

    updateAvailableMonths() {
        const months = this.getAllMonths();
        if (months.length > 0) {
            if (!this.selectedReferenceMonth || !months.some(m => m.ym === this.selectedReferenceMonth)) {
                this.selectedReferenceMonth = months[0].ym;
            }
        } else {
            this.selectedReferenceMonth = null;
        }
    },

    getCurrentMonthExpenses() {
        if (!this.selectedReferenceMonth) return [];
        return this.transactions.filter(t => t.date && t.date.startsWith(this.selectedReferenceMonth));
    },

    getPreviousMonthKey(monthKey = this.selectedReferenceMonth) {
        if (!monthKey) return null;
        const [year, month] = monthKey.split('-').map(Number);
        const prev = new Date(year, month - 2, 1);
        return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    },

    getPreviousMonthExpenses() {
        const prevKey = this.getPreviousMonthKey();
        if (!prevKey) return [];
        return this.transactions.filter(t => t.date && t.date.startsWith(prevKey));
    },

    /**
     * Resolve de forma dinâmica todas as receitas de um determinado mês,
     * propagando receitas recorrentes e aplicando eventuais ajustes manuais daquele mês.
     */
    getIncomesForMonth(targetMonth) {
        if (!targetMonth) return [];
        const result = [];

        // 1. Receitas pontuais / variáveis com data correspondente ao mês
        this.incomes
            .filter(i => i.type === 'variable' && i.date && i.date.startsWith(targetMonth))
            .forEach(i => result.push({ ...i, rootId: i.id, isRecurrentInstance: false, isAdjusted: false }));

        // 2. Receitas recorrentes que iniciaram neste mês ou antes
        this.incomes
            .filter(i => i.type !== 'variable')
            .forEach(item => {
                const startMonth = (item.date || '').substring(0, 7);
                if (startMonth && targetMonth >= startMonth) {
                    // Verificar se este mês específico foi excluído da recorrência
                    if (item.excludedMonths && item.excludedMonths.includes(targetMonth)) {
                        return;
                    }

                    const day = (item.date && item.date.split('-')[2]) ? item.date.split('-')[2] : '05';
                    const effectiveDate = `${targetMonth}-${day}`;

                    // Verificar se existe um ajuste manual específico para este mês
                    const adjustment = (item.monthlyAdjustments && item.monthlyAdjustments[targetMonth]) ? item.monthlyAdjustments[targetMonth] : null;

                    if (adjustment) {
                        const origAmount = adjustment.amountOriginal !== undefined ? Number(adjustment.amountOriginal) : Number(item.amountOriginal);
                        const curr = adjustment.currency || item.currency || 'BRL';
                        const isUsd = curr === 'USD';
                        const amountBrl = adjustment.amountBrl !== undefined ? Number(adjustment.amountBrl) : (isUsd ? origAmount * this.exchangeRateUsdBrl : origAmount);

                        result.push({
                            ...item,
                            ...adjustment,
                            id: `${item.id}_${targetMonth}`,
                            rootId: item.id,
                            date: adjustment.date || effectiveDate,
                            amountOriginal: origAmount,
                            amountBrl: amountBrl,
                            currency: curr,
                            isRecurrentInstance: true,
                            isAdjusted: true
                        });
                    } else {
                        result.push({
                            ...item,
                            id: `${item.id}_${targetMonth}`,
                            rootId: item.id,
                            date: effectiveDate,
                            isRecurrentInstance: true,
                            isAdjusted: false
                        });
                    }
                }
            });

        return result.sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    getCurrentMonthIncomes() {
        if (!this.selectedReferenceMonth) return [];
        return this.getIncomesForMonth(this.selectedReferenceMonth);
    },

    getPreviousMonthIncomes() {
        const prevKey = this.getPreviousMonthKey();
        if (!prevKey) return [];
        return this.getIncomesForMonth(prevKey);
    },

    getCategoryBudgetLimit(category, currency = this.displayCurrency) {
        const limitBrl = this.categoryBudgetLimits[category] || 0;
        return currency === 'USD' ? limitBrl / this.exchangeRateUsdBrl : limitBrl;
    }
};
