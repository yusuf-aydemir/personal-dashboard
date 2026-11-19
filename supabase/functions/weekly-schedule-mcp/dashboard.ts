// Pure helpers for the notes, finance and job tools. Nothing here talks to
// Supabase, so it can be unit tested with `deno test`.

export const NOTES_MAX_LENGTH = 20_000;
const MAX_AMOUNT = 1_000_000_000_000;

export const JOB_STATUSES: Record<string, string> = {
  saved: "Kaydedildi",
  applied: "Başvuruldu",
  interview: "Görüşme",
  offer: "Teklif",
  rejected: "Olumsuz",
};

export interface FixedExpense {
  id: string;
  title: string;
  amount: number;
}

export interface Category {
  id: string;
  name: string;
  amount: number;
}

export interface Expense {
  id: string;
  category: string;
  categoryName: string;
  amount: number;
  note: string;
  createdAt: number;
}

export interface Finance {
  currency: string;
  income: number;
  fixedExpenses: FixedExpense[];
  categories: Category[];
  expenses: Expense[];
}

export interface Job {
  id: string;
  title: string;
  company: string;
  url: string;
  location: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

type Args = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// ---------- input parsing ----------

export function readArgs(
  value: unknown,
  allowed: string[],
  required: string[] = [],
): Args {
  const args = value === undefined || value === null ? {} : value;
  if (!isRecord(args)) throw new TypeError("Araç girdisi bir nesne olmalı.");
  const unknown = Object.keys(args).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new TypeError(`Tanınmayan alan: ${unknown.join(", ")}.`);
  }
  for (const key of required) {
    if (args[key] === undefined || args[key] === null) {
      throw new TypeError(`${key} alanı gerekli.`);
    }
  }
  return args;
}

export function readText(
  args: Args,
  key: string,
  { min = 0, max }: { min?: number; max: number },
): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError(`${key} metin olmalı.`);
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new TypeError(
      min > 0
        ? `${key} ${min}-${max} karakter arasında olmalı.`
        : `${key} en fazla ${max} karakter olabilir.`,
    );
  }
  return text;
}

export function readAmount(
  args: Args,
  key: string,
  { allowZero }: { allowZero: boolean },
): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${key} bir sayı olmalı.`);
  }
  if (value < 0 || (!allowZero && value === 0) || value > MAX_AMOUNT) {
    throw new TypeError(
      allowZero
        ? `${key} sıfır veya daha büyük olmalı.`
        : `${key} sıfırdan büyük olmalı.`,
    );
  }
  return Math.round(value * 100) / 100;
}

export function readJobStatus(args: Args, key = "status"): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !Object.hasOwn(JOB_STATUSES, value)) {
    throw new TypeError(
      `Durum şunlardan biri olmalı: ${Object.keys(JOB_STATUSES).join(", ")}.`,
    );
  }
  return value;
}

export function readUrl(args: Args, key = "url"): string | undefined {
  const text = readText(args, key, { max: 2000 });
  if (!text) return text;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new TypeError("Bağlantı geçerli bir http veya https adresi olmalı.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError("Bağlantı geçerli bir http veya https adresi olmalı.");
  }
  return text;
}

export function readUuid(args: Args, key: string): string {
  const value = args[key];
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new TypeError(`${key} geçerli bir kimlik (UUID) olmalı.`);
  }
  return value.toLowerCase();
}

// Finance item ids are usually UUIDs, but data from the first local-only
// prototype may use other strings, so accept any short id.
export function readItemId(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim() || value.length > 100) {
    throw new TypeError(`${key} geçerli bir kimlik olmalı.`);
  }
  return value.trim();
}

// Returns a timestamp at 12:00 UTC on the given day so the day does not shift
// in Türkiye or nearby time zones.
export function readDate(args: Args, key: string): number | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${key} YYYY-AA-GG biçiminde olmalı.`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const time = Date.UTC(year, month - 1, day, 12);
  const check = new Date(time);
  if (
    check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new TypeError(`${key} geçerli bir tarih değil.`);
  }
  return time;
}

// ---------- validation of stored data ----------

export function isValidNotes(value: unknown): value is string {
  return typeof value === "string";
}

export function isValidFixedExpenses(value: unknown): value is FixedExpense[] {
  return Array.isArray(value) && value.every((item) =>
    isRecord(item) && typeof item.id === "string" &&
    typeof item.title === "string" && isNonNegativeNumber(item.amount)
  );
}

export function isValidCategories(value: unknown): value is Category[] {
  return Array.isArray(value) && value.every((item) =>
    isRecord(item) && typeof item.id === "string" &&
    typeof item.name === "string" && item.name.trim().length > 0 &&
    isNonNegativeNumber(item.amount)
  );
}

export function isValidExpenses(value: unknown): value is Expense[] {
  return Array.isArray(value) && value.every((item) =>
    isRecord(item) && typeof item.id === "string" &&
    typeof item.category === "string" &&
    typeof item.amount === "number" && Number.isFinite(item.amount) &&
    item.amount > 0 && typeof item.note === "string" &&
    typeof item.createdAt === "number" && Number.isFinite(item.createdAt)
  );
}

export function readFinance(data: unknown): Finance {
  if (!isRecord(data)) {
    throw new Error(
      "Panel verisi Supabase hesabında yok. Önce uygulamada hesabına giriş yap.",
    );
  }
  const categories = data.categories ?? [];
  if (
    !isNonNegativeNumber(data.income) ||
    !isValidFixedExpenses(data.fixedExpenses) ||
    !isValidCategories(categories) ||
    !isValidExpenses(data.expenses)
  ) {
    throw new Error("Kayıtlı finans verisinin biçimi geçersiz.");
  }
  return {
    currency: typeof data.currency === "string" ? data.currency : "TRY",
    income: data.income,
    fixedExpenses: data.fixedExpenses,
    categories,
    expenses: data.expenses,
  };
}

