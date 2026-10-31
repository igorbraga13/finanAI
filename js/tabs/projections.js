/** Simulação local. Valores monetários persistidos em BRL; nenhum lançamento real é alterado. */
window.ProjectionsTab = {
    chart: null,
    shift(month, offset) {
        const [year, number] = month.split('-').map(Number);
        const date = new Date(year, number - 1 + offset, 1);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    },
    currentMonth() {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
        return parts.find(p => p.type === 'year').value + '-' + parts.find(p => p.type === 'month').value;
    },
    label(month) {
        const [y, m] = month.split('-').map(Number);
        return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    },
    history(state = AppState, nowMonth = this.currentMonth()) {
        const settings = state.projectionSettings;
        const anchor = state.selectedReferenceMonth || nowMonth;
        // O mês atual pode estar incompleto. Meses futuros não entram na média.
        const end = [anchor, this.shift(nowMonth, -1)].sort()[0];
        const months = Array.from({ length: settings.basis }, (_, i) => this.shift(end, -i)).reverse();
        const collect = income => {
            const totals = [], missing = [];
            for (const month of months) {
                const items = income ? state.getIncomesForMonth(month) : state.transactions.filter(t => (t.date || '').startsWith(month));
                const amounts = items.map(item => state.convertAmount(item, 'BRL')).filter(n => Number.isFinite(n) && n >= 0);
                if (amounts.length) totals.push(amounts.reduce((sum, n) => sum + n, 0));
                else missing.push(month);
            }
            return { mean: totals.length ? totals.reduce((sum, n) => sum + n, 0) / totals.length : null, count: totals.length, missing };
        };
        return { start: this.shift(anchor, 1), months, income: collect(true), expense: collect(false) };
    },
    calculate(state = AppState, nowMonth = this.currentMonth()) {
        const settings = state.normalizeProjectionSettings(state.projectionSettings);
        const history = this.history(state, nowMonth);
        const income = settings.income ?? history.income.mean;
        const expense = settings.expense ?? history.expense.mean;
        const missing = [income === null ? 'receita' : '', expense === null ? 'despesa' : ''].filter(Boolean);
        if (missing.length) return { history, missing, rows: [], income, expense };
        let cash = settings.initial, invested = settings.initial;
        const rate = Math.pow(1 + settings.rate / 100, 1 / 12) - 1;
        const rows = [];
        for (let i = 0; i < settings.months; i++) {
            const extra = settings.extras.reduce((sum, item) => sum + (i < item.duration ? item.amount * (item.type === 'income' ? 1 : -1) : 0), 0);
            const flow = income - expense + extra - settings.contribution;
            invested += Math.max(0, invested) * rate + flow;
            cash += flow;
            rows.push({ month: this.shift(history.start, i), income, expense, extra, contribution: settings.contribution, cash, invested });
        }
        return { history, missing, rows, income, expense, monthlyRate: rate };
    },
    get root() { return document.getElementById('finanai-projection-demo'); },
    query(selector) { return this.root.querySelector(selector); },
    factor() { return AppState.displayCurrency === 'USD' ? 1 / AppState.exchangeRateUsdBrl : 1; },
    format(value) { return Utils.formatCurrency(value * this.factor(), AppState.displayCurrency); },
    init() {
        const root = this.root;
        if (!root) return;
        root.querySelectorAll('[data-months]').forEach(button => button.addEventListener('click', () => {
            AppState.projectionSettings.months = Number(button.dataset.months); this.save(); this.render();
        }));
        root.querySelectorAll('[data-basis]').forEach(button => button.addEventListener('click', () => {
            AppState.projectionSettings.basis = Number(button.dataset.basis); this.save(); this.render();
        }));
        for (const key of ['initial', 'income', 'expense', 'contribution', 'rate']) {
            const input = this.query(`[data-field="${key}"]`);
            input.addEventListener('input', () => {
                const optional = key === 'income' || key === 'expense';
                const value = input.value === '' && optional && !input.validity.badInput ? null : Number(input.value);
                const brl = value === null ? null : key === 'rate' ? value : value / this.factor();
                const valid = !input.validity.badInput && (value === null || input.value !== '' && Number.isFinite(brl) && brl >= 0 && brl <= (key === 'rate' ? 100 : 1e12));
                input.setCustomValidity(valid ? '' : 'Informe um valor válido.');
                const error = this.query('[data-error]');
                error.hidden = valid;
                error.textContent = valid ? '' : 'Valor inválido. A simulação mantém o último valor válido (taxa entre 0% e 100% a.a.).';
                if (!valid) return;
                AppState.projectionSettings[key] = brl === null ? null : key === 'rate' ? brl : Math.round(brl * 100) / 100;
                this.save(); this.render();
            });
        }
        this.query('[data-add-extra]').addEventListener('click', () => {
            if (AppState.projectionSettings.extras.length >= 20) return;
            AppState.projectionSettings.extras.push({ type: 'expense', name: '', amount: 0, duration: 1 });
            this.save(); this.render();
        });
    },
    save() {
        const saved = AppState.persistFinancialSetting('finanai_projection_settings', AppState.projectionSettings, false);
        this.query('[data-save-status]').textContent = saved ? 'Premissas salvas neste navegador.' : 'Não foi possível salvar. As alterações estão apenas nesta sessão.';
    },
    renderExtras() {
        const holder = this.query('[data-extras]');
        if (holder.contains(document.activeElement)) return;
        holder.replaceChildren();
        const extras = AppState.projectionSettings.extras;
        this.query('[data-add-extra]').disabled = extras.length >= 20;
        extras.forEach((item, index) => {
            const row = document.createElement('div'); row.className = 'p-extra-row';
            row.innerHTML = `<label>Tipo<select data-kind><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
                <label>Descrição (opcional)<input data-name type="text" maxlength="80" placeholder="Ex.: curso ou trabalho extra"></label>
                <label>Valor mensal (${AppState.displayCurrency})<input data-amount type="number" min="0" step="0.01"></label>
                <label>Meses<input data-duration type="number" min="1" max="120" step="1"></label>
                <button type="button" data-remove>Remover</button>`;
            const kind = row.querySelector('[data-kind]'), name = row.querySelector('[data-name]');
            const amount = row.querySelector('[data-amount]'), duration = row.querySelector('[data-duration]');
            kind.value = item.type; name.value = item.name;
            amount.value = (item.amount * this.factor()).toFixed(2); duration.value = item.duration;
            kind.addEventListener('change', () => { item.type = kind.value; this.save(); this.render(); });
            name.addEventListener('input', () => { item.name = name.value.slice(0, 80); this.save(); });
            for (const [input, key] of [[amount, 'amount'], [duration, 'duration']]) {
                input.addEventListener('input', () => {
                    const value = Number(input.value), brl = key === 'amount' ? value / this.factor() : value;
                    const valid = input.value !== '' && !input.validity.badInput && Number.isFinite(brl)
                        && (key === 'duration' ? Number.isInteger(value) && value >= 1 && value <= 120 : brl >= 0 && brl <= 1e12);
                    input.setCustomValidity(valid ? '' : 'Valor inválido.');
                    this.query('[data-extra-error]').hidden = valid;
                    this.query('[data-extra-error]').textContent = valid ? '' : 'Informe valor não negativo e duração inteira de 1 a 120 meses. O último valor válido foi mantido.';
                    if (!valid) return;
                    item[key] = key === 'amount' ? Math.round(brl * 100) / 100 : value;
                    this.save(); this.render();
                });
            }
            row.querySelector('[data-remove]').addEventListener('click', () => {
                extras.splice(index, 1); row.remove();
                this.query('[data-extra-error]').hidden = true;
                this.save(); this.render();
            });
            holder.appendChild(row);
        });
    },
    render() {
        if (!this.root) return;
        const settings = AppState.projectionSettings, result = this.calculate();
        const root = this.root;
        root.querySelectorAll('[data-months]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.months) === settings.months)));
        root.querySelectorAll('[data-basis]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.basis) === settings.basis)));
        root.querySelectorAll('[data-currency-label]').forEach(el => { el.textContent = AppState.displayCurrency; });
        for (const key of ['initial', 'income', 'expense', 'contribution', 'rate']) {
            const input = this.query(`[data-field="${key}"]`);
            if (document.activeElement !== input) {
                input.value = settings[key] === null ? '' : key === 'rate' ? settings[key] : (settings[key] * this.factor()).toFixed(2);
            }
        }
        this.renderExtras();
        const history = result.history;
        this.query('[data-start-label]').textContent = this.label(history.start) + ' em diante';
        this.query('[data-history]').textContent = `${this.label(history.months[0])} a ${this.label(history.months.at(-1))}. `
            + `Base disponível: receitas ${history.income.count}/${settings.basis} meses; despesas ${history.expense.count}/${settings.basis} meses. `
            + 'Meses sem registros de cada tipo ficam fora da respectiva média; extratos podem estar incompletos. Receitas recorrentes incluem ajustes e não comprovam recebimento.';
        for (const key of ['income', 'expense']) {
            this.query(`[data-${key}-note]`).textContent = settings[key] !== null ? 'Valor manual: ' + this.format(settings[key])
                : history[key].mean === null ? 'Sem histórico: informe um valor manual (zero é válido).'
                    : `Automático · média de ${history[key].count} meses: ${this.format(history[key].mean)}`;
        }
        const total = type => settings.extras.filter(item => item.type === type).reduce((sum, item) => sum + item.amount * Math.min(item.duration, settings.months), 0);
        this.query('[data-extras-total]').textContent = `Neste horizonte: ${this.format(total('income'))} em receitas extras · ${this.format(total('expense'))} em despesas extras.`
            + (settings.extras.some(item => item.duration > settings.months) ? ' Há lançamentos além do período exibido.' : '');
        const rows = result.rows, final = rows.at(-1);
        for (const [selector, value] of [['[data-final]', final?.cash], ['[data-invested]', final?.invested]]) {
            const element = this.query(selector); element.textContent = value === undefined ? '—' : this.format(value);
            element.classList.toggle('negative', value < 0);
        }
        const growth = this.query('[data-growth]');
        const change = final ? final.cash - settings.initial : 0;
        growth.textContent = !final ? 'Sem estimativa' : settings.initial > 0
            ? (change >= 0 ? '+' : '') + (100 * change / settings.initial).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'
            : 'Base inicial zero';
        growth.classList.toggle('negative', change < 0);
        this.query('[data-final-label]').textContent = final ? 'Ao encerrar ' + this.label(final.month) + ' · fora da reserva' : 'Preencha as premissas para simular.';
        this.query('[data-yield]').textContent = final ? this.format(final.invested - final.cash) + ' de rendimento estimado no período' : '';
        this.query('[data-rate-label]').textContent = settings.rate.toLocaleString('pt-BR') + '% a.a. ≈ '
            + ((Math.pow(1 + settings.rate / 100, 1 / 12) - 1) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + '% a.m.';
        const shortfall = rows.find(row => row.cash < 0), status = this.query('[data-status]');
        status.textContent = result.missing.length ? 'Sem histórico para estimar ' + result.missing.join(' e ') + '. Informe um valor manual ou importe o histórico.'
            : shortfall ? `Saldo insuficiente a partir de ${this.label(shortfall.month)}. Os aportes planejados foram mantidos; revise os valores.`
                : 'Saldo disponível positivo ou zero em todos os meses desta simulação.';
        status.style.borderColor = shortfall || result.missing.length ? 'var(--warn)' : 'var(--green)';
        this.query('[data-rows]').innerHTML = rows.map(row => `<tr><td>${this.label(row.month)}</td>${['income', 'expense', 'extra', 'contribution', 'cash', 'invested']
            .map(key => `<td class="${row[key] < 0 ? 'negative' : ''}">${this.format(row[key])}</td>`).join('')}</tr>`).join('');
        this.renderChart(rows);
    },
    renderChart(rows) {
        if (!window.Chart) return;
        const settings = AppState.projectionSettings;
        const labels = rows.length ? ['Inicial', ...rows.map(row => this.label(row.month))] : [];
        const datasets = [
            { label: 'Sem rendimentos', data: rows.length ? [settings.initial, ...rows.map(row => row.cash)].map(n => n * this.factor()) : [], borderColor: '#34d399', pointRadius: 3, tension: 0 },
            { label: 'Com rendimento estimado', data: rows.length ? [settings.initial, ...rows.map(row => row.invested)].map(n => n * this.factor()) : [], borderColor: '#38bdf8', borderDash: [5, 4], pointRadius: 3, tension: 0 }
        ];
        if (this.chart) { this.chart.data = { labels, datasets }; this.chart.update('none'); return; }
        this.chart = new Chart(document.getElementById('projectionChart'), {
            type: 'line', data: { labels, datasets }, options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { datalabels: { display: false }, legend: { labels: { color: '#94a3b8' } },
                    tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + Utils.formatCurrency(ctx.parsed.y, AppState.displayCurrency) } } },
                scales: { x: { ticks: { color: '#94a3b8', maxTicksLimit: 7 }, grid: { color: '#334155' } },
                    y: { ticks: { color: '#94a3b8', callback: n => Utils.formatCurrency(n, AppState.displayCurrency) }, grid: { color: '#334155' } } }
            }
        });
    }
};
