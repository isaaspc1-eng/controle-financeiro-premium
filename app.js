
"use strict";

const STORAGE_KEY = "controleFinanceiroPremium.v1";

const $ = (id) => document.getElementById(id);
const form = $("transactionForm");

let transactions = loadTransactions();

function loadTransactions() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(validTransaction) : [];
  } catch {
    return [];
  }
}

function validTransaction(item) {
  return item &&
    typeof item.id === "string" &&
    typeof item.description === "string" &&
    Number.isFinite(item.amount) &&
    item.amount > 0 &&
    ["income", "expense"].includes(item.type) &&
    typeof item.date === "string" &&
    typeof item.category === "string";
}

function saveTransactions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    render();
  } catch {
    alert("Não foi possível salvar. Verifique o espaço disponível no navegador.");
  }
}

function money(value) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function dateToday() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function render() {
  const income = transactions
    .filter(t => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);

  const expenses = transactions
    .filter(t => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  $("balance").textContent = money(income - expenses);
  $("income").textContent = money(income);
  $("expenses").textContent = money(expenses);

  const list = $("transactionList");
  list.replaceChildren();

  if (transactions.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Nenhum lançamento registrado.";
    list.append(empty);
    return;
  }

  [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach(t => {
      const row = document.createElement("article");
      row.className = "transaction";

      const details = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = t.description;

      const meta = document.createElement("p");
      meta.textContent = `${t.date} · ${t.category}`;

      details.append(title, meta);

      const right = document.createElement("div");
      right.className = "transaction-right";

      const value = document.createElement("strong");
      value.textContent =
        `${t.type === "income" ? "+" : "−"} ${money(t.amount)}`;
      value.className = t.type === "income" ? "positive" : "negative";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "Excluir";
      remove.addEventListener("click", () => {
        if (confirm(`Excluir o lançamento "${t.description}"?`)) {
          transactions = transactions.filter(item => item.id !== t.id);
          saveTransactions();
        }
      });

      right.append(value, remove);
      row.append(details, right);
      list.append(row);
    });
}

form.addEventListener("submit", event => {
  event.preventDefault();

  const description = $("description").value.trim();
  const amount = Number($("amount").value);
  const type = $("type").value;
  const date = $("date").value;
  const category = $("category").value;

  if (!description || !Number.isFinite(amount) || amount <= 0 || !date) {
    alert("Preencha a descrição, um valor válido e a data.");
    return;
  }

  transactions.push({
    id: crypto.randomUUID(),
    description,
    amount: Math.round(amount * 100) / 100,
    type,
    date,
    category
  });

  saveTransactions();
  form.reset();
  $("date").value = dateToday();
  $("description").focus();
});

$("exportButton").addEventListener("click", () => {
  const backup = {
    app: "Controle Financeiro Premium",
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `backup-financeiro-${dateToday()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("importButton").addEventListener("click", async () => {
  const file = $("importFile").files[0];

  if (!file) {
    alert("Selecione um arquivo de backup JSON primeiro.");
    return;
  }

  try {
    const data = JSON.parse(await file.text());
    const items = Array.isArray(data) ? data : data.transactions;

    if (!Array.isArray(items) || !items.every(validTransaction)) {
      throw new Error("Formato inválido");
    }

    if (!confirm(
      "A importação substituirá os registros atuais. " +
      "Exporte um backup antes de continuar. Deseja prosseguir?"
    )) return;

    transactions = items;
    saveTransactions();
    $("importFile").value = "";
    alert("Backup importado. Confira os valores e o histórico.");
  } catch {
    alert("Não foi possível importar. Verifique se o arquivo é um backup JSON válido.");
  }
});

function updateConnectionStatus() {
  const status = $("connectionStatus");
  status.textContent = navigator.onLine ? "Online" : "Modo offline";
}

window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);

$("date").value = dateToday();
updateConnectionStatus();
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .catch((error) => {
        console.error("Falha ao registrar o suporte offline:", error);
      });
  });
}
