import { assertEquals } from "@std/assert";
import { relativeTime, shortSha } from "./time.ts";

Deno.test("relativeTime formats nearby dates", () => {
  const now = Date.parse("2026-08-16T12:00:00.000Z");
  assertEquals(relativeTime("2026-08-16T11:59:20.000Z", now), "just now");
  assertEquals(relativeTime("2026-08-16T11:10:00.000Z", now), "50m ago");
  assertEquals(relativeTime("2026-08-16T09:00:00.000Z", now), "3h ago");
  assertEquals(relativeTime("2026-08-15T12:00:00.000Z", now), "yesterday");
});

Deno.test("shortSha trims to 8", () => {
  assertEquals(shortSha("abcdef1234567890"), "abcdef12");
});
