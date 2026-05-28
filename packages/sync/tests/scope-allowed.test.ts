import { describe, expect, it } from "vitest";
import { isScopeAllowed } from "../src/consent-protocol.js";

describe("isScopeAllowed (additional smoke)", () => {
  it("snippet ceiling allows metadata + snippet, blocks file", () => {
    expect(isScopeAllowed(["metadata", "snippet"], "metadata")).toBe(true);
    expect(isScopeAllowed(["metadata", "snippet"], "snippet")).toBe(true);
    expect(isScopeAllowed(["metadata", "snippet"], "file")).toBe(false);
  });

  it("file ceiling allows all", () => {
    expect(isScopeAllowed(["metadata", "snippet", "file"], "file")).toBe(true);
  });

  it("metadata-only ceiling blocks snippet + file", () => {
    expect(isScopeAllowed(["metadata"], "metadata")).toBe(true);
    expect(isScopeAllowed(["metadata"], "snippet")).toBe(false);
    expect(isScopeAllowed(["metadata"], "file")).toBe(false);
  });

  it("empty list blocks everything", () => {
    expect(isScopeAllowed([], "metadata")).toBe(false);
  });
});
