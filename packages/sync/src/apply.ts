import b4a from "b4a";
import { verifyCanonical } from "./sign.js";
import { loadRoster, loadRevoked, type RosterMember } from "./roster.js";

export interface ApplyDeps {
  /** Vault founder's peerId — exempt from the empty-roster gate at boot. */
  founderPeerId: string;
}

/**
 * Op envelope every record is wrapped in before being appended to
 * Autobee. apply() reads these from the batch, gates them through the
 * roster, and writes the unwrapped value into the merged view.
 */
export interface Op {
  kind:
    | "member"
    | "revocation"
    | "memory"
    | "person"
    | "place"
    | "event"
    | "task"
    | "external-ref"
    | "relationship"
    | "source-record"
    | "index";
  key: string;
  value: Record<string, unknown>;
}

interface ApplyNode {
  value: Op | { type: "addWriter"; key: Uint8Array };
  from: { key: Uint8Array };
}

interface View {
  get(key: string): Promise<{ value: unknown } | null>;
  put(key: string, value: unknown): Promise<void>;
  createReadStream(opts: {
    gte?: string;
    lt?: string;
  }): AsyncIterable<{ key: string; value: unknown }>;
}

interface Base {
  addWriter(key: Uint8Array): Promise<void>;
}

function stripSig<T extends Record<string, unknown>>(record: T): Omit<T, "sig"> {
  const { sig: _, ...rest } = record;
  return rest as Omit<T, "sig">;
}

export function makeApply(deps: ApplyDeps) {
  return async function apply(
    batch: ReadonlyArray<ApplyNode>,
    view: View,
    base: Base
  ): Promise<void> {
    const roster = await loadRoster(view);
    const revoked = await loadRevoked(view);

    for (const node of batch) {
      const op = node.value;

      // Control op: addWriter — only admit roster members
      if ("type" in op && op.type === "addWriter") {
        const candHex = b4a.toString(op.key, "hex");
        if (roster.has(candHex) && !revoked.has(candHex)) {
          await base.addWriter(op.key);
        }
        continue;
      }

      const dataOp = op as Op;
      const writerPeerId = b4a.toString(node.from.key, "hex");

      // Founder bootstrap exception: founder writing its own Member record
      // into the empty roster
      const isFounderBootstrap =
        writerPeerId === deps.founderPeerId &&
        dataOp.kind === "member" &&
        dataOp.value["peerId"] === deps.founderPeerId &&
        !roster.has(deps.founderPeerId);

      // Roster gate
      if (!isFounderBootstrap && (!roster.has(writerPeerId) || revoked.has(writerPeerId))) {
        continue;
      }

      // Governance signature verification
      if (dataOp.kind === "member" || dataOp.kind === "revocation") {
        const signerPeerId = (dataOp.kind === "member"
          ? dataOp.value["admittedBy"]
          : dataOp.value["issuedBy"]) as string | undefined;
        if (!signerPeerId || typeof signerPeerId !== "string") continue;

        // Find signer's public key:
        // 1) The current op (if it's the founder's own self-bootstrap)
        // 2) Or the roster (the signer must already be present)
        let signerPublicKey: Uint8Array | null = null;
        if (
          isFounderBootstrap &&
          typeof dataOp.value["publicKey"] === "string"
        ) {
          signerPublicKey = b4a.from(dataOp.value["publicKey"] as string, "hex");
        } else {
          const signer = roster.get(signerPeerId);
          if (!signer?.publicKey) continue;
          if (dataOp.kind === "revocation" && signer.role !== "admin") continue;
          signerPublicKey = b4a.from(signer.publicKey, "hex");
        }

        const sig = dataOp.value["sig"] as string | undefined;
        if (typeof sig !== "string") continue;
        const ok = verifyCanonical(stripSig(dataOp.value), sig, signerPublicKey);
        if (!ok) continue;
      }

      await view.put(dataOp.key, dataOp.value);

      // Promote the freshly-added member into the in-memory roster
      // so subsequent ops in the same batch see it.
      if (dataOp.kind === "member") {
        roster.set(
          dataOp.value["peerId"] as string,
          dataOp.value as unknown as RosterMember
        );
      }
      if (dataOp.kind === "revocation") {
        revoked.add(dataOp.value["targetPeerId"] as string);
      }
    }
  };
}
