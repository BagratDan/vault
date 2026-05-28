// @ts-expect-error — corestore has no published types
import Corestore from "corestore";
// @ts-expect-error — autobee has no published types
import Autobee from "autobee";
import b4a from "b4a";
import { makeApply } from "./apply.js";

// ---------------------------------------------------------------------------
// Hyperbee2 view adapter
// ---------------------------------------------------------------------------
// autobee@1.0.0 passes a Hyperbee2 (hyperbee2) instance as the `view`
// argument to the apply() callback.  Hyperbee2 does NOT have a `put` method;
// writes go through `view.write()` → WriteBatch → `tryPut(keyBuf, valueBuf)`
// + `flush()`.  Keys and values are raw Buffers.
//
// Our apply.ts was written against a higher-level interface:
//   view.put(key: string, value: unknown)
//   view.get(key: string) → { value: unknown } | null
//   view.createReadStream({ gte?, lt? }) → AsyncIterable<{ key, value }>
//
// This adapter bridges the gap so that apply.ts can stay clean.
// ---------------------------------------------------------------------------

class HyperbeeViewAdapter {
  private readonly _hb: {
    write(): {
      tryPut(k: Uint8Array, v: Uint8Array): void;
      flush(): Promise<void>;
    };
    get(k: Uint8Array): Promise<{ key: Uint8Array; value: Uint8Array } | null>;
    createReadStream(opts: {
      gte?: Uint8Array;
      lt?: Uint8Array;
    }): AsyncIterable<{ key: Uint8Array; value: Uint8Array }>;
  };

  constructor(hyperbee: unknown) {
    this._hb = hyperbee as HyperbeeViewAdapter["_hb"];
  }

  async put(key: string, value: unknown): Promise<void> {
    const wb = this._hb.write();
    wb.tryPut(b4a.from(key), b4a.from(JSON.stringify(value)));
    await wb.flush();
  }

  async get(key: string): Promise<{ value: unknown } | null> {
    const entry = await this._hb.get(b4a.from(key));
    if (!entry) return null;
    return { value: JSON.parse(b4a.toString(entry.value)) as unknown };
  }

