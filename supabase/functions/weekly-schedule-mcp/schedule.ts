export const DAYS = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
];

// A slot is unplanned (null), free, busy ("Diğer meşgul") or the id of one of
// the user's activity categories.
export type SlotStatus = string | null;
export type Schedule = SlotStatus[][];

export interface ActivityCategory {
  id: string;
  name: string;
  color: string;
}

export const ACTIVITY_COLORS = [
  "orange",
  "yellow",
  "blue",
  "pink",
  "teal",
  "purple",
  "red",
  "brown",
];
export const MAX_ACTIVITY_CATEGORIES = 8;
export const DEFAULT_ACTIVITY_CATEGORIES: ActivityCategory[] = [
  { id: "gym", name: "Gym", color: "orange" },
  { id: "meal-prep", name: "Yemek hazırlama", color: "yellow" },
];
const CATEGORY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const BEDTIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

// Latest bedtime per day (Monday first). A time after midnight belongs to the
// night that starts on that day, so "00:30" on Thursday is Thursday night.
export type Bedtimes = (string | null)[];

export interface ScheduleChange {
  day: string;
  dayIndex: number;
  startHour: number;
  endHour: number;
  status: "free" | "busy" | "unplanned" | "category";
  value: SlotStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidSlot(slot: unknown): boolean {
  return slot === null || slot === "free" || slot === "busy" ||
    (typeof slot === "string" && CATEGORY_ID_PATTERN.test(slot));
}

export function isValidSchedule(value: unknown): value is Schedule {
  return Array.isArray(value) &&
    value.length === DAYS.length &&
    value.every((day) =>
      Array.isArray(day) &&
      day.length === 18 &&
      day.every(isValidSlot)
    );
}

export function isValidActivityCategories(
  value: unknown,
): value is ActivityCategory[] {
  return Array.isArray(value) &&
    value.length <= MAX_ACTIVITY_CATEGORIES &&
    value.every((category) =>
      isRecord(category) &&
      typeof category.id === "string" &&
      CATEGORY_ID_PATTERN.test(category.id) &&
      category.id !== "free" && category.id !== "busy" &&
      typeof category.name === "string" &&
      category.name.trim().length > 0 &&
      category.name.length <= 30 &&
      typeof category.color === "string" &&
      ACTIVITY_COLORS.includes(category.color)
    );
}

export function readActivityCategories(
  data: Record<string, unknown>,
): ActivityCategory[] {
  return isValidActivityCategories(data.activityCategories)
    ? data.activityCategories
    : DEFAULT_ACTIVITY_CATEGORIES.map((category) => ({ ...category }));
}

export function isValidBedtime(value: unknown): value is string {
  if (typeof value !== "string" || !BEDTIME_PATTERN.test(value)) return false;
  const hour = Number(value.slice(0, 2));
  return hour >= 18 || hour < 6;
}

export function isValidBedtimes(value: unknown): value is Bedtimes {
  return Array.isArray(value) && value.length === DAYS.length &&
    value.every((time) => time === null || isValidBedtime(time));
}

export function readBedtimes(data: Record<string, unknown>): Bedtimes {
  return isValidBedtimes(data.bedtimes)
    ? [...data.bedtimes]
    : Array(DAYS.length).fill(null);
}

function sameName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("tr-TR") ===
    right.trim().toLocaleLowerCase("tr-TR");
}

export function findActivityCategory(
  categories: ActivityCategory[],
  name: string,
): ActivityCategory | undefined {
  return categories.find((category) => sameName(category.name, name));
}

