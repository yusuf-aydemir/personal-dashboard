import {
  addActivityCategory,
  applyBedtimeChange,
  applyScheduleChanges,
  DEFAULT_ACTIVITY_CATEGORIES,
  formatSchedule,
  isValidBedtime,
  isValidSchedule,
  parseBedtimeChange,
  parseScheduleChanges,
  type Schedule,
} from "./schedule.ts";

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

Deno.test("updates only requested recurring hours", () => {
  const schedule: Schedule = Array.from(
    { length: 7 },
    () => Array(18).fill(null),
  );
  schedule[0][0] = "busy";
  const original = schedule.map((day) => [...day]);
  const changes = parseScheduleChanges({
    changes: [
      { day: "Pazartesi", startHour: 8, endHour: 10, status: "free" },
      { day: "Salı", startHour: 22, endHour: 24, status: "busy" },
    ],
  });
  const updated = applyScheduleChanges(schedule, changes);

  assert(
    updated[0][0] === "busy",
    "An untouched Monday slot should remain busy.",
  );
  assert(
    updated[0][2] === "free" && updated[0][3] === "free",
    "Monday's requested interval should be set.",
  );
  assert(
    updated[0][4] === null,
    "A slot after the requested interval should remain unplanned.",
  );
  assert(
    updated[1][16] === "busy" && updated[1][17] === "busy",
    "The 22:00-24:00 interval should be set.",
  );
  assert(
    isValidSchedule(updated),
    "The result should match the app's schedule format.",
  );
  assert(
    JSON.stringify(schedule) === JSON.stringify(original),
    "The input schedule should not be mutated.",
  );
});

Deno.test("unplanned clears only the requested interval", () => {
  const schedule: Schedule = Array.from(
    { length: 7 },
    () => Array(18).fill(null),
  );
  schedule[0][0] = "free";
  schedule[0][1] = "busy";
  const changes = parseScheduleChanges({
    changes: [{
      day: "Pazartesi",
      startHour: 6,
      endHour: 8,
      status: "unplanned",
    }],
  });

  const updated = applyScheduleChanges(schedule, changes);
  assert(
    updated[0][0] === null && updated[0][1] === null,
    "Requested slots should become unplanned.",
  );
  assert(
    schedule[0][0] === "free" && schedule[0][1] === "busy",
    "The original schedule should stay unchanged.",
  );
});

Deno.test("rejects out-of-range and overlapping changes", () => {
  assertThrows(() =>
    parseScheduleChanges({
      changes: [{ day: "Pazartesi", startHour: 5, endHour: 7, status: "free" }],
    }), "An interval before 06:00 should be rejected.");
  assertThrows(() =>
    parseScheduleChanges({
      changes: [
        { day: "Pazartesi", startHour: 8, endHour: 10, status: "free" },
        { day: "Pazartesi", startHour: 9, endHour: 11, status: "busy" },
      ],
    }), "Overlapping intervals should be rejected.");
});

Deno.test("paints hours with an activity category by name", () => {
  const schedule: Schedule = Array.from(
    { length: 7 },
    () => Array(18).fill(null),
  );
  const changes = parseScheduleChanges({
    changes: [
      { day: "Salı", startHour: 18, endHour: 20, status: "category", category: "gym" },
    ],
  }, DEFAULT_ACTIVITY_CATEGORIES);
  const updated = applyScheduleChanges(schedule, changes);
  assert(updated[1][12] === "gym" && updated[1][13] === "gym", "Gym should fill 18-20.");
  assert(updated[1][14] === null, "20:00 should stay unplanned.");
  assert(isValidSchedule(updated), "A schedule with category ids should be valid.");
  assert(
    formatSchedule(updated, DEFAULT_ACTIVITY_CATEGORIES, [null, "00:30", null, null, null, null, null])
      .includes("Salı: 06:00–18:00 Planlanmadı, 18:00–20:00 Gym, 20:00–24:00 Planlanmadı · en geç yatma 00:30"),
    "The formatted plan should name the category and bedtime.",
  );
  assertThrows(
    () => parseScheduleChanges({
      changes: [{ day: "Salı", startHour: 18, endHour: 20, status: "category", category: "Yüzme" }],
    }, DEFAULT_ACTIVITY_CATEGORIES),
    "An unknown category should be rejected.",
  );
  assertThrows(
    () => parseScheduleChanges({
      changes: [{ day: "Salı", startHour: 18, endHour: 20, status: "free", category: "Gym" }],
    }),
    "category without status=category should be rejected.",
  );
});

Deno.test("validates and applies bedtimes", () => {
  assert(isValidBedtime("23:30") && isValidBedtime("00:30") && isValidBedtime("05:59"), "Night times are valid.");
  assert(!isValidBedtime("12:00") && !isValidBedtime("24:00") && !isValidBedtime("7:00"), "Day or malformed times are invalid.");
  const change = parseBedtimeChange({ days: ["Pazartesi", "Cuma"], time: "01:30" });
  const updated = applyBedtimeChange(Array(7).fill(null), change);
  assert(updated[0] === "01:30" && updated[4] === "01:30" && updated[1] === null, "Only chosen days change.");
  const cleared = applyBedtimeChange(updated, parseBedtimeChange({ days: ["Cuma"], time: null }));
  assert(cleared[4] === null && cleared[0] === "01:30", "null clears a bedtime.");
  assertThrows(() => parseBedtimeChange({ days: ["Pazartesi"], time: "14:00" }), "Afternoon bedtimes are rejected.");
});

Deno.test("adds activity categories with limits", () => {
  const added = addActivityCategory(DEFAULT_ACTIVITY_CATEGORIES, " Ders ", "blue", "c-1");
  assert(added.length === 3 && added[2].name === "Ders", "A new category is appended with a trimmed name.");
  assertThrows(() => addActivityCategory(added, "GYM", "red", "c-2"), "Duplicate names are rejected.");
  assertThrows(() => addActivityCategory(added, "Yürüyüş", "neon", "c-3"), "Unknown colors are rejected.");
});
