import {
  ACTIVITY_COLORS,
  addActivityCategory,
  applyBedtimeChange,
  applyScheduleChanges,
  DAYS,
  formatActivityCategories,
  formatSchedule,
  isValidSchedule,
  parseBedtimeChange,
  parseScheduleChanges,
  readActivityCategories,
  readBedtimes,
} from "./schedule.ts";
import {
  appendNote,
  categoryNotFound,
  filterJobs,
  findCategory,
  formatFinance,
  formatJob,
  isValidNotes,
  type Job,
  JOB_STATUSES,
  money,
  NOTES_MAX_LENGTH,
  readAmount,
  readArgs,
  readDate,
  readFinance,
  readJobStatus,
  readText,
  readUrl,
  readItemId,
  readUuid,
  upsertCategory,
} from "./dashboard.ts";

const SERVER_INFO = {
  name: "kisisel-alan",
  version: "2.1.0",
};

const SUPPORTED_PROTOCOL_VERSIONS = new Set([
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
]);

const TOOL_DEFINITIONS = [
  {
    name: "get_weekly_schedule",
    description:
      "Kişisel Alan: kullanıcının haftalık planını (takvimini/programını) Pazartesi-Pazar, 06:00-24:00 aralığında, etkinlik kategorilerini ve günlük en geç yatma saatlerini oku. Bu plan haftalık tekrarlanır.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "update_weekly_schedule",
    description:
      "Kişisel Alan: kullanıcı planına, takvimine veya programına bir şey eklemek/değiştirmek istediğinde bunu kullan (Google/Apple Takvim değil). Haftalık planda yalnızca belirtilen gün ve saat aralıklarını ayarla. Plan haftalık tekrarlanır; saat aralığı başlangıç dahil, bitiş hariçtir. Yalnızca tam saatler 06:00-24:00 arasında kullanılabilir. Belirtilmeyen saatler değişmeden kalır. free=boş, busy=diğer meşgul, unplanned=planlanmadı, category=kullanıcının etkinlik kategorilerinden biri (ör. Gym, Yemek hazırlama; adını category alanına yaz). Kategori adlarını görmek için önce get_weekly_schedule kullan.",
    inputSchema: {
      type: "object",
      properties: {
        changes: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          description:
            "Değiştirilecek saat aralıkları. Aynı gün ve saat birden fazla aralıkta yer almamalı.",
          items: {
            type: "object",
            properties: {
              day: { type: "string", enum: DAYS },
              startHour: {
                type: "integer",
                minimum: 6,
                maximum: 23,
                description:
                  "Dahil başlangıç saati; örneğin 9, 09:00 demektir.",
              },
              endHour: {
                type: "integer",
                minimum: 7,
                maximum: 24,
                description: "Hariç bitiş saati; 24, gün sonu demektir.",
              },
              status: {
                type: "string",
                enum: ["free", "busy", "unplanned", "category"],
              },
              category: {
                type: "string",
                maxLength: 30,
                description:
                  "Yalnızca status=category ile: etkinlik kategorisinin adı, ör. Gym.",
              },
            },
            required: ["day", "startHour", "endHour", "status"],
            additionalProperties: false,
          },
        },
      },
      required: ["changes"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "set_bedtimes",
    description:
      "Kişisel Alan: belirtilen günler için en geç yatağa girme (yatma / uyku) saatini ayarla veya kaldır. Gece yarısından sonraki saat o günün gecesine aittir: Perşembe 00:30, Perşembe'yi Cuma'ya bağlayan gece demektir. Saat 18:00-05:59 arasında olmalı.",
    inputSchema: {
      type: "object",
      properties: {
        days: {
          type: "array",
          minItems: 1,
          maxItems: 7,
          items: { type: "string", enum: DAYS },
          description: "Yatma saati değişecek günler.",
        },
        time: {
          type: ["string", "null"],
          pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$",
          description: "SS:DD biçiminde saat, ör. 23:30 veya 00:30. Kaldırmak için null.",
        },
      },
      required: ["days", "time"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "add_activity_category",
    description:
      "Kişisel Alan: haftalık plana yeni bir etkinlik kategorisi (ör. Ders, Yürüyüş) ekle. En fazla 8 kategori olabilir.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 30 },
        color: { type: "string", enum: ACTIVITY_COLORS },
      },
      required: ["name", "color"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];


const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const ADDITIVE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};
const SETTING = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};
const NO_INPUT = {
  type: "object",
  properties: {},
  additionalProperties: false,
};
const STATUS_HELP = Object.entries(JOB_STATUSES)
  .map(([key, label]) => `${key}=${label}`)
  .join(", ");
const JOB_FIELDS = {
  title: { type: "string", minLength: 1, maxLength: 120, description: "İlan başlığı / pozisyon." },
  company: { type: "string", minLength: 1, maxLength: 100, description: "Şirket adı." },
  url: { type: "string", maxLength: 2000, description: "İlan bağlantısı (http/https). Boş metin bağlantıyı kaldırır." },
  location: { type: "string", maxLength: 100, description: "Konum. Boş metin konumu kaldırır." },
  status: { type: "string", enum: Object.keys(JOB_STATUSES), description: `Başvuru durumu: ${STATUS_HELP}.` },
  notes: { type: "string", maxLength: 3000, description: "İlanla ilgili notlar (mevcut notun yerine geçer)." },
};

const DASHBOARD_TOOL_DEFINITIONS = [
  {
    name: "get_notes",
    description: "Genel bakış sayfasındaki notları oku.",
    inputSchema: NO_INPUT,
    annotations: READ_ONLY,
  },
  {
    name: "add_note",
    description: "Notların sonuna yeni bir satır ekle. Mevcut notlar korunur.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", minLength: 1, maxLength: 2000, description: "Eklenecek not satırı." },
      },
      required: ["text"],
      additionalProperties: false,
    },
    annotations: ADDITIVE,
  },
  {
    name: "replace_notes",
    description:
      "Notların TAMAMINI verilen metinle değiştir. Mevcut notlar silinir; yalnızca kullanıcı açıkça notları yeniden yazmak veya bir kısmını silmek istediğinde kullan. Önce get_notes ile oku.",
    inputSchema: {
      type: "object",
      properties: {
        notes: { type: "string", maxLength: NOTES_MAX_LENGTH, description: "Notların yeni tam metni. Boş metin tüm notları siler." },
      },
      required: ["notes"],
      additionalProperties: false,
    },
    annotations: DESTRUCTIVE,
  },
  {
    name: "list_jobs",
    description: "Kayıtlı iş ilanlarını en son güncellenen önce listele. İsteğe bağlı olarak duruma göre filtrele veya başlık/şirket/konum/notlarda ara.",
    inputSchema: {
      type: "object",
      properties: {
        status: JOB_FIELDS.status,
        query: { type: "string", maxLength: 100, description: "Aranacak kelime." },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: "add_job",
    description: "Yeni bir iş ilanı kaydet. Durum verilmezse saved (Kaydedildi) olur.",
    inputSchema: {
      type: "object",
      properties: JOB_FIELDS,
      required: ["title", "company"],
      additionalProperties: false,
    },
    annotations: ADDITIVE,
  },
  {
    name: "update_job",
    description: "Bir iş ilanının yalnızca verilen alanlarını güncelle (örneğin durumunu interview yap). id için önce list_jobs kullan.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "list_jobs çıktısındaki ilan kimliği." },
        ...JOB_FIELDS,
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: SETTING,
  },
  {
    name: "delete_job",
    description: "Bir iş ilanını kalıcı olarak sil. id için önce list_jobs kullan.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Silinecek ilanın kimliği." } },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: DESTRUCTIVE,
  },
  {
    name: "get_finance_summary",
    description:
      "Finans özetini oku: aylık gelir, sabit giderler, bütçe kategorileri (bu ay harcanan ve kalan) ve bu ayın harcamaları. Harcama ve sabit gider kimlikleri de listelenir.",
    inputSchema: NO_INPUT,
    annotations: READ_ONLY,
  },
  {
    name: "add_expense",
    description:
      "Mevcut bir bütçe kategorisine harcama ekle. Kategori adı büyük/küçük harf duyarsız eşleşir; kategori yoksa hata döner ve mevcut kategoriler listelenir.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", minLength: 1, maxLength: 60, description: "Bütçe kategorisinin adı." },
        amount: { type: "number", exclusiveMinimum: 0, description: "Harcama tutarı, hesabın para biriminde." },
        note: { type: "string", maxLength: 300, description: "İsteğe bağlı açıklama." },
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "İsteğe bağlı harcama tarihi (YYYY-AA-GG). Verilmezse şimdi." },
      },
      required: ["category", "amount"],
      additionalProperties: false,
    },
    annotations: ADDITIVE,
  },
  {
    name: "delete_expense",
    description: "Bir harcamayı sil. id için önce get_finance_summary kullan.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Silinecek harcamanın kimliği." } },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: DESTRUCTIVE,
  },
  {
    name: "set_income",
    description: "Aylık geliri ayarla.",
    inputSchema: {
      type: "object",
      properties: { amount: { type: "number", minimum: 0, description: "Aylık gelir tutarı." } },
      required: ["amount"],
      additionalProperties: false,
    },
    annotations: SETTING,
  },
  {
    name: "set_category_budget",
    description: "Bir bütçe kategorisinin aylık tutarını ayarla. Bu adda kategori yoksa yeni kategori oluşturulur.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 60, description: "Kategori adı." },
        amount: { type: "number", minimum: 0, description: "Aylık bütçe tutarı." },
      },
      required: ["name", "amount"],
      additionalProperties: false,
    },
    annotations: SETTING,
  },
  {
    name: "delete_category",
    description: "Bir bütçe kategorisini ve bütçesini kaldır. Geçmiş harcamalar korunur.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", minLength: 1, maxLength: 60, description: "Kaldırılacak kategorinin adı." } },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: DESTRUCTIVE,
  },
  {
    name: "add_fixed_expense",
    description: "Kira veya abonelik gibi yeni bir aylık sabit gider ekle.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 120, description: "Sabit giderin adı." },
        amount: { type: "number", minimum: 0, description: "Aylık tutar." },
      },
      required: ["title", "amount"],
      additionalProperties: false,
    },
    annotations: ADDITIVE,
  },
  {
    name: "delete_fixed_expense",
    description: "Bir sabit gideri sil. id için önce get_finance_summary kullan.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Silinecek sabit giderin kimliği." } },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: DESTRUCTIVE,
  },
];

