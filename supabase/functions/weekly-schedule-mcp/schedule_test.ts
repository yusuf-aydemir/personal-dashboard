import {
  applyScheduleChanges,
  isValidSchedule,
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
