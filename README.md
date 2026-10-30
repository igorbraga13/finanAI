# FinanAI - Gestão Financeira Inteligente & Investimentos

Aplicação modular de finanças pessoais e controle de investimentos com suporte a moedas BRL/USD, leitura inteligente de extratos via IA, sistema de receitas recorrentes inteligentes e diagnóstico consultivo integrado.

## Despesas manuais

Na aba Despesas, clique em **Nova Despesa** e informe data, descrição, categoria, moeda (BRL ou USD) e valor. O lançamento é salvo no navegador, aparece como **Lançamento manual** e participa dos totais, gráficos e orçamento. O ícone de edição na tabela permite ajustar uma despesa existente. Limpar os arquivos importados mantém os lançamentos manuais.

Teste local: `node tests/manual-expenses.cjs`.

## Salvamento de budgets e reserva de emergência

Os tetos por categoria são salvos automaticamente durante a edição; a reserva de emergência também salva a meta de cobertura, o saldo guardado e o custo mensal personalizado. As configurações são restauradas ao recarregar ou reabrir o site no mesmo navegador e endereço. Os valores financeiros são armazenados em BRL e convertidos para a moeda selecionada na tela.

O indicador de meses cobertos e o simulador usam a mesma base: saldo da reserva dividido pelo custo mensal personalizado, quando preenchido. Sem custo personalizado, usam as despesas do mês selecionado; sem despesas, usam uma base provisória de R$ 2.500. Por exemplo, R$ 5.000 guardados com custo mensal de R$ 5.000 correspondem a 1 mês coberto, em qualquer moeda de exibição.

Cada seção informa se o salvamento funcionou. As configurações não são sincronizadas entre dispositivos ou navegadores e podem ser removidas ao limpar os dados do site. O endereço local e o GitHub Pages têm armazenamentos separados; em navegação privada, os dados podem durar apenas a sessão.

Teste de persistência, usando armazenamento fictício: `node tests/financial-settings.cjs`.

## Importação de extratos com entradas e saídas

Importe o extrato pela aba Despesas ou Receitas. A leitura por IA identifica os dois sentidos: saídas são registradas em Despesas e entradas em Receitas, com valores positivos em cada aba. PDF, imagens, TXT e CSV usam o provedor de IA selecionado nas configurações; JSON é processado localmente.

- Pix, TED, DOC, Zelle, ACH e outras transferências enviadas: **Despesa → Transferências**.
- Transferência recebida de pessoa física: **Receita → Transferências**.
- Transferência recebida de empresa: **Receita → Freelance / Serviços**.
- Naturezas explícitas, como salário, dividendos e cashback, mantêm suas categorias específicas.
- Recebimentos de extrato são pontuais e não se repetem automaticamente nos meses seguintes.

A categoria Transferências aparece nos filtros, cadastros e orçamento. Seu teto inicial é zero (sem limite definido), podendo ser ajustado nas configurações.

Para JSONs mistos, use `transactionType: "expense"` ou `"income"`. Em receitas, `payerType: "person"` ou `"company"` identifica o remetente. A recorrência usa um campo separado, `recurrence: "variable"` (pontual) ou `"recurrent"` (recorrente explícita). O formato antigo `type: "variable"` / `"recurrent"` continua aceito para receitas. Sem indicação de direção, valores negativos são saídas; valores positivos mantêm a aba de importação por compatibilidade com os JSONs antigos.

Verificação local, sem chave de API: `node tests/statement-import.cjs`.

## Escolher Gemini ou OpenAI (ChatGPT)

1. Abra as configurações na engrenagem e escolha **Google Gemini** ou **OpenAI (ChatGPT)**.
2. Informe a chave de API do serviço escolhido. Na OpenAI, o modelo inicial é `gpt-4.1-mini`; é possível informar outro modelo compatível com imagens e JSON, disponível para sua chave.
3. Clique em **Testar chave e modelo selecionados** e depois em **Salvar Alterações**. O teste faz uma pequena requisição ao serviço selecionado.

