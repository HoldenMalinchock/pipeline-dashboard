import { assertEquals, assertThrows } from "@std/assert";
import { nextLink, normalizeBaseUrl } from "./http.ts";

Deno.test("normalizeBaseUrl strips trailing slashes", () => {
  assertEquals(normalizeBaseUrl("https://gitlab.example.com/"), "https://gitlab.example.com");
});

Deno.test("normalizeBaseUrl rejects missing scheme", () => {
  assertThrows(() => normalizeBaseUrl("gitlab.example.com"), Error, "http://");
});

Deno.test("nextLink reads GitLab pagination", () => {
  const header =
    '<https://gitlab.example.com/api/v4/projects?page=2>; rel="next", <https://gitlab.example.com/api/v4/projects?page=1>; rel="first"';
  assertEquals(
    nextLink(header),
    "https://gitlab.example.com/api/v4/projects?page=2",
  );
  assertEquals(nextLink(null), null);
});