// ---------- finance changes ----------

function sameName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("tr-TR") ===
    right.trim().toLocaleLowerCase("tr-TR");
}

export function findCategory(
  categories: Category[],
  name: string,
): Category | undefined {
  return categories.find((category) => sameName(category.name, name));
}

export function categoryNotFound(categories: Category[], name: string): Error {
  const names = categories.map((category) => category.name);
  return new Error(
    names.length > 0
      ? `"${name}" adında bir bütçe kategorisi yok. Mevcut kategoriler: ${
        names.join(", ")
      }.`
      : `"${name}" adında bir bütçe kategorisi yok; henüz hiç kategori eklenmemiş. Önce set_category_budget ile kategori oluştur.`,
  );
}

export function upsertCategory(
  categories: Category[],
  name: string,
  amount: number,
  newId: string,
): { categories: Category[]; created: boolean } {
  const existing = findCategory(categories, name);
  if (existing) {
    return {
      categories: categories.map((category) =>
        category.id === existing.id ? { ...category, amount } : category
      ),
      created: false,
    };
  }
  return { categories: [...categories, { id: newId, name, amount }], created: true };
}

// ---------- formatting ----------

export function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function monthKey(time: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).format(time);
}

function formatDay(time: number, timeZone: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    day: "numeric",
    month: "long",
  }).format(time);
}

function categoryLabel(expense: Expense, categories: Category[]): string {
  return categories.find((category) => category.id === expense.category)?.name ??
    (expense.categoryName || "Kaldırılmış kategori");
}

export function formatFinance(
  finance: Finance,
  now: number,
  timeZone: string,
): string {
  const m = (value: number) => money(value, finance.currency);
  const currentMonth = monthKey(now, timeZone);
  const monthLabel = new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    month: "long",
    year: "numeric",
  }).format(now);
  const monthExpenses = finance.expenses
    .filter((expense) => monthKey(expense.createdAt, timeZone) === currentMonth)
    .sort((a, b) => b.createdAt - a.createdAt);
  const fixedTotal = finance.fixedExpenses.reduce((sum, item) => sum + item.amount, 0);
  const available = finance.income - fixedTotal;
  const budgetTotal = finance.categories.reduce((sum, item) => sum + item.amount, 0);
  const spentTotal = monthExpenses.reduce((sum, item) => sum + item.amount, 0);

  const lines = [
    `Para birimi: ${finance.currency}`,
    `Aylık gelir: ${m(finance.income)}`,
    `Sabit giderler (toplam ${m(fixedTotal)}):`,
    ...(finance.fixedExpenses.length > 0
      ? finance.fixedExpenses.map((item) =>
        `- ${item.title}: ${m(item.amount)} (id: ${item.id})`
      )
      : ["- yok"]),
    `Sabit giderlerden sonra kalan: ${m(available)}`,
    `Bütçe kategorileri (${monthLabel}):`,
    ...(finance.categories.length > 0
      ? finance.categories.map((category) => {
        const spent = monthExpenses
          .filter((expense) => expense.category === category.id)
          .reduce((sum, expense) => sum + expense.amount, 0);
        return `- ${category.name}: bütçe ${m(category.amount)}, harcanan ${
          m(spent)
        }, kalan ${m(category.amount - spent)}`;
      })
      : ["- yok"]),
    `Kategorilere ayrılan toplam: ${m(budgetTotal)}; dağıtılmamış: ${
      m(available - budgetTotal)
    }`,
    `Bu ay toplam harcama: ${m(spentTotal)}`,
    `Bu ayın harcamaları (en yeni ${Math.min(monthExpenses.length, 30)}):`,
    ...(monthExpenses.length > 0
      ? monthExpenses.slice(0, 30).map((expense) =>
        `- ${formatDay(expense.createdAt, timeZone)} · ${
          categoryLabel(expense, finance.categories)
        } · ${m(expense.amount)}${
          expense.note ? ` · ${expense.note}` : ""
        } (id: ${expense.id})`
      )
      : ["- yok"]),
  ];
  return lines.join("\n");
}

export function formatJob(job: Job): string {
  const parts = [
    `- ${job.title} · ${job.company} · ${JOB_STATUSES[job.status] ?? job.status} (${job.status})`,
  ];
  if (job.location) parts.push(`  Konum: ${job.location}`);
  if (job.url) parts.push(`  Bağlantı: ${job.url}`);
  if (job.notes) parts.push(`  Not: ${job.notes.replace(/\s+/g, " ")}`);
  parts.push(`  Güncellendi: ${job.updated_at.slice(0, 10)} · id: ${job.id}`);
  return parts.join("\n");
}

export function filterJobs(
  jobs: Job[],
  status: string | undefined,
  query: string | undefined,
): Job[] {
  const needle = query?.toLocaleLowerCase("tr-TR");
  return jobs.filter((job) =>
    (!status || job.status === status) &&
    (!needle ||
      [job.title, job.company, job.location, job.notes].some((value) =>
        value.toLocaleLowerCase("tr-TR").includes(needle)
      ))
  );
}

export function appendNote(notes: string, text: string): string {
  const trimmedEnd = notes.replace(/\s+$/, "");
  const result = trimmedEnd ? `${trimmedEnd}\n${text}` : text;
  if (result.length > NOTES_MAX_LENGTH) {
    throw new TypeError(
      `Notlar en fazla ${NOTES_MAX_LENGTH} karakter olabilir.`,
    );
  }
  return result;
}
