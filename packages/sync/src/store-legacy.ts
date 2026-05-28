// @ts-expect-error - corestore has no published types
import Corestore from "corestore";
// @ts-expect-error - hyperbee has no published types
import Hyperbee from "hyperbee";

export interface OpenedStore {
  store: unknown;
  bee: unknown;
  close: () => Promise<void>;
}

export async function openStore(rootDir: string): Promise<OpenedStore> {
  const store = new Corestore(rootDir);
  await store.ready();
  const core = store.get({ name: "vault-data" });
  await core.ready();
  const bee = new Hyperbee(core, {
    keyEncoding: "utf-8",
    valueEncoding: "json",
  });
  await bee.ready();
  return {
    store,
    bee,
    close: async () => {
      await bee.close();
      await store.close();
    },
  };
}
