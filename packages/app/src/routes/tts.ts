import { synthesizeStream, type ModelPool } from "@vault/ai";

export interface TtsDeps {
  pool: ModelPool;
}

export async function* streamTts(
  deps: TtsDeps,
  text: string
): AsyncGenerator<Uint8Array, void, void> {
  yield* synthesizeStream(deps.pool, text);
}
