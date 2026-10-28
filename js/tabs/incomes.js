/**
 * FinanAI - Módulo da Aba de Receitas com Recorrência Inteligente
 */

window.IncomesTab = {
    filteredIncomes: [],
    currentSort: { field: 'date', direction: 'desc' },

    // Instâncias dos gráficos
    incomeTimelineChartInstance: null,
    incomeMonthlyChartInstance: null,
    incomeCategoryChartInstance: null,

    init() {
        this.populateIncomeCategoryFilter();
        this.setupEventListeners();
    },

    setupEventListeners() {
        const dropZoneIncome = document.getElementById('dropZoneIncome');
        if (dropZoneIncome) {
            dropZoneIncome.addEventListener('dragover', (e) => this.handleDragOver(e));
            dropZoneIncome.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            dropZoneIncome.addEventListener('drop', (e) => this.handleIncomeFileDrop(e));
        }
    },

    render() {
        this.applyFilters();
        this.renderKPICards();
        this.renderCharts();
    },

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('border-cyan-500', 'bg-cyan-500/5');
    },

    handleDragLeave(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('border-cyan-500', 'bg-cyan-500/5');
    },

    async handleIncomeFileDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('border-cyan-500', 'bg-cyan-500/5');
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            await this.processMultipleIncomeFiles(files);
        }
    },

    async handleIncomeFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            await this.processMultipleIncomeFiles(files);
            e.target.value = '';
        }
    },

    async processMultipleIncomeFiles(files) {
        let importedTotal = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const mimeType = AIAPI.getFileMimeType(file);
            const isJson = file.name.toLowerCase().endsWith('.json') || mimeType.includes('json');

            if (isJson) {
                try {
                    const text = await file.text();
                    if (this.parseAndImportIncomeJSON(text, file.name)) {
                        importedTotal++;
                    }
                } catch (e) {
                    console.error("Erro ao ler JSON de receita:", e);
                }
            } else {
                if (!AIAPI.hasApiKey()) {
                    Utils.toggleModal('configModal');
                    Utils.showNotification('Insira a chave de API do provedor selecionado para processar informes ou recibos em PDF/imagem.', 'warning');
                    continue;
                }
                try {
                    Utils.showNotification(`Processando ${file.name} com IA...`, 'info');
                    let base64 = null;
                    let rawText = '';
                    if (mimeType.includes('pdf') || mimeType.includes('image')) {
                        base64 = await Utils.fileToBase64(file);
                    } else {
                        rawText = await file.text();
                    }
                    const parsed = await AIAPI.processIncomesDocument(rawText, base64, mimeType);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        if (StatementImport.importJSON(JSON.stringify(parsed), file.name, 'income', `Extração via ${AIAPI.getProviderName()}`, { rawText, type: mimeType })) {
                            importedTotal++;
                        }
                    } else {
                        Utils.showNotification('A IA não encontrou entradas ou saídas no documento.', 'warning');
                    }
                } catch (err) {
                    console.error("Erro ao extrair receitas:", err);
                    Utils.showNotification(err.message || `Erro ao processar ${file.name}.`, 'error');
                }
            }
        }

        if (importedTotal > 0) {
            Utils.showNotification(`Importação concluída: entradas em Receitas e saídas em Despesas.`, 'success');
        }
    },

    parseAndImportIncomeJSON(jsonString, fileName = 'Receitas.json') {
        return StatementImport.importJSON(jsonString, fileName, 'income');
    },

    onIncomeTypeChange(type) {
        const notice = document.getElementById('recurrentNotice');
        if (notice) {
            if (type === 'recurrent') notice.classList.remove('hidden');
            else notice.classList.add('hidden');
        }
    },

    openIncomeModal(incomeId = null) {
        const modal = document.getElementById('incomeModal');
        const form = document.getElementById('incomeForm');
        form.reset();

        document.getElementById('incomeModalTitle').innerText = incomeId ? 'Editar Receita' : 'Nova Receita';
        document.getElementById('incomeEditId').value = incomeId || '';
        document.getElementById('incomeRootId').value = '';

        const catSelect = document.getElementById('incomeCategoryInput');
        catSelect.innerHTML = INCOME_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');

        const curr = window.AppState.displayCurrency;
        document.getElementById('incomeCurrencyInput').value = curr;

        const scopeContainer = document.getElementById('recurrentEditScopeContainer');
        const recurrentNotice = document.getElementById('recurrentNotice');

        if (incomeId) {
            // Buscar na lista renderizada atual do mês
            const currentItems = window.AppState.getCurrentMonthIncomes();
            let currentItem = currentItems.find(i => i.id === incomeId);
            
            // Se não achar pelo ID de instância, buscar na lista global
            if (!currentItem) {
                currentItem = window.AppState.incomes.find(i => i.id === incomeId);
            }

            if (currentItem) {
                const rootId = currentItem.rootId || currentItem.id;
                document.getElementById('incomeRootId').value = rootId;
                document.getElementById('incomeDateInput').value = currentItem.date;
                document.getElementById('incomeDescInput').value = currentItem.description;
                document.getElementById('incomeCategoryInput').value = currentItem.category;
                document.getElementById('incomeTypeInput').value = currentItem.type || 'recurrent';
                document.getElementById('incomeCurrencyInput').value = currentItem.currency || 'BRL';
                document.getElementById('incomeAmountInput').value = currentItem.amountOriginal;

                const isRecurrent = currentItem.type !== 'variable';
                if (isRecurrent && scopeContainer) {
                    scopeContainer.classList.remove('hidden');
                    const [y, m] = (window.AppState.selectedReferenceMonth || currentItem.date.substring(0, 7)).split('-');
                    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                    const monthLabel = `${monthNames[parseInt(m, 10) - 1]}/${y}`;
                    document.getElementById('recurrentScopeMonthLabel').innerText = monthLabel;
                    if (recurrentNotice) recurrentNotice.classList.add('hidden');
                } else {
                    if (scopeContainer) scopeContainer.classList.add('hidden');
                    if (recurrentNotice) recurrentNotice.classList.add('hidden');
                }
            }
        } else {
            // Nova receita
            const selMonth = window.AppState.selectedReferenceMonth;
            if (selMonth) {
                document.getElementById('incomeDateInput').value = `${selMonth}-05`;
            } else {
                document.getElementById('incomeDateInput').value = new Date().toISOString().split('T')[0];
            }
            if (scopeContainer) scopeContainer.classList.add('hidden');
            if (recurrentNotice) recurrentNotice.classList.remove('hidden');
            document.getElementById('incomeTypeInput').value = 'recurrent';
        }

        Utils.toggleModal('incomeModal');
        if (window.lucide) window.lucide.createIcons();
    },

    saveIncomeFromModal(e) {
        if (e) e.preventDefault();

        const editId = document.getElementById('incomeEditId').value;
        const rootId = document.getElementById('incomeRootId').value;
        const date = document.getElementById('incomeDateInput').value;
        const desc = document.getElementById('incomeDescInput').value.trim();
        const cat = document.getElementById('incomeCategoryInput').value;
        const type = document.getElementById('incomeTypeInput').value;
        const currency = document.getElementById('incomeCurrencyInput').value;
        const amount = parseFloat(document.getElementById('incomeAmountInput').value) || 0;

        if (!date || !desc || amount <= 0) {
            Utils.showNotification('Preencha todos os campos obrigatórios com valores válidos.', 'warning');
            return;
        }

        const isUsd = currency === 'USD';
        const amountBrl = isUsd ? amount * window.AppState.exchangeRateUsdBrl : amount;
        const currentMonth = window.AppState.selectedReferenceMonth || date.substring(0, 7);

        if (editId) {
            // Edição
            const effectiveRootId = rootId || editId;
            const rootIdx = window.AppState.incomes.findIndex(i => i.id === effectiveRootId);

            if (rootIdx !== -1) {
                const rootItem = window.AppState.incomes[rootIdx];

                if (rootItem.type !== 'variable') {
                    // Receita Recorrente: checar o escopo escolhido
                    const scopeRadio = document.querySelector('input[name="recurrenceScope"]:checked');
                    const scope = scopeRadio ? scopeRadio.value : 'single_month';

                    if (scope === 'single_month') {
                        // Ajustar APENAS neste mês
                        if (!rootItem.monthlyAdjustments) rootItem.monthlyAdjustments = {};
                        rootItem.monthlyAdjustments[currentMonth] = {
                            description: desc,
                            category: cat,
                            currency: currency,
                            amountOriginal: amount,
                            amountBrl: amountBrl,
                            date: date
                        };
                        Utils.showNotification(`Ajuste de ${Utils.formatCurrency(amount, currency)} aplicado apenas ao mês de ${currentMonth}.`, 'success');
                    } else {
                        // Reajuste definitivo a partir deste mês
                        rootItem.description = desc;
                        rootItem.category = cat;
                        rootItem.currency = currency;
                        rootItem.amountOriginal = amount;
                        rootItem.amountBrl = amountBrl;
                        rootItem.date = date;

                        // Limpa ajuste residual deste mês para prevalecer o novo valor base
                        if (rootItem.monthlyAdjustments && rootItem.monthlyAdjustments[currentMonth]) {
                            delete rootItem.monthlyAdjustments[currentMonth];
                        }
                        Utils.showNotification(`Valor base da receita recorrente atualizado para ${Utils.formatCurrency(amount, currency)}!`, 'success');
                    }
                } else {
                    // Receita Pontual / Variável
                    window.AppState.incomes[rootIdx] = {
                        ...rootItem,
                        date,
                        description: desc,
                        category: cat,
                        type,
                        currency,
                        amountOriginal: amount,
                        amountBrl
                    };
                    Utils.showNotification('Receita atualizada!', 'success');
                }
            }
        } else {
            // Nova receita
            const newIncome = {
                id: 'inc_' + Date.now(),
                date,
                description: desc,
                category: cat,
                type,
                currency,
                amountOriginal: amount,
                amountBrl,
                monthlyAdjustments: {},
                excludedMonths: [],
                sourceId: 'manual_entry'
            };
            window.AppState.incomes.unshift(newIncome);
            
            if (type === 'recurrent') {
                Utils.showNotification('Receita recorrente criada! Ela aparecerá automaticamente em todos os meses subsequentes.', 'success');
            } else {
                Utils.showNotification('Receita pontual adicionada!', 'success');
            }
        }

        window.AppState.saveIncomes();
        Utils.toggleModal('incomeModal');
    },

    deleteIncome(id) {
        const currentItems = window.AppState.getCurrentMonthIncomes();
        const item = currentItems.find(i => i.id === id) || window.AppState.incomes.find(i => i.id === id);

        if (!item) return;

        const currentMonth = window.AppState.selectedReferenceMonth || item.date.substring(0, 7);

        if (item.type !== 'variable') {
            // Receita recorrente: dar opção de remover só neste mês ou geral
            const rootId = item.rootId || item.id;
            const rootItem = window.AppState.incomes.find(i => i.id === rootId);

            if (!rootItem) return;

            const confirmChoice = confirm(
                `Esta é uma receita recorrente ("${item.description}").\n\n` +
                `• Clique em [OK] para remover APENAS neste mês (${currentMonth}).\n` +
                `• Clique em [Cancelar] se desejava outra ação.`
            );

            if (confirmChoice) {
                // Excluir apenas neste mês
                if (!rootItem.excludedMonths) rootItem.excludedMonths = [];
                if (!rootItem.excludedMonths.includes(currentMonth)) {
                    rootItem.excludedMonths.push(currentMonth);
                }
                // Remover override deste mês se houver
                if (rootItem.monthlyAdjustments && rootItem.monthlyAdjustments[currentMonth]) {
                    delete rootItem.monthlyAdjustments[currentMonth];
                }
                window.AppState.saveIncomes();
                Utils.showNotification(`Receita oculta no mês de ${currentMonth}. Nos outros meses ela continua ativa.`, 'info');
            } else {
                // Pergunta se deseja excluir de todos os meses
                const deleteAll = confirm(`Deseja EXCLUIR DEFINITIVAMENTE esta receita recorrente de TODOS os meses?`);
                if (deleteAll) {
                    window.AppState.incomes = window.AppState.incomes.filter(i => i.id !== rootId);
                    window.AppState.saveIncomes();
                    Utils.showNotification('Receita recorrente excluída de todos os meses.', 'info');
                }
            }
        } else {
            // Pontual
            if (!confirm('Deseja excluir este lançamento de receita?')) return;
            window.AppState.incomes = window.AppState.incomes.filter(i => i.id !== (item.rootId || item.id));
            window.AppState.saveIncomes();
            Utils.showNotification('Receita removida.', 'info');
        }
    },

    renderKPICards() {
        const currentItems = window.AppState.getCurrentMonthIncomes();
        const prevItems = window.AppState.getPreviousMonthIncomes();
        const curr = window.AppState.displayCurrency;

        const totalCurrent = currentItems.reduce((acc, i) => acc + window.AppState.convertAmount(i, curr), 0);
        document.getElementById('kpiIncomeTotalLabel').innerText = `Total de Receitas (${curr})`;
        document.getElementById('kpiIncomeTotalMain').innerText = Utils.formatCurrency(totalCurrent, curr);

        const totalPrev = prevItems.reduce((acc, i) => acc + window.AppState.convertAmount(i, curr), 0);
        const diffElem = document.getElementById('kpiIncomeDiffPercent');
        if (totalPrev > 0) {
            const diff = ((totalCurrent - totalPrev) / totalPrev) * 100;
            diffElem.innerText = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
            diffElem.className = diff >= 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-red-400';
        } else {
            diffElem.innerText = 'N/A';
            diffElem.className = 'font-semibold text-slate-400';
        }

        // Recorrente vs Variável
        const recurrentSum = currentItems.filter(i => i.type !== 'variable').reduce((acc, i) => acc + window.AppState.convertAmount(i, curr), 0);
        const variableSum = currentItems.filter(i => i.type === 'variable').reduce((acc, i) => acc + window.AppState.convertAmount(i, curr), 0);
        const recPercent = totalCurrent > 0 ? (recurrentSum / totalCurrent) * 100 : 0;
        const varPercent = totalCurrent > 0 ? (variableSum / totalCurrent) * 100 : 0;

        document.getElementById('kpiIncomeRecurrentMain').innerText = Utils.formatCurrency(recurrentSum, curr);
        document.getElementById('kpiIncomeVariableMain').innerText = Utils.formatCurrency(variableSum, curr);
        document.getElementById('kpiIncomeRecPercent').innerText = `${recPercent.toFixed(0)}% Fixo / ${varPercent.toFixed(0)}% Variável`;

        // Maior Entrada
        if (currentItems.length > 0) {
            const maxItem = currentItems.reduce((prev, cur) => {
                return window.AppState.convertAmount(prev, curr) > window.AppState.convertAmount(cur, curr) ? prev : cur;
            }, currentItems[0]);
            const maxVal = window.AppState.convertAmount(maxItem, curr);
            document.getElementById('kpiIncomeMax').innerText = Utils.formatCurrency(maxVal, curr);
            document.getElementById('kpiIncomeMaxDesc').innerText = `${maxItem.description} (${maxItem.category})`;
        } else {
            document.getElementById('kpiIncomeMax').innerText = Utils.formatCurrency(0, curr);
            document.getElementById('kpiIncomeMaxDesc').innerText = 'Nenhum lançamento';
        }

        // Média Diária de Entradas
        const uniqueDays = new Set(currentItems.map(i => i.date)).size;
        const dailyAvg = uniqueDays > 0 ? totalCurrent / uniqueDays : 0;
        document.getElementById('kpiIncomeDailyAvg').innerText = Utils.formatCurrency(dailyAvg, curr);

        const uniqueDaysPrev = new Set(prevItems.map(i => i.date)).size;
        const dailyAvgPrev = uniqueDaysPrev > 0 ? totalPrev / uniqueDaysPrev : 0;
        const dailyDiffElem = document.getElementById('kpiIncomeDailyAvgDiff');
        if (dailyAvgPrev > 0) {
            const dDiff = ((dailyAvg - dailyAvgPrev) / dailyAvgPrev) * 100;
            dailyDiffElem.innerText = `${dDiff > 0 ? '+' : ''}${dDiff.toFixed(1)}%`;
            dailyDiffElem.className = dDiff >= 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-red-400';
        } else {
            dailyDiffElem.innerText = '0%';
            dailyDiffElem.className = 'font-semibold text-slate-400';
        }
    },

    setIncomeTimelineMode(mode) {
        window.AppState.incomeTimelineMode = mode;
        const btnGeral = document.getElementById('incomeTimelineModeGeral');
        const btnCat = document.getElementById('incomeTimelineModeCat');
        if (mode === 'geral') {
            btnGeral.className = "px-2.5 py-1 rounded-md bg-cyan-600 text-white transition";
            btnCat.className = "px-2.5 py-1 rounded-md text-slate-400 hover:text-white transition";
        } else {
            btnCat.className = "px-2.5 py-1 rounded-md bg-cyan-600 text-white transition";
            btnGeral.className = "px-2.5 py-1 rounded-md text-slate-400 hover:text-white transition";
        }
        this.renderCharts();
    },

    renderCharts() {
        const currentData = window.AppState.getCurrentMonthIncomes();
        const curr = window.AppState.displayCurrency;
        const currSymbol = curr === 'BRL' ? 'R$' : '$';

        // 1. Rosca de Receitas por Categoria
        const categorySums = {};
        INCOME_CATEGORIES.forEach(c => categorySums[c] = 0);
        currentData.forEach(i => {
            const val = window.AppState.convertAmount(i, curr);
            if (categorySums[i.category] !== undefined) {
                categorySums[i.category] += val;
            } else {
                categorySums['Outras Receitas'] += val;
            }
        });

        const activeLabels = Object.keys(categorySums).filter(c => categorySums[c] > 0);
        const activeValues = activeLabels.map(c => categorySums[c]);
        const activeColors = activeLabels.map(c => INCOME_COLORS[c] || '#64748b');
        const totalIncomeAmount = activeValues.reduce((a, b) => a + b, 0);

        if (this.incomeCategoryChartInstance) this.incomeCategoryChartInstance.destroy();
        const canvasCat = document.getElementById('incomeCategoryChart');
        if (canvasCat) {
            const ctxCat = canvasCat.getContext('2d');
            this.incomeCategoryChartInstance = new Chart(ctxCat, {
                type: 'doughnut',
                data: {
                    labels: activeLabels.length ? activeLabels : ['Sem Dados'],
                    datasets: [{
                        data: activeValues.length ? activeValues : [1],
                        backgroundColor: activeLabels.length ? activeColors : ['#334155'],
                        borderWidth: 2,
                        borderColor: '#1e293b'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        datalabels: { display: false },
                        legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 } } },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    if (!activeLabels.length) return ' Sem receitas neste mês';
                                    const val = context.raw || 0;
                                    const pct = totalIncomeAmount > 0 ? ((val / totalIncomeAmount) * 100).toFixed(1) : '0.0';
                                    return ` ${context.label}: ${currSymbol} ${val.toFixed(2)} (${pct}%)`;
                                }
                            }
                        }
                    },
                    cutout: '65%'
                }
            });
        }

        // 2. Timeline de Receitas
        const sortedDays = Array.from(new Set(currentData.map(i => i.date))).sort();
        const timelineLabels = sortedDays.map(d => {
            const parts = d.split('-');
            return `${parts[2]}/${parts[1]}`;
        });

        let timelineDatasets = [];
        const mode = window.AppState.incomeTimelineMode || 'geral';

        if (mode === 'geral') {
            const dailySums = {};
            currentData.forEach(i => {
                dailySums[i.date] = (dailySums[i.date] || 0) + window.AppState.convertAmount(i, curr);
            });
            timelineDatasets.push({
                label: `Total de Entradas (${curr})`,
                data: sortedDays.map(d => dailySums[d] || 0),
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.15)',
                fill: true,
                tension: 0.3,
                pointRadius: 4
            });
        } else {
            const activeCats = INCOME_CATEGORIES.filter(c => currentData.some(i => i.category === c));
            timelineDatasets = activeCats.map(cat => {
                const dataPts = sortedDays.map(day => {
                    return currentData
                        .filter(i => i.date === day && i.category === cat)
                        .reduce((sum, i) => sum + window.AppState.convertAmount(i, curr), 0);
                });
                return {
                    label: cat,
                    data: dataPts,
                    borderColor: INCOME_COLORS[cat] || '#64748b',
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 3
                };
            });
        }

        if (this.incomeTimelineChartInstance) this.incomeTimelineChartInstance.destroy();
        const canvasTimeline = document.getElementById('incomeTimelineChart');
        if (canvasTimeline) {
            const ctxTime = canvasTimeline.getContext('2d');
            this.incomeTimelineChartInstance = new Chart(ctxTime, {
                type: 'line',
                data: {
                    labels: timelineLabels.length ? timelineLabels : ['Sem dados'],
                    datasets: timelineDatasets.length ? timelineDatasets : [{
                        label: 'Sem dados',
                        data: [0],
                        borderColor: '#64748b'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
                        y: { ticks: { color: '#94a3b8', callback: (v) => `${currSymbol} ${v}` }, grid: { color: '#334155' } }
                    },
                    plugins: {
                        datalabels: { display: false },
                        legend: { display: mode === 'category', position: 'top', labels: { color: '#94a3b8', font: { size: 10 } } }
                    }
                }
            });
        }

        // 3. Comparativo Histórico Mês a Mês de Receitas (incluindo receitas propagadas)
        const allMonths = window.AppState.getAllMonths();
        const sortedMonths = allMonths.map(m => m.ym).sort();
        const monthlyDataMap = {};

        sortedMonths.forEach(ym => {
            const monthIncomes = window.AppState.getIncomesForMonth(ym);
            monthlyDataMap[ym] = monthIncomes.reduce((acc, i) => acc + window.AppState.convertAmount(i, curr), 0);
        });

        const monthlyLabels = sortedMonths.map(m => {
            const [y, mon] = m.split('-');
            const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            return `${monthNames[parseInt(mon, 10) - 1]}/${y.substring(2)}`;
        });

        const barColors = sortedMonths.map(m => m === window.AppState.selectedReferenceMonth ? '#06b6d4' : '#3b82f6');

        if (this.incomeMonthlyChartInstance) this.incomeMonthlyChartInstance.destroy();
        const canvasMonthly = document.getElementById('incomeMonthlyChart');
        if (canvasMonthly) {
            const ctxMonth = canvasMonthly.getContext('2d');
            this.incomeMonthlyChartInstance = new Chart(ctxMonth, {
                type: 'bar',
                data: {
                    labels: monthlyLabels.length ? monthlyLabels : ['Sem registros'],
                    datasets: [{
                        label: `Receita Total (${curr})`,
                        data: sortedMonths.map(m => monthlyDataMap[m] || 0),
                        backgroundColor: barColors,
                        borderRadius: 6
                    }]
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
                        legend: { display: false }
                    }
                }
            });
        }
    },

    populateIncomeCategoryFilter() {
        const select = document.getElementById('incomeCategoryFilter');
        if (!select) return;
        select.innerHTML = '<option value="ALL">Todas Categorias</option>';
        INCOME_CATEGORIES.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.innerText = c;
            select.appendChild(opt);
        });
    },

    applyFilters() {
        const searchInput = document.getElementById('incomeSearchInput');
        const catFilter = document.getElementById('incomeCategoryFilter');
        const typeFilter = document.getElementById('incomeTypeFilter');

        const search = searchInput ? searchInput.value.toLowerCase() : '';
        const selectedCat = catFilter ? catFilter.value : 'ALL';
        const selectedType = typeFilter ? typeFilter.value : 'ALL';

        const currentItems = window.AppState.getCurrentMonthIncomes();

        this.filteredIncomes = currentItems.filter(i => {
            const matchSearch = i.description.toLowerCase().includes(search);
            const matchCat = selectedCat === 'ALL' || i.category === selectedCat;
            const matchType = selectedType === 'ALL' || (selectedType === 'recurrent' ? i.type !== 'variable' : i.type === 'variable');
            return matchSearch && matchCat && matchType;
        });

        const curr = window.AppState.displayCurrency;
        this.filteredIncomes.sort((a, b) => {
            let valA = a[this.currentSort.field];
            let valB = b[this.currentSort.field];

            if (this.currentSort.field === 'convertedAmount') {
                valA = window.AppState.convertAmount(a, curr);
                valB = window.AppState.convertAmount(b, curr);
            } else if (this.currentSort.field === 'date') {
                valA = new Date(valA);
                valB = new Date(valB);
            }

            if (valA < valB) return this.currentSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return this.currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        this.renderTable();
    },

    sortIncomeTable(field) {
        if (this.currentSort.field === field) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.field = field;
            this.currentSort.direction = 'desc';
        }
        this.applyFilters();
    },

    renderTable() {
        const tbody = document.getElementById('incomeTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const curr = window.AppState.displayCurrency;
        const symbol = curr === 'BRL' ? 'R$' : '$';

        if (this.filteredIncomes.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="py-6 text-center text-slate-500 text-xs">
                        Nenhum lançamento de receita para o mês de referência (${window.AppState.selectedReferenceMonth || 'Sem mês'}).
                    </td>
                </tr>
            `;
            document.getElementById('incomeTableCountInfo').innerText = `Mostrando 0 receitas`;
            document.getElementById('incomeTableTotalFiltered').innerText = `Total filtrado: ${symbol} 0.00`;
            return;
        }

        this.filteredIncomes.forEach(i => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-800/80 transition border-b border-slate-700/40";

            const catColor = INCOME_COLORS[i.category] || '#64748b';
            const converted = window.AppState.convertAmount(i, curr);
            const isRec = i.type !== 'variable';
            const isAdjusted = !!i.isAdjusted;

            let badgeHtml = '';
            if (isRec) {
                if (isAdjusted) {
                    badgeHtml = `<span class="text-[10px] px-2 py-0.5 rounded font-mono bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1" title="Ajustado manualmente neste mês">
                        <i data-lucide="edit-3" class="w-3 h-3"></i> Fixo (Ajustado)
                    </span>`;
                } else {
                    badgeHtml = `<span class="text-[10px] px-2 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1" title="Propagado automaticamente por recorrência">
                        <i data-lucide="refresh-cw" class="w-3 h-3"></i> Fixo (Recorrente)
                    </span>`;
                }
            } else {
                badgeHtml = `<span class="text-[10px] px-2 py-0.5 rounded font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">Variável</span>`;
            }

            tr.innerHTML = `
                <td class="py-3 px-4 font-mono text-xs text-slate-400">${Utils.formatDate(i.date)}</td>
                <td class="py-3 px-4 font-medium text-slate-200">
                    <div class="flex items-center gap-2">
                        <span class="truncate max-w-[200px]" title="${Utils.escapeHtml(i.description)}">${Utils.escapeHtml(i.description)}</span>
                        ${badgeHtml}
                    </div>
                </td>
                <td class="py-3 px-4">
                    <select onchange="IncomesTab.updateIncomeCategory('${i.id}', this.value)" class="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-500" style="border-left: 3px solid ${catColor}">
                        ${INCOME_CATEGORIES.map(c => `<option value="${c}" ${c === i.category ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </td>
                <td class="py-3 px-4 text-right font-mono text-slate-400">
                    ${i.currency === 'USD' ? `<span class="text-blue-400 font-semibold">$ ${i.amountOriginal.toFixed(2)}</span>` : `R$ ${i.amountOriginal.toFixed(2)}`}
                </td>
                <td class="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                    + ${symbol} ${converted.toFixed(2)}
                </td>
                <td class="py-3 px-4 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        <button onclick="IncomesTab.openIncomeModal('${i.id}')" class="text-slate-400 hover:text-cyan-400 p-1.5 rounded-lg hover:bg-slate-700/50 transition" title="Editar valor ou detalhes desta receita">
                            <i data-lucide="edit-2" class="w-4 h-4"></i>
                        </button>
                        <button onclick="IncomesTab.deleteIncome('${i.id}')" class="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-700/50 transition" title="Excluir receita">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (window.lucide) window.lucide.createIcons();

        const totalInMonth = window.AppState.getCurrentMonthIncomes().length;
        document.getElementById('incomeTableCountInfo').innerText = `Mostrando ${this.filteredIncomes.length} de ${totalInMonth} receitas deste mês`;
        const sumFiltered = this.filteredIncomes.reduce((acc, i) => acc + window.AppState.convertAmount(i, curr), 0);
        document.getElementById('incomeTableTotalFiltered').innerText = `Total filtrado: ${symbol} ${sumFiltered.toFixed(2)}`;
    },

    updateIncomeCategory(id, newCat) {
        const currentItems = window.AppState.getCurrentMonthIncomes();
        const item = currentItems.find(i => i.id === id);
        const rootId = item ? (item.rootId || item.id) : id;

        const idx = window.AppState.incomes.findIndex(i => i.id === rootId);
        if (idx !== -1) {
            window.AppState.incomes[idx].category = newCat;
            window.AppState.saveIncomes();
            Utils.showNotification('Categoria de receita atualizada.', 'info');
        }
    },

    exportCSV() {
        if (this.filteredIncomes.length === 0) return;
        const curr = window.AppState.displayCurrency;
        const headers = ['Data', 'Descricao', 'Categoria', 'Tipo', 'MoedaOriginal', 'ValorOriginal', `Valor_${curr}`];
        const rows = this.filteredIncomes.map(i => [
            i.date,
            `"${i.description.replace(/"/g, '""')}"`,
            i.category,
            i.type || 'recurrent',
            i.currency,
            i.amountOriginal,
            window.AppState.convertAmount(i, curr).toFixed(2)
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join("\n");
        Utils.downloadFile(`receitas_finanai_${window.AppState.selectedReferenceMonth}_${curr}.csv`, csv, 'text/csv;charset=utf-8');
    },

    exportJSON() {
        if (this.filteredIncomes.length === 0) return;
        const curr = window.AppState.displayCurrency;
        const data = this.filteredIncomes.map(i => ({
            ...i,
            convertedAmount: window.AppState.convertAmount(i, curr)
        }));
        Utils.downloadFile(`receitas_finanai_${window.AppState.selectedReferenceMonth}_${curr}.json`, JSON.stringify(data, null, 2), 'application/json');
    }
};
