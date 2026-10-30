/**
 * FinanAI - Funções Utilitárias e Helpers de Interface
 */

window.Utils = {
    formatCurrency(val, currency = (window.AppState ? window.AppState.displayCurrency : 'BRL')) {
        const num = Number(val) || 0;
        return new Intl.NumberFormat(currency === 'BRL' ? 'pt-BR' : 'en-US', {
            style: 'currency',
            currency: currency
        }).format(num);
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return dateStr;
    },

    escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    toggleModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.toggle('hidden');
        }
    },

    setSaveStatus(elementId, saved) {
        const element = document.getElementById(elementId);
        if (!element) return;
        element.textContent = saved
            ? 'Alterações salvas neste navegador.'
            : 'Não foi possível salvar. Verifique o armazenamento permitido no navegador; os valores podem se perder ao sair.';
        element.className = saved ? 'text-xs text-emerald-400' : 'text-xs text-amber-400';
    },

    showNotification(msg, type = 'info') {
        const toast = document.createElement('div');
        let bgClass = 'bg-slate-700';
        let icon = 'info';

        if (type === 'success') {
            bgClass = 'bg-emerald-600';
            icon = 'check-circle';
        } else if (type === 'error') {
            bgClass = 'bg-red-600';
            icon = 'alert-triangle';
        } else if (type === 'warning') {
            bgClass = 'bg-amber-600';
            icon = 'alert-circle';
        }

        toast.className = `fixed bottom-4 right-4 ${bgClass} text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-medium z-50 transition transform translate-y-2 opacity-0 flex items-center gap-2`;
        toast.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4"></i> <span>${this.escapeHtml(msg)}</span>`;

        document.body.appendChild(toast);
        if (window.lucide) window.lucide.createIcons();

        setTimeout(() => {
            toast.classList.remove('translate-y-2', 'opacity-0');
        }, 10);

        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    },

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });
    },

    downloadFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    getScoreBadge(score) {
        if (score >= 80) {
            return {
                label: 'Excelente',
                colorClass: 'text-emerald-400',
                borderClass: 'border-emerald-500/30',
                bgClass: 'bg-emerald-500/10',
                strokeColor: '#10b981',
                desc: 'Suas finanças estão sólidas e com alto potencial de geração de patrimônio!'
            };
        } else if (score >= 65) {
            return {
                label: 'Bom / Estável',
                colorClass: 'text-cyan-400',
                borderClass: 'border-cyan-500/30',
                bgClass: 'bg-cyan-500/10',
                strokeColor: '#06b6d4',
                desc: 'Equilíbrio financeiro saudável com boa taxa de poupança e controle de gastos.'
            };
        } else if (score >= 50) {
            return {
                label: 'Moderado / Atenção',
                colorClass: 'text-amber-400',
                borderClass: 'border-amber-500/30',
                bgClass: 'bg-amber-500/10',
                strokeColor: '#f59e0b',
                desc: 'Você está no zero a zero ou com pouca margem. Cuidado com imprevistos.'
            };
        } else {
            return {
                label: 'Crítico / Déficit',
                colorClass: 'text-red-400',
                borderClass: 'border-red-500/30',
                bgClass: 'bg-red-500/10',
                strokeColor: '#ef4444',
                desc: 'Despesas superando ou muito próximas da renda. Ação corretiva urgente recomendada.'
            };
        }
    }
};
