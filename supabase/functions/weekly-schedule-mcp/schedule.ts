export const DAYS = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
];

export type SlotStatus = "free" | "busy" | null;
export type Schedule = SlotStatus[][];

export interface ScheduleChange {
  day: string;
  dayIndex: number;
  startHour: number;
  endHour: number;
  status: "free" | "busy" | "unplanned";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isValidSchedule(value: unknown): value is Schedule {
  return Array.isArray(value) &&
    value.length === DAYS.length &&
    value.every((day) =>
      Array.isArray(day) &&
      day.length === 18 &&
      day.every((slot) => slot === null || slot === "free" || slot === "busy")
    );
}

export function parseScheduleChanges(value: unknown): ScheduleChange[] {
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
    const allowedKeys = ["day", "startHour", "endHour", "status"];
    if (Object.keys(change).some((key) => !allowedKeys.includes(key))) {
      throw new TypeError("Saat aralığında tanınmayan bir alan var.");
    }

    const { day, startHour, endHour, status } = change;
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
    if (status !== "free" && status !== "busy" && status !== "unplanned") {
      throw new TypeError("Durum free, busy veya unplanned olmalı.");
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
    const value = change.status === "unplanned" ? null : change.status;
    for (let hour = change.startHour; hour < change.endHour; hour += 1) {
      updated[change.dayIndex][hour - 6] = value;
    }
  }

  return updated;
}

export function formatSchedule(schedule: Schedule): string {
  if (!isValidSchedule(schedule)) {
    throw new TypeError("Haftalık planın biçimi geçersiz.");
  }

  const labels = { free: "Boş", busy: "Meşgul" };
  return schedule.map((day, dayIndex) => {
    const periods: string[] = [];
    let start = 0;

    while (start < day.length) {
      const status = day[start];
      let end = start + 1;
      while (end < day.length && day[end] === status) end += 1;

      const startLabel = `${String(start + 6).padStart(2, "0")}:00`;
      const endLabel = `${String(end + 6).padStart(2, "0")}:00`;
      const statusLabel = status ? labels[status] : "Planlanmadı";
      periods.push(`${startLabel}–${endLabel} ${statusLabel}`);
      start = end;
    }

    return `${DAYS[dayIndex]}: ${periods.join(", ")}`;
  }).join("\n");
}