O campo de modelo oferece sugestões (`gpt-4.1-mini`, `gpt-5.4-nano`, `gpt-5.4-mini` e `gpt-4.1`), além de aceitar outros IDs compatíveis. A disponibilidade depende da chave e das permissões da conta. Consulte o [catálogo oficial de modelos](https://developers.openai.com/api/docs/models).

**Modelos alternativos:** marque “Tentar modelos alternativos automaticamente” e informe as alternativas em ordem, uma por linha. O modelo principal é tentado primeiro, seguido da lista (até oito modelos únicos no total). A configuração inicial mantém `gpt-4.1-mini` como principal e sugere `gpt-5.4-nano` e `gpt-5.4-mini` como alternativas. Os preços variam; ajuste a sequência conforme seu orçamento. Tanto a importação quanto os diagnósticos e o teste de conexão usam essa sequência. Uma notificação indica quando uma alternativa foi utilizada.

A troca ocorre em caso de modelo indisponível, limite temporário de requisições ou falha temporária do serviço. Há uma espera entre tentativas; se a API exigir mais de dez segundos, a operação é interrompida e informa quanto aguardar. Saldo esgotado, limites de gastos, chave inválida e erros de permissão interrompem a operação: não se tenta contorná-los mudando de modelo. Os créditos são da conta, não individuais por modelo. Veja [erros da API](https://developers.openai.com/api/docs/guides/error-codes) e [limites de requisições](https://developers.openai.com/api/docs/guides/rate-limits). Limites temporários podem ser compartilhados entre modelos; a troca não garante disponibilidade.

A seleção vale para importação de extratos, diagnóstico de despesas e consultoria de saúde financeira. Cada serviço mantém sua própria chave; mudar o provedor não apaga a configuração do outro. Erros de um serviço não enviam seus documentos automaticamente ao outro.

A opção OpenAI usa a API, com chave própria e faturamento da API, sem login na interface do ChatGPT. A implementação usa a Responses API para [texto e anexos PDF](https://developers.openai.com/api/docs/guides/file-inputs), [imagens](https://developers.openai.com/api/docs/guides/images-vision) e [respostas JSON](https://developers.openai.com/api/docs/guides/structured-outputs), conforme a documentação oficial OpenAI. As requisições OpenAI usam `store: false`.

Esta versão pessoal chama os serviços pelo navegador e salva as chaves no armazenamento local. Para disponibilizar a aplicação a outras pessoas, mova as chamadas e as chaves para um servidor. Não inclua chaves nos arquivos do projeto.

Testes da seleção, transporte e configurações, com respostas simuladas: `node tests/ai-provider.cjs`.

---

## 📁 Estrutura Modular do Projeto

```
organiador_financas/
├── index.html                  # Shell da aplicação com as 3 abas e navegação
├── css/
│   └── styles.css              # Estilos complementares, scrollbars e gauge de score
├── js/
│   ├── state.js                # Estado reativo compartilhado (despesas, receitas recorrentes, câmbio, mês ativo)
│   ├── utils.js                # Helpers de formatação de moedas, datas, toasts e modais
│   ├── api.js                  # Integração com a API Gemini (extração e diagnósticos)
│   ├── ai-provider.js          # Seleção Gemini/OpenAI e integração com a Responses API
│   ├── app.js                  # Inicializador e orquestrador de troca de abas
│   └── tabs/
│       ├── expenses.js         # Módulo da Aba de Despesas (budgeting, faturas, gráficos)
│       ├── incomes.js          # Módulo da Aba de Receitas & Proventos (com Recorrência Inteligente)
│       └── health.js           # Módulo da Aba de Saúde Financeira & Balanço Líquido
└── README.md
```

---

## 🔄 Como Funciona a Recorrência Inteligente de Receitas

- **Propagação Automática**: Ao cadastrar uma receita recorrente (ex: *Salário* ou *Aluguel recebido*) com data em Janeiro/2026, ela **aparecerá automaticamente em Fevereiro, Março e em todos os meses subsequentes**. Não é necessário cadastrá-la novamente a cada mês!
- **Ajustes Pontuais no Valor**: Caso em determinado mês haja um pequeno reajuste ou variação (bônus, desconto ou dissídio):
  1. No mês desejado (ex: Fevereiro), clique no ícone de **Editar (✏️)** na tabela de receitas.
  2. Altere o valor.
  3. Escolha no modal:
     - 🔘 **Ajustar apenas em Fevereiro/2026**: A variação fica gravada exclusivamente para este mês.
     - 🔘 **Atualizar deste mês em diante**: O novo valor passa a ser a nova base permanente da recorrência.
- **Identificação Visual**:
  - `Fixo (Recorrente)`: Receita propagada automaticamente.
  - `Fixo (Ajustado)`: Receita recorrente com ajuste manual pontual registrado para aquele mês.
  - `Variável`: Receita pontual daquele mês (dividendos, freelas, cashback, etc.).
- **Exclusão Segura**: Ao clicar no ícone de **Excluir (🗑️)** em uma receita recorrente, o sistema permite escolher entre ocultar apenas naquele mês específico ou remover a regra definitivamente de todos os meses.

---

## 🚀 Como Executar

Basta abrir o arquivo **`index.html`** em qualquer navegador moderno (Google Chrome, Edge, Firefox, Brave).
- Funciona tanto via duplo clique no arquivo `index.html` quanto via Live Server / servidor HTTP local.