export function addActivityCategory(
  categories: ActivityCategory[],
  name: string,
  color: string,
  id: string,
): ActivityCategory[] {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 30) {
    throw new TypeError("Kategori adı 1-30 karakter arasında olmalı.");
  }
  if (!ACTIVITY_COLORS.includes(color)) {
    throw new TypeError(`Renk şunlardan biri olmalı: ${ACTIVITY_COLORS.join(", ")}.`);
  }
  if (findActivityCategory(categories, trimmed)) {
    throw new TypeError(`"${trimmed}" adında bir kategori zaten var.`);
  }
  if (categories.length >= MAX_ACTIVITY_CATEGORIES) {
    throw new TypeError(`En fazla ${MAX_ACTIVITY_CATEGORIES} kategori olabilir.`);
  }
  return [...categories, { id, name: trimmed, color }];
}

export function parseBedtimeChange(
  value: unknown,
): { dayIndexes: number[]; time: string | null } {
  if (!isRecord(value)) throw new TypeError("Girdi bir nesne olmalı.");
  if (Object.keys(value).some((key) => key !== "days" && key !== "time")) {
    throw new TypeError("Yalnızca days ve time alanları kabul edilir.");
  }
  const { days, time } = value;
  if (!Array.isArray(days) || days.length < 1 || days.length > DAYS.length) {
    throw new TypeError("En az bir gün belirt.");
  }
  const dayIndexes = days.map((day) => {
    const index = typeof day === "string" ? DAYS.indexOf(day) : -1;
    if (index < 0) {
      throw new TypeError("Gün adı Pazartesi ile Pazar arasında olmalı.");
    }
    return index;
  });
  if (time !== null && !isValidBedtime(time)) {
    throw new TypeError(
      "Saat SS:DD biçiminde ve 18:00-05:59 arasında olmalı (ör. 23:30 veya 00:30). Kaldırmak için null gönder.",
    );
  }
  return { dayIndexes: [...new Set(dayIndexes)], time: time as string | null };
}

export function applyBedtimeChange(
  bedtimes: Bedtimes,
  change: { dayIndexes: number[]; time: string | null },
): Bedtimes {
  const updated = [...bedtimes];
  change.dayIndexes.forEach((index) => {
    updated[index] = change.time;
  });
  return updated;
}

export function parseScheduleChanges(
  value: unknown,
  categories: ActivityCategory[] = DEFAULT_ACTIVITY_CATEGORIES,
): ScheduleChange[] {
  if (!isRecord(value)) {
    throw new TypeError("Güncelleme girdisi bir nesne olmalı.");
  }

  if (Object.keys(value).some((key) => key !== "changes")) {
    throw new TypeError("Yalnızca changes alanı kabul edilir.");
  }
  if (
    !Array.isArray(value.changes) || value.changes.length < 1 ||
    value.changes.length > 50
  ) {
    throw new TypeError("1 ile 50 arasında saat aralığı belirt.");
  }

  const occupiedSlots = new Set<string>();
  return value.changes.map((item): ScheduleChange => {
    if (!isRecord(item)) {
      throw new TypeError("Her saat aralığı bir nesne olmalı.");
    }

    const change = item;
    const allowedKeys = ["day", "startHour", "endHour", "status", "category"];
    if (Object.keys(change).some((key) => !allowedKeys.includes(key))) {
      throw new TypeError("Saat aralığında tanınmayan bir alan var.");
    }

    const { day, startHour, endHour, status, category } = change;
    if (typeof day !== "string") {
      throw new TypeError("Gün adı Pazartesi ile Pazar arasında olmalı.");
    }
    const dayIndex = DAYS.indexOf(day);
    if (dayIndex < 0) {
      throw new TypeError("Gün adı Pazartesi ile Pazar arasında olmalı.");
    }
    if (
      typeof startHour !== "number" ||
      !Number.isInteger(startHour) ||
      startHour < 6 ||
      startHour > 23
    ) {
      throw new TypeError("Başlangıç saati 6 ile 23 arasında tam saat olmalı.");
    }
    if (
      typeof endHour !== "number" ||
      !Number.isInteger(endHour) ||
      endHour < 7 ||
      endHour > 24
    ) {
      throw new TypeError("Bitiş saati 7 ile 24 arasında tam saat olmalı.");
    }
    if (startHour >= endHour) {
      throw new TypeError("Bitiş saati başlangıç saatinden sonra olmalı.");
    }
    if (
      status !== "free" && status !== "busy" && status !== "unplanned" &&
      status !== "category"
    ) {
      throw new TypeError("Durum free, busy, unplanned veya category olmalı.");
    }
    let value: SlotStatus = status === "unplanned" ? null : status;
    if (status === "category") {
      if (typeof category !== "string" || !category.trim()) {
        throw new TypeError("status=category için category alanına kategori adını yaz.");
      }
      const match = findActivityCategory(categories, category);
      if (!match) {
        throw new TypeError(
          `"${category}" adında bir kategori yok. Mevcut kategoriler: ${
            categories.map((item) => item.name).join(", ") || "yok"
          }.`,
        );
      }
      value = match.id;
    } else if (category !== undefined) {
      throw new TypeError("category alanı yalnızca status=category ile kullanılır.");
    }

    for (let hour = startHour; hour < endHour; hour += 1) {
      const slot = `${dayIndex}:${hour}`;
      if (occupiedSlots.has(slot)) {
        throw new TypeError(
          "Aynı saati birden fazla kez değiştiren aralıklar gönderme.",
        );
      }
      occupiedSlots.add(slot);
    }

    return {
      day,
      dayIndex,
      startHour,
      endHour,
      status,
      value,
    };
  });
}

