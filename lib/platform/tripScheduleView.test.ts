import assert from "node:assert/strict";
import test from "node:test";
import { setupPlan } from "./savedTripSetup";
import { tripSchedule } from "./tripScheduleView";

const basis = { startDate: "2027-04-22", endDate: "2027-04-25", rounds: [
  { roundNumber: 1, dayNumber: 1, playDate: "2027-04-22", courseName: "Pinehurst No. 2" },
  { roundNumber: 2, dayNumber: 2, playDate: "2027-04-23", courseName: "Pinehurst No. 4" },
] };
const trip = { trip: { expected_traveler_count: 4 }, members: [] } as never;

test("schedule matches the server's saved rounds: numbers, dates and courses (picked course, typed name, then the saved one)", () => {
  const values = { dayCount: 4, arrivalShift: 0, golfOnArrival: false, golfOnDeparture: true, playerTotal: 4,
    roundsPerDay: { 0: 2, 1: 0, 2: 1 }, pickedCourses: { "0-1": { name: "Mid Pines" } }, slotCourseNames: { "2-0": "Tobacco Road" }, teeTimes: { "0-0": ["08:00", "08:10"] } };
  const view = tripSchedule(values, basis);
  const plan = setupPlan(trip, basis as never, values);
  assert.deepEqual(view.slots.map((s) => [s.number, s.date, s.course === "Course TBD" ? null : s.course]), plan.rounds.map((r) => [r.roundNumber, r.playDate, r.courseName]));
  assert.equal(view.arrival, plan.arrival);
  assert.equal(view.departure, plan.departure);
  assert.deepEqual(view.slots[0].teeTimes, ["08:00", "08:10"]);
  assert.equal(view.days.length, 3, "no golf on arrival day");
});

test("without saved counts the schedule follows the trip's saved rounds", () => {
  const view = tripSchedule({}, basis);
  assert.deepEqual(view.slots.map((s) => [s.key, s.course]), [["0-0", "Pinehurst No. 2"], ["1-0", "Pinehurst No. 4"]]);
  assert.equal(view.days.length, 4);
});
