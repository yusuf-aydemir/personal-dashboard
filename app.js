const STORAGE_KEY = "personal-area-v1";
const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const LEGACY_CATEGORY_NAMES = {
  groceries: "Market & yemek",
  dining: "Dışarıda yeme-içme",
  transport: "Ulaşım",
  personal: "Kişisel harcamalar",
  social: "Sosyal & eğlence",
  savings: "Birikim",
};
const CURRENCY_SYMBOLS = { TRY: "₺", EUR: "€", USD: "$", GBP: "£" };
const VIEW_COPY = {
  overview: ["Genel bakış", "Finansını ve haftanı tek bir yerden takip et."],
  finance: ["Finans", "Gelirini, sabit giderlerini ve aylık bütçeni düzenle."],
  weekly: ["Haftalık plan", "Boş ve meşgul zamanlarını tek bir tabloda gör."],
};
const makeEmptySchedule = () => DAYS.map(() => Array(18).fill(null));

function createDefaultState() {
  return {
    currency: "TRY",
    income: 0,
    fixedExpenses: [],
    expenses: [],
    categories: [],
    schedule: makeEmptySchedule(),
  };
}

const notice = document.querySelector("#app-notice");

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = false;
}

function hideNotice() {
  notice.textContent = "";
  notice.hidden = true;
}

function isValidState(value) {
  return value
    && typeof value === "object"
    && typeof value.income === "number"
    && Number.isFinite(value.income)
    && Array.isArray(value.fixedExpenses)
    && value.fixedExpenses.every((expense) => expense
      && typeof expense.id === "string"
      && typeof expense.title === "string"
      && Number.isFinite(expense.amount)
      && expense.amount >= 0)
    && Array.isArray(value.expenses)
    && value.expenses.every((expense) => expense
      && typeof expense.id === "string"
      && typeof expense.category === "string"
      && Number.isFinite(expense.amount)
      && expense.amount > 0
      && typeof expense.note === "string"
      && Number.isFinite(expense.createdAt))
    && (value.categories === undefined || (Array.isArray(value.categories)
      && value.categories.every((category) => category
        && typeof category.id === "string"
        && typeof category.name === "string"
        && category.name.trim().length > 0
        && Number.isFinite(category.amount)
        && category.amount >= 0)))
    && Array.isArray(value.schedule)
    && value.schedule.length === DAYS.length
    && value.schedule.every((day) => Array.isArray(day)
      && day.length === 18
      && day.every((slot) => slot === null || slot === "free" || slot === "busy"));
}

function loadState() {
  let stored;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    showNotice("Tarayıcı bu cihazda veri saklamaya izin vermiyor. Değişiklikler bu oturumdan sonra korunmayabilir.");
    return createDefaultState();
  }
  if (!stored) return createDefaultState();

  try {
    const parsed = JSON.parse(stored);
    if (!isValidState(parsed)) throw new TypeError("Invalid saved state");
    const defaults = createDefaultState();
    return {
      ...defaults,
      ...parsed,
      currency: CURRENCY_SYMBOLS[parsed.currency] ? parsed.currency : defaults.currency,
      categories: parsed.categories ?? [],
      expenses: parsed.expenses.map((expense) => ({
        ...expense,
        categoryName: expense.categoryName || LEGACY_CATEGORY_NAMES[expense.category] || "Kaldırılmış kategori",
      })),
    };
  } catch {
    showNotice("Kaydedilmiş veriler okunamadı; yeni bir başlangıç gösteriliyor. Bu kayıt, yeni bir değişiklik kaydedilene kadar korunur.");
    return createDefaultState();
  }
}

let state = loadState();
let hasPersistenceWarning = !notice.hidden;

function saveState(message = "Değişiklikler bu cihazda kaydedildi.") {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (hasPersistenceWarning) {
      hasPersistenceWarning = false;
      showNotice("Yeni başlangıç bu cihazda kaydedildi. Bu cihazdaki önceki kayıt artık değiştirildi.");
    } else {
      showNotice(message);
    }
    return true;
  } catch {
    showNotice("Tarayıcı değişiklikleri kaydedemedi. Depolama alanı veya tarayıcı gizlilik ayarlarını kontrol et.");
    return false;
  }
}

