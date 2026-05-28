import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface WriteOptions {
  /** POSIX file mode. Defaults to 0o600 — readable/writable by owner only. */
  mode?: number;
}

export class VaultFs {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  /**
   * Resolve a relative path against VAULT_ROOT and verify it doesn't escape
   * the root either via .. segments OR via symlinks. Symlink resolution
   * walks the deepest existing ancestor through realpath; if any segment
   * already exists as a symlink pointing outside root, the call throws.
   */
  private async resolveSafe(rel: string): Promise<string> {
    const resolved = path.resolve(this.root, rel);
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error(`refused: ${rel} resolves outside VAULT_ROOT`);
    }
    // Ensure the root exists as a real directory before the symlink check —
    // otherwise the deepest-existing-ancestor walk would land on a parent of
    // root and (correctly) refuse it as "outside root".
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const realRoot = await fs.realpath(this.root);
    // Walk up from `resolved` to the deepest existing path; realpath it to
    // detect a symlink-based escape; require the real path to still be
    // under realRoot.
    let cursor = resolved;
    while (cursor !== path.dirname(cursor)) {
      try {
        const realCursor = await fs.realpath(cursor);
        if (realCursor !== realRoot && !realCursor.startsWith(realRoot + path.sep)) {
          throw new Error(`refused: ${rel} resolves outside VAULT_ROOT via symlink`);
        }
        break;
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: string }).code === "ENOENT"
        ) {
          cursor = path.dirname(cursor);
          continue;
        }
        throw err;
      }
    }
    return resolved;
  }

  /**
   * Resolve an absolute path that may live anywhere on the user's machine
   * (NOT confined to VAULT_ROOT). Used by folder-add to validate user-
   * supplied paths. Refuses paths whose realpath escapes $HOME or sits in
   * a system directory. The deepest existing ancestor is realpath'd to
   * catch symlink-based escapes.
   */
  async resolveSafeAbsolute(rawPath: string): Promise<string> {
    const absPath = sanitizeUserPath(rawPath);
    if (!path.isAbsolute(absPath)) {
      throw new Error(`refused: ${absPath} is not absolute`);
    }
    const refuseList = [
      "/etc",
      "/var",
      "/System",
      "/private",
      "/Library/Keychains",
      "/.ssh",
    ];
    for (const r of refuseList) {
      if (absPath === r || absPath.startsWith(r + path.sep)) {
        throw new Error(`refused: ${absPath} is in system refuse-list`);
      }
    }
    const home = os.homedir();
    const homeReal = await fs.realpath(home);
    let cursor = absPath;
    let realCursor: string | null = null;
    while (cursor !== path.dirname(cursor)) {
      try {
        realCursor = await fs.realpath(cursor);
        break;
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: string }).code === "ENOENT"
        ) {
          cursor = path.dirname(cursor);
          continue;
        }
        throw err;
      }
    }
    if (!realCursor) {
      throw new Error(`refused: ${absPath} has no existing ancestor`);
    }
    if (
      realCursor !== homeReal &&
      !realCursor.startsWith(homeReal + path.sep)
    ) {
      throw new Error(`refused: ${absPath} resolves outside $HOME`);
    }
    return absPath;
  }

  async writeFile(
    rel: string,
    data: Uint8Array,
    options: WriteOptions = {}
  ): Promise<void> {
    const abs = await this.resolveSafe(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true, mode: 0o700 });
    await fs.writeFile(abs, data, { mode: options.mode ?? 0o600 });
  }

  async readFile(rel: string): Promise<Uint8Array> {
    const abs = await this.resolveSafe(rel);
    return fs.readFile(abs);
  }

  async exists(rel: string): Promise<boolean> {
    try {
      const abs = await this.resolveSafe(rel);
      await fs.stat(abs);
      return true;
    } catch {
      return false;
    }
  }

  async ensureDir(rel: string): Promise<void> {
    const abs = await this.resolveSafe(rel);
    await fs.mkdir(abs, { recursive: true, mode: 0o700 });
  }

  /** Resolve a relative subpath against VAULT_ROOT. Returns absolute path. */
  path(rel: string): string {
    return path.resolve(this.root, rel);
  }
}

/**
 * Normalize a user-supplied filesystem path before validation. Handles the
 * real-world mangling that happens when a user copies a path on macOS and
 * pastes it into a web input:
 *
 *  - macOS Finder "Copy as Pathname" / title-bar drag prepends Unicode
 *    directional-formatting marks (U+202A LRE … U+202C PDF, plus LRM/RLM,
 *    and a zero-width BOM/space can sneak in). These make `path.isAbsolute`
 *    return false even though the visible text starts with "/".
 *  - A leading "~" or "~/" is expanded to the user's home directory.
 *  - Surrounding whitespace and matched quotes are trimmed.
 *
 * This runs at the trust boundary (resolveSafeAbsolute) and only NORMALIZES
 * the input — the realpath + refuse-list + $HOME checks still gate the
 * cleaned path, so sanitizing here does not weaken the security model.
 */
export function sanitizeUserPath(input: string): string {
  // Strip Unicode bidi/format/zero-width controls anywhere in the string:
  // ZWSP/ZWNJ/ZWJ (U+200B-200D), LRM/RLM (U+200E-200F),
  // LRE/RLE/PDF/LRO/RLO (U+202A-202E), LRI/RLI/FSI/PDI (U+2066-2069), BOM (U+FEFF).
  let p = input.replace(
    /[​-‏‪-‮⁦-⁩﻿]/gu,
    ""
  );
  p = p.trim();
  // Strip a single pair of surrounding quotes (users sometimes paste with them).
  if (
    (p.startsWith('"') && p.endsWith('"')) ||
    (p.startsWith("'") && p.endsWith("'"))
  ) {
    p = p.slice(1, -1).trim();
  }
  // Expand a leading ~ / ~/ to the home directory.
  if (p === "~" || p.startsWith("~/")) {
    p = path.join(os.homedir(), p.slice(1));
  }
  return p;
}