  async *createReadStream(opts: {
    gte?: string;
    lt?: string;
  }): AsyncIterable<{ key: string; value: unknown }> {
    const bufOpts: { gte?: Uint8Array; lt?: Uint8Array } = {};
    if (opts.gte != null) bufOpts.gte = b4a.from(opts.gte);
    if (opts.lt != null) bufOpts.lt = b4a.from(opts.lt);
    for await (const entry of this._hb.createReadStream(bufOpts)) {
      yield {
        key: b4a.toString(entry.key),
        value: JSON.parse(b4a.toString(entry.value)) as unknown,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OpenAutobeeStoreInput {
  rootDir: string;
  /**
   * For `role: "admin"`: ignored — the store derives founderPeerId from its
   * own Autobee local writer key (bee.local.key) after ready().
   *
   * For `role: "member"`: the hex-encoded public key of the vault founder
   * (admin) that apply() uses as the trusted bootstrap writer.
   */
  founderPeerId?: string;
  role: "admin" | "member";
  /**
   * Required for members: the admin's Autobee bootstrap key (hex, 64 chars).
   * For the founder / admin role this is derived from bee.key after ready().
   */
  bootstrapKey?: string;
}

export interface OpenedAutobeeStore {
  view: {
    get(key: string): Promise<{ value: unknown } | null>;
    createReadStream(opts: {
      gte?: string;
      lt?: string;
    }): AsyncIterable<{ key: string; value: unknown }>;
  };
  /** Append an Op (automatically JSON-serialised to a Buffer). */
  append(op: unknown): Promise<void>;
  /**
   * Wait until all locally-appended ops have been processed by apply().
   * Equivalent to bee.update() in autobee@1.0.0.
   */
  flush(): Promise<void>;
  /**
   * The resolved founderPeerId used by apply() — for admins this is the
   * hex-encoded local writer public key (bee.local.key); for members it is
   * the founderPeerId provided in the input.
   */
  founderPeerId: string;
  /**
   * Hex-encoded public key of the local Autobee writer core (= bee.local.key).
   * This is the peerId that apply() will see as the writer of locally-appended
   * ops.  For admins this equals founderPeerId.
   */
  localPeerId: string;
  /** Ed25519 secret key of the local writer (64 bytes). */
  secretKey: Uint8Array;
  /** Hex-encoded bootstrap key (= bee.key) clients need to join this store. */
  bootstrapKey: string;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export async function openAutobeeStore(
  input: OpenAutobeeStoreInput
): Promise<OpenedAutobeeStore> {
  if (input.role === "member") {
    if (!input.bootstrapKey) {
      throw new Error("openAutobeeStore: members must provide bootstrapKey");
    }
    if (!input.founderPeerId) {
      throw new Error("openAutobeeStore: members must provide founderPeerId");
    }
  }

  const store = new Corestore(input.rootDir) as {
    ready(): Promise<void>;
    close(): Promise<void>;
  };
  await store.ready();

  const bootstrap: Uint8Array | null =
    input.role === "member"
      ? (b4a.from(input.bootstrapKey!, "hex") as Uint8Array)
      : null;

  // We use a late-binding container so the apply closure can reference
  // the resolved applyFn after bee.ready().  During the brief window
  // between the Autobee constructor and ready() no apply() calls occur.
  let applyFn: ReturnType<typeof makeApply> | null = null;

  // autobee@1.0.0 API:
  //   new Autobee(store, bootstrapKey | null, { apply })
  //
  // The apply callback signature: (batch, view, base)
  //   - batch: node[]  where node = { key: Uint8Array (writer pubkey),
  //                                   value: Uint8Array (raw oplog Buffer),
  //                                   ... }
  //   - view: Hyperbee2 instance (writable in apply context)
  //   - base: ApplyCalls — has addWriter(key: Uint8Array)
  //
  // Key differences from the Plan-2 design assumption:
  //   1. node.key (not node.from.key) is the writer's public key
  //   2. node.value is a raw Buffer → must JSON.parse
  //   3. view has no .put(); writes via view.write() → WriteBatch → tryPut()
  //   4. valueEncoding: "json" is silently ignored (oplog always uses buffers)

  const bee = new Autobee(store, bootstrap, {
    apply: async (
      batch: Array<{
        key: Uint8Array;
        value: Uint8Array;
        core: { keyPair: { publicKey: Uint8Array } };
      }>,
      rawView: unknown,
      base: { addWriter(key: Uint8Array): Promise<void> }
    ) => {
      if (!applyFn) return; // guard: should not happen after ready()
      const adaptedView = new HyperbeeViewAdapter(rawView);

      // Adapt autobee@1.0.0 nodes → shape that apply.ts expects:
      //   { from: { key: Uint8Array }, value: Record<string, unknown> }
      //
      // IMPORTANT: node.key is the Hypercore data key, NOT the signing key.
      // The signing public key is at node.core.keyPair.publicKey (verified by
      // probe: this matches bee.local.keyPair.publicKey exactly).
      // apply.ts uses from.key to verify Ed25519 signatures, so we must use
      // the signing key here.
      const adaptedBatch = batch.map((node) => ({
        from: { key: node.core.keyPair.publicKey },
        value: JSON.parse(b4a.toString(node.value)) as Record<string, unknown>,
      }));

      await applyFn(
        adaptedBatch as never,
        adaptedView as never,
        base as never
      );
    },
  }) as {
    ready(): Promise<void>;
    close(): Promise<void>;
    append(buf: Uint8Array): Promise<void>;
    update(): Promise<void>;
    key: Uint8Array;
    local: {
      key: Uint8Array;
      keyPair: { publicKey: Uint8Array; secretKey: Uint8Array };
    };
    view: {
      get(k: Uint8Array): Promise<{ key: Uint8Array; value: Uint8Array } | null>;
      createReadStream(opts: {
        gte?: Uint8Array;
        lt?: Uint8Array;
      }): AsyncIterable<{ key: Uint8Array; value: Uint8Array }>;
    };
  };

  await bee.ready();

  // bee.local is a Hypercore.  Its keyPair is populated after ready().
  //   bee.local.key          → Uint8Array (public key, 32 bytes)
  //   bee.local.keyPair      → { publicKey, secretKey }
  //   bee.local.keyPair.secretKey → 64-byte Ed25519 secret key
  // bee.key → bootstrap key (= bee.local.key for the admin/founding node)
  const secretKey = bee.local.keyPair.secretKey;
  if (!secretKey) {
    throw new Error(
      "openAutobeeStore: could not locate writer secret key on bee.local.keyPair"
    );
  }

  // The signing public key (keyPair.publicKey) is the Ed25519 key used for
  // vault identity.  node.key in apply() is the Hypercore data key — different
  // from keyPair.publicKey.  We expose the signing key as localPeerId because
  // that is what apply.ts signature verification uses.
  const localPeerId = b4a.toString(
    bee.local.keyPair.publicKey,
    "hex"
  ) as string;

  // For admins: the founderPeerId is the local writer's signing public key.
  // For members: it is the provided input.founderPeerId.
  const founderPeerId =
    input.role === "admin" ? localPeerId : (input.founderPeerId as string);

  // Wire up the apply function now that we know the founderPeerId.
  applyFn = makeApply({ founderPeerId });

  const bootstrapKeyHex =
    input.role === "admin"
      ? b4a.toString(bee.key, "hex")
      : (input.bootstrapKey as string);

  const viewAdapter = new HyperbeeViewAdapter(bee.view);

  return {
    view: {
      get: (key) => viewAdapter.get(key),
      createReadStream: (opts) => viewAdapter.createReadStream(opts),
    },
    append: async (op) => {
      // Serialize op to Buffer before passing to autobee's append.
      const buf = b4a.from(JSON.stringify(op)) as Uint8Array;
      await bee.append(buf);
    },
    flush: async () => {
      await bee.update();
    },
    founderPeerId,
    localPeerId,
    secretKey,
    bootstrapKey: bootstrapKeyHex,
    close: async () => {
      // autobee@1.0.0 closes the store internally in bee.close().
      await bee.close();
    },
  };
}

// Preserve Plan 1's openStore for back-compat with existing tests.
export { openStore } from "./store-legacy.js";
export type { OpenedStore } from "./store-legacy.js";