function money(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: state.currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function sumFixedExpenses() {
  return state.fixedExpenses.reduce((total, item) => total + item.amount, 0);
}

function isCurrentMonth(expense) {
  const date = new Date(expense.createdAt);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
}

function sumExpenses(categoryId) {
  return state.expenses
    .filter((expense) => isCurrentMonth(expense) && (!categoryId || expense.category === categoryId))
    .reduce((total, expense) => total + expense.amount, 0);
}

function remainingIncome() {
  return state.income - sumFixedExpenses();
}

function assignedBudget(categoryId) {
  return state.categories.find((category) => category.id === categoryId)?.amount ?? 0;
}

function categoryName(categoryId) {
  return state.categories.find((category) => category.id === categoryId)?.name ?? "Kaldırılmış kategori";
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderSummary() {
  const fixed = sumFixedExpenses();
  const spent = sumExpenses();
  document.querySelector("#summary-income").textContent = money(state.income);
  document.querySelector("#summary-fixed").textContent = money(fixed);
  document.querySelector("#summary-spent").textContent = money(spent);
  document.querySelector("#summary-available").textContent = money(state.income - fixed - spent);
}

function renderOverviewBudgets() {
  const container = document.querySelector("#overview-budgets");
  container.replaceChildren();

  if (state.categories.length === 0) {
    container.append(makeElement("p", "empty-state", "Henüz bütçe kategorisi eklemedin."));
  }

  state.categories.slice(0, 4).forEach((category) => {
    const budget = assignedBudget(category.id);
    const spent = sumExpenses(category.id);
    const row = makeElement("div", "compact-budget");
    row.append(makeElement("span", "compact-budget-label", category.name));

    const track = makeElement("div", "mini-track");
    const fill = makeElement("div", "mini-fill");
    const ratio = budget > 0 ? spent / budget : spent > 0 ? 1 : 0;
    fill.style.width = `${Math.min(ratio * 100, 100)}%`;
    if (ratio > 1) fill.classList.add("is-over");
    track.append(fill);
    row.append(track, makeElement("span", "compact-budget-value", money(budget)));
    container.append(row);
  });
}

function renderFixedExpenses() {
  const list = document.querySelector("#fixed-expense-list");
  list.replaceChildren();
  document.querySelector("#fixed-total").textContent = money(sumFixedExpenses());

  state.fixedExpenses.forEach((expense) => {
    const row = makeElement("div", "fixed-item");
    const title = document.createElement("input");
    title.type = "text";
    title.maxLength = 50;
    title.value = expense.title;
    title.setAttribute("aria-label", "Sabit gider adı");
    title.addEventListener("change", () => {
      const newTitle = title.value.trim();
      if (!newTitle) {
        showNotice("Sabit gider adı boş bırakılamaz.");
        title.value = expense.title;
        return;
      }
      expense.title = newTitle;
      saveState();
      renderFinance();
    });

    const amount = document.createElement("input");
    amount.type = "number";
    amount.min = "0";
    amount.step = "0.01";
    amount.inputMode = "decimal";
    amount.value = String(expense.amount);
    amount.setAttribute("aria-label", `${expense.title} aylık tutarı`);
    amount.addEventListener("change", () => {
      const newAmount = Number(amount.value);
      if (!Number.isFinite(newAmount) || newAmount < 0) {
        showNotice("Sabit gider tutarı sıfır veya daha büyük olmalı.");
        amount.value = String(expense.amount);
        return;
      }
      expense.amount = newAmount;
      saveState();
      renderFinance();
    });

    const remove = makeElement("button", "icon-button", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `${expense.title} giderini sil`);
    remove.addEventListener("click", () => {
      state.fixedExpenses = state.fixedExpenses.filter((item) => item.id !== expense.id);
      saveState("Sabit gider silindi.");
      renderAll();
    });
    row.append(title, amount, remove);
    list.append(row);
  });
}

function renderBudgets() {
  const container = document.querySelector("#budget-list");
  container.replaceChildren();
  const available = Math.max(0, remainingIncome());
  const allocated = state.categories.reduce((total, category) => total + category.amount, 0);
  const unallocated = available - allocated;
  document.querySelector("#budget-available").textContent = money(available);
  document.querySelector("#budget-total-allocated").textContent = money(allocated);
  document.querySelector("#budget-unallocated").textContent = money(unallocated);
  const warning = document.querySelector("#budget-warning");
  warning.hidden = unallocated >= 0;
  warning.textContent = unallocated < 0
    ? `Kategorilere ayırdığın tutar kullanılabilir paranı ${money(Math.abs(unallocated))} aşıyor. Tutarları dilediğin gibi değiştirebilirsin.`
    : "";

  if (state.categories.length === 0) {
    container.append(makeElement("p", "empty-state", "Henüz kategori eklemedin. Aşağıdan adını ve bütçe tutarını gir."));
  }

  state.categories.forEach((category) => {
    const budget = assignedBudget(category.id);
    const spent = sumExpenses(category.id);
    const left = budget - spent;
    const ratio = budget > 0 ? spent / budget : spent > 0 ? 1 : 0;
    const row = makeElement("div", "budget-row");

    const identity = makeElement("div", "budget-category");
    identity.append(makeElement("span", "category-icon", "₺"));
    const info = document.createElement("div");
    info.append(makeElement("span", "budget-name", category.name));
    info.append(makeElement("span", "budget-share", "Aylık bütçe"));
    identity.append(info);
    row.append(identity);

    const progressWrap = makeElement("div", "budget-progress-wrap");
    const track = makeElement("div", "progress-track");
    const fill = makeElement("div", "progress-fill");
    fill.style.width = `${Math.min(ratio * 100, 100)}%`;
    if (ratio > 1) fill.classList.add("is-over");
    track.append(fill);
    const caption = makeElement("div", "budget-caption");
    caption.append(
      makeElement("span", "", `Harcanan ${money(spent)}`),
      makeElement("span", "", `Bütçe ${money(budget)}`),
    );
    progressWrap.append(track, caption);
    row.append(progressWrap);

    const values = makeElement("div", "budget-values");
    const amountInput = document.createElement("input");
    amountInput.className = "budget-amount-input";
    amountInput.type = "number";
    amountInput.min = "0";
    amountInput.step = "0.01";
    amountInput.inputMode = "decimal";
    amountInput.value = String(budget);
    amountInput.setAttribute("aria-label", `${category.name} için aylık bütçe tutarı`);
    amountInput.addEventListener("change", () => {
      const value = Number(amountInput.value);
      if (!Number.isFinite(value) || value < 0) {
        showNotice("Kategori bütçesi sıfır veya daha büyük bir tutar olmalı.");
        amountInput.value = String(category.amount);
        return;
      }
      category.amount = value;
      saveState("Kategori bütçesi güncellendi.");
      renderAll();
    });
    values.append(amountInput);
    const remaining = makeElement("span", left < 0 ? "is-negative" : "", `${left < 0 ? "Bütçe aşıldı" : "Kalan"} ${money(Math.abs(left))}`);
    values.append(remaining);
    row.append(values);

    const remove = makeElement("button", "icon-button", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `${category.name} kategorisini ve bütçesini kaldır`);
    remove.title = "Kategori ve bütçeyi kaldır; geçmiş harcamalar korunur";
    remove.addEventListener("click", () => {
      state.categories = state.categories.filter((item) => item.id !== category.id);
      saveState("Kategori ve bütçe kaldırıldı. Bu kategoriye ait geçmiş harcamalar korunuyor.");
      renderAll();
    });
    row.append(remove);
    container.append(row);
  });
}

function renderExpenseCategoryOptions() {
  const select = document.querySelector("#expense-category");
  const selected = select.value;
  select.replaceChildren();
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = state.categories.length ? "Kategori seç" : "Önce bütçe kategorisi ekle";
  emptyOption.disabled = state.categories.length > 0;
  emptyOption.selected = !state.categories.some((category) => category.id === selected);
  select.append(emptyOption);
  state.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    select.append(option);
  });
  if (state.categories.some((category) => category.id === selected)) select.value = selected;
  document.querySelector("#expense-category-empty").hidden = state.categories.length > 0;
  document.querySelector("#expense-form button[type='submit']").disabled = state.categories.length === 0;
}