const ALL_TOOL_DEFINITIONS = [...TOOL_DEFINITIONS, ...DASHBOARD_TOOL_DEFINITIONS];

const JSON_HEADERS = {
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function rpcError(id: unknown, code: number, message: string): Response {
  return jsonResponse({ jsonrpc: "2.0", id, error: { code, message } });
}

function safeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let mismatch = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return mismatch === 0;
}

function getConfiguration() {
  const apiKey = Deno.env.get("MCP_API_KEY");
  const userId = Deno.env.get("MCP_USER_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (
    !apiKey || apiKey.length < 32 || !userId || !supabaseUrl || !serviceRoleKey
  ) {
    throw new Error(
      "The personal dashboard MCP function is missing required secrets.",
    );
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(userId)
  ) {
    throw new Error("MCP_USER_ID must be a Supabase user UUID.");
  }

  const timeZone = Deno.env.get("MCP_TIME_ZONE") || "Europe/Istanbul";
  try {
    new Intl.DateTimeFormat("tr-TR", { timeZone });
  } catch {
    throw new Error("MCP_TIME_ZONE must be a valid IANA time zone.");
  }

  return { apiKey, userId, supabaseUrl, serviceRoleKey, timeZone };
}

function supabaseHeaders(serviceRoleKey: string): HeadersInit {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

type Config = ReturnType<typeof getConfiguration>;
type Section =
  | "notes"
  | "income"
  | "fixedExpenses"
  | "categories"
  | "expenses"
  | "schedule"
  | "activityCategories"
  | "bedtimes";

async function readUserData(config: Config): Promise<Record<string, unknown>> {
  const url = new URL("/rest/v1/user_data", config.supabaseUrl);
  url.searchParams.set("select", "data");
  url.searchParams.set("user_id", `eq.${config.userId}`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: supabaseHeaders(config.serviceRoleKey),
  });
  if (!response.ok) {
    throw new Error(`Supabase panel verisi okunamadı (${response.status}).`);
  }
  const rows = await response.json();
  const data = Array.isArray(rows) ? rows[0]?.data : undefined;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(
      "Panel verisi henüz Supabase hesabında yok. Önce uygulamada hesabına giriş yap.",
    );
  }
  return data as Record<string, unknown>;
}

