import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface ScannedFile {
  absPath: string;
  size: number;
  lastModified: string;
  ext: string; // lowercased, includes the dot, e.g. ".pdf"
}

export interface ScanFolderOpts {
  /** Default 50 MB. */
  maxFileBytes?: number;
  /** Default 8. */
  maxDepth?: number;
  /** Default known noise dirs. */
  skipDirs?: readonly string[];
}

const DEFAULT_SKIP_DIRS: readonly string[] = [
  ".git",
  "node_modules",
  ".venv",
  "__pycache__",
  "dist",
  "build",
  ".next",
];

const SUPPORTED_EXT = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".pdf",
  ".docx",
  ".mp3",
  ".wav",
  ".m4a",
  ".flac",
  ".ogg",
]);

/**
 * Recursive walker. Skips:
 *  - files > maxFileBytes
 *  - hidden files (basename starts with ".")
 *  - directories in skipDirs
 *  - depths > maxDepth
 *  - symlinks whose realpath escapes $HOME
 *  - files whose extension isn't in SUPPORTED_EXT
 */
export async function scanFolder(
  rootAbsPath: string,
  opts: ScanFolderOpts = {}
): Promise<ScannedFile[]> {
  const maxBytes = opts.maxFileBytes ?? 50 * 1024 * 1024;
  const maxDepth = opts.maxDepth ?? 8;
  const skipDirs = new Set(opts.skipDirs ?? DEFAULT_SKIP_DIRS);
  const home = os.homedir();
  const homeReal = await fs.realpath(home);

  const out: ScannedFile[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir; skip
    }
    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith(".")) continue;
      const abs = path.join(dir, name);
      if (entry.isDirectory()) {
        if (skipDirs.has(name)) continue;
        await walk(abs, depth + 1);
        continue;
      }
      if (entry.isSymbolicLink()) {
        let real: string;
        try {
          real = await fs.realpath(abs);
        } catch {
          continue;
        }
        if (!real.startsWith(homeReal + path.sep) && real !== homeReal) {
          continue;
        }
        // fall through and stat the real target
      }
      const ext = path.extname(name).toLowerCase();
      if (!SUPPORTED_EXT.has(ext)) continue;
      let st: import("node:fs").Stats;
      try {
        st = await fs.stat(abs);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      if (st.size > maxBytes) continue;
      out.push({
        absPath: abs,
        size: st.size,
        lastModified: st.mtime.toISOString(),
        ext,
      });
    }
  }

  await walk(rootAbsPath, 0);
  return out;
}
