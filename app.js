
"use strict";

const STORAGE_KEY = "controleFinanceiroPremium.v1";
const BILLS_KEY = "controleFinanceiroPremium.bills.v1";
const SALARIES_KEY = "controleFinanceiroPremium.salaries.v1";
const GYM_KEY = "controleFinanceiroPremium.gym.v1";

const $ = id => document.getElementById(id);

const form = $("transactionForm");
let transactions = loadJSON(STORAGE_KEY, []).filter(validTransaction);
let bills = loadJSON(BILLS_KEY, []);
let salaries = loadJSON(SALARIES_KEY, []);
let gymGoal = loadJSON(GYM_KEY, null);

function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    alert("Não foi possível salvar. Verifique o espaço disponível.");
    return false;
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

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
}

function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* Armazenamento de arquivos no navegador */
function openFileDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ControleFinanceiroArquivos", 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("arquivos")) {
        db.createObjectStore("arquivos");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeFile(key, file) {
  const db = await openFileDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("arquivos", "readwrite");
    tx.objectStore("arquivos").put(file, key);
    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getFile(key) {
  const db = await openFileDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction("arquivos", "readonly");
    const request = tx.objectStore("arquivos").get(key);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function downloadStoredFile(key, filename) {
  try {
    const file = await getFile(key);
    if (!file) {
      alert("O arquivo não foi encontrado neste dispositivo.");
      return;
    }

    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "documento";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch {
    alert("Não foi possível abrir o arquivo salvo.");
  }
}

/* Lançamentos financeiros existentes */
function saveTransactions() {
  if (saveJSON(STORAGE_KEY, transactions)) render();
}

function renderMonthly() {
  const now = new Date();
  const prefix =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const current = transactions.filter(t => t.date.startsWith(prefix));
  const income = current
    .filter(t => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const expenses = current
    .filter(t => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0);

  $("monthLabel").textContent = now.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
  $("monthIncome").textContent = money(income);
  $("monthExpenses").textContent = money(expenses);

  const max = Math.max(income, expenses, 1);
  $("incomeBar").style.width = `${income / max * 100}%`;
  $("expenseBar").style.width = `${expenses / max * 100}%`;
  renderSpendingDonut(current.filter(t => t.type === "expense"));
}

function renderSpendingDonut(monthExpenses) {
  const donut = $("spendingDonut");
  const legend = $("spendingLegend");
  const totalEl = $("donutTotal");
  if (!donut || !legend || !totalEl) return;

  const colors = ["#48e0a4", "#7c83ff", "#ff8b6a", "#f7c65f", "#56b8ff", "#e879f9", "#ff6b91", "#9aa9bd"];
  const groups = new Map();
  monthExpenses.forEach(t => {
    const category = t.category || "Outros";
    groups.set(category, (groups.get(category) || 0) + t.amount);
  });
  const entries = [...groups.entries()].sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  totalEl.textContent = money(total);
  legend.replaceChildren();

  if (!total || !entries.length) {
    donut.style.background = "conic-gradient(#263349 0deg 360deg)";
    const empty = document.createElement("p");
    empty.className = "empty-chart";
    empty.textContent = "Ainda não há despesas neste mês. Quando registrar, seus gastos aparecerão aqui.";
    legend.append(empty);
    return;
  }

  let cursor = 0;
  const stops = [];
  entries.forEach(([category, amount], index) => {
    const start = cursor;
    cursor += amount / total * 360;
    stops.push(`${colors[index % colors.length]} ${start}deg ${cursor}deg`);
  });
  donut.style.background = `conic-gradient(${stops.join(", ")})`;

  entries.forEach(([category, amount], index) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = colors[index % colors.length];
    const details = document.createElement("div");
    details.className = "legend-details";
    const name = document.createElement("span");
    name.className = "legend-name";
    name.textContent = category;
    const value = document.createElement("strong");
    value.textContent = money(amount);
    const percentage = document.createElement("small");
    percentage.textContent = `${Math.round(amount / total * 100)}% das despesas`;
    details.append(name, value, percentage);
    item.append(swatch, details);
    legend.append(item);
  });
}

function renderTransactions() {
  const list = $("transactionList");
  list.replaceChildren();

  if (!transactions.length) {
    list.textContent = "Nenhum lançamento registrado.";
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
      value.className = t.type === "income" ? "positive" : "negative";
      value.textContent =
        `${t.type === "income" ? "+" : "−"} ${money(t.amount)}`;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "Excluir";

      remove.addEventListener("click", () => {
        if (confirm(`Excluir "${t.description}"?`)) {
          transactions = transactions.filter(x => x.id !== t.id);
          saveTransactions();
        }
      });

      right.append(value, remove);
      row.append(details, right);
      list.append(row);
    });
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

  renderMonthly();
  renderTransactions();
  renderBills();
  renderSalaries();
  renderGym();
}

form.addEventListener("submit", event => {
  event.preventDefault();

  const description = $("description").value.trim();
  const amount = Number($("amount").value);
  const type = $("type").value;
  const date = $("date").value;
  const category = $("category").value;

  if (!description || !Number.isFinite(amount) || amount <= 0 || !date) {
    alert("Preencha a descrição, o valor e a data corretamente.");
    return;
  }

  transactions.push({
    id: makeId(),
    description,
    amount: Math.round(amount * 100) / 100,
    type,
    date,
    category
  });

  saveTransactions();
  form.reset();
  $("date").value = today();
});

/* Contas a pagar */
$("billForm").addEventListener("submit", event => {
  event.preventDefault();

  const description = $("billDescription").value.trim();
  const amount = Number($("billAmount").value);
  const dueDate = $("billDueDate").value;
  const recurrence = $("billRecurrence").value;

  if (!description || amount <= 0 || !dueDate) {
    alert("Confira o nome, o valor e o vencimento.");
    return;
  }

  bills.push({
    id: makeId(),
    description,
    amount: Math.round(amount * 100) / 100,
    dueDate,
    recurrence,
    status: "pending",
    paidTransactionId: null
  });

  if (!saveJSON(BILLS_KEY, bills)) return;

  $("billForm").reset();
  render();
});

function renderBills() {
  const list = $("billList");
  const summary = $("billSummary");
  if (!list || !summary) return;

  list.replaceChildren();

  const pending = bills.filter(b => b.status !== "paid");
  const total = pending.reduce((sum, b) => sum + b.amount, 0);

  summary.textContent =
    `${pending.length} conta(s) pendente(s) · Total: ${money(total)}`;

  [...bills]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .forEach(b => {
      const row = document.createElement("article");
      row.className = "transaction";

      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = b.description;

      const meta = document.createElement("p");
      const due = b.dueDate.split("-").reverse().join("/");
      const recurrence = b.recurrence === "monthly"
        ? "Mensal"
        : "Única";

      const status = b.status === "paid"
        ? "Paga"
        : b.dueDate < today() ? "VENCIDA" : "Pendente";

      meta.textContent =
        `Vence: ${due} · ${recurrence} · ${status}`;

      info.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "transaction-right";

      const amount = document.createElement("strong");
      amount.textContent = money(b.amount);
      actions.append(amount);

      if (b.status !== "paid") {
        const paid = document.createElement("button");
        paid.type = "button";
        paid.textContent = "Marcar como paga";

        paid.addEventListener("click", () => {
          if (!confirm(
            `Confirmar o pagamento de "${b.description}" por ${money(b.amount)}?`
          )) return;

          const txId = makeId();
          const tx = {
            id: txId,
            description: b.description,
            amount: b.amount,
            type: "expense",
            date: today(),
            category: "Contas"
          };

          b.status = "paid";
          b.paidTransactionId = txId;

          if (!saveJSON(BILLS_KEY, bills)) {
            b.status = "pending";
            b.paidTransactionId = null;
            return;
          }

          transactions.push(tx);
          saveTransactions();
        });

        actions.append(paid);
      }

      row.append(info, actions);
      list.append(row);
    });
}

/* Salário e holerite */
$("salaryForm").addEventListener("submit", async event => {
  event.preventDefault();

  const month = $("salaryMonth").value;
  const net = Number($("salaryNet").value);
  const file = $("salaryFile").files[0];

  if (!month || !Number.isFinite(net) || net < 0) {
    alert("Informe o mês e o salário líquido.");
    return;
  }

  let record = salaries.find(s => s.month === month);
  const previous = record ? { ...record } : null;
  const fileKey = file ? `salary-${month}-${makeId()}` : record?.fileKey || null;

  if (file && file.size > 8 * 1024 * 1024) {
    alert("O arquivo ultrapassa 8 MB. Comprima o arquivo e tente novamente.");
    return;
  }

  try {
    if (file) await storeFile(fileKey, file);
  } catch {
    alert("Não foi possível guardar o arquivo neste dispositivo.");
    return;
  }

  const txDate = today();
  let salaryTx = record?.transactionId
    ? transactions.find(t => t.id === record.transactionId)
    : null;

  if (salaryTx) {
    salaryTx.amount = Math.round(net * 100) / 100;
    salaryTx.date = txDate;
  } else {
    salaryTx = {
      id: makeId(),
      description: `Salário líquido - ${month}`,
      amount: Math.round(net * 100) / 100,
      type: "income",
      date: txDate,
      category: "Salário"
    };
    transactions.push(salaryTx);
  }

  record = {
    month,
    net: Math.round(net * 100) / 100,
    fileKey,
    fileName: file?.name || record?.fileName || "",
    transactionId: salaryTx.id
  };

  salaries = salaries.filter(s => s.month !== month);
  salaries.push(record);

  if (!saveJSON(SALARIES_KEY, salaries)) {
    if (previous) salaries.push(previous);
    return;
  }

  if (!saveJSON(STORAGE_KEY, transactions)) return;

  $("salaryForm").reset();
  $("salaryMonth").value = monthNow();
  render();
  alert("Salário registrado. Confira se o valor corresponde ao holerite.");
});

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function renderSalaries() {
  const list = $("salaryList");
  if (!list) return;

  list.replaceChildren();

  [...salaries]
    .sort((a, b) => b.month.localeCompare(a.month))
    .forEach(s => {
      const row = document.createElement("article");
      row.className = "transaction";

      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = `Salário — ${s.month}`;

      const meta = document.createElement("p");
      meta.textContent = `Líquido registrado: ${money(s.net)}`;
      info.append(title, meta);
      row.append(info);

      if (s.fileKey && s.fileName) {
        const download = document.createElement("button");
        download.type = "button";
        download.className = "secondary";
        download.textContent = "Abrir holerite";
        download.addEventListener("click", () =>
          downloadStoredFile(s.fileKey, s.fileName)
        );
        row.append(download);
      }

      list.append(row);
    });
}

/* Gastos extras */
$("extraDate").value = today();

$("extraExpenseForm").addEventListener("submit", async event => {
  event.preventDefault();

  const description = $("extraDescription").value.trim();
  const amount = Number($("extraAmount").value);
  const date = $("extraDate").value;
  const file = $("extraReceipt").files[0];

  if (!description || amount <= 0 || !date) {
    alert("Preencha a descrição, o valor total e a data.");
    return;
  }

  if (file && file.size > 8 * 1024 * 1024) {
    alert("A imagem ultrapassa 8 MB. Escolha uma imagem menor.");
    return;
  }

  const receiptKey = file ? `receipt-${makeId()}` : null;

  if (file) {
    try {
      await storeFile(receiptKey, file);
    } catch {
      alert("Não foi possível guardar a foto. Tente novamente sem o anexo.");
      return;
    }
  }

  transactions.push({
    id: makeId(),
    description,
    amount: Math.round(amount * 100) / 100,
    type: "expense",
    date,
    category: "Gastos extras",
    receiptKey,
    receiptName: file?.name || ""
  });

  saveTransactions();
  $("extraExpenseForm").reset();
  $("extraDate").value = today();
  $("receiptStatus").textContent = "Gasto registrado.";
});

/* Taxa PicPay */
$("picpayCalculate").addEventListener("click", () => {
  const amount = Number($("picpayAmount").value);

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Informe um valor maior que zero.");
    return;
  }

  const fee = Math.round(amount * 0.0309 * 100) / 100;
  const net = Math.round((amount - fee) * 100) / 100;

  $("picpayFeeResult").textContent =
    `Taxa estimada: ${money(fee)} · Valor líquido estimado: ${money(net)}. ` +
    "Confirme se a taxa de 3,09% se aplica à sua operação.";
});

$("picpayImport").addEventListener("click", async () => {
  const file = $("picpayFile").files[0];

  if (!file) {
    alert("Selecione primeiro o arquivo do extrato.");
    return;
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    alert("Nesta primeira versão, a conferência automática aceita CSV. " +
      "Para PDF, confira os valores e registre-os manualmente.");
    return;
  }

  try {
    const text = await file.text();
    const preview = $("picpayPreview");
    preview.replaceChildren();

    const note = document.createElement("p");
    note.textContent =
      "Prévia do extrato. Confira as linhas abaixo; nada será lançado automaticamente.";
    preview.append(note);

    const lines = text.split(/\r?\n/).filter(line => line.trim()).slice(0, 21);

    lines.forEach(line => {
      const item = document.createElement("p");
      item.textContent = line.slice(0, 500);
      preview.append(item);
    });

    if (text.split(/\r?\n/).filter(line => line.trim()).length > 21) {
      const more = document.createElement("p");
      more.textContent =
        "Exibidas as primeiras 20 linhas de dados, além do cabeçalho.";
      preview.append(more);
    }
  } catch {
    alert("Não foi possível ler o CSV.");
  }
});

/* Leitura experimental do QR Code da nota */
$("scanReceipt").addEventListener("click", async () => {
  const file = $("extraReceipt").files[0];
  const status = $("receiptStatus");

  if (!file) {
    status.textContent = "Escolha uma foto da nota fiscal primeiro.";
    return;
  }

  if (!("BarcodeDetector" in window)) {
    status.textContent =
      "Este navegador não oferece leitura de QR Code por esta função. " +
      "Digite o valor total da nota manualmente.";
    return;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const codes = await detector.detect(bitmap);
    bitmap.close();

    if (!codes.length) {
      status.textContent =
        "Não encontrei um QR Code legível. Digite o valor total manualmente.";
      return;
    }

    const raw = codes[0].rawValue;
    let extracted = null;

    try {
      const url = new URL(raw);
      for (const key of ["vNF", "valor", "total", "vlr"]) {
        const candidate = Number(
          (url.searchParams.get(key) || "").replace(",", ".")
        );
        if (Number.isFinite(candidate) && candidate > 0) {
          extracted = candidate;
          break;
        }
      }
    } catch {
      // O conteúdo do QR pode não ser uma URL.
    }

    if (extracted !== null) {
      $("extraAmount").value = extracted.toFixed(2);
      status.textContent =
        `Valor sugerido: ${money(extracted)}. Confira com a nota antes de registrar.`;
    } else {
      status.textContent =
        "QR Code lido, mas não foi possível identificar o total com segurança. " +
        "Confira a nota e digite o valor total.";
    }
  } catch {
    status.textContent =
      "Não foi possível ler essa imagem. Digite o valor total manualmente.";
  }
});

/* Meta da academia */
$("gymGoalForm").addEventListener("submit", event => {
  event.preventDefault();

  const name = $("gymGoalName").value.trim();
  const target = Number($("gymGoalTarget").value);
  const saved = Number($("gymGoalSaved").value);

  if (!name || target <= 0 || saved < 0) {
    alert("Confira o nome da meta e os valores.");
    return;
  }

  gymGoal = {
    name,
    target: Math.round(target * 100) / 100,
    saved: Math.round(saved * 100) / 100
  };

  if (saveJSON(GYM_KEY, gymGoal)) renderGym();
});

function renderGym() {
  const summary = $("gymGoalSummary");
  if (!summary) return;

  summary.replaceChildren();

  if (!gymGoal) {
    summary.textContent = "Cadastre o custo estimado para acompanhar sua meta.";
    return;
  }

  const balance = transactions.reduce((sum, t) =>
    sum + (t.type === "income" ? t.amount : -t.amount), 0);

  const pending = bills
    .filter(b => b.status !== "paid")
    .reduce((sum, b) => sum + b.amount, 0);

  const available = balance - pending;
  const remaining = Math.max(0, gymGoal.target - gymGoal.saved);
  const percent = Math.min(100, gymGoal.saved / gymGoal.target * 100);

  const title = document.createElement("h3");
  title.textContent = gymGoal.name;

  const details = document.createElement("p");
  details.textContent =
    `Meta: ${money(gymGoal.target)} · Guardado: ${money(gymGoal.saved)} · ` +
    `Falta: ${money(remaining)}`;

  const progress = document.createElement("progress");
  progress.max = 100;
  progress.value = percent;
  progress.style.width = "100%";

  const availableText = document.createElement("p");
  availableText.textContent =
    `Saldo dos lançamentos menos contas pendentes: ${money(available)}. ` +
    "É uma estimativa, não uma garantia de dinheiro disponível.";

  summary.append(title, details, progress, availableText);
}

/* Backup dos lançamentos */
$("exportButton").addEventListener("click", () => {
  const backup = {
    app: "Controle Financeiro Premium",
    version: 2,
    exportedAt: new Date().toISOString(),
    transactions,
    bills,
    salaries,
    gymGoal
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `backup-financeiro-${today()}.json`;
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
      "A importação substituirá os lançamentos atuais. " +
      "Exporte um backup antes de continuar. Deseja prosseguir?"
    )) return;

    transactions = items;
    if (!saveJSON(STORAGE_KEY, transactions)) return;

    if (Array.isArray(data.bills)) {
      bills = data.bills;
      saveJSON(BILLS_KEY, bills);
    }
    if (Array.isArray(data.salaries)) {
      salaries = data.salaries;
      saveJSON(SALARIES_KEY, salaries);
    }
    if (data.gymGoal) {
      gymGoal = data.gymGoal;
      saveJSON(GYM_KEY, gymGoal);
    }

    render();
    $("importFile").value = "";
    alert("Dados importados. Confira os valores e o histórico.");
  } catch {
    alert("Não foi possível importar. Verifique se o arquivo é válido.");
  }
});

/* Conexão e inicialização */
function updateConnectionStatus() {
  $("connectionStatus").textContent =
    navigator.onLine ? "Online" : "Modo offline";
}

window.addEventListener("online", updateConnectionStatus);
window.addEventListener("offline", updateConnectionStatus);

$("date").value = today();
$("extraDate").value = today();
$("salaryMonth").value = monthNow();

updateConnectionStatus();
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .catch(error => console.error("Falha no suporte offline:", error));
  });
}
