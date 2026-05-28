// Ambient declarations for modules used by @vault/sync that ship without
// TypeScript type definitions. Shapes match the runtime contract of the
// specific pinned versions (hypercore-crypto@3.x, b4a@1.x).

declare module "b4a" {
  export function isBuffer(value: unknown): boolean;
  export function isEncoding(encoding: string): boolean;
  export function alloc(
    size: number,
    fill?: string | number | Uint8Array,
    encoding?: BufferEncoding
  ): Buffer;
  export function allocUnsafe(size: number): Buffer;
  export function allocUnsafeSlow(size: number): Buffer;
  export function byteLength(
    string: string | Uint8Array,
    encoding?: BufferEncoding
  ): number;
  export function compare(a: Uint8Array, b: Uint8Array): -1 | 0 | 1;
  export function concat(buffers: Uint8Array[], totalLength?: number): Buffer;
  export function copy(
    source: Uint8Array,
    target: Uint8Array,
    targetStart?: number,
    start?: number,
    end?: number
  ): number;
  export function equals(a: Uint8Array, b: Uint8Array): boolean;
  export function from(
    value: string | ArrayBuffer | ArrayLike<number> | Uint8Array,
    encodingOrOffset?: BufferEncoding | number,
    length?: number
  ): Buffer;
  export function toString(
    buffer: Uint8Array,
    encoding?: BufferEncoding,
    start?: number,
    end?: number
  ): string;
  export function toBuffer(value: Uint8Array): Buffer;
  export function write(
    buffer: Uint8Array,
    string: string,
    offset?: number,
    length?: number,
    encoding?: BufferEncoding
  ): number;
}

declare module "hyperswarm" {
  interface ConnectionInfo {
    publicKey: Uint8Array;
  }
  interface DuplexStream {
    write(data: Uint8Array): boolean;
    on(event: "data", cb: (data: Uint8Array) => void): this;
    on(event: "close", cb: () => void): this;
    on(event: "error", cb: (err: Error) => void): this;
  }
  class Hyperswarm {
    constructor(opts?: Record<string, unknown>);
    on(event: "connection", cb: (conn: DuplexStream, info: ConnectionInfo) => void): this;
    join(topic: Uint8Array, opts?: { server?: boolean; client?: boolean }): unknown;
    flush(): Promise<void>;
    destroy(opts?: { force?: boolean }): Promise<void>;
  }
  export default Hyperswarm;
}

declare module "hypercore-crypto" {
  export interface KeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  }

  export function keyPair(seed?: Uint8Array): KeyPair;
  export function validateKeyPair(keyPair: KeyPair): boolean;
  export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array;
  export function verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array
  ): boolean;
  export function hash(data: Uint8Array | Uint8Array[]): Uint8Array;
  export function randomBytes(n: number): Uint8Array;
  export function discoveryKey(publicKey: Uint8Array): Uint8Array;
  export function namespace(name: string, count?: number): Uint8Array[];
}

declare module "hypercore" {
  interface HypercoreOpts {
    valueEncoding?: "json" | "binary" | "utf-8";
    createIfMissing?: boolean;
  }
  class Hypercore {
    constructor(storage: string, opts?: HypercoreOpts);
    ready(): Promise<void>;
    append(block: unknown): Promise<number>;
    get length(): number;
    get(index: number): Promise<unknown>;
    createReadStream(opts?: {
      start?: number;
      end?: number;
      live?: boolean;
    }): AsyncIterable<unknown>;
    close(): Promise<void>;
  }
  export default Hypercore;
}