// Read-modify-write one section with a compare-and-swap so a change made at
// the same time from the web app is never silently overwritten.
async function updateSection<T>(
  config: Config,
  section: Section,
  change: (data: Record<string, unknown>) => { value: unknown; result: T },
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const data = await readUserData(config);
    const { value, result } = change(data);
    const response = await fetch(
      new URL("/rest/v1/rpc/mcp_replace_user_data_section", config.supabaseUrl),
      {
        method: "POST",
        headers: supabaseHeaders(config.serviceRoleKey),
        body: JSON.stringify({
          p_user_id: config.userId,
          p_section: section,
          p_expected: data[section] ?? null,
          p_value: value,
        }),
      },
    );
    if (response.status === 404) {
      throw new Error(
        "Supabase'de mcp_replace_user_data_section fonksiyonu yok. 20261119120000_mcp_dashboard_tools.sql dosyasını SQL Editor'da çalıştır.",
      );
    }
    if (!response.ok) {
      throw new Error(`Supabase panel verisi güncellenemedi (${response.status}).`);
    }
    const saved = await response.json();
    if (saved !== null) return result;
  }
  throw new Error(
    "Veri aynı anda başka bir yerden değişti. Lütfen isteği tekrar dene.",
  );
}

const JOB_COLUMNS = "id,title,company,url,location,status,notes,created_at,updated_at";

