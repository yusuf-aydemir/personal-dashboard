import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";

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
const JOB_STATUSES = {
  saved: "Kaydedildi",
  applied: "Başvuruldu",
  interview: "Görüşme",
  offer: "Teklif",
  rejected: "Olumsuz",
};
const VIEW_COPY = {
  overview: ["Genel bakış", "Finansını ve haftanı tek bir yerden takip et."],
  finance: ["Finans", "Gelirini, sabit giderlerini ve aylık bütçeni düzenle."],
  weekly: ["Haftalık plan", "Boş ve meşgul zamanlarını tek bir tabloda gör."],
  jobs: ["İş ilanları", "İlanlarını ve başvuru sürecini takip et."],
};
const makeEmptySchedule = () => DAYS.map(() => Array(18).fill(null));

function createDefaultState() {
  return {
    currency: "TRY",
    income: 0,
    fixedExpenses: [],
    expenses: [],
    categories: [],
    jobs: [],
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
    && (value.jobs === undefined || (Array.isArray(value.jobs)
      && value.jobs.every((job) => job
        && typeof job.id === "string"
        && typeof job.title === "string"
        && typeof job.company === "string"
        && typeof job.url === "string"
        && typeof job.location === "string"
        && typeof job.notes === "string"
        && Object.hasOwn(JOB_STATUSES, job.status)
        && Number.isFinite(job.createdAt)
        && Number.isFinite(job.updatedAt))))
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
      jobs: parsed.jobs ?? [],
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
let supabaseClientPromise;
let authSession = null;
let accountEmail = "";
let loadingRemoteJobs = false;

function saveState(message = "Değişiklikler bu cihazda kaydedildi.") {
  try {
    const savedState = authSession ? { ...state, jobs: [] } : state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
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

function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("https://esm.sh/@supabase/supabase-js@2")
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY));
  }
  return supabaseClientPromise;
}

function updateAccountUI() {
  const accountLabel = document.querySelector("#account-label");
  const accountMessage = document.querySelector("#account-message");
  const signOutButton = document.querySelector("#account-signout");
  const emailInput = document.querySelector("#account-email");
  const accountForm = document.querySelector("#account-form");

  accountLabel.textContent = authSession ? "Hesap" : "Giriş yap";
  accountMessage.textContent = authSession
    ? `İlanların ${accountEmail} hesabında eşitleniyor.`
    : "E-posta adresine güvenli giriş bağlantısı gönderelim.";
  emailInput.hidden = Boolean(authSession);
  accountForm.querySelector(".field-label").hidden = Boolean(authSession);
  accountForm.querySelector("#account-submit").hidden = Boolean(authSession);
  signOutButton.hidden = !authSession;
}

function mapRemoteJob(job) {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    url: job.url,
    location: job.location,
    status: job.status,
    notes: job.notes,
    createdAt: new Date(job.created_at).getTime(),
    updatedAt: new Date(job.updated_at).getTime(),
  };
}

async function loadRemoteJobs(client) {
  if (!authSession || loadingRemoteJobs) return;
  loadingRemoteJobs = true;
  try {
    const { data, error } = await client
      .from("jobs")
      .select("id, title, company, url, location, status, notes, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw error;

    state.jobs = data.map(mapRemoteJob);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, jobs: [] }));
    } catch (error) {
      showNotice(`İlanlar buluttan yüklendi ancak bu cihazın diğer verileri kaydedilemedi: ${error.message}`);
    }
    renderJobs();
  } catch (error) {
    showNotice(`İlanlar Supabase'den yüklenemedi: ${error.message}`);
  } finally {
    loadingRemoteJobs = false;
  }
}

