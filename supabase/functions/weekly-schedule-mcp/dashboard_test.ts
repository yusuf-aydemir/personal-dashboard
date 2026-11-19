import {
  appendNote,
  filterJobs,
  findCategory,
  formatFinance,
  type Job,
  monthKey,
  readAmount,
  readArgs,
  readDate,
  readFinance,
  readJobStatus,
  readUrl,
  upsertCategory,
} from "./dashboard.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(action: () => unknown, message: string): void {
  let thrown = false;
  try {
    action();
  } catch {
    thrown = true;
  }
  assert(thrown, message);
}

Deno.test("appends notes on a new line", () => {
  assert(appendNote("", "a") === "a", "Empty notes should become the text.");
  assert(appendNote("x\n\n", "a") === "x\na", "Trailing blank lines are trimmed.");
});

Deno.test("validates tool arguments", () => {
  assertThrows(() => readArgs({ z: 1 }, ["a"]), "Unknown keys are rejected.");
  assertThrows(() => readArgs({}, ["a"], ["a"]), "Missing keys are rejected.");
  assert(readAmount({ a: 10.005 }, "a", { allowZero: false }) === 10.01, "Rounds to cents.");
  assertThrows(() => readAmount({ a: 0 }, "a", { allowZero: false }), "Zero expense rejected.");
  assertThrows(() => readAmount({ a: "5" }, "a", { allowZero: true }), "Strings rejected.");
  assertThrows(() => readDate({ d: "2026-02-30" }, "d"), "Impossible dates rejected.");
  assertThrows(() => readUrl({ url: "javascript:alert(1)" }), "Non-http links rejected.");
  assertThrows(() => readJobStatus({ status: "x" }), "Unknown status rejected.");
});

Deno.test("matches categories case-insensitively in Turkish", () => {
  const categories = [{ id: "1", name: "İçecek", amount: 100 }];
  assert(findCategory(categories, "içecek")?.id === "1", "Turkish İ/i should match.");
  const updated = upsertCategory(categories, "içecek", 200, "new");
  assert(!updated.created && updated.categories[0].amount === 200, "Existing category updated.");
  assert(upsertCategory(categories, "Ulaşım", 50, "new").created, "New category created.");
});

Deno.test("summarises only the current month in the given time zone", () => {
  const now = Date.UTC(2026, 10, 19, 10);
  const finance = readFinance({
    currency: "TRY",
    income: 50000,
    fixedExpenses: [{ id: "f1", title: "Kira", amount: 20000 }],
    categories: [{ id: "1", name: "Market", amount: 1000 }],
    expenses: [
      { id: "e1", category: "1", categoryName: "Market", amount: 450, note: "", createdAt: now },
      { id: "e2", category: "1", categoryName: "Market", amount: 999, note: "", createdAt: Date.UTC(2026, 9, 5) },
    ],
  });
  const text = formatFinance(finance, now, "Europe/Istanbul");
  assert(text.includes("harcanan ₺450"), "Only this month's spending counts.");
  assert(text.includes("id: e1") && !text.includes("id: e2"), "Only this month is listed.");
  assert(
    monthKey(Date.UTC(2026, 10, 30, 22), "Europe/Istanbul") === "2026-12",
    "Months follow the Istanbul calendar.",
  );
});

Deno.test("filters jobs by status and text", () => {
  const job: Job = {
    id: "1",
    title: "Geliştirici",
    company: "Şirket",
    url: "",
    location: "",
    status: "applied",
    notes: "",
    created_at: "2026-11-19T00:00:00Z",
    updated_at: "2026-11-19T00:00:00Z",
  };
  assert(filterJobs([job], "applied", "şirket").length === 1, "Matching job kept.");
  assert(filterJobs([job], "offer", undefined).length === 0, "Other status filtered.");
});
