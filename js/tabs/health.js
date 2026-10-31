/**
 * FinanAI - Módulo da Aba de Saúde Financeira
 */

window.HealthTab = {
    // Instâncias de gráficos
    cashflowChartInstance: null,
    ruleChartInstance: null,

    init() {
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Listeners para os inputs do simulador de reserva
        const monthsInput = document.getElementById('emergencyTargetMonths');
        const savingsInput = document.getElementById('emergencyCurrentSavings');
        const expenseInput = document.getElementById('emergencyCustomExpense');

        if (monthsInput) monthsInput.addEventListener('change', () => this.updateEmergencySettings('targetMonths'));
        if (savingsInput) savingsInput.addEventListener('input', () => this.updateEmergencySettings('currentSavings'));
        if (expenseInput) expenseInput.addEventListener('input', () => this.updateEmergencySettings('customMonthlyExpense'));
    },

    render() {
        this.renderHealthScore();
        this.renderHealthKPIs();
        this.renderRule503020();
        this.renderEmergencySimulator();
        this.renderCharts();
    },

    getEmergencyReserveMetrics(totalExpenses = null) {
        const state = window.AppState;
        const curr = state.displayCurrency;
        const fund = state.emergencyFund;
        const factor = curr === 'USD' ? 1 / state.exchangeRateUsdBrl : 1;
        const expenses = totalExpenses ?? state.getCurrentMonthExpenses()
            .reduce((sum, item) => sum + state.convertAmount(item, curr), 0);
        const customCost = (fund.customMonthlyExpense || 0) * factor;
        // A reserva e o custo personalizado são armazenados em BRL.
        // O padrão de R$ 2.500 também deve ser convertido ao exibir USD.
        const monthlyCost = customCost > 0 ? customCost : (expenses > 0 ? expenses : 2500 * factor);
        const currentSavedConverted = (fund.currentSavings || 0) * factor;
        const targetMonths = fund.targetMonths || 6;
        return {
            monthlyCost, currentSavedConverted, targetMonths,
            totalTarget: monthlyCost * targetMonths,
            coverageMonths: monthlyCost > 0 ? currentSavedConverted / monthlyCost : 0
        };
    },

    calculateHealthMetrics() {
        const curr = window.AppState.displayCurrency;
        const currentExpenses = window.AppState.getCurrentMonthExpenses();
        const currentIncomes = window.AppState.getCurrentMonthIncomes();

        const totalExpenses = currentExpenses.reduce((acc, t) => acc + window.AppState.convertAmount(t, curr), 0);
        const totalIncomes = currentIncomes.reduce((acc, i) => acc + window.AppState.convertAmount(i, curr), 0);
        const netSavings = totalIncomes - totalExpenses;
        const savingsRate = totalIncomes > 0 ? (netSavings / totalIncomes) * 100 : (netSavings > 0 ? 100 : -100);

        // 1. Pontuação da Taxa de Poupança (peso 35%)
        let savingsScore = 0;
        if (savingsRate >= 30) savingsScore = 100;
        else if (savingsRate >= 20) savingsScore = 85;
        else if (savingsRate >= 10) savingsScore = 65;
        else if (savingsRate > 0) savingsScore = 40;
        else savingsScore = 0;

        // 2. Aderência ao Teto de Gastos (peso 25%)
        const categorySpent = {};
        EXPENSE_CATEGORIES.forEach(c => categorySpent[c] = 0);
        currentExpenses.forEach(t => {
            categorySpent[t.category] = (categorySpent[t.category] || 0) + window.AppState.convertAmount(t, curr);
        });

        let exceededCount = 0;
        EXPENSE_CATEGORIES.forEach(cat => {
            const limit = window.AppState.getCategoryBudgetLimit(cat, curr);
            if (limit > 0 && categorySpent[cat] > limit) {
                exceededCount++;
            }
        });

        let budgetScore = 100;
        if (exceededCount === 1) budgetScore = 70;
        else if (exceededCount === 2) budgetScore = 45;
        else if (exceededCount >= 3) budgetScore = 15;

        // 3. Regra 50/30/20 (peso 20%)
        let needsSpent = 0;
        let wantsSpent = 0;
        let savingsSpent = 0;

        currentExpenses.forEach(t => {
            const val = window.AppState.convertAmount(t, curr);
            const group = EXPENSE_RULE_MAP[t.category] || 'wants';
            if (group === 'needs') needsSpent += val;
            else if (group === 'wants') wantsSpent += val;
            else if (group === 'savings') savingsSpent += val;
        });

        const needsPct = totalIncomes > 0 ? (needsSpent / totalIncomes) * 100 : (needsSpent > 0 ? 100 : 0);
        let ruleScore = 50;
        if (needsPct <= 50) ruleScore = 100;
        else if (needsPct <= 60) ruleScore = 80;
        else if (needsPct <= 75) ruleScore = 55;
        else ruleScore = 20;

        // 4. Cobertura da Reserva (peso 20%)
        const { coverageMonths } = this.getEmergencyReserveMetrics(totalExpenses);

        let fundScore = 15;
        if (coverageMonths >= 6) fundScore = 100;
        else if (coverageMonths >= 3) fundScore = 75;
        else if (coverageMonths >= 1) fundScore = 45;

        // Score Global ponderado (0 a 100)
        let overallScore = Math.round(
            (savingsScore * 0.35) +
            (budgetScore * 0.25) +
            (ruleScore * 0.20) +
            (fundScore * 0.20)
        );

        if (totalIncomes === 0 && totalExpenses === 0) {
            overallScore = 50;
        }

        return {
            totalExpenses,
            totalIncomes,
            netSavings,
            savingsRate,
            needsSpent,
            wantsSpent,
            savingsSpent,
            needsPct,
            wantsPct: totalIncomes > 0 ? (wantsSpent / totalIncomes) * 100 : 0,
            savingsPct: totalIncomes > 0 ? (savingsSpent / totalIncomes) * 100 : 0,
            exceededCount,
            coverageMonths,
            overallScore,
            scores: { savingsScore, budgetScore, ruleScore, fundScore }
        };
    },

    renderHealthScore() {
        const metrics = this.calculateHealthMetrics();
        const score = metrics.overallScore;
        const badge = Utils.getScoreBadge(score);

        // Atualizar textos e cores
        const scoreElem = document.getElementById('healthScoreVal');
        const labelElem = document.getElementById('healthScoreLabel');
        const descElem = document.getElementById('healthScoreDesc');
        const badgeElem = document.getElementById('healthScoreBadge');

        if (scoreElem) scoreElem.innerText = score;
        if (labelElem) {
            labelElem.innerText = badge.label;
            labelElem.className = `text-lg font-bold ${badge.colorClass}`;
        }
        if (descElem) descElem.innerText = badge.desc;
        if (badgeElem) {
            badgeElem.className = `px-3 py-1 rounded-full text-xs font-bold border ${badge.bgClass} ${badge.borderClass} ${badge.colorClass}`;
            badgeElem.innerText = `Score ${score}/100`;
        }

        // Animação do anel SVG
        const circle = document.getElementById('healthScoreGauge');
        if (circle) {
            const radius = circle.r.baseVal.value;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (score / 100) * circumference;
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            circle.style.strokeDashoffset = offset;
            circle.style.stroke = badge.strokeColor;
        }

        // Atualizar barras dos 4 pilares
        this.updatePillarBar('pillarSavingsBar', 'pillarSavingsVal', metrics.scores.savingsScore, `${metrics.savingsRate.toFixed(1)}%`);
        this.updatePillarBar('pillarBudgetBar', 'pillarBudgetVal', metrics.scores.budgetScore, `${metrics.exceededCount === 0 ? 'Sem estouros' : metrics.exceededCount + ' estourado(s)'}`);
        this.updatePillarBar('pillarRuleBar', 'pillarRuleVal', metrics.scores.ruleScore, `${metrics.needsPct.toFixed(0)}% Essencial`);
        this.updatePillarBar('pillarFundBar', 'pillarFundVal', metrics.scores.fundScore, `${metrics.coverageMonths.toFixed(1)} meses`);
    },

    updatePillarBar(barId, valId, score, label) {
        const bar = document.getElementById(barId);
        const val = document.getElementById(valId);
        if (bar) {
            bar.style.width = `${Math.min(score, 100)}%`;
            if (score >= 80) bar.className = 'bg-emerald-500 h-full rounded-full transition-all duration-500';
            else if (score >= 60) bar.className = 'bg-cyan-500 h-full rounded-full transition-all duration-500';
            else if (score >= 40) bar.className = 'bg-amber-500 h-full rounded-full transition-all duration-500';
            else bar.className = 'bg-red-500 h-full rounded-full transition-all duration-500';
        }
        if (val) val.innerText = label;
    },

    renderHealthKPIs() {
        const metrics = this.calculateHealthMetrics();
        const curr = window.AppState.displayCurrency;

        // 1. Balanço Líquido
        const netElem = document.getElementById('kpiHealthNet');
        const netDescElem = document.getElementById('kpiHealthNetDesc');
        const isSurplus = metrics.netSavings >= 0;

        if (netElem) {
            netElem.innerText = Utils.formatCurrency(metrics.netSavings, curr);
            netElem.className = `text-2xl font-bold ${isSurplus ? 'text-emerald-400' : 'text-red-400'}`;
        }
        if (netDescElem) {
            netDescElem.innerText = isSurplus ? 'Superávit Livre para Investir' : 'Déficit (Gastou mais do que ganhou)';
            netDescElem.className = isSurplus ? 'text-xs text-emerald-400/80 font-medium' : 'text-xs text-red-400/80 font-medium';
        }

        // 2. Taxa de Poupança
        const saveRateElem = document.getElementById('kpiHealthSavingsRate');
        const saveBarElem = document.getElementById('kpiHealthSavingsBar');
        if (saveRateElem) {
            saveRateElem.innerText = `${metrics.savingsRate.toFixed(1)}%`;
            saveRateElem.className = `text-2xl font-bold ${metrics.savingsRate >= 20 ? 'text-emerald-400' : (metrics.savingsRate > 0 ? 'text-amber-400' : 'text-red-400')}`;
        }
        if (saveBarElem) {
            saveBarElem.style.width = `${Math.min(Math.max(metrics.savingsRate, 0), 100)}%`;
            saveBarElem.className = metrics.savingsRate >= 20 ? 'bg-emerald-500 h-full rounded-full' : (metrics.savingsRate > 0 ? 'bg-amber-500 h-full rounded-full' : 'bg-red-500 h-full rounded-full');
        }

        // 3. Receitas vs Despesas
        document.getElementById('kpiHealthIncomeVal').innerText = Utils.formatCurrency(metrics.totalIncomes, curr);
        document.getElementById('kpiHealthExpenseVal').innerText = Utils.formatCurrency(metrics.totalExpenses, curr);

        // 4. Cobertura da Reserva
        document.getElementById('kpiHealthReserveMonths').innerText = `${metrics.coverageMonths.toFixed(1)} Meses`;
    },

    renderRule503020() {
        const metrics = this.calculateHealthMetrics();
        const curr = window.AppState.displayCurrency;

        // Needs (50%)
        document.getElementById('ruleNeedsSpent').innerText = Utils.formatCurrency(metrics.needsSpent, curr);
        document.getElementById('ruleNeedsPct').innerText = `${metrics.needsPct.toFixed(1)}%`;
        const barNeeds = document.getElementById('ruleNeedsBar');
        if (barNeeds) {
            barNeeds.style.width = `${Math.min(metrics.needsPct, 100)}%`;
            barNeeds.className = metrics.needsPct <= 50 ? 'bg-emerald-500 h-full rounded-full' : (metrics.needsPct <= 65 ? 'bg-amber-500 h-full rounded-full' : 'bg-red-500 h-full rounded-full');
        }

        // Wants (30%)
        document.getElementById('ruleWantsSpent').innerText = Utils.formatCurrency(metrics.wantsSpent, curr);
        document.getElementById('ruleWantsPct').innerText = `${metrics.wantsPct.toFixed(1)}%`;
        const barWants = document.getElementById('ruleWantsBar');
        if (barWants) {
            barWants.style.width = `${Math.min(metrics.wantsPct, 100)}%`;
            barWants.className = metrics.wantsPct <= 30 ? 'bg-cyan-500 h-full rounded-full' : (metrics.wantsPct <= 40 ? 'bg-amber-500 h-full rounded-full' : 'bg-red-500 h-full rounded-full');
        }

        // Savings (20%)
        const actualSavingsRate = Math.max(metrics.savingsRate, 0);
        document.getElementById('ruleSavingsSpent').innerText = Utils.formatCurrency(Math.max(metrics.netSavings, 0), curr);
        document.getElementById('ruleSavingsPct').innerText = `${actualSavingsRate.toFixed(1)}%`;
        const barSavings = document.getElementById('ruleSavingsBar');
        if (barSavings) {
            barSavings.style.width = `${Math.min(actualSavingsRate, 100)}%`;
            barSavings.className = actualSavingsRate >= 20 ? 'bg-emerald-500 h-full rounded-full' : 'bg-amber-500 h-full rounded-full';
        }
    },

    renderEmergencySimulator() {
        const curr = window.AppState.displayCurrency;
        const fund = window.AppState.emergencyFund;
        const { monthlyCost, targetMonths, totalTarget, currentSavedConverted } = this.getEmergencyReserveMetrics();

        const progressPct = totalTarget > 0 ? (currentSavedConverted / totalTarget) * 100 : 0;
        const remainingToSave = Math.max(totalTarget - currentSavedConverted, 0);

        // Preencher inputs
        const targetMonthsInput = document.getElementById('emergencyTargetMonths');
        const currentSavingsInput = document.getElementById('emergencyCurrentSavings');
        const customExpenseInput = document.getElementById('emergencyCustomExpense');

        if (targetMonthsInput) targetMonthsInput.value = targetMonths;
        if (currentSavingsInput && document.activeElement !== currentSavingsInput) {
            currentSavingsInput.value = Number(currentSavedConverted.toFixed(2));
        }
        if (customExpenseInput && document.activeElement !== customExpenseInput) {
            customExpenseInput.value = fund.customMonthlyExpense > 0 ? Number(monthlyCost.toFixed(2)) : '';
        }

        // Preencher displays
        document.getElementById('simTotalTarget').innerText = Utils.formatCurrency(totalTarget, curr);
        document.getElementById('simCurrentSaved').innerText = Utils.formatCurrency(currentSavedConverted, curr);
        document.getElementById('simRemaining').innerText = Utils.formatCurrency(remainingToSave, curr);
        document.getElementById('simProgressPercent').innerText = `${progressPct.toFixed(1)}%`;

        const progressBar = document.getElementById('simProgressBar');
        if (progressBar) {
            progressBar.style.width = `${Math.min(progressPct, 100)}%`;
            progressBar.className = progressPct >= 100 ? 'bg-emerald-500 h-full rounded-full transition-all' : (progressPct >= 50 ? 'bg-cyan-500 h-full rounded-full transition-all' : 'bg-amber-500 h-full rounded-full transition-all');
        }

        // Estimativa de tempo com superávit atual
        const metrics = this.calculateHealthMetrics();
        const estElem = document.getElementById('simTimeToTarget');
        if (estElem) {
            if (currentSavedConverted >= totalTarget) {
                estElem.innerHTML = `<span class="text-emerald-400 font-bold">Reserva de Emergência 100% Concluída! Parabéns!</span>`;
            } else if (metrics.netSavings > 0) {
                const monthsLeft = Math.ceil(remainingToSave / metrics.netSavings);
                estElem.innerHTML = `No ritmo atual de economia (+${Utils.formatCurrency(metrics.netSavings, curr)}/mês), você completará sua reserva em aprox. <strong class="text-cyan-400">${monthsLeft} mês(es)</strong>.`;
            } else {
                estElem.innerHTML = `<span class="text-amber-400">Gere superávit mensal na aba de despesas/receitas para projetar o tempo de conclusão.</span>`;
            }
        }
    },

    updateEmergencySettings(changedField = null) {
        const targetMonthsInput = document.getElementById('emergencyTargetMonths');
        const currentSavingsInput = document.getElementById('emergencyCurrentSavings');
        const customExpenseInput = document.getElementById('emergencyCustomExpense');
        if (currentSavingsInput?.validity?.badInput || customExpenseInput?.validity?.badInput) return;

        const targetMonths = parseInt(targetMonthsInput?.value) || 6;
        const currentSavings = parseFloat(currentSavingsInput?.value) || 0;
        const customExpense = parseFloat(customExpenseInput?.value) || 0;
        if (![3, 6, 12].includes(targetMonths) || !Number.isFinite(currentSavings) || !Number.isFinite(customExpense)
            || currentSavings < 0 || customExpense < 0) return;
        const rate = window.AppState.displayCurrency === 'USD' ? window.AppState.exchangeRateUsdBrl : 1;

        window.AppState.emergencyFund = {
            targetMonths: !changedField || changedField === 'targetMonths' ? targetMonths : window.AppState.emergencyFund.targetMonths,
            currentSavings: !changedField || changedField === 'currentSavings'
                ? Math.round(currentSavings * rate * 100) / 100 : window.AppState.emergencyFund.currentSavings,
            customMonthlyExpense: !changedField || changedField === 'customMonthlyExpense'
                ? Math.round(customExpense * rate * 100) / 100 : window.AppState.emergencyFund.customMonthlyExpense
        };

        const saved = window.AppState.saveEmergencyFund();
        Utils.setSaveStatus('emergencySaveStatus', saved);
        this.renderHealthScore();
        this.renderHealthKPIs();
        this.renderEmergencySimulator();
    },

    renderCharts() {
        const curr = window.AppState.displayCurrency;
        const currSymbol = curr === 'BRL' ? 'R$' : '$';

        // 1. Gráfico Histórico de Fluxo de Caixa (Receitas vs Despesas vs Saldo)
        const allMonths = window.AppState.getAllMonths();
        const sortedMonths = allMonths.map(m => m.ym).sort();

        const monthlyIncomes = {};
        const monthlyExpenses = {};
        sortedMonths.forEach(m => {
            const mIncomes = window.AppState.getIncomesForMonth(m);
            monthlyIncomes[m] = mIncomes.reduce((acc, i) => acc + window.AppState.convertAmount(i, curr), 0);
            monthlyExpenses[m] = 0;
        });

        window.AppState.transactions.forEach(t => {
            const ym = t.date.substring(0, 7);
            if (monthlyExpenses[ym] !== undefined) {
                monthlyExpenses[ym] += window.AppState.convertAmount(t, curr);
            }
        });

        const labels = sortedMonths.map(ym => {
            const [y, m] = ym.split('-');
            const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            return `${monthNames[parseInt(m)-1]}/${y.substring(2)}`;
        });

        const incomeData = sortedMonths.map(m => monthlyIncomes[m] || 0);
        const expenseData = sortedMonths.map(m => monthlyExpenses[m] || 0);
        const netData = sortedMonths.map(m => (monthlyIncomes[m] || 0) - (monthlyExpenses[m] || 0));

        if (this.cashflowChartInstance) this.cashflowChartInstance.destroy();
        const canvasCashflow = document.getElementById('healthCashflowChart');
        if (canvasCashflow) {
            const ctxCash = canvasCashflow.getContext('2d');
            this.cashflowChartInstance = new Chart(ctxCash, {
                type: 'bar',
                data: {
                    labels: labels.length ? labels : ['Sem dados'],
                    datasets: [
                        {
                            label: `Receitas (${curr})`,
                            data: incomeData,
                            backgroundColor: '#10b981',
                            borderRadius: 6
                        },
                        {
                            label: `Despesas (${curr})`,
                            data: expenseData,
                            backgroundColor: '#ef4444',
                            borderRadius: 6
                        },
                        {
                            label: `Saldo Líquido (${curr})`,
                            data: netData,
                            type: 'line',
                            order: -1,
                            borderColor: '#38bdf8',
                            backgroundColor: 'rgba(56, 189, 248, 0.2)',
                            tension: 0.3,
                            pointRadius: 5
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                        y: { ticks: { color: '#94a3b8', callback: (v) => `${currSymbol} ${v}` }, grid: { color: '#334155' } }
                    },
                    plugins: {
                        datalabels: { display: false },
                        legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ` ${ctx.dataset.label}: ${currSymbol} ${ctx.raw.toFixed(2)}`
                            }
                        }
                    }
                }
            });
        }
    },

    async generateHealthAiDiagnosis() {
        const metrics = this.calculateHealthMetrics();
        const curr = window.AppState.displayCurrency;

        document.getElementById('healthDiagText').innerText = 'Processando diagnóstico global com inteligência artificial...';
        document.getElementById('healthActionPlanText').innerText = 'Elaborando plano de ação financeiro personalizado...';
        document.getElementById('healthInvestmentText').innerText = 'Estruturando recomendações estratégicas de aporte...';

        const healthObj = {
            referenceMonth: window.AppState.selectedReferenceMonth,
            overallScore: metrics.overallScore,
            totalIncome: metrics.totalIncomes,
            totalExpense: metrics.totalExpenses,
            netSavings: metrics.netSavings,
            savingsRatePercent: metrics.savingsRate.toFixed(1),
            rule503020: {
                needsPercent: metrics.needsPct.toFixed(1),
                wantsPercent: metrics.wantsPct.toFixed(1),
                savingsPercent: metrics.savingsPct.toFixed(1)
            },
            emergencyReserveMonths: metrics.coverageMonths.toFixed(1),
            overbudgetCategoriesCount: metrics.exceededCount,
            currency: curr
        };

        if (AIAPI.hasApiKey()) {
            try {
                const parsed = await AIAPI.generateHealthDiagnosis(healthObj);
                document.getElementById('healthDiagText').innerText = parsed.diagnosis || 'Diagnóstico concluído.';
                document.getElementById('healthActionPlanText').innerText = parsed.actionPlan || 'Mantenha o foco em aumentar a taxa de poupança.';
                document.getElementById('healthInvestmentText').innerText = parsed.investmentAdvice || 'Aporte a sobra em reserva de emergência e ativos geradores de renda.';
                Utils.showNotification('Consultoria via IA gerada com sucesso!', 'success');
                return;
            } catch (e) {
                console.error("Erro no diagnostico de saude:", e); Utils.showNotification(`Aviso da IA: ${e.message}`, "warning");
            }
        }

        // Diagnóstico local inteligente
        if (metrics.netSavings > 0) {
            document.getElementById('healthDiagText').innerText = `Parabéns! Você fechou o mês com superávit de ${Utils.formatCurrency(metrics.netSavings, curr)} e Score de ${metrics.overallScore}/100. Suas finanças estão no caminho certo.`;
            document.getElementById('healthActionPlanText').innerText = `1. Direcione a sobra de ${Utils.formatCurrency(metrics.netSavings, curr)} prioritariamente para acelerar sua Reserva de Emergência até cobrir ${window.AppState.emergencyFund.targetMonths || 6} meses de custo.\n2. Mantenha os gastos essenciais controlados abaixo de 55% da sua renda.`;
            document.getElementById('healthInvestmentText').innerText = `Com a reserva de emergência garantida (Tesouro Selic ou CDB Liquidez Diária), comece a alocar aportes mensais em Fundos Imobiliários e ações pagadoras de dividendos para aumentar sua renda passiva.`;
        } else {
            document.getElementById('healthDiagText').innerText = `Atenção: Você encerrou o mês com déficit de ${Utils.formatCurrency(Math.abs(metrics.netSavings), curr)}. Suas despesas superaram sua renda.`;
            document.getElementById('healthActionPlanText').innerText = `1. Revise imediatamente as categorias de Desejos/Lazer e Assinaturas.\n2. Congele compras não essenciais até reequilibrar o fluxo de caixa.\n3. Busque fontes adicionais de receita na aba de Receitas.`;
            document.getElementById('healthInvestmentText').innerText = `Prioridade absoluta deve ser estancar o sangramento do orçamento antes de realizar qualquer investimento de risco.`;
        }
        Utils.showNotification('Diagnóstico consultivo local gerado.', 'info');
    }
};