async function initializeCloudJobs() {
  try {
    const client = await getSupabaseClient();
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    authSession = session;
    accountEmail = session?.user?.email ?? "";
    updateAccountUI();
    if (session) await loadRemoteJobs(client);

    client.auth.onAuthStateChange((event, nextSession) => {
      const hadSession = Boolean(authSession);
      authSession = nextSession;
      accountEmail = nextSession?.user?.email ?? "";
      updateAccountUI();
      if (nextSession) {
        void loadRemoteJobs(client);
      } else if (event === "SIGNED_OUT" && hadSession) {
        state.jobs = [];
        saveState("Hesaptan çıkış yapıldı.");
        renderJobs();
      }
    });
  } catch (error) {
    showNotice(`Bulut bağlantısı başlatılamadı: ${error.message}`);
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

function renderJobs() {
  const list = document.querySelector("#job-list");
  const search = document.querySelector("#job-search").value.trim().toLocaleLowerCase("tr-TR");
  const statusFilter = document.querySelector("#job-status-filter").value;
  const matchingJobs = state.jobs
    .filter((job) => statusFilter === "all" || job.status === statusFilter)
    .filter((job) => !search || [job.title, job.company, job.location, job.notes]
      .some((value) => value.toLocaleLowerCase("tr-TR").includes(search)))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  list.replaceChildren();
  document.querySelector("#job-count").textContent = `${state.jobs.length} ilan`;
  const empty = document.querySelector("#jobs-empty");
  empty.hidden = matchingJobs.length > 0;
  if (state.jobs.length > 0 && matchingJobs.length === 0) {
    empty.textContent = "Aramana veya seçtiğin duruma uygun ilan bulunamadı.";
  } else {
    empty.textContent = "Henüz kaydedilmiş ilan yok.";
  }

  matchingJobs.forEach((job) => {
    const card = makeElement("article", "job-card");
    const heading = makeElement("div", "job-card-heading");
    const identity = makeElement("div", "job-card-identity");
    identity.append(makeElement("h3", "job-card-title", job.title));
    identity.append(makeElement("p", "job-card-company", job.company));
    heading.append(identity, makeElement("span", `job-status job-status--${job.status}`, JOB_STATUSES[job.status]));
    card.append(heading);

    const details = makeElement("div", "job-card-details");
    if (job.location) details.append(makeElement("span", "", job.location));
    details.append(makeElement("span", "", `Güncellendi ${new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(job.updatedAt)}`));
    card.append(details);

    if (job.notes) card.append(makeElement("p", "job-card-notes", job.notes));
    if (job.url) {
      const link = makeElement("a", "job-link", "İlanı aç ↗");
      link.href = job.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      card.append(link);
    }

    const actions = makeElement("div", "job-card-actions");
    const remove = makeElement("button", "text-button job-delete-button", "Sil");
    remove.type = "button";
    remove.addEventListener("click", () => {
      if (!window.confirm(`“${job.title}” ilanını silmek istiyor musun?`)) return;
      void deleteJob(job);
    });
    actions.append(remove);
    card.append(actions);
    list.append(card);
  });
}

async function deleteJob(job) {
  if (authSession) {
    try {
      const client = await getSupabaseClient();
      const { error } = await client.from("jobs").delete().eq("id", job.id);
      if (error) throw error;
    } catch (error) {
      showNotice(`İlan silinemedi: ${error.message}`);
      return;
    }
  }
  state.jobs = state.jobs.filter((item) => item.id !== job.id);
  saveState("İş ilanı silindi.");
  renderJobs();
}

function renderAll() {
  renderSummary();
  renderOverviewBudgets();
  renderFinance();
  renderSchedule();
  renderJobs();
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

document.querySelector("#job-search").addEventListener("input", renderJobs);
document.querySelector("#job-status-filter").addEventListener("change", renderJobs);
window.addEventListener("focus", () => {
  if (!authSession) return;
  void getSupabaseClient()
    .then(loadRemoteJobs)
    .catch((error) => showNotice(`İlanlar yenilenemedi: ${error.message}`));
});

const accountDialog = document.querySelector("#account-dialog");
document.querySelector("#account-button").addEventListener("click", () => accountDialog.showModal());
document.querySelector("#account-dialog-close").addEventListener("click", () => accountDialog.close());
document.querySelector("#account-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#account-email").value.trim();
  const submitButton = document.querySelector("#account-submit");
  submitButton.disabled = true;
  try {
    const client = await getSupabaseClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href.split("#")[0] },
    });
    if (error) throw error;
    document.querySelector("#account-message").textContent = "Giriş bağlantısını e-posta kutuna gönderdik.";
  } catch (error) {
    showNotice(`Giriş bağlantısı gönderilemedi: ${error.message}`);
  } finally {
    submitButton.disabled = false;
  }
});
document.querySelector("#account-signout").addEventListener("click", async () => {
  try {
    const client = await getSupabaseClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    accountDialog.close();
  } catch (error) {
    showNotice(`Çıkış yapılamadı: ${error.message}`);
  }
});

renderAll();
void initializeCloudJobs();
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    showNotice("Uygulama çevrimdışı kullanım için hazırlanamadı; internet bağlantısı gerekir.");
  });
}
