/**
 * FinanAI - Módulo da Aba de Despesas
 */

window.ExpensesTab = {
    filteredTransactions: [],
    currentSort: { field: 'date', direction: 'desc' },

    // Instâncias dos gráficos
    weekdayChartInstance: null,
    categoryChartInstance: null,
    timelineChartInstance: null,
    monthlyChartInstance: null,

    init() {
        this.populateCategoryFilter();
        this.renderBudgetInputs();
        this.setupEventListeners();
    },

    setupEventListeners() {
        const dropZone = document.getElementById('dropZone');
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
            dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            dropZone.addEventListener('drop', (e) => this.handleFileDrop(e));
        }

        const dropZoneJson = document.getElementById('dropZoneJson');
        if (dropZoneJson) {
            dropZoneJson.addEventListener('dragover', (e) => this.handleDragOverJson(e));
            dropZoneJson.addEventListener('dragleave', (e) => this.handleDragLeaveJson(e));
            dropZoneJson.addEventListener('drop', (e) => this.handleJsonFileDrop(e));
        }
    },

    render() {
        this.renderMonthLabels();
        this.renderFileList();
        this.renderBudgetInputs();
        this.applyFilters();
        this.renderKPICards();
        this.renderBudgetSection();
        if (window.ExpenseComparison) window.ExpenseComparison.render();
        this.renderCharts();
    },

    renderMonthLabels() {
        const month = window.AppState.selectedReferenceMonth;
        let label = 'Sem mês selecionado';
        if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            const [year, number] = month.split('-').map(Number);
            const name = new Date(year, number - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
            label = name.charAt(0).toUpperCase() + name.slice(1) + '/' + year;
        }
        document.querySelectorAll('[data-expense-month]').forEach(element => {
            element.textContent = `(${label})`;
        });
    },

    openExpenseModal(expenseId = null) {
        const item = expenseId ? window.AppState.transactions.find(t => t.id === expenseId) : null;
        if (expenseId && !item) {
            Utils.showNotification('Despesa não encontrada.', 'warning');
            return;
        }
        document.getElementById('expenseForm').reset();
        document.getElementById('expenseModalTitle').innerText = item ? 'Editar Despesa' : 'Nova Despesa';
        document.getElementById('expenseEditId').value = item ? item.id : '';
        document.getElementById('expenseCategoryInput').innerHTML = EXPENSE_CATEGORIES
            .map(category => `<option value="${category}">${category}</option>`).join('');
        const today = new Date();
        const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const selectedMonth = window.AppState.selectedReferenceMonth;
        document.getElementById('expenseDateInput').value = item ? item.date
            : (selectedMonth && selectedMonth !== todayDate.slice(0, 7) ? `${selectedMonth}-01` : todayDate);
        document.getElementById('expenseDescInput').value = item ? item.description : '';
        document.getElementById('expenseCategoryInput').value = item ? item.category : EXPENSE_CATEGORIES[0];
        document.getElementById('expenseCurrencyInput').value = item ? item.currency : window.AppState.displayCurrency;
        document.getElementById('expenseAmountInput').value = item ? item.amountOriginal : '';
        document.getElementById('expenseModal').classList.remove('hidden');
        document.getElementById('expenseDescInput').focus();
        if (window.lucide) window.lucide.createIcons();
    },

    saveExpenseFromModal(event) {
        if (event) event.preventDefault();
        const editId = document.getElementById('expenseEditId').value;
        const date = document.getElementById('expenseDateInput').value;
        const description = document.getElementById('expenseDescInput').value.trim();
        const category = document.getElementById('expenseCategoryInput').value;
        const currency = document.getElementById('expenseCurrencyInput').value;
        const amountOriginal = Number(document.getElementById('expenseAmountInput').value);
        const parsedDate = new Date(date + 'T00:00:00Z');
        const amountBrl = amountOriginal * (currency === 'USD' ? window.AppState.exchangeRateUsdBrl : 1);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime())
            || parsedDate.toISOString().slice(0, 10) !== date || !description
            || !EXPENSE_CATEGORIES.includes(category) || !['BRL', 'USD'].includes(currency)
            || !Number.isFinite(amountOriginal) || amountOriginal < 0.01
            || !Number.isFinite(amountBrl) || amountBrl <= 0) {
            Utils.showNotification('Preencha data, descrição, categoria, moeda e valor válidos.', 'warning');
            return;
        }
        const state = window.AppState;
        const index = editId ? state.transactions.findIndex(t => t.id === editId) : -1;
        if (editId && index === -1) {
            Utils.showNotification('Despesa não encontrada. Abra o formulário novamente.', 'warning');
            return;
        }
        const item = { ...(editId ? state.transactions[index] : {
            id: 'exp_' + (window.crypto?.randomUUID?.() || Date.now() + '_' + Math.random().toString(36).slice(2)),
            sourceId: 'manual_entry'
        }), date, description, category, currency, amountOriginal, amountBrl };
        const previous = state.transactions;
        const previousMonth = state.selectedReferenceMonth;
        state.transactions = editId ? state.transactions.map((t, i) => i === index ? item : t) : [item, ...state.transactions];
        state.selectedReferenceMonth = date.slice(0, 7);
        try {
            state.saveExpenses();
        } catch (error) {
            state.transactions = previous;
            state.selectedReferenceMonth = previousMonth;
            Utils.showNotification('Não foi possível salvar a despesa. Verifique o armazenamento do navegador.', 'error');
            return;
        }
        document.getElementById('expenseModal').classList.add('hidden');
        Utils.showNotification(editId ? 'Despesa atualizada!' : 'Despesa adicionada!', 'success');
    },

    switchImportTab(type) {
        const tabFile = document.getElementById('tabFile');
        const tabText = document.getElementById('tabText');
        const fileContainer = document.getElementById('importFileContainer');
        const jsonContainer = document.getElementById('importJsonContainer');

        if (type === 'file') {
            tabFile.className = "px-3 py-1.5 rounded-md font-medium bg-emerald-600 text-white transition";
            tabText.className = "px-3 py-1.5 rounded-md font-medium text-slate-400 hover:text-white transition";
            fileContainer.classList.remove('hidden');
            jsonContainer.classList.add('hidden');
        } else {
            tabText.className = "px-3 py-1.5 rounded-md font-medium bg-emerald-600 text-white transition";
            tabFile.className = "px-3 py-1.5 rounded-md font-medium text-slate-400 hover:text-white transition";
            jsonContainer.classList.remove('hidden');
            fileContainer.classList.add('hidden');
        }
    },

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('border-emerald-500', 'bg-emerald-500/5');
    },

    handleDragLeave(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('border-emerald-500', 'bg-emerald-500/5');
    },

    async handleFileDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('border-emerald-500', 'bg-emerald-500/5');
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            await this.processMultipleFiles(files);
        }
    },

    async handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            await this.processMultipleFiles(files);
            e.target.value = '';
        }
    },

    handleDragOverJson(e) {
        e.preventDefault();
        e.currentTarget.classList.add('border-emerald-400', 'bg-emerald-500/10');
    },

    handleDragLeaveJson(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('border-emerald-400', 'bg-emerald-500/10');
    },

    async handleJsonFileDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('border-emerald-400', 'bg-emerald-500/10');
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            await this.processMultipleJsonFiles(files);
        }
    },

    async handleJsonFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            await this.processMultipleJsonFiles(files);
            e.target.value = '';
        }
    },

    async processMultipleFiles(files) {
        const total = files.length;
        let importedCount = 0;

        for (let i = 0; i < total; i++) {
            const file = files[i];
            this.showProcessingState(
                `Processando arquivo ${i + 1} de ${total}: ${file.name}`,
                `Extraindo e categorizando lançamentos...`
            );
            await this.processFile(file);
            importedCount++;
        }

        this.hideProcessingState();
        if (total > 1) {
            Utils.showNotification(`Processamento concluído: ${importedCount} arquivos analisados.`, 'success');
        }
    },

    async processMultipleJsonFiles(files) {
        const jsonFiles = files.filter(f => f.name.toLowerCase().endsWith('.json') || f.type.includes('json'));
        
        if (jsonFiles.length === 0) {
            Utils.showNotification('Por favor, envie apenas arquivos com extensão .JSON.', 'warning');
            return;
        }

        const total = jsonFiles.length;
        let successCount = 0;

        for (let i = 0; i < total; i++) {
            const file = jsonFiles[i];
            this.showProcessingState(
                `Lendo arquivo JSON ${i + 1} de ${total}: ${file.name}`,
                'Processamento local instantâneo...'
            );
            try {
                const jsonText = await file.text();
                if (this.parseAndImportJSONContent(jsonText, file.name, 'Leitura JSON Local')) {
                    successCount++;
                }
            } catch (err) {
                console.error("Erro ao ler JSON:", err);
                Utils.showNotification(`Erro ao ler "${file.name}".`, 'error');
            }
        }

        this.hideProcessingState();
        if (total > 1) {
            Utils.showNotification(`Lidos ${successCount} de ${total} arquivos JSON com sucesso!`, 'success');
        }
    },

    parseAndImportJSONContent(jsonString, fileName = 'Arquivo.json', readingMethod = 'Leitura JSON Local') {
        return StatementImport.importJSON(jsonString, fileName, 'expense', readingMethod);
    },

    async processFile(file) {
        const fileId = 'file_' + Date.now();
        const fileName = file.name;
        const mimeType = AIAPI.getFileMimeType(file);
        const isJson = fileName.toLowerCase().endsWith('.json') || mimeType.includes('json');

        if (isJson) {
            this.showProcessingState("Lendo arquivo .JSON...", "Processamento local instantâneo.");
            try {
                const jsonText = await file.text();
                this.hideProcessingState();
                this.parseAndImportJSONContent(jsonText, fileName, 'Leitura JSON Local');
            } catch (err) {
                this.hideProcessingState();
                Utils.showNotification("Erro ao ler o arquivo JSON localmente.", "error");
            }
            return;
        }

        let extractedText = "";
        let readingMethod = "Texto Direto";
        let base64Data = null;

        this.showProcessingState("Lendo arquivo...", "Decodificando extrato ou fatura.");

        try {
            if (fileName.toLowerCase().endsWith('.pdf') || mimeType.includes('pdf')) {
                readingMethod = `PDF / Texto (${AIAPI.getProviderName()})`;
                this.showProcessingState("Lendo PDF...", "Extraindo texto das páginas do PDF");
                
                const arrayBuffer = await file.arrayBuffer();
                if (window.pdfjsLib) {
                    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    let fullText = "";
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        fullText += `--- PÁGINA ${i} ---\n` + pageText + '\n\n';
                    }
                    extractedText = fullText.trim();
                }
                
                if (!extractedText || extractedText.length < 20) {
                    readingMethod = `PDF Multimodal (${AIAPI.getProviderName()})`;
                    base64Data = await Utils.fileToBase64(file);
                }
            } 
            else if (mimeType.includes('image') || fileName.match(/\.(png|jpg|jpeg|webp)$/i)) {
                readingMethod = `OCR Imagem (${AIAPI.getProviderName()})`;
                this.showProcessingState("Executando OCR na Imagem...", "Identificando estabelecimentos e valores.");
                base64Data = await Utils.fileToBase64(file);

                if (window.Tesseract) {
                    try {
                        const worker = await Tesseract.createWorker('por');
                        const ret = await worker.recognize(file);
                        extractedText = ret.data.text;
                        await worker.terminate();
                    } catch (e) {
                        console.warn("Tesseract fallback:", e);
                    }
                }
            } 
            else {
                readingMethod = `Texto/CSV (${AIAPI.getProviderName()})`;
                extractedText = await file.text();
            }

            const fileMeta = {
                id: fileId,
                name: fileName,
                type: mimeType || fileName.split('.').pop(),
                dateUploaded: new Date().toISOString().split('T')[0],
                rawText: extractedText || "(Conteúdo enviado via Base64 Multimodal)",
                method: readingMethod
            };

            await this.processTextWithAI(extractedText, fileMeta, base64Data, mimeType);
        } catch (err) {
            console.error("Erro na leitura do arquivo:", err);
            this.hideProcessingState();
            Utils.showNotification("Falha ao ler o arquivo.", "error");
        }
    },

    async processTextWithAI(rawText, sourceMeta, base64Data = null, mimeType = null) {
        if (!AIAPI.hasApiKey()) {
            this.hideProcessingState();
            Utils.toggleModal('configModal');
            Utils.showNotification('Insira a chave de API do provedor selecionado para processar PDFs ou imagens.', 'warning');
            return;
        }

        this.showProcessingState("A IA está analisando os dados...", "Identificando entradas, saídas e categorias.");

        try {
            const parsedArray = await AIAPI.processExpensesDocument(rawText, base64Data, mimeType);
            if (Array.isArray(parsedArray) && parsedArray.length > 0) {
                sourceMeta.jsonResponse = JSON.stringify(parsedArray, null, 2);
                StatementImport.importJSON(sourceMeta.jsonResponse, sourceMeta.name, 'expense', sourceMeta.method || `Extração via ${AIAPI.getProviderName()}`, sourceMeta);
            } else {
                Utils.showNotification('A IA não encontrou entradas ou saídas no documento.', 'warning');
            }
        } catch (err) {
            console.error(err);
            Utils.showNotification(err.message || 'Erro ao processar com a IA.', 'error');
        } finally {
            this.hideProcessingState();
        }
    },

    showProcessingState(title, step) {
        const stateDiv = document.getElementById('processingState');
        if (stateDiv) {
            document.getElementById('processingTitle').innerText = title;
            document.getElementById('processingStep').innerText = step;
            stateDiv.classList.remove('hidden');
            stateDiv.classList.add('flex');
        }
    },

    hideProcessingState() {
        const stateDiv = document.getElementById('processingState');
        if (stateDiv) {
            stateDiv.classList.add('hidden');
            stateDiv.classList.remove('flex');
        }
    },

    renderFileList() {
        const container = document.getElementById('fileListContainer');
        if (!container) return;
        container.innerHTML = '';

        const uploadedFiles = window.AppState.uploadedFiles;
        if (uploadedFiles.length === 0) {
            container.innerHTML = `
                <div class="col-span-full p-4 bg-slate-900/40 border border-slate-800 text-slate-500 rounded-xl text-center text-xs">
                    Nenhum arquivo carregado. Arraste arquivos .JSON ou use IA para começar.
                </div>
            `;
            return;
        }

        const selMonth = window.AppState.selectedReferenceMonth || '';
        uploadedFiles.forEach(file => {
            const count = window.AppState.transactions.filter(t => t.sourceId === file.id && t.date.startsWith(selMonth)).length;
            const totalCount = window.AppState.transactions.filter(t => t.sourceId === file.id).length;
            
            let icon = 'file-text';
            if (file.type?.includes('json') || file.name.toLowerCase().endsWith('.json')) icon = 'file-json';
            else if (file.type?.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) icon = 'file-type-pdf';
            else if (file.type?.includes('image') || file.name.match(/\.(jpg|jpeg|png)$/i)) icon = 'image';

            const card = document.createElement('div');
            card.className = "bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 flex flex-col justify-between gap-2.5 text-xs shadow-md hover:border-slate-600 transition";
            card.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <div class="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg flex-shrink-0">
                            <i data-lucide="${icon}" class="w-4 h-4"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="font-medium text-slate-200 truncate" title="${Utils.escapeHtml(file.name)}">${Utils.escapeHtml(file.name)}</p>
                            <p class="text-[10px] text-slate-400">${count} no mês (${totalCount} total)</p>
                        </div>
                    </div>
                    <button onclick="ExpensesTab.removeSourceFile('${file.id}')" class="text-slate-500 hover:text-red-400 p-1 transition flex-shrink-0" title="Remover este arquivo">
                        <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                </div>
                
                <div class="border-t border-slate-800 pt-2 flex items-center justify-between">
                    <span class="text-[10px] text-slate-500 font-mono truncate max-w-[130px]">${file.method || 'Leitura JSON Local'}</span>
                    <button onclick="ExpensesTab.openDiagnosticModal('${file.id}')" class="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium transition" title="Inspecione o texto bruto ou JSON">
                        <i data-lucide="bug" class="w-3 h-3"></i> IDE Inspeção
                    </button>
                </div>
            `;
            container.appendChild(card);
        });

        if (window.lucide) window.lucide.createIcons();
    },

    removeSourceFile(sourceId) {
        window.AppState.uploadedFiles = window.AppState.uploadedFiles.filter(f => f.id !== sourceId);
        window.AppState.transactions = window.AppState.transactions.filter(t => t.sourceId !== sourceId);
        window.AppState.saveExpenses();
        Utils.showNotification('Arquivo e despesas associadas removidos.', 'info');
    },

    clearAllSources() {
        if (!confirm('Deseja realmente remover todos os arquivos e despesas importadas?')) return;
        window.AppState.uploadedFiles = [];
        window.AppState.transactions = window.AppState.transactions.filter(t => t.sourceId === 'manual_entry');
        window.AppState.saveExpenses();
        Utils.showNotification('Arquivos e despesas importadas removidos. Os lançamentos manuais foram mantidos.', 'info');
    },

    renderKPICards() {
        const currentItems = window.AppState.getCurrentMonthExpenses();
        const prevItems = window.AppState.getPreviousMonthExpenses();
        const curr = window.AppState.displayCurrency;

        const totalCurrent = currentItems.reduce((acc, t) => acc + window.AppState.convertAmount(t, curr), 0);
        document.getElementById('kpiTotalLabel').innerText = `Total de Despesas (${curr})`;
        document.getElementById('kpiTotalMain').innerText = Utils.formatCurrency(totalCurrent, curr);

        const totalPrev = prevItems.reduce((acc, t) => acc + window.AppState.convertAmount(t, curr), 0);
        const diffElem = document.getElementById('kpiDiffPercent');
        if (totalPrev > 0) {
            const diff = ((totalCurrent - totalPrev) / totalPrev) * 100;
            const sign = diff > 0 ? '+' : '';
            diffElem.innerText = `${sign}${diff.toFixed(1)}%`;
            diffElem.className = diff > 0 ? 'font-semibold text-red-400' : 'font-semibold text-emerald-400';
        } else {
            diffElem.innerText = 'N/A';
            diffElem.className = 'font-semibold text-slate-400';
        }

        // Compras em Moeda Estrangeira
        const foreignCurr = curr === 'BRL' ? 'USD' : 'BRL';
        const foreignItems = currentItems.filter(t => t.currency === foreignCurr);
        const foreignTotalOrig = foreignItems.reduce((acc, t) => acc + t.amountOriginal, 0);
        const foreignTotalConverted = foreignItems.reduce((acc, t) => acc + window.AppState.convertAmount(t, curr), 0);

        document.getElementById('kpiForeignLabel').innerText = `Compras em ${foreignCurr}`;
        document.getElementById('kpiForeignTotal').innerText = Utils.formatCurrency(foreignTotalOrig, foreignCurr);
        document.getElementById('kpiForeignConverted').innerText = Utils.formatCurrency(foreignTotalConverted, curr);

        const prevForeignItems = prevItems.filter(t => t.currency === foreignCurr);
        const prevForeignConverted = prevForeignItems.reduce((acc, t) => acc + window.AppState.convertAmount(t, curr), 0);
        const foreignDiffElem = document.getElementById('kpiForeignDiffPercent');
        if (prevForeignConverted > 0) {
            const fDiff = ((foreignTotalConverted - prevForeignConverted) / prevForeignConverted) * 100;
            foreignDiffElem.innerText = `${fDiff > 0 ? '+' : ''}${fDiff.toFixed(1)}%`;
            foreignDiffElem.className = fDiff > 0 ? 'font-semibold text-red-400' : 'font-semibold text-emerald-400';
        } else {
            foreignDiffElem.innerText = '0%';
            foreignDiffElem.className = 'font-semibold text-slate-400';
        }

        // Média Diária
        const uniqueDays = new Set(currentItems.map(t => t.date)).size;
        const dailyAvgCurrent = uniqueDays > 0 ? totalCurrent / uniqueDays : 0;
        document.getElementById('kpiDailyAvg').innerText = Utils.formatCurrency(dailyAvgCurrent, curr);

        const uniqueDaysPrev = new Set(prevItems.map(t => t.date)).size;
        const dailyAvgPrev = uniqueDaysPrev > 0 ? totalPrev / uniqueDaysPrev : 0;
        const dailyDiffElem = document.getElementById('kpiDailyAvgDiff');
        if (dailyAvgPrev > 0) {
            const dDiff = ((dailyAvgCurrent - dailyAvgPrev) / dailyAvgPrev) * 100;
            dailyDiffElem.innerText = `${dDiff > 0 ? '+' : ''}${dDiff.toFixed(1)}%`;
            dailyDiffElem.className = dDiff > 0 ? 'font-semibold text-red-400' : 'font-semibold text-emerald-400';
        } else {
            dailyDiffElem.innerText = '0%';
            dailyDiffElem.className = 'font-semibold text-slate-400';
        }

        // Maior Compra
        if (currentItems.length > 0) {
            const maxItem = currentItems.reduce((prev, cur) => {
                return window.AppState.convertAmount(prev, curr) > window.AppState.convertAmount(cur, curr) ? prev : cur;
            }, currentItems[0]);

            const maxVal = window.AppState.convertAmount(maxItem, curr);
            document.getElementById('kpiMaxExpense').innerText = Utils.formatCurrency(maxVal, curr);
            document.getElementById('kpiMaxExpenseDesc').innerText = `${maxItem.description} (${maxItem.category})`;
        } else {
            document.getElementById('kpiMaxExpense').innerText = Utils.formatCurrency(0, curr);
            document.getElementById('kpiMaxExpenseDesc').innerText = 'Nenhum lançamento';
        }

        // Média Semanal vs Mês Anterior
        const avgWeeklyCurrent = totalCurrent / 4;
        const avgWeeklyPrev = totalPrev / 4;
        const weekdayDiffElem = document.getElementById('kpiWeekdayDiff');
        if (avgWeeklyPrev > 0) {
            const wDiff = ((avgWeeklyCurrent - avgWeeklyPrev) / avgWeeklyPrev) * 100;
            weekdayDiffElem.innerText = `${wDiff > 0 ? '+' : ''}${wDiff.toFixed(1)}%`;
            weekdayDiffElem.className = wDiff > 0 ? 'font-bold text-red-400' : 'font-bold text-emerald-400';
        } else {
            weekdayDiffElem.innerText = '0%';
            weekdayDiffElem.className = 'font-bold text-slate-400';
        }
    },

    renderBudgetInputs() {
        const container = document.getElementById('budgetInputsContainer');
        if (!container) return;
        // Notificações do estado não devem apagar campos enquanto são editados.
        if (container.contains(document.activeElement)) return;
        container.innerHTML = '';

        const curr = window.AppState.displayCurrency;
        document.querySelectorAll('.budgetCurrLabel').forEach(el => el.innerText = curr);

        EXPENSE_CATEGORIES.forEach(cat => {
            const limitVal = window.AppState.getCategoryBudgetLimit(cat, curr);
            const color = EXPENSE_COLORS[cat] || '#64748b';

            const item = document.createElement('div');
            item.className = "flex items-center justify-between p-2.5 bg-slate-900/80 border border-slate-700/80 rounded-xl gap-3";
            item.innerHTML = `
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${color}"></span>
                    <span class="text-xs font-medium text-slate-200 truncate">${cat}</span>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    <span class="text-xs font-semibold text-slate-400">${curr === 'BRL' ? 'R$' : '$'}</span>
                    <input type="number" id="budget_input_${cat}" step="0.01" min="0" value="${Number(limitVal.toFixed(2))}" class="w-28 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono text-right">
                </div>
            `;
            const input = item.querySelector('input');
            input.addEventListener('input', () => this.updateBudgetLimit(cat, input.value));
            input.addEventListener('change', () => this.updateBudgetLimit(cat, input.value, true));
            container.appendChild(item);
        });
    },

    updateBudgetLimit(category, rawValue, notify = false) {
        if (rawValue === '' && !notify) return;
        const value = Number(rawValue);
        if (!EXPENSE_CATEGORIES.includes(category) || !Number.isFinite(value) || value < 0) return;
        const rate = window.AppState.displayCurrency === 'USD' ? window.AppState.exchangeRateUsdBrl : 1;
        window.AppState.categoryBudgetLimits[category] = Math.round(value * rate * 100) / 100;
        const saved = window.AppState.saveBudgetLimits(notify);
        Utils.setSaveStatus('budgetSaveStatus', saved);
    },

    saveBudgetSettings() {
        const curr = window.AppState.displayCurrency;
        const rate = window.AppState.exchangeRateUsdBrl;
        const limits = { ...window.AppState.categoryBudgetLimits };
        for (const cat of EXPENSE_CATEGORIES) {
            const input = document.getElementById(`budget_input_${cat}`);
            if (input) {
                if (input.value === input.defaultValue) continue;
                const val = Number(input.value);
                if (!Number.isFinite(val) || val < 0) {
                    Utils.showNotification('Informe tetos válidos, iguais ou maiores que zero.', 'warning');
                    return;
                }
                limits[cat] = Math.round(val * (curr === 'USD' ? rate : 1) * 100) / 100;
            }
        }
        window.AppState.categoryBudgetLimits = limits;
        const saved = window.AppState.saveBudgetLimits();
        Utils.setSaveStatus('budgetSaveStatus', saved);
        if (!saved) return;
        Utils.toggleModal('budgetModal');
        Utils.showNotification('Tetos de gastos salvos neste navegador!', 'success');
    },

    resetBudgetLimits() {
        window.AppState.categoryBudgetLimits = { ...DEFAULT_BUDGET_LIMITS_BRL };
        const saved = window.AppState.saveBudgetLimits();
        Utils.setSaveStatus('budgetSaveStatus', saved);
        this.renderBudgetInputs();
    },

    renderBudgetSection() {
        const currentData = window.AppState.getCurrentMonthExpenses();
        const grid = document.getElementById('categoryBudgetGrid');
        if (!grid) return;
        grid.innerHTML = '';

        const curr = window.AppState.displayCurrency;
        const categorySpent = {};
        EXPENSE_CATEGORIES.forEach(c => categorySpent[c] = 0);

        currentData.forEach(t => {
            const val = window.AppState.convertAmount(t, curr);
            if (categorySpent[t.category] !== undefined) {
                categorySpent[t.category] += val;
            } else {
                categorySpent['Outros'] += val;
            }
        });

        let totalLimit = 0;
        let totalSpent = 0;
        let hasOverbudget = false;

        EXPENSE_CATEGORIES.forEach(cat => {
            const spent = categorySpent[cat] || 0;
            const limit = window.AppState.getCategoryBudgetLimit(cat, curr);
            totalLimit += limit;
            totalSpent += spent;

            const usageRatio = limit > 0 ? (spent / limit) * 100 : 0;
            const isOver = limit > 0 && spent > limit;
            if (isOver) hasOverbudget = true;

            let barColorClass = 'bg-emerald-500';
            let textColorClass = 'text-emerald-400';
            let badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            let badgeText = 'No Limite';

            if (limit === 0) {
                barColorClass = 'bg-slate-600';
                textColorClass = 'text-slate-400';
                badgeClass = 'bg-slate-700/50 text-slate-400 border-slate-600/30';
                badgeText = 'Sem Teto';
            } else if (usageRatio > 100) {
                barColorClass = 'bg-red-500';
                textColorClass = 'text-red-400';
                badgeClass = 'bg-red-500/10 text-red-400 border-red-500/30 font-bold animate-pulse';
                badgeText = `Excedido (+${(spent - limit).toFixed(0)})`;
            } else if (usageRatio >= 80) {
                barColorClass = 'bg-amber-500';
                textColorClass = 'text-amber-400';
                badgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
                badgeText = 'Atenção (>80%)';
            }

            const catColor = EXPENSE_COLORS[cat] || '#64748b';

            const card = document.createElement('div');
            card.className = `bg-slate-900/80 border ${isOver ? 'border-red-500/40 bg-red-950/10' : 'border-slate-700/80'} rounded-xl p-3.5 flex flex-col justify-between gap-3 shadow-md hover:border-slate-600 transition`;

            card.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${catColor}"></span>
                        <span class="font-medium text-xs text-slate-200 truncate">${cat}</span>
                    </div>
                    <span class="text-[10px] px-2 py-0.5 rounded-full border ${badgeClass} uppercase tracking-wider flex-shrink-0">
                        ${badgeText}
                    </span>
                </div>

                <div class="space-y-1.5">
                    <div class="flex items-center justify-between text-xs">
                        <span class="text-slate-400">
                            <strong class="text-slate-200">${Utils.formatCurrency(spent, curr)}</strong> / ${limit > 0 ? Utils.formatCurrency(limit, curr) : 'N/A'}
                        </span>
                        <span class="font-bold font-mono text-xs ${textColorClass}">
                            ${limit > 0 ? `${usageRatio.toFixed(1)}%` : '-'}
                        </span>
                    </div>

                    <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/80 relative">
                        <div class="${barColorClass} h-full rounded-full transition-all duration-500" style="width: ${Math.min(usageRatio, 100)}%"></div>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });

        document.getElementById('budgetTotalLimit').innerText = Utils.formatCurrency(totalLimit, curr);
        document.getElementById('budgetTotalSpent').innerText = Utils.formatCurrency(totalSpent, curr);

        const overallPercent = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;
        const percentElem = document.getElementById('budgetTotalPercent');
        const barElem = document.getElementById('budgetTotalProgressBar');

        percentElem.innerText = `${overallPercent.toFixed(1)}%`;
        barElem.style.width = `${Math.min(overallPercent, 100)}%`;

        if (overallPercent > 100) {
            percentElem.className = "text-lg font-bold text-red-400";
            barElem.className = "bg-red-500 h-full rounded-full transition-all duration-500";
        } else if (overallPercent >= 80) {
            percentElem.className = "text-lg font-bold text-amber-400";
            barElem.className = "bg-amber-500 h-full rounded-full transition-all duration-500";
        } else {
            percentElem.className = "text-lg font-bold text-emerald-400";
            barElem.className = "bg-emerald-500 h-full rounded-full transition-all duration-500";
        }

        const alertBadge = document.getElementById('budgetAlertBadge');
        if (alertBadge) {
            if (hasOverbudget) alertBadge.classList.remove('hidden');
            else alertBadge.classList.add('hidden');
        }
    },

    setWeekdayMode(mode) {
        window.AppState.weekdayMode = mode;
        const btnAvg = document.getElementById('weekdayModeAvg');
        const btnMax = document.getElementById('weekdayModeMax');
        const btnRecent = document.getElementById('weekdayModeRecent');

        if (btnAvg && btnMax && btnRecent) {
            btnAvg.className = "px-2.5 py-1 rounded-md text-slate-400 hover:text-white transition";
            btnMax.className = "px-2.5 py-1 rounded-md text-slate-400 hover:text-white transition";
            btnRecent.className = "px-2.5 py-1 rounded-md text-slate-400 hover:text-white transition";

            if (mode === 'avg') btnAvg.className = "px-2.5 py-1 rounded-md bg-emerald-600 text-white transition";
            else if (mode === 'max') btnMax.className = "px-2.5 py-1 rounded-md bg-emerald-600 text-white transition";
            else if (mode === 'recent') btnRecent.className = "px-2.5 py-1 rounded-md bg-emerald-600 text-white transition";
        }
        this.renderCharts();
    },

    setTimelineMode(mode) {
        window.AppState.timelineMode = mode;
        const btnGeral = document.getElementById('timelineModeGeral');
        const btnCat = document.getElementById('timelineModeCat');
        if (mode === 'geral') {
            btnGeral.className = "px-2.5 py-1 rounded-md bg-emerald-600 text-white transition";
            btnCat.className = "px-2.5 py-1 rounded-md text-slate-400 hover:text-white transition";
        } else {
            btnCat.className = "px-2.5 py-1 rounded-md bg-emerald-600 text-white transition";
            btnGeral.className = "px-2.5 py-1 rounded-md text-slate-400 hover:text-white transition";
        }
        this.renderCharts();
    },

    setMonthlyMode(mode) {
        window.AppState.monthlyMode = mode;
        const btnGeral = document.getElementById('monthlyModeGeral');
        const btnCat = document.getElementById('monthlyModeCat');
        if (mode === 'geral') {
            btnGeral.className = "px-2.5 py-1 rounded-md bg-emerald-600 text-white transition";
            btnCat.className = "px-2.5 py-1 rounded-md text-slate-400 hover:text-white transition";
        } else {
            btnCat.className = "px-2.5 py-1 rounded-md bg-emerald-600 text-white transition";
            btnGeral.className = "px-2.5 py-1 rounded-md text-slate-400 hover:text-white transition";
        }
        this.renderCharts();
    },

    renderCharts() {
        const currentData = window.AppState.getCurrentMonthExpenses();
        const prevData = window.AppState.getPreviousMonthExpenses();
        const curr = window.AppState.displayCurrency;
        const currSymbol = curr === 'BRL' ? 'R$' : '$';
        const weekdayMode = window.AppState.weekdayMode;

        // Gráfico 1: Dia da Semana
        const weekDaysNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        let weekdayDataPoints = [0, 0, 0, 0, 0, 0, 0];
        let weekdayPercentages = ['N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'];

        if (weekdayMode === 'recent') {
            const sortedAllDates = Array.from(new Set(currentData.map(t => t.date))).sort().slice(-7);
            const recentMap = {};
            sortedAllDates.forEach(d => recentMap[d] = 0);
            currentData.forEach(t => {
                if (recentMap[t.date] !== undefined) {
                    recentMap[t.date] += window.AppState.convertAmount(t, curr);
                }
            });

            const prevDailyTotalsMap = {};
            prevData.forEach(t => {
                prevDailyTotalsMap[t.date] = (prevDailyTotalsMap[t.date] || 0) + window.AppState.convertAmount(t, curr);
            });

            const labelsRecent = sortedAllDates.map(d => {
                const dt = new Date(d + 'T00:00:00');
                const dayName = weekDaysNames[dt.getDay()];
                const parts = d.split('-');
                return `${dayName} (${parts[2]}/${parts[1]})`;
            });

            const valuesRecent = sortedAllDates.map(d => recentMap[d]);
            const recentPercentages = sortedAllDates.map(d => {
                const [y, m, dayNum] = d.split('-');
                const prevRefDate = new Date(parseInt(y), parseInt(m) - 2, parseInt(dayNum));
                const prevDateStr = `${prevRefDate.getFullYear()}-${String(prevRefDate.getMonth() + 1).padStart(2, '0')}-${String(prevRefDate.getDate()).padStart(2, '0')}`;
                const prevVal = prevDailyTotalsMap[prevDateStr] || 0;
                const currVal = recentMap[d] || 0;

                if (prevVal > 0) {
                    const diff = ((currVal - prevVal) / prevVal) * 100;
                    return (diff > 0 ? '+' : '') + diff.toFixed(1) + '%';
                } else if (currVal > 0) {
                    return 'N/A';
                } else {
                    return '0.0%';
                }
            });

            if (this.weekdayChartInstance) this.weekdayChartInstance.destroy();
            const canvasWeek = document.getElementById('weekdayChart');
            if (canvasWeek) {
                const ctxWeek = canvasWeek.getContext('2d');
                this.weekdayChartInstance = new Chart(ctxWeek, {
                    type: 'bar',
                    data: {
                        labels: labelsRecent.length ? labelsRecent : ['Sem registros'],
                        datasets: [{
                            label: `Gastos (Últimos 7 dias) - ${curr}`,
                            data: valuesRecent.length ? valuesRecent : [0],
                            backgroundColor: '#10b981',
                            borderRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { top: 25 } },
                        scales: {
                            x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                            y: { ticks: { color: '#94a3b8', callback: (v) => `${currSymbol} ${v}` }, grid: { color: '#334155' } }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: (ctx) => ` ${currSymbol} ${ctx.raw.toFixed(2)}` } },
                            datalabels: {
                                anchor: 'end',
                                align: 'end',
                                offset: 4,
                                color: function(context) {
                                    const val = recentPercentages[context.dataIndex];
                                    if (val && val.startsWith('+')) return '#f87171';
                                    if (val && val.startsWith('-')) return '#34d399';
                                    return '#94a3b8';
                                },
                                font: { weight: 'bold', size: 11 },
                                formatter: function(value, context) {
                                    return recentPercentages[context.dataIndex] || 'N/A';
                                }
                            }
                        }
                    }
                });
            }
        } else {
            const daysSums = [0, 0, 0, 0, 0, 0, 0];
            const daysCounts = [0, 0, 0, 0, 0, 0, 0];
            const daysMax = [0, 0, 0, 0, 0, 0, 0];

            const dailyTotalsMap = {};
            currentData.forEach(t => {
                dailyTotalsMap[t.date] = (dailyTotalsMap[t.date] || 0) + window.AppState.convertAmount(t, curr);
            });

            Object.keys(dailyTotalsMap).forEach(d => {
                const dt = new Date(d + 'T00:00:00');
                const dayIdx = dt.getDay();
                const dayTotal = dailyTotalsMap[d];

                daysSums[dayIdx] += dayTotal;
                daysCounts[dayIdx] += 1;
                if (dayTotal > daysMax[dayIdx]) daysMax[dayIdx] = dayTotal;
            });

            const prevDaysSums = [0, 0, 0, 0, 0, 0, 0];
            const prevDaysCounts = [0, 0, 0, 0, 0, 0, 0];
            const prevDaysMax = [0, 0, 0, 0, 0, 0, 0];

            const prevDailyTotalsMap = {};
            prevData.forEach(t => {
                prevDailyTotalsMap[t.date] = (prevDailyTotalsMap[t.date] || 0) + window.AppState.convertAmount(t, curr);
            });

            Object.keys(prevDailyTotalsMap).forEach(d => {
                const dt = new Date(d + 'T00:00:00');
                const dayIdx = dt.getDay();
                const dayTotal = prevDailyTotalsMap[d];

                prevDaysSums[dayIdx] += dayTotal;
                prevDaysCounts[dayIdx] += 1;
                if (dayTotal > prevDaysMax[dayIdx]) prevDaysMax[dayIdx] = dayTotal;
            });

            let prevWeekdayDataPoints = [0, 0, 0, 0, 0, 0, 0];

            if (weekdayMode === 'avg') {
                weekdayDataPoints = daysSums.map((sum, idx) => daysCounts[idx] > 0 ? sum / daysCounts[idx] : 0);
                prevWeekdayDataPoints = prevDaysSums.map((sum, idx) => prevDaysCounts[idx] > 0 ? sum / prevDaysCounts[idx] : 0);
            } else {
                weekdayDataPoints = daysMax;
                prevWeekdayDataPoints = prevDaysMax;
            }

            weekdayPercentages = weekdayDataPoints.map((currVal, idx) => {
                const prevVal = prevWeekdayDataPoints[idx];
                if (prevVal > 0) {
                    const diff = ((currVal - prevVal) / prevVal) * 100;
                    return (diff > 0 ? '+' : '') + diff.toFixed(1) + '%';
                } else if (currVal > 0) {
                    return 'N/A';
                } else {
                    return '0.0%';
                }
            });

            if (this.weekdayChartInstance) this.weekdayChartInstance.destroy();
            const canvasWeek = document.getElementById('weekdayChart');
            if (canvasWeek) {
                const ctxWeek = canvasWeek.getContext('2d');
                this.weekdayChartInstance = new Chart(ctxWeek, {
                    type: 'bar',
                    data: {
                        labels: weekDaysNames,
                        datasets: [{
                            label: `${weekdayMode === 'avg' ? 'Média' : 'Valor Máximo'} por Dia (${curr})`,
                            data: weekdayDataPoints,
                            backgroundColor: weekdayMode === 'avg' ? '#6366f1' : '#f59e0b',
                            borderRadius: 6
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: { padding: { top: 25 } },
                        scales: {
                            x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                            y: { ticks: { color: '#94a3b8', callback: (v) => `${currSymbol} ${v}` }, grid: { color: '#334155' } }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw > 0 ? currSymbol + ' ' + ctx.raw.toFixed(2) : 'Sem gastos'}` } },
                            datalabels: {
                                anchor: 'end',
                                align: 'end',
                                offset: 4,
                                color: function(context) {
                                    const val = weekdayPercentages[context.dataIndex];
                                    if (val && val.startsWith('+')) return '#f87171';
                                    if (val && val.startsWith('-')) return '#34d399';
                                    return '#94a3b8';
                                },
                                font: { weight: 'bold', size: 11 },
                                formatter: function(value, context) {
                                    return weekdayPercentages[context.dataIndex] || 'N/A';
                                }
                            }
                        }
                    }
                });
            }
        }

        // Gráfico 2: Rosca por Categoria
        const categorySums = {};
        EXPENSE_CATEGORIES.forEach(c => categorySums[c] = 0);
        currentData.forEach(t => {
            const val = window.AppState.convertAmount(t, curr);
            if (categorySums[t.category] !== undefined) {
                categorySums[t.category] += val;
            } else {
                categorySums['Outros'] += val;
            }
        });

        const categoryLabels = Object.keys(categorySums).filter(c => categorySums[c] > 0);
        const categoryValues = categoryLabels.map(c => categorySums[c]);
        const categoryBgColors = categoryLabels.map(c => EXPENSE_COLORS[c] || '#64748b');
        const totalCategoryAmount = categoryValues.reduce((acc, val) => acc + val, 0);

        if (this.categoryChartInstance) this.categoryChartInstance.destroy();
        const canvasCat = document.getElementById('categoryChart');
        if (canvasCat) {
            const ctxCat = canvasCat.getContext('2d');
            this.categoryChartInstance = new Chart(ctxCat, {
                type: 'doughnut',
                data: {
                    labels: categoryLabels.length ? categoryLabels : ['Sem Dados'],
                    datasets: [{
                        data: categoryValues.length ? categoryValues : [1],
                        backgroundColor: categoryLabels.length ? categoryBgColors : ['#334155'],
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
                                    if (!categoryLabels.length) return ' Sem despesas neste mês';
                                    const val = context.raw || 0;
                                    const percentage = totalCategoryAmount > 0 ? ((val / totalCategoryAmount) * 100).toFixed(1) : '0.0';
                                    return ` ${context.label}: ${currSymbol} ${val.toFixed(2)} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    cutout: '65%'
                }
            });
        }

        // Gráfico 3: Timeline Diária
        const sortedDays = Array.from(new Set(currentData.map(t => t.date))).sort();
        const timelineLabels = sortedDays.map(d => {
            const parts = d.split('-');
            return `${parts[2]}/${parts[1]}`;
        });

        let timelineDatasets = [];
        const timelineMode = window.AppState.timelineMode;

        if (timelineMode === 'geral') {
            const dailySums = {};
            currentData.forEach(t => {
                dailySums[t.date] = (dailySums[t.date] || 0) + window.AppState.convertAmount(t, curr);
            });
            const timelineValues = sortedDays.map(d => dailySums[d] || 0);

            timelineDatasets.push({
                label: `Total Diário (${curr})`,
                data: timelineValues,
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4
            });
        } else {
            const activeCategories = EXPENSE_CATEGORIES.filter(c => currentData.some(t => t.category === c));
            timelineDatasets = activeCategories.map(cat => {
                const dataPoints = sortedDays.map(day => {
                    return currentData
                        .filter(t => t.date === day && t.category === cat)
                        .reduce((sum, t) => sum + window.AppState.convertAmount(t, curr), 0);
                });
                return {
                    label: cat,
                    data: dataPoints,
                    borderColor: EXPENSE_COLORS[cat] || '#64748b',
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 3
                };
            });
        }

        if (this.timelineChartInstance) this.timelineChartInstance.destroy();
        const canvasTimeline = document.getElementById('timelineChart');
        if (canvasTimeline) {
            const ctxTime = canvasTimeline.getContext('2d');
            this.timelineChartInstance = new Chart(ctxTime, {
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
                        legend: { 
                            display: timelineMode === 'category',
                            position: 'top',
                            labels: { color: '#94a3b8', font: { size: 10 } }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => ` ${context.dataset.label}: ${currSymbol} ${context.raw.toFixed(2)}`
                            }
                        }
                    }
                }
            });
        }

        // Gráfico 4: Mês a Mês
        const monthlyDataMap = {};
        window.AppState.transactions.forEach(t => {
            const ym = t.date.substring(0, 7);
            if (!monthlyDataMap[ym]) monthlyDataMap[ym] = {};
            const val = window.AppState.convertAmount(t, curr);
            monthlyDataMap[ym][t.category] = (monthlyDataMap[ym][t.category] || 0) + val;
        });

        const sortedMonths = Object.keys(monthlyDataMap).sort();
        const monthlyLabels = sortedMonths.map(m => {
            const [year, month] = m.split('-');
            const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            return `${monthNames[parseInt(month)-1]}/${year.substring(2)}`;
        });

        let monthlyDatasets = [];
        let isStacked = false;
        const monthlyMode = window.AppState.monthlyMode;

        if (monthlyMode === 'geral') {
            const totalMonthlyValues = sortedMonths.map(m => {
                return Object.values(monthlyDataMap[m]).reduce((a, b) => a + b, 0);
            });

            const barBgColors = sortedMonths.map(m => m === window.AppState.selectedReferenceMonth ? '#22c55e' : '#3b82f6');

            monthlyDatasets.push({
                label: `Total Gasto (${curr})`,
                data: totalMonthlyValues,
                backgroundColor: barBgColors,
                borderRadius: 6
            });
        } else {
            isStacked = true;
            const activeCategoriesInHistory = EXPENSE_CATEGORIES.filter(c => 
                sortedMonths.some(m => (monthlyDataMap[m][c] || 0) > 0)
            );

            monthlyDatasets = activeCategoriesInHistory.map(cat => {
                const percentagePoints = sortedMonths.map(m => {
                    const monthTotal = Object.values(monthlyDataMap[m]).reduce((a, b) => a + b, 0);
                    const catVal = monthlyDataMap[m][cat] || 0;
                    return monthTotal > 0 ? (catVal / monthTotal) * 100 : 0;
                });

                return {
                    label: cat,
                    data: percentagePoints,
                    backgroundColor: EXPENSE_COLORS[cat] || '#64748b'
                };
            });
        }

        if (this.monthlyChartInstance) this.monthlyChartInstance.destroy();
        const canvasMonthly = document.getElementById('monthlyChart');
        if (canvasMonthly) {
            const ctxMonth = canvasMonthly.getContext('2d');
            this.monthlyChartInstance = new Chart(ctxMonth, {
                type: 'bar',
                data: {
                    labels: monthlyLabels.length ? monthlyLabels : ['Sem registros'],
                    datasets: monthlyDatasets.length ? monthlyDatasets : [{
                        label: 'Sem registros',
                        data: [0]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { 
                            stacked: isStacked,
                            ticks: { color: '#94a3b8' }, 
                            grid: { display: false } 
                        },
                        y: { 
                            stacked: isStacked,
                            max: isStacked ? 100 : undefined,
                            ticks: { 
                                color: '#94a3b8',
                                callback: (val) => isStacked ? `${val}%` : `${currSymbol} ${val}`
                            }, 
                            grid: { color: '#334155' } 
                        }
                    },
                    plugins: {
                        datalabels: { display: false },
                        legend: { 
                            display: monthlyMode === 'category',
                            position: 'top',
                            labels: { color: '#94a3b8', font: { size: 10 } }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    if (monthlyMode === 'category') {
                                        const monthKey = sortedMonths[context.dataIndex];
                                        const catName = context.dataset.label;
                                        const absoluteVal = monthlyDataMap[monthKey] ? (monthlyDataMap[monthKey][catName] || 0) : 0;
                                        return ` ${catName}: ${currSymbol} ${absoluteVal.toFixed(2)} (${context.raw.toFixed(1)}%)`;
                                    }
                                    return ` ${context.dataset.label}: ${currSymbol} ${context.raw.toFixed(2)}`;
                                }
                            }
                        }
                    }
                }
            });
        }
    },

    populateCategoryFilter() {
        const select = document.getElementById('categoryFilter');
        if (!select) return;
        select.innerHTML = '<option value="ALL">Todas Categorias</option>';
        EXPENSE_CATEGORIES.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.innerText = cat;
            select.appendChild(opt);
        });
    },

    applyFilters() {
        const searchInput = document.getElementById('searchInput');
        const categoryFilter = document.getElementById('categoryFilter');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const selectedCat = categoryFilter ? categoryFilter.value : 'ALL';

        const currentMonthItems = window.AppState.getCurrentMonthExpenses();

        this.filteredTransactions = currentMonthItems.filter(t => {
            const matchesSearch = t.description.toLowerCase().includes(searchTerm);
            const matchesCat = selectedCat === 'ALL' || t.category === selectedCat;
            return matchesSearch && matchesCat;
        });

        const curr = window.AppState.displayCurrency;
        this.filteredTransactions.sort((a, b) => {
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

    sortTable(field) {
        if (this.currentSort.field === field) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort.field = field;
            this.currentSort.direction = 'desc';
        }
        this.applyFilters();
    },

    getSourceName(sourceId) {
        if (sourceId === 'manual_entry') return 'Lançamento manual';
        const source = window.AppState.uploadedFiles.find(f => f.id === sourceId);
        return source ? source.name : 'Outra Fonte';
    },

    renderTable() {
        const tbody = document.getElementById('transactionTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const curr = window.AppState.displayCurrency;
        const symbol = curr === 'BRL' ? 'R$' : '$';

        if (this.filteredTransactions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="py-6 text-center text-slate-500 text-xs">
                        Nenhum lançamento de despesa para o mês selecionado (${window.AppState.selectedReferenceMonth || 'Sem mês'}).
                    </td>
                </tr>
            `;
            document.getElementById('tableCountInfo').innerText = `Mostrando 0 lançamentos`;
            document.getElementById('tableTotalFiltered').innerText = `Soma filtrada: ${symbol} 0.00`;
            return;
        }

        this.filteredTransactions.forEach(t => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-800/80 transition border-b border-slate-700/40";

            const categoryBg = EXPENSE_COLORS[t.category] || '#64748b';
            const convertedVal = window.AppState.convertAmount(t, curr);
            const sourceName = this.getSourceName(t.sourceId);

            tr.innerHTML = `
                <td class="py-3 px-4 font-mono text-xs text-slate-400">${Utils.formatDate(t.date)}</td>
                <td class="py-3 px-4 font-medium text-slate-200">${Utils.escapeHtml(t.description)}</td>
                <td class="py-3 px-4 text-xs text-slate-400">
                    <span class="inline-block truncate max-w-[120px] bg-slate-900 border border-slate-700/80 px-2 py-0.5 rounded text-[11px]" title="${Utils.escapeHtml(sourceName)}">
                        ${Utils.escapeHtml(sourceName)}
                    </span>
                </td>
                <td class="py-3 px-4">
                    <select onchange="ExpensesTab.updateCategory('${t.id}', this.value)" class="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 focus:outline-none focus:border-emerald-500" style="border-left: 3px solid ${categoryBg}">
                        ${EXPENSE_CATEGORIES.map(c => `<option value="${c}" ${c === t.category ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </td>
                <td class="py-3 px-4 text-right font-mono text-slate-400">
                    ${t.currency === 'USD' ? `<span class="text-blue-400 font-semibold">$ ${t.amountOriginal.toFixed(2)}</span>` : `R$ ${t.amountOriginal.toFixed(2)}`}
                </td>
                <td class="py-3 px-4 text-right font-mono font-bold text-slate-100">
                    ${symbol} ${convertedVal.toFixed(2)}
                </td>
                <td class="py-3 px-4 text-center">
                    <button type="button" data-edit-expense class="text-slate-400 hover:text-emerald-400 p-1 transition" title="Editar despesa" aria-label="Editar despesa">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    <button onclick="ExpensesTab.deleteTransaction('${t.id}')" class="text-slate-500 hover:text-red-400 p-1 transition" title="Excluir Lançamento">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </td>
            `;
            tr.querySelector('[data-edit-expense]').addEventListener('click', () => this.openExpenseModal(t.id));
            tbody.appendChild(tr);
        });

        if (window.lucide) window.lucide.createIcons();

        const currentMonthTotal = window.AppState.getCurrentMonthExpenses().length;
        document.getElementById('tableCountInfo').innerText = `Mostrando ${this.filteredTransactions.length} de ${currentMonthTotal} despesas deste mês`;
        const sumFiltered = this.filteredTransactions.reduce((acc, t) => acc + window.AppState.convertAmount(t, curr), 0);
        document.getElementById('tableTotalFiltered').innerText = `Soma filtrada: ${symbol} ${sumFiltered.toFixed(2)}`;
    },

    updateCategory(id, newCat) {
        const index = window.AppState.transactions.findIndex(t => t.id === id);
        if (index !== -1) {
            window.AppState.transactions[index].category = newCat;
            window.AppState.saveExpenses();
            Utils.showNotification('Categoria atualizada.', 'info');
        }
    },

    deleteTransaction(id) {
        window.AppState.transactions = window.AppState.transactions.filter(t => t.id !== id);
        window.AppState.saveExpenses();
        Utils.showNotification('Despesa removida.', 'info');
    },

    exportCSV() {
        if (this.filteredTransactions.length === 0) return;
        const curr = window.AppState.displayCurrency;
        const headers = ['Data', 'Descricao', 'Arquivo_Fonte', 'Categoria', 'MoedaOriginal', 'ValorOriginal', `Valor_${curr}`];
        const rows = this.filteredTransactions.map(t => [
            t.date,
            `"${t.description.replace(/"/g, '""')}"`,
            `"${this.getSourceName(t.sourceId).replace(/"/g, '""')}"`,
            t.category,
            t.currency,
            t.amountOriginal,
            window.AppState.convertAmount(t, curr).toFixed(2)
        ]);

        const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join("\n");
        Utils.downloadFile(`despesas_finanai_${window.AppState.selectedReferenceMonth}_${curr}.csv`, csvContent, 'text/csv;charset=utf-8');
    },

    exportJSON() {
        if (this.filteredTransactions.length === 0) return;
        const curr = window.AppState.displayCurrency;
        const exportData = this.filteredTransactions.map(t => ({
            ...t,
            sourceName: this.getSourceName(t.sourceId),
            displayCurrency: curr,
            convertedAmount: window.AppState.convertAmount(t, curr)
        }));
        Utils.downloadFile(`despesas_finanai_${window.AppState.selectedReferenceMonth}_${curr}.json`, JSON.stringify(exportData, null, 2), 'application/json');
    },

    openDiagnosticModal(fileId) {
        const currentMonthItems = window.AppState.getCurrentMonthExpenses();
        const file = window.AppState.uploadedFiles.find(f => f.id === fileId);
        
        document.getElementById('diagFileName').innerText = file ? file.name : `Despesas de ${window.AppState.selectedReferenceMonth}`;
        document.getElementById('diagReadingMethod').innerText = file ? (file.method || 'Leitura JSON Local') : 'Filtro Mês Ativo';
        
        const rawContent = file ? file.rawText : JSON.stringify(currentMonthItems, null, 2);
        document.getElementById('diagRawText').innerText = rawContent || 'Sem dados brutos registrados.';
        document.getElementById('diagJsonResponse').innerText = JSON.stringify(currentMonthItems, null, 2);

        const alertContainer = document.getElementById('diagAlertContainer');
        const alertText = document.getElementById('diagAlertText');

        alertContainer.className = "p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs";
        alertText.innerHTML = `<strong>Inspeção Atualizada:</strong> Exibindo dados correspondentes ao Mês de Referência selecionado (<strong>${window.AppState.selectedReferenceMonth}</strong>).`;

        Utils.toggleModal('diagnosticModal');
    },

    copyRawText() {
        const text = document.getElementById('diagRawText').innerText;
        navigator.clipboard.writeText(text);
        Utils.showNotification('Texto copiado!', 'info');
    },

    copyJsonResponse() {
        const text = document.getElementById('diagJsonResponse').innerText;
        navigator.clipboard.writeText(text);
        Utils.showNotification('JSON copiado!', 'info');
    },

    async generateAiDiagnosis() {
        const currentData = window.AppState.getCurrentMonthExpenses();
        const prevData = window.AppState.getPreviousMonthExpenses();

        if (currentData.length === 0) {
            Utils.showNotification('Sem despesas no mês selecionado para diagnosticar.', 'warning');
            return;
        }

        document.getElementById('aiDiagPoints').innerText = 'Analisando histórico e processando com IA...';
        document.getElementById('aiDiagRecs').innerText = 'Comparando variações e teto de gastos...';
        document.getElementById('aiDiagSummary').innerText = 'Gerando síntese do perfil financeiro...';

        const categoryBreakdown = {};
        const budgetAnalysis = {};

        currentData.forEach(t => {
            categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + window.AppState.convertAmount(t, 'BRL');
        });

        EXPENSE_CATEGORIES.forEach(c => {
            const spent = categoryBreakdown[c] || 0;
            const limit = window.AppState.categoryBudgetLimits[c] || 0;
            budgetAnalysis[c] = {
                spentBrl: spent,
                limitBrl: limit,
                exceeded: limit > 0 && spent > limit,
                overAmountBrl: limit > 0 && spent > limit ? spent - limit : 0
            };
        });

        const summaryObj = {
            monthReference: window.AppState.selectedReferenceMonth,
            totalCurrentBrl: currentData.reduce((acc, t) => acc + window.AppState.convertAmount(t, 'BRL'), 0),
            totalPrevBrl: prevData.reduce((acc, t) => acc + window.AppState.convertAmount(t, 'BRL'), 0),
            categoryBreakdown: categoryBreakdown,
            budgetAnalysis: budgetAnalysis,
            transactionCount: currentData.length
        };

        if (AIAPI.hasApiKey()) {
            try {
                const parsed = await AIAPI.generateExpensesDiagnosis(summaryObj);
                document.getElementById('aiDiagPoints').innerText = parsed.pointsOfAttention || 'Sem observações críticas.';
                document.getElementById('aiDiagRecs').innerText = parsed.recommendations || 'Mantenha os hábitos de consumo atuais.';
                document.getElementById('aiDiagSummary').innerText = parsed.summary || 'Análise executada com sucesso.';
                Utils.showNotification('Diagnóstico via IA concluído!', 'success');
                return;
            } catch (e) {
                console.error("Erro na chamada da API da IA:", e); Utils.showNotification(`Aviso da IA: ${e.message}`, "warning");
            }
        }

        // Diagnóstico sintético local se sem API
        const exceeded = Object.keys(budgetAnalysis).filter(c => budgetAnalysis[c].exceeded);
        if (exceeded.length > 0) {
            document.getElementById('aiDiagPoints').innerText = `Atenção! Você ultrapassou o teto em ${exceeded.length} categoria(s): ${exceeded.join(', ')}.`;
            document.getElementById('aiDiagRecs').innerText = `Reajuste os gastos nas categorias excedidas para voltar à meta mensal.`;
        } else {
            document.getElementById('aiDiagPoints').innerText = `Excelente! Suas despesas respeitaram todos os tetos configurados neste mês.`;
            document.getElementById('aiDiagRecs').innerText = `Continue monitorando as categorias mais volumosas para preservar a sobra líquida.`;
        }
        document.getElementById('aiDiagSummary').innerText = `Gasto total contabilizado de ${Utils.formatCurrency(summaryObj.totalCurrentBrl, 'BRL')}.`;
        Utils.showNotification('Diagnóstico local gerado.', 'info');
    }
};
