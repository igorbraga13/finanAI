/** Comparação do mês selecionado com meses anteriores, sem alterar os lançamentos. */
window.ExpenseComparison = {
    period: 1,
    reductionPeriod: 1,

    setPeriod(period, direction = 'increase') {
        if (![1, 3, 6].includes(period)) return;
        if (direction === 'reduction') this.reductionPeriod = period;
        else this.period = period;
        this.render();
    },

    previousMonths(month, count) {
        let [year, number] = month.split('-').map(Number);
        const months = [];
        for (let i = 0; i < count; i++) {
            if (--number === 0) { year--; number = 12; }
            months.push(`${year}-${String(number).padStart(2, '0')}`);
        }
        return months;
    },

    calculate(state = AppState, count = 1, direction = 'increase') {
        if (![1, 3, 6].includes(count)) throw new Error('Período de comparação inválido.');
        const selected = state.selectedReferenceMonth;
        if (!selected) return { selected: null, rows: [], months: [], available: [], missing: [], hasCurrent: false };
        const months = this.previousMonths(selected, count);
        const byMonth = new Map([selected, ...months].map(month => [month, new Map()]));
        const hasData = new Set();
        for (const item of state.transactions) {
            const month = (item.date || '').slice(0, 7);
            if (!byMonth.has(month)) continue;
            const amount = state.convertAmount(item, state.displayCurrency);
            if (!Number.isFinite(amount) || amount < 0) continue;
            hasData.add(month);
            const totals = byMonth.get(month);
            totals.set(item.category, (totals.get(item.category) || 0) + amount);
        }
        const available = months.filter(month => hasData.has(month));
        const missing = months.filter(month => !hasData.has(month));
        const rows = [];
        if (hasData.has(selected) && available.length) {
            const categories = new Set([...byMonth.get(selected).keys(), ...available.flatMap(month => [...byMonth.get(month).keys()])]);
            for (const category of categories) {
                const rawCurrent = byMonth.get(selected).get(category) || 0;
                const rawBase = available.reduce((total, month) => total + (byMonth.get(month).get(category) || 0), 0) / available.length;
                const current = Math.round((rawCurrent + Number.EPSILON) * 100) / 100;
                const baseline = Math.round((rawBase + Number.EPSILON) * 100) / 100;
                const increase = Math.round((current - baseline) * 100) / 100;
                if (direction === 'reduction' ? increase < 0 : increase > 0) rows.push({ category, current, baseline, increase,
                    percent: baseline > 0 ? increase / baseline * 100 : null });
            }
            rows.sort((a, b) => Math.abs(b.increase) - Math.abs(a.increase) || a.category.localeCompare(b.category, 'pt-BR'));
        }
        return { selected, rows: rows.slice(0, 3), months, available, missing, hasCurrent: hasData.has(selected) };
    },

    label(month) {
        const [year, number] = month.split('-').map(Number);
        return new Date(year, number - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    },

    render() {
        this.renderPanel('increase', this.period);
        this.renderPanel('reduction', this.reductionPeriod);
    },

    renderPanel(direction, selectedPeriod) {
        const prefix = direction === 'reduction' ? 'categoryReduction' : 'categoryIncrease';
        const container = document.getElementById(prefix + 'Cards');
        if (!container) return;
        const selected = AppState.selectedReferenceMonth;
        const summary = document.getElementById(prefix + 'Summary');
        const notice = document.getElementById(prefix + 'Notice');
        for (const period of [1, 3, 6]) {
            const button = document.getElementById(prefix + 'Period' + period);
            button.setAttribute('aria-pressed', String(period === selectedPeriod));
            button.className = 'px-3 py-1.5 rounded-md transition ' + (period === selectedPeriod
                ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white');
        }
        container.replaceChildren();
        notice.textContent = '';
        if (!selected) {
            summary.textContent = 'Adicione despesas para comparar os gastos entre meses.';
            return;
        }
        const notes = [];
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        if (selected === currentMonth) notes.push('Mês atual em andamento: os gastos registrados até agora são comparados aos meses anteriores inteiros.');
        else if (selected > currentMonth) notes.push('Mês futuro: a comparação usa apenas os lançamentos já cadastrados.');
        notes.push('A comparação usa todas as despesas do mês, independentemente dos filtros da tabela. Meses com lançamentos podem ter extratos incompletos.');
        if (direction === 'reduction') notes.push('Reduções nos registros não confirmam economia: uma categoria sem lançamentos é indicada como “Sem gasto registrado”.');
        notice.textContent = notes.join(' ');
        this.renderPeriod(container, selectedPeriod, direction, prefix);
    },

    renderPeriod(container, period, direction, prefix) {
        const reducing = direction === 'reduction';
        const noun = reducing ? 'redução' : 'aumento';
        const data = this.calculate(AppState, period, direction);
        const reference = period === 1 ? this.label(data.months[0])
            : 'média mensal de ' + this.label(data.months[data.months.length - 1]) + ' a ' + this.label(data.months[0]);
        document.getElementById(prefix + 'Summary').textContent = this.label(data.selected)
            + ' em comparação com ' + reference + '. Até 3 categorias com maior ' + noun + ' em dinheiro.';
        if (data.missing.length) {
            const notice = document.getElementById(prefix + 'Notice');
            notice.textContent = 'Base disponível: ' + data.available.length + ' de ' + period + (period === 1 ? ' mês.' : ' meses.')
                + ' Sem registros em ' + data.missing.map(month => this.label(month)).join(', ') + '; esses meses não entram na média. '
                + notice.textContent;
        }
        let empty = '';
        if (!data.hasCurrent) empty = 'Sem despesas registradas no mês selecionado. Ainda não é possível comparar.';
        else if (!data.available.length) empty = 'Sem histórico de despesas no período anterior escolhido. Importe os extratos anteriores.';
        else if (!data.rows.length) empty = 'Nenhuma categoria apresentou ' + noun + ' em relação à base disponível.';
        if (empty) {
            const message = document.createElement('p');
            message.className = 'text-sm text-slate-400 col-span-full py-4';
            message.textContent = empty;
            container.appendChild(message);
            return;
        }
        const currency = AppState.displayCurrency;
        const format = value => Utils.escapeHtml(Utils.formatCurrency(value, currency));
        const color = reducing ? 'text-emerald-300' : 'text-amber-300';
        const badge = reducing ? 'bg-emerald-500/10' : 'bg-amber-500/10';
        const sign = reducing ? '−' : '+';
        for (const [index, row] of data.rows.entries()) {
            const card = document.createElement('article');
            card.className = 'rounded-xl bg-slate-900/60 border border-slate-700 p-4 space-y-3 min-w-0';
            const percent = row.percent === null ? 'Sem gasto na base' : sign + Math.abs(row.percent).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
            card.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <h4 class="text-sm font-semibold text-slate-200 break-words">${index + 1}. ${Utils.escapeHtml(row.category)}</h4>
                    <span class="text-xs ${color} ${badge} rounded-lg px-2 py-1 shrink-0">${percent}</span>
                </div>
                <p class="text-xl font-bold ${color}">${sign}${format(Math.abs(row.increase))} <span class="text-xs font-normal text-slate-400">de ${noun}</span></p>
                <dl class="grid grid-cols-2 gap-2 text-xs">
                    <div><dt class="text-slate-400">${period === 1 ? 'Mês anterior' : 'Média mensal disponível'}</dt><dd class="text-slate-300 mt-1">${format(row.baseline)}</dd></div>
                    <div><dt class="text-slate-400">Mês selecionado</dt><dd class="text-slate-200 mt-1">${format(row.current)}${reducing && row.current === 0 ? '<span class="block text-slate-400 mt-1">Sem gasto registrado</span>' : ''}</dd></div>
                </dl>`;
            container.appendChild(card);
        }
    }
};
