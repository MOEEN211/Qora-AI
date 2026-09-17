import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parseEnv } from "node:util";

export function updateEnvText(source, values) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  let result = source;
  for (const [key, value] of Object.entries(values)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || !/^[a-zA-Z0-9_.,@:/+=-]*$/.test(value)) throw new Error("Unsafe generated environment value.");
    const pattern = new RegExp(`^(?:export\\s+)?${key}\\s*=.*$`, "gm");
    const matches = [...result.matchAll(pattern)];
    if (matches.length > 1) throw new Error(`Duplicate ${key} entries in .env. Keep one before retrying.`);
    result = matches.length ? result.replace(pattern, `${key}=${value}`) : result.replace(/\s*$/, "") + newline + `${key}=${value}` + newline;
  }
  const parsed = parseEnv(result);
  if (Object.entries(values).some(([key, value]) => parsed[key] !== value)) throw new Error("Could not safely update .env.");
  return result;
}

export async function saveGeneratedEnv(path, values) {
  // Read again immediately before writing, preserving the buyer's other keys/comments.
  const source = await readFile(path, "utf8");
  const updated = updateEnvText(source, values);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, updated, { mode: 0o600, flag: "wx" });
    if (await readFile(path, "utf8") !== source) throw new Error(".env changed during setup. Rerun to resume safely.");
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}