export function applyScheduleChanges(
  schedule: Schedule,
  changes: ScheduleChange[],
): Schedule {
  if (!isValidSchedule(schedule)) {
    throw new TypeError("Kayıtlı haftalık planın biçimi geçersiz.");
  }
  const updated = schedule.map((day) => [...day]);

  for (const change of changes) {
    const value = change.value;
    for (let hour = change.startHour; hour < change.endHour; hour += 1) {
      updated[change.dayIndex][hour - 6] = value;
    }
  }

  return updated;
}

export function slotLabel(
  status: SlotStatus,
  categories: ActivityCategory[],
): string {
  if (status === null) return "Planlanmadı";
  if (status === "free") return "Boş";
  if (status === "busy") return "Diğer meşgul";
  return categories.find((category) => category.id === status)?.name ??
    "Kaldırılmış kategori";
}

export function formatSchedule(
  schedule: Schedule,
  categories: ActivityCategory[] = DEFAULT_ACTIVITY_CATEGORIES,
  bedtimes: Bedtimes = Array(DAYS.length).fill(null),
): string {
  if (!isValidSchedule(schedule)) {
    throw new TypeError("Haftalık planın biçimi geçersiz.");
  }

  return schedule.map((day, dayIndex) => {
    const periods: string[] = [];
    let start = 0;

    while (start < day.length) {
      const status = day[start];
      let end = start + 1;
      while (end < day.length && day[end] === status) end += 1;

      const startLabel = `${String(start + 6).padStart(2, "0")}:00`;
      const endLabel = `${String(end + 6).padStart(2, "0")}:00`;
      periods.push(`${startLabel}–${endLabel} ${slotLabel(status, categories)}`);
      start = end;
    }

    const bedtime = bedtimes[dayIndex]
      ? ` · en geç yatma ${bedtimes[dayIndex]}`
      : "";
    return `${DAYS[dayIndex]}: ${periods.join(", ")}${bedtime}`;
  }).join("\n");
}

export function formatActivityCategories(
  categories: ActivityCategory[],
): string {
  return categories.length
    ? `Etkinlik kategorileri: ${
      categories.map((category) => `${category.name} (${category.color})`).join(", ")
    }. Ayrıca: Boş (free), Diğer meşgul (busy), Planlanmadı (unplanned).`
    : "Etkinlik kategorisi yok. Boş (free), Diğer meşgul (busy) ve Planlanmadı (unplanned) kullanılabilir.";
}
