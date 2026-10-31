/** Relatório independente do DOM das abas; geração local com pdf-lib. */
window.Report = {
    today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    open() {
        const month = AppState.selectedReferenceMonth || this.today().slice(0, 7);
        document.getElementById('reportFrom').value = month + '-01';
        document.getElementById('reportTo').value = this.monthEnd(month);
        document.getElementById('reportCurrency').value = AppState.displayCurrency;
        Utils.toggleModal('reportModal');
        this.updatePeriod();
    },
    monthEnd(month) {
        const [y, m] = month.split('-').map(Number);
        return `${month}-${new Date(y, m, 0).getDate()}`;
    },
    updatePeriod() {
        document.getElementById('reportDates').classList.toggle('hidden', document.getElementById('reportPeriod').value !== 'custom');
    },
    range(mode, from, to) {
        const today = this.today();
        if (mode === 'selected') {
            const month = AppState.selectedReferenceMonth || today.slice(0, 7);
            from = month + '-01'; to = this.monthEnd(month);
        } else if (mode === 'all') {
            const dates = [...AppState.transactions, ...AppState.incomes].map(item => item.date).filter(Boolean).sort();
            from = dates[0] || today;
            // Recorrências são expandidas até hoje ou a última data cadastrada.
            to = dates.length ? [today, dates[dates.length - 1]].sort().pop() : today;
        }
        if (!Backup.date(from) || !Backup.date(to) || from > to) throw new Error('Escolha um intervalo de datas válido.');
        const months = [];
        let month = from.slice(0, 7);
        while (month <= to.slice(0, 7)) {
            months.push(month);
            const [y, m] = month.split('-').map(Number);
            month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
        }
        if (months.length > 1200) throw new Error('Escolha um período de até 100 anos.');
        return { from, to, months };
    },
    collect(options) {
        if (!options.tabs.length || !options.tabs.every(tab => ['expenses', 'incomes', 'health'].includes(tab))) {
            throw new Error('Selecione pelo menos uma aba.');
        }
        if (!['BRL', 'USD'].includes(options.currency)) throw new Error('Moeda inválida.');
        const range = this.range(options.period, options.from, options.to);
        const within = item => item.date >= range.from && item.date <= range.to;
        const expenses = AppState.transactions.filter(within);
        const incomes = range.months.flatMap(month => AppState.getIncomesForMonth(month).map(item => {
            // Uma receita do dia 31 vence no último dia de meses mais curtos.
            const last = this.monthEnd(item.date.slice(0, 7));
            return { ...item, date: item.date > last ? last : item.date };
        })).filter(within);
        const sum = items => items.reduce((total, item) => total + AppState.convertAmount(item, options.currency), 0);
        const monthly = range.months.map(month => ({ month,
            expenses: sum(expenses.filter(item => item.date.startsWith(month))),
            incomes: sum(incomes.filter(item => item.date.startsWith(month))) }));
        return { ...range, expenses, incomes, monthly, totalExpenses: sum(expenses), totalIncomes: sum(incomes) };
    },
    async build(options) {
        const data = this.collect(options);
        const { PDFDocument, StandardFonts, rgb } = PDFLib;
        const pdf = await PDFDocument.create();
        pdf.setTitle('FinanAI - Relatório financeiro');
        pdf.setAuthor('FinanAI');
        const normal = await pdf.embedFont(StandardFonts.Helvetica);
        const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
        const ink = rgb(0.12, 0.19, 0.25), muted = rgb(0.36, 0.42, 0.47), accent = rgb(0.02, 0.45, 0.36);
        let page, y;
        const clean = value => Array.from(String(value).replace(/[\r\n\t]+/g, ' ')).map(char => {
            try { normal.encodeText(char); return char; } catch (_) { return '?'; }
        }).join('');
        const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: options.currency }).format(value);
        const date = value => value.split('-').reverse().join('/');
        const newPage = () => {
            page = pdf.addPage([595.28, 841.89]); y = 752;
            page.drawText('FinanAI', { x: 42, y: 795, size: 20, font: bold, color: accent });
            page.drawText('RELATÓRIO FINANCEIRO', { x: 340, y: 800, size: 10, font: bold, color: muted });
            page.drawLine({ start: { x: 42, y: 780 }, end: { x: 553, y: 780 }, thickness: 1, color: accent });
        };
        const room = height => { if (!page || y - height < 55) newPage(); };
        const wrap = (value, width, size = 10, font = normal) => {
            const lines = []; let line = '';
            for (const word of clean(value).split(/\s+/)) {
                const candidate = line ? line + ' ' + word : word;
                if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
                if (line) { lines.push(line); line = ''; }
                for (const char of word) {
                    if (font.widthOfTextAtSize(line + char, size) > width && line) { lines.push(line); line = ''; }
                    line += char;
                }
            }
            lines.push(line); return lines;
        };
        const text = (value, size = 10, font = normal, color = ink) => {
            for (const line of wrap(value, 511, size, font)) {
                room(size + 6);
                page.drawText(line, { x: 42, y, size, font, color }); y -= size + 6;
            }
        };
        const title = label => { room(55); y -= 12; text(label, 15, bold, accent); y -= 5; };
        const table = (headers, rows, widths) => {
            y -= 8;
            const header = () => {
                room(36);
                page.drawRectangle({ x: 42, y: y - 8, width: 511, height: 23, color: rgb(0.9, 0.95, 0.94) });
                let x = 48;
                headers.forEach((label, i) => { page.drawText(label, { x, y, size: 9, font: bold, color: ink }); x += widths[i]; });
                y -= 25;
            };
            header();
            for (const row of rows) {
                const cells = row.map((value, i) => wrap(value, widths[i] - 12, 9));
                // Linhas muito extensas continuam na página seguinte, sem cortar texto.
                const count = Math.max(...cells.map(cell => cell.length));
                for (let line = 0; line < count; line++) {
                    if (y - 18 < 55) { newPage(); header(); }
                    let x = 48;
                    cells.forEach((cell, i) => {
                        if (cell[line]) page.drawText(cell[line], { x, y, size: 9, font: normal, color: ink });
                        x += widths[i];
                    });
                    y -= 13;
                }
                y -= 7;
                page.drawLine({ start: { x: 42, y: y + 10 }, end: { x: 553, y: y + 10 }, thickness: 0.3, color: rgb(0.82, 0.85, 0.87) });
            }
            if (!rows.length) text('Sem lançamentos no período.', 10, normal, muted);
            y -= 8;
        };
        const categories = items => {
            const totals = new Map();
            items.forEach(item => totals.set(item.category, (totals.get(item.category) || 0) + AppState.convertAmount(item, options.currency)));
            return [...totals].sort((a, b) => b[1] - a[1]);
        };
        const bars = values => {
            const max = Math.max(1, ...values.map(([, value]) => value));
            for (const [label, value] of values) {
                room(45);
                text(`${label}: ${money(value)}`, 10);
                page.drawRectangle({ x: 42, y: y - 3, width: 511, height: 7, color: rgb(0.92, 0.94, 0.95) });
                if (value > 0) page.drawRectangle({ x: 42, y: y - 3, width: 511 * value / max, height: 7, color: accent });
                y -= 20;
            }
        };
        newPage();
        text(`${date(data.from)} a ${date(data.to)}`, 16, bold);
        text(`Gerado em ${new Date().toLocaleString('pt-BR')} | Moeda: ${options.currency}`, 9, normal, muted);
        text(`Câmbio de exibição: 1 USD = ${AppState.exchangeRateUsdBrl.toLocaleString('pt-BR')} BRL.`, 9, normal, muted);
        text('Receitas recorrentes incluem ocorrências e ajustes do período; não comprovam recebimento.', 9, normal, muted);
        if (options.tabs.includes('expenses')) {
            title('Despesas');
            text(`Total: ${money(data.totalExpenses)} | ${data.expenses.length} lançamentos`, 12, bold);
            table(['Categoria', 'Total'], categories(data.expenses).map(([cat, value]) => [cat, money(value)]), [340, 171]);
            if (options.charts) bars(categories(data.expenses));
            if (options.budgets) {
                title('Orçamento por mês e categoria');
                text('Tetos atuais aplicados a cada mês. Meses parciais mostram apenas gastos das datas selecionadas; o teto não é proporcional.', 9, normal, muted);
                const rows = [];
                for (const month of data.months) {
                    for (const cat of EXPENSE_CATEGORIES) {
                        const limit = AppState.getCategoryBudgetLimit(cat, options.currency);
                        const spent = data.expenses.filter(item => item.date.startsWith(month) && item.category === cat)
                            .reduce((sum, item) => sum + AppState.convertAmount(item, options.currency), 0);
                        if (spent || limit) rows.push([month, cat, money(spent), limit > 0 ? money(limit) : 'Sem teto', limit > 0 ? money(limit - spent) : '-']);
                    }
                }
                table(['Mês', 'Categoria', 'Gasto', 'Teto', 'Disponível'], rows, [61, 150, 100, 100, 100]);
            }
        }
        if (options.tabs.includes('incomes')) {
            title('Receitas');
            text(`Total: ${money(data.totalIncomes)} | ${data.incomes.length} ocorrências`, 12, bold);
            table(['Categoria', 'Total'], categories(data.incomes).map(([cat, value]) => [cat, money(value)]), [340, 171]);
            if (options.charts) bars(categories(data.incomes));
        }
        if (options.tabs.includes('health')) {
            title('Saúde financeira - balanço do período');
            text('Calculado com todas as receitas e despesas do período, mesmo quando uma dessas abas não foi incluída.', 9, normal, muted);
            const balance = data.totalIncomes - data.totalExpenses;
            table(['Indicador', 'Valor'], [
                ['Receitas', money(data.totalIncomes)], ['Despesas', money(data.totalExpenses)],
                ['Saldo do período', money(balance)],
                ['Taxa de poupança', data.totalIncomes > 0 ? (100 * balance / data.totalIncomes).toFixed(1) + '%' : 'Sem receita para calcular']
            ], [340, 171]);
            table(['Mês', 'Receitas', 'Despesas', 'Saldo'], data.monthly.map(row => [row.month, money(row.incomes), money(row.expenses), money(row.incomes - row.expenses)]), [91, 140, 140, 140]);
            if (options.reserve) {
                room(255);
                title('Reserva de emergência - posição informada atual');
                const factor = options.currency === 'USD' ? 1 / AppState.exchangeRateUsdBrl : 1;
                const fund = AppState.emergencyFund;
                const refMonth = data.to.slice(0, 7);
                const actual = AppState.transactions.filter(item => item.date.startsWith(refMonth))
                    .reduce((sum, item) => sum + AppState.convertAmount(item, options.currency), 0);
                const cost = fund.customMonthlyExpense > 0 ? fund.customMonthlyExpense * factor : actual || 2500 * factor;
                const saved = fund.currentSavings * factor;
                text('O saldo da reserva é o informado atualmente, não uma posição histórica do período.', 9, normal, muted);
                text(fund.customMonthlyExpense > 0 ? 'Base mensal: custo personalizado.' : actual > 0
                    ? `Base mensal: despesas de todo o mês ${refMonth}.` : 'Base mensal provisória: R$ 2.500, por ausência de despesas.', 9, normal, muted);
                table(['Indicador', 'Valor'], [['Saldo guardado', money(saved)], ['Custo mensal', money(cost)],
                    ['Meses cobertos', (saved / cost).toFixed(1)], ['Meta de cobertura', `${fund.targetMonths} meses`],
                    ['Valor da meta', money(cost * fund.targetMonths)], ['Falta acumular', money(Math.max(0, cost * fund.targetMonths - saved))]], [340, 171]);
            }
        }
        if (options.details) {
            for (const [tab, label, items] of [['expenses', 'Despesas', data.expenses], ['incomes', 'Receitas', data.incomes]]) {
                if (!options.tabs.includes(tab)) continue;
                title(`${label} - lançamentos`);
                table(['Data', 'Descrição', 'Categoria', `Valor (${options.currency})`], [...items].sort((a, b) => a.date.localeCompare(b.date))
                    .map(item => [date(item.date), item.description, item.category, money(AppState.convertAmount(item, options.currency))]), [65, 210, 126, 110]);
            }
        }
        pdf.getPages().forEach((p, index, pages) => {
            p.drawText('FinanAI | Dados financeiros pessoais', { x: 42, y: 28, size: 8, font: normal, color: muted });
            p.drawText(`${index + 1} / ${pages.length}`, { x: 510, y: 28, size: 8, font: normal, color: muted });
        });
        return { bytes: await pdf.save(), filename: `finanai_relatorio_${data.from}_${data.to}.pdf` };
    },
    async download(event) {
        event.preventDefault();
        const button = document.getElementById('reportDownload');
        button.disabled = true; button.textContent = 'Gerando PDF...';
        try {
            const options = {
                tabs: ['expenses', 'incomes', 'health'].filter(tab => document.getElementById('report_' + tab).checked),
                period: document.getElementById('reportPeriod').value,
                from: document.getElementById('reportFrom').value, to: document.getElementById('reportTo').value,
                currency: document.getElementById('reportCurrency').value,
                details: document.getElementById('reportDetails').checked, charts: document.getElementById('reportCharts').checked,
                budgets: document.getElementById('reportBudgets').checked, reserve: document.getElementById('reportReserve').checked
            };
            const result = await this.build(options);
            Utils.downloadFile(result.filename, result.bytes, 'application/pdf');
            Utils.showNotification('Relatório PDF gerado.', 'success');
        } catch (error) { Utils.showNotification(error.message || 'Não foi possível gerar o PDF.', 'error'); }
        finally { button.disabled = false; button.textContent = 'Baixar PDF'; }
    }
};