async function jobsRequest(
  config: Config,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  params: Record<string, string>,
  body?: unknown,
): Promise<Job[]> {
  const url = new URL("/rest/v1/jobs", config.supabaseUrl);
  url.searchParams.set("select", JOB_COLUMNS);
  // Inserts carry user_id in the body; every other request is scoped to it.
  if (method !== "POST") url.searchParams.set("user_id", `eq.${config.userId}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    method,
    headers: {
      ...supabaseHeaders(config.serviceRoleKey),
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Supabase iş ilanı isteği başarısız oldu (${response.status}).`);
  }
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error("Supabase geçerli bir ilan listesi döndürmedi.");
  }
  return rows as Job[];
}

function readJobFields(args: Record<string, unknown>) {
  const fields: Record<string, string> = {};
  const title = readText(args, "title", { min: 1, max: 120 });
  const company = readText(args, "company", { min: 1, max: 100 });
  const url = readUrl(args);
  const location = readText(args, "location", { max: 100 });
  const status = readJobStatus(args);
  const notes = readText(args, "notes", { max: 3000 });
  if (title !== undefined) fields.title = title;
  if (company !== undefined) fields.company = company;
  if (url !== undefined) fields.url = url;
  if (location !== undefined) fields.location = location;
  if (status !== undefined) fields.status = status;
  if (notes !== undefined) fields.notes = notes;
  return fields;
}

const JOB_FIELD_NAMES = ["title", "company", "url", "location", "status", "notes"];

