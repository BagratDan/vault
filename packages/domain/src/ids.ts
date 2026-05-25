import { ulid as createUlid } from "ulid";

declare const ulidBrand: unique symbol;
export type Ulid = string & { readonly [ulidBrand]: never };

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function newUlid(): Ulid {
  return createUlid() as Ulid;
}

export function isUlid(value: unknown): value is Ulid {
  return typeof value === "string" && ULID_RE.test(value);
}

export function asUlid(value: string): Ulid {
  if (!isUlid(value)) {
    throw new Error(`Invalid ULID: ${value}`);
  }
  return value;
}