function renderExpenseHistory() {
  const list = document.querySelector("#expense-list");
  const empty = document.querySelector("#expenses-empty");
  list.replaceChildren();
  const expenses = state.expenses
    .filter(isCurrentMonth)
    .sort((a, b) => b.createdAt - a.createdAt);
  empty.hidden = expenses.length > 0;
  document.querySelector("#month-spent-total").textContent = money(sumExpenses());

  expenses.forEach((expense) => {
    const item = makeElement("li", "expense-item");
    const description = document.createElement("div");
    const name = expense.categoryName || categoryName(expense.category);
    description.append(makeElement("span", "expense-item-title", expense.note.trim() || name));
    const date = new Date(expense.createdAt);
    description.append(makeElement("span", "expense-item-meta", `${name} · ${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(date)}`));
    const amount = makeElement("span", "expense-item-amount", money(expense.amount));
    const remove = makeElement("button", "icon-button", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `${money(expense.amount)} harcamayı sil`);
    remove.addEventListener("click", () => {
      state.expenses = state.expenses.filter((itemToKeep) => itemToKeep.id !== expense.id);
      saveState("Harcama silindi.");
      renderAll();
    });
    item.append(description, amount, remove);
    list.append(item);
  });
}

function renderFinance() {
  document.querySelector("#income-input").value = String(state.income || "");
  document.querySelector("#currency-select").value = state.currency;
  document.querySelector("#income-currency").textContent = CURRENCY_SYMBOLS[state.currency];
  renderFixedExpenses();
  renderBudgets();
  renderExpenseCategoryOptions();
  renderExpenseHistory();
}

function describeSlot(value) {
  if (value === "free") return "Boş";
  if (value === "busy") return "Meşgul";
  return "Planlanmadı";
}

function nextSlot(value) {
  if (value === null) return "free";
  if (value === "free") return "busy";
  return null;
}

