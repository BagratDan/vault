import crypto from "node:crypto";
import { VaultFs } from "./vault-fs.js";

export interface Identity {
  peerId: string; // 64-char lowercase hex
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

const IDENTITY_PATH = "identity/keypair.json";

export async function loadOrCreateIdentity(fsApi: VaultFs): Promise<Identity> {
  if (await fsApi.exists(IDENTITY_PATH)) {
    const raw = await fsApi.readFile(IDENTITY_PATH);
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as {
      peerId: string;
      publicKey: string;
      privateKey: string;
    };
    return {
      peerId: parsed.peerId,
      publicKey: Buffer.from(parsed.publicKey, "hex"),
      privateKey: Buffer.from(parsed.privateKey, "hex"),
    };
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pubRaw = publicKey.export({ format: "der", type: "spki" });
  // Strip the SPKI prefix to get the raw 32-byte public key.
  const pubBytes = pubRaw.subarray(pubRaw.length - 32);
  const privRaw = privateKey.export({ format: "der", type: "pkcs8" });
  const privBytes = privRaw.subarray(privRaw.length - 32);
  const peerId = Buffer.from(pubBytes).toString("hex");
  await fsApi.writeFile(
    IDENTITY_PATH,
    new TextEncoder().encode(
      JSON.stringify({
        peerId,
        publicKey: Buffer.from(pubBytes).toString("hex"),
        privateKey: Buffer.from(privBytes).toString("hex"),
      })
    )
  );
  return { peerId, publicKey: pubBytes, privateKey: privBytes };
}