async function callDashboardTool(
  name: string,
  rawArgs: unknown,
  config: Config,
): Promise<string | undefined> {
  const now = Date.now();
  const financeText = (data: Record<string, unknown>) =>
    formatFinance(readFinance(data), now, config.timeZone);

  switch (name) {
    case "get_notes": {
      readArgs(rawArgs, []);
      const data = await readUserData(config);
      const notes = isValidNotes(data.notes) ? data.notes : "";
      return notes.trim() ? `Notlar:\n${notes}` : "Notlar boş.";
    }
    case "add_note": {
      const args = readArgs(rawArgs, ["text"], ["text"]);
      const text = readText(args, "text", { min: 1, max: 2000 })!;
      const notes = await updateSection(config, "notes", (data) => {
        const value = appendNote(isValidNotes(data.notes) ? data.notes : "", text);
        return { value, result: value };
      });
      return `Not eklendi. Güncel notlar:\n${notes}`;
    }
    case "replace_notes": {
      const args = readArgs(rawArgs, ["notes"], ["notes"]);
      const value = args.notes;
      if (typeof value !== "string" || value.length > NOTES_MAX_LENGTH) {
        throw new TypeError(`notes en fazla ${NOTES_MAX_LENGTH} karakterlik metin olmalı.`);
      }
      await updateSection(config, "notes", () => ({ value, result: null }));
      return value.trim() ? `Notlar değiştirildi. Güncel notlar:\n${value}` : "Tüm notlar silindi.";
    }

    case "list_jobs": {
      const args = readArgs(rawArgs, ["status", "query"]);
      const status = readJobStatus(args);
      const query = readText(args, "query", { max: 100 });
      const jobs = filterJobs(
        await jobsRequest(config, "GET", { order: "updated_at.desc", limit: "200" }),
        status,
        query,
      );
      if (jobs.length === 0) return "Bu ölçütlere uyan ilan yok.";
      return `${jobs.length} ilan:\n${jobs.map(formatJob).join("\n")}`;
    }
    case "add_job": {
      const args = readArgs(rawArgs, JOB_FIELD_NAMES, ["title", "company"]);
      const fields = readJobFields(args);
      const [job] = await jobsRequest(config, "POST", {}, {
        user_id: config.userId,
        status: "saved",
        ...fields,
      });
      return `İlan kaydedildi:\n${formatJob(job)}`;
    }
    case "update_job": {
      const args = readArgs(rawArgs, ["id", ...JOB_FIELD_NAMES], ["id"]);
      const id = readUuid(args, "id");
      const fields = readJobFields(args);
      if (Object.keys(fields).length === 0) {
        throw new TypeError("Güncellenecek en az bir alan belirt.");
      }
      const [job] = await jobsRequest(config, "PATCH", { id: `eq.${id}` }, {
        ...fields,
        updated_at: new Date().toISOString(),
      });
      if (!job) throw new Error("Bu kimlikle bir ilan bulunamadı. list_jobs ile kontrol et.");
      return `İlan güncellendi:\n${formatJob(job)}`;
    }
    case "delete_job": {
      const args = readArgs(rawArgs, ["id"], ["id"]);
      const id = readUuid(args, "id");
      const [job] = await jobsRequest(config, "DELETE", { id: `eq.${id}` });
      if (!job) throw new Error("Bu kimlikle bir ilan bulunamadı. list_jobs ile kontrol et.");
      return `“${job.title} · ${job.company}” ilanı silindi.`;
    }

    case "get_finance_summary": {
      readArgs(rawArgs, []);
      return financeText(await readUserData(config));
    }
    case "add_expense": {
      const args = readArgs(rawArgs, ["category", "amount", "note", "date"], ["category", "amount"]);
      const categoryName = readText(args, "category", { min: 1, max: 60 })!;
      const amount = readAmount(args, "amount", { allowZero: false });
      const note = readText(args, "note", { max: 300 }) ?? "";
      const createdAt = readDate(args, "date") ?? now;
      const summary = await updateSection(config, "expenses", (data) => {
        const finance = readFinance(data);
        const category = findCategory(finance.categories, categoryName);
        if (!category) throw categoryNotFound(finance.categories, categoryName);
        const value = [...finance.expenses, {
          id: crypto.randomUUID(),
          category: category.id,
          categoryName: category.name,
          amount,
          note,
          createdAt,
        }];
        return {
          value,
          result: `${category.name} kategorisine ${money(amount, finance.currency)} harcama eklendi.`,
        };
      });
      return `${summary}\n\n${financeText(await readUserData(config))}`;
    }
    case "delete_expense": {
      const args = readArgs(rawArgs, ["id"], ["id"]);
      const id = readItemId(args, "id");
      const summary = await updateSection(config, "expenses", (data) => {
        const finance = readFinance(data);
        const expense = finance.expenses.find((item) => item.id === id);
        if (!expense) throw new Error("Bu kimlikle bir harcama bulunamadı. get_finance_summary ile kontrol et.");
        return {
          value: finance.expenses.filter((item) => item !== expense),
          result: `${money(expense.amount, finance.currency)} tutarındaki harcama silindi.`,
        };
      });
      return `${summary}\n\n${financeText(await readUserData(config))}`;
    }
    case "set_income": {
      const args = readArgs(rawArgs, ["amount"], ["amount"]);
      const amount = readAmount(args, "amount", { allowZero: true });
      await updateSection(config, "income", (data) => {
        readFinance(data);
        return { value: amount, result: null };
      });
      return `Aylık gelir ayarlandı.\n\n${financeText(await readUserData(config))}`;
    }
    case "set_category_budget": {
      const args = readArgs(rawArgs, ["name", "amount"], ["name", "amount"]);
      const name = readText(args, "name", { min: 1, max: 60 })!;
      const amount = readAmount(args, "amount", { allowZero: true });
      const created = await updateSection(config, "categories", (data) => {
        const finance = readFinance(data);
        const result = upsertCategory(finance.categories, name, amount, crypto.randomUUID());
        return { value: result.categories, result: result.created };
      });
      return `${created ? "Yeni kategori oluşturuldu" : "Kategori bütçesi güncellendi"}.\n\n${
        financeText(await readUserData(config))
      }`;
    }
    case "delete_category": {
      const args = readArgs(rawArgs, ["name"], ["name"]);
      const name = readText(args, "name", { min: 1, max: 60 })!;
      const removed = await updateSection(config, "categories", (data) => {
        const finance = readFinance(data);
        const category = findCategory(finance.categories, name);
        if (!category) throw categoryNotFound(finance.categories, name);
        return {
          value: finance.categories.filter((item) => item.id !== category.id),
          result: category.name,
        };
      });
      return `“${removed}” kategorisi kaldırıldı; geçmiş harcamalar korundu.\n\n${
        financeText(await readUserData(config))
      }`;
    }
    case "add_fixed_expense": {
      const args = readArgs(rawArgs, ["title", "amount"], ["title", "amount"]);
      const title = readText(args, "title", { min: 1, max: 120 })!;
      const amount = readAmount(args, "amount", { allowZero: true });
      await updateSection(config, "fixedExpenses", (data) => {
        const finance = readFinance(data);
        return {
          value: [...finance.fixedExpenses, { id: crypto.randomUUID(), title, amount }],
          result: null,
        };
      });
      return `Sabit gider eklendi.\n\n${financeText(await readUserData(config))}`;
    }
    case "delete_fixed_expense": {
      const args = readArgs(rawArgs, ["id"], ["id"]);
      const id = readItemId(args, "id");
      const title = await updateSection(config, "fixedExpenses", (data) => {
        const finance = readFinance(data);
        const item = finance.fixedExpenses.find((expense) => expense.id === id);
        if (!item) throw new Error("Bu kimlikle bir sabit gider bulunamadı. get_finance_summary ile kontrol et.");
        return {
          value: finance.fixedExpenses.filter((expense) => expense !== item),
          result: item.title,
        };
      });
      return `“${title}” sabit gideri silindi.\n\n${financeText(await readUserData(config))}`;
    }
  }
  return undefined;
}