function renderSchedule() {
  const table = document.querySelector("#schedule-table");
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headerRow.append(makeElement("th", "", "Saat"));

  DAYS.forEach((day) => {
    const th = document.createElement("th");
    th.append(document.createTextNode(day.slice(0, 3)));
    th.append(makeElement("span", "", day));
    headerRow.append(th);
  });
  head.append(headerRow);

  const body = document.createElement("tbody");
  for (let hourIndex = 0; hourIndex < 18; hourIndex += 1) {
    const row = document.createElement("tr");
    row.append(makeElement("td", "", `${String(hourIndex + 6).padStart(2, "0")}:00`));

    DAYS.forEach((day, dayIndex) => {
      const cell = document.createElement("td");
      const value = state.schedule[dayIndex][hourIndex];
      const button = makeElement("button", `schedule-slot${value ? ` schedule-slot--${value}` : ""}`);
      button.type = "button";
      button.setAttribute("aria-label", `${day}, ${String(hourIndex + 6).padStart(2, "0")}:00–${String(hourIndex + 7).padStart(2, "0")}:00: ${describeSlot(value)}. Değiştirmek için dokun.`);
      button.setAttribute("aria-pressed", String(value !== null));
      button.title = `${day} ${String(hourIndex + 6).padStart(2, "0")}:00–${String(hourIndex + 7).padStart(2, "0")}:00 · ${describeSlot(value)}`;
      button.addEventListener("click", () => {
        state.schedule[dayIndex][hourIndex] = nextSlot(state.schedule[dayIndex][hourIndex]);
        saveState("Haftalık plan güncellendi.");
        renderSchedule();
      });
      cell.append(button);
      row.append(cell);
    });
    body.append(row);
  }
  table.replaceChildren(head, body);
}

function renderAll() {
  renderSummary();
  renderOverviewBudgets();
  renderFinance();
  renderSchedule();
}

function setView(viewName) {
  if (!VIEW_COPY[viewName]) return;
  document.querySelectorAll(".view").forEach((view) => {
    view.hidden = view.id !== `${viewName}-view`;
  });
  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.dataset.view === viewName;
    link.classList.toggle("is-active", active);
    link.setAttribute("aria-current", active ? "page" : "false");
  });
  document.querySelector("#page-title").textContent = VIEW_COPY[viewName][0];
  document.querySelector("#page-subtitle").textContent = VIEW_COPY[viewName][1];
}

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.go));
});

document.querySelector("#income-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const income = Number(document.querySelector("#income-input").value);
  if (!Number.isFinite(income) || income < 0) {
    showNotice("Aylık gelir sıfır veya daha büyük bir tutar olmalı.");
    return;
  }
  state.income = income;
  saveState("Aylık gelir kaydedildi.");
  renderAll();
});

document.querySelector("#currency-select").addEventListener("change", (event) => {
  state.currency = event.target.value;
  saveState("Para birimi güncellendi.");
  renderAll();
});

document.querySelector("#fixed-expense-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const title = form.elements.title.value.trim();
  const amount = Number(form.elements.amount.value);
  if (!title || !Number.isFinite(amount) || amount < 0) {
    showNotice("Sabit gider adı ve sıfır veya daha büyük bir tutar gir.");
    return;
  }
  state.fixedExpenses.push({ id: crypto.randomUUID(), title, amount });
  saveState("Sabit gider eklendi.");
  form.reset();
  renderAll();
});

document.querySelector("#budget-category-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.title.value.trim();
  const amount = Number(form.elements.amount.value);
  if (!name || !Number.isFinite(amount) || amount < 0) {
    showNotice("Kategori adı ve sıfır veya daha büyük bir bütçe tutarı gir.");
    return;
  }
  if (state.categories.some((category) => category.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"))) {
    showNotice("Bu isimde bir bütçe kategorisi zaten var.");
    return;
  }
  state.categories.push({ id: crypto.randomUUID(), name, amount });
  saveState("Bütçe kategorisi eklendi.");
  form.reset();
  renderAll();
});

document.querySelector("#expense-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const category = form.elements.category.value;
  const selectedCategory = state.categories.find((item) => item.id === category);
  const amount = Number(form.elements.amount.value);
  if (!selectedCategory) {
    showNotice("Önce 3. adımda bir bütçe kategorisi ekle.");
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    showNotice("Harcama tutarı sıfırdan büyük olmalı.");
    return;
  }
  state.expenses.push({
    id: crypto.randomUUID(),
    category,
    categoryName: selectedCategory.name,
    amount,
    note: form.elements.note.value.trim(),
    createdAt: Date.now(),
  });
  saveState("Harcama eklendi.");
  form.reset();
  renderAll();
});

renderAll();
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    showNotice("Uygulama çevrimdışı kullanım için hazırlanamadı; internet bağlantısı gerekir.");
  });
}
