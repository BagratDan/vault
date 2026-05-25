import { describe, expect, it } from "vitest";
import { newUlid, isUlid, type Ulid } from "../src/ids.js";

describe("ulid", () => {
  it("newUlid returns a 26-char Crockford-base32 string", () => {
    const id = newUlid();
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("isUlid accepts valid ULIDs and rejects non-ULIDs", () => {
    expect(isUlid(newUlid())).toBe(true);
    expect(isUlid("not-a-ulid")).toBe(false);
    expect(isUlid("0000000000000000000000000")).toBe(false); // 25 chars
    expect(isUlid("")).toBe(false);
  });

  it("brand: Ulid is assignable to string", () => {
    const u: Ulid = newUlid();
    const s: string = u; // should compile
    expect(typeof s).toBe("string");
  });
});
