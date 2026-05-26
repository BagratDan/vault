import { describe, expect, it, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { openAutobeeStore } from "../src/store.js";
import { signCanonical } from "../src/sign.js";

describe("openAutobeeStore (founder)", () => {
  let dir: string;
  let opened: Awaited<ReturnType<typeof openAutobeeStore>>;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "vault-autobee-"));
    opened = await openAutobeeStore({
      rootDir: dir,
      role: "admin",
    });
  });

  afterEach(async () => {
    await opened.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("opens cleanly and exposes view + append + bootstrapKey", async () => {
    expect(typeof opened.view.get).toBe("function");
    expect(typeof opened.append).toBe("function");
    expect(typeof opened.bootstrapKey).toBe("string");
    expect(opened.bootstrapKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("append + read roundtrip via apply()", async () => {
    // For an admin store, founderPeerId === localPeerId === bee.local.key.hex.
    // We sign with opened.secretKey (bee.local.keyPair.secretKey) whose
    // corresponding public key is opened.founderPeerId.
    const founderPeerId = opened.founderPeerId;

    const memberRec = {
      id: "01J0AAA0000000000000000001",
      kind: "member" as const,
      peerId: founderPeerId,
      displayName: "Sarah",
      role: "admin" as const,
      admittedBy: founderPeerId,
      admittedAt: "2026-05-26T10:00:00.000Z",
      publicKey: founderPeerId,
    };
    await opened.append({
      kind: "member",
      key: `member/${founderPeerId}`,
      value: { ...memberRec, sig: signCanonical(memberRec, opened.secretKey) },
    });
    await opened.flush();
    const got = await opened.view.get(`member/${founderPeerId}`);
    expect(got).not.toBeNull();
    expect((got?.value as { peerId: string }).peerId).toBe(founderPeerId);
  });
});
