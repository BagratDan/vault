import { describe, expect, it } from "vitest";
import { clientMessageShape, serverMessageShape } from "../src/messages.js";

describe("WS messages", () => {
  it("captureText is well-formed", () => {
    const m = { kind: "capture.text" as const, text: "hello", tags: ["t"] };
    expect(clientMessageShape.safeParse(m).success).toBe(true);
  });

  it("captureAudio rejects when audioBase64 missing", () => {
    const m = { kind: "capture.audio", tags: [] };
    expect(clientMessageShape.safeParse(m).success).toBe(false);
  });

  it("search.run minimal shape", () => {
    const m = { kind: "search.run" as const, query: "indemnification", k: 8 };
    expect(clientMessageShape.safeParse(m).success).toBe(true);
  });

  it("server answer.chunk discriminates correctly", () => {
    const m = {
      kind: "answer.chunk" as const,
      requestId: "01J0".padEnd(26, "A"),
      text: "Hi",
    };
    expect(serverMessageShape.safeParse(m).success).toBe(true);
  });
});

describe("WS protocol — Plan 2 additions", () => {
  it("vault.status (client) parses with just the kind", () => {
    expect(
      clientMessageShape.safeParse({ kind: "vault.status" }).success
    ).toBe(true);
  });

  it("vault.create requires displayName", () => {
    expect(
      clientMessageShape.safeParse({ kind: "vault.create" }).success
    ).toBe(false);
    expect(
      clientMessageShape.safeParse({
        kind: "vault.create",
        displayName: "Acme",
      }).success
    ).toBe(true);
  });

  it("vault.invite-create accepts optional fields", () => {
    expect(
      clientMessageShape.safeParse({ kind: "vault.invite-create" }).success
    ).toBe(true);
    expect(
      clientMessageShape.safeParse({
        kind: "vault.invite-create",
        placeholderDisplayName: "Marcus",
        expiresIn: "7d",
      }).success
    ).toBe(true);
  });

  it("vault.invite-accept requires token + displayName", () => {
    expect(
      clientMessageShape.safeParse({
        kind: "vault.invite-accept",
        token: "x",
        displayName: "Marcus",
      }).success
    ).toBe(true);
    expect(
      clientMessageShape.safeParse({
        kind: "vault.invite-accept",
        token: "x",
      }).success
    ).toBe(false);
  });

  it("peer.list (client) accepts just the kind", () => {
    expect(
      clientMessageShape.safeParse({ kind: "peer.list" }).success
    ).toBe(true);
  });

  it("vault.status (server) requires a known state enum", () => {
    expect(
      serverMessageShape.safeParse({
        kind: "vault.status",
        state: "no-vault",
      }).success
    ).toBe(true);
    expect(
      serverMessageShape.safeParse({
        kind: "vault.status",
        state: "admin",
        vaultId: "01J0A",
        vaultName: "Acme",
        selfPeerId: "aa",
      }).success
    ).toBe(true);
    expect(
      serverMessageShape.safeParse({
        kind: "vault.status",
        state: "weird",
      }).success
    ).toBe(false);
  });

  it("peer.list (server) parses peers array", () => {
    expect(
      serverMessageShape.safeParse({
        kind: "peer.list",
        peers: [
          { peerId: "aa", displayName: "Sarah", role: "admin" },
          { peerId: "bb", displayName: "Marcus", role: "member" },
        ],
      }).success
    ).toBe(true);
  });

  it("peer.connected requires a nested peer object", () => {
    expect(
      serverMessageShape.safeParse({
        kind: "peer.connected",
        peer: { peerId: "aa", displayName: "Sarah" },
      }).success
    ).toBe(true);
    expect(
      serverMessageShape.safeParse({
        kind: "peer.connected",
        peerId: "aa",
      }).success
    ).toBe(false);
  });
});