function toolResult(text: string, isError = false) {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

function readStoredSchedule(data: Record<string, unknown>) {
  if (!isValidSchedule(data.schedule)) {
    throw new Error(
      "Haftalık plan henüz Supabase hesabında yok veya kayıtlı biçimi geçersiz. Önce uygulamada hesabına giriş yap.",
    );
  }
  return data.schedule;
}

function formatPlan(data: Record<string, unknown>): string {
  const categories = readActivityCategories(data);
  return `${formatSchedule(readStoredSchedule(data), categories, readBedtimes(data))}\n\n${
    formatActivityCategories(categories)
  }`;
}

async function callTool(
  name: unknown,
  args: unknown,
  config: ReturnType<typeof getConfiguration>,
) {
  if (name === "get_weekly_schedule") {
    if (args && typeof args === "object" && Object.keys(args).length > 0) {
      return toolResult("Bu araç ek girdi kabul etmiyor.", true);
    }
    return toolResult(`Haftalık plan (tekrarlanan, 06:00-24:00):\n${
      formatPlan(await readUserData(config))
    }`);
  }

  if (name === "update_weekly_schedule") {
    const text = await updateSection(config, "schedule", (data) => {
      const schedule = readStoredSchedule(data);
      const changes = parseScheduleChanges(args, readActivityCategories(data));
      const updated = applyScheduleChanges(schedule, changes);
      return {
        value: updated,
        result: formatPlan({ ...data, schedule: updated }),
      };
    });
    return toolResult(
      `İstenen saat aralıkları kaydedildi. Güncel haftalık plan:\n${text}`,
    );
  }

  if (name === "set_bedtimes") {
    const change = parseBedtimeChange(args);
    const text = await updateSection(config, "bedtimes", (data) => {
      const updated = applyBedtimeChange(readBedtimes(data), change);
      return {
        value: updated,
        result: DAYS.map((day, index) => `${day}: ${updated[index] ?? "ayarlanmadı"}`)
          .join("\n"),
      };
    });
    return toolResult(`Yatma saatleri kaydedildi:\n${text}`);
  }

  if (name === "add_activity_category") {
    const parsed = readArgs(args, ["name", "color"], ["name", "color"]);
    if (typeof parsed.name !== "string" || typeof parsed.color !== "string") {
      throw new TypeError("name ve color metin olmalı.");
    }
    const text = await updateSection(config, "activityCategories", (data) => {
      const updated = addActivityCategory(
        readActivityCategories(data),
        parsed.name as string,
        parsed.color as string,
        `c-${crypto.randomUUID().slice(0, 8)}`,
      );
      return { value: updated, result: formatActivityCategories(updated) };
    });
    return toolResult(`Kategori eklendi. ${text}`);
  }

  if (typeof name === "string") {
    const text = await callDashboardTool(name, args, config);
    if (text !== undefined) return toolResult(text);
  }

  throw new TypeError("Bilinmeyen araç.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: JSON_HEADERS });
  }
  if (request.method !== "POST") {
    return new Response("Method not allowed.", {
      status: 405,
      headers: { ...JSON_HEADERS, Allow: "POST, OPTIONS" },
    });
  }

  let config: ReturnType<typeof getConfiguration>;
  try {
    config = getConfiguration();
  } catch {
    return new Response("MCP function is not configured.", {
      status: 503,
      headers: JSON_HEADERS,
    });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const suppliedKey = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!safeEqual(suppliedKey, config.apiKey)) {
    return new Response("Unauthorized.", {
      status: 401,
      headers: { ...JSON_HEADERS, "WWW-Authenticate": "Bearer" },
    });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64_000) {
    return new Response("Request too large.", {
      status: 413,
      headers: JSON_HEADERS,
    });
  }

  let message: Record<string, unknown>;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 64_000) {
      return new Response("Request too large.", {
        status: 413,
        headers: JSON_HEADERS,
      });
    }
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return rpcError(null, -32600, "Invalid Request");
    }
    message = parsed as Record<string, unknown>;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  if (message.method === "notifications/initialized") {
    return new Response(null, { status: 202, headers: JSON_HEADERS });
  }
  if (
    message.jsonrpc !== "2.0" || !("id" in message) ||
    typeof message.method !== "string"
  ) {
    return rpcError(message.id ?? null, -32600, "Invalid Request");
  }

  if (message.method === "initialize") {
    const params = message.params && typeof message.params === "object"
      ? message.params as Record<string, unknown>
      : {};
    const requestedVersion = params.protocolVersion;
    const protocolVersion = typeof requestedVersion === "string" &&
        SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion)
      ? requestedVersion
      : "2025-03-26";
    return jsonResponse({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Bu sunucu kullanıcının Kişisel Alan panelini yönetir: haftalık plan (takvimi/programı), etkinlik kategorileri (Gym, Yemek hazırlama…), en geç yatma saatleri, notlar, iş ilanları ve finans. Kullanıcı 'plan', 'takvim', 'program', 'panel', 'gym', 'yemek hazırlama', 'yatma saati', 'not', 'iş ilanı', 'harcama' veya 'bütçe' dediğinde HER ZAMAN bu sunucunun araçlarını kullan. Google Takvim, Apple Takvim veya başka bir takvim aracına etkinlik ekleme; bunu yalnızca kullanıcı açıkça 'Google Takvim' ya da 'Apple Takvim' derse yap. Haftalık plan değişiklikleri haftalık tekrarlanır ve yalnızca verilen saat aralıklarını etkiler. Kimlik (id) gerektiren işlemlerden önce ilgili okuma aracını çağır. Silme veya notların tamamını değiştirme işlemlerini yalnızca kullanıcı açıkça istediğinde yap.",
      },
    });
  }

  if (message.method === "ping") {
    return jsonResponse({ jsonrpc: "2.0", id: message.id, result: {} });
  }

  if (message.method === "tools/list") {
    return jsonResponse({
      jsonrpc: "2.0",
      id: message.id,
      result: { tools: ALL_TOOL_DEFINITIONS },
    });
  }

  if (message.method === "tools/call") {
    const params = message.params && typeof message.params === "object"
      ? message.params as Record<string, unknown>
      : {};
    try {
      const result = await callTool(params.name, params.arguments, config);
      return jsonResponse({ jsonrpc: "2.0", id: message.id, result });
    } catch (error) {
      const text = error instanceof Error
        ? error.message
        : "Araç çalıştırılamadı.";
      return jsonResponse({
        jsonrpc: "2.0",
        id: message.id,
        result: toolResult(text, true),
      });
    }
  }

  return rpcError(message.id, -32601, "Method not found");
});
