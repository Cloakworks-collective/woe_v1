// The harnesses must not be able to touch the database. Ever.
//
// They exist to be run casually — on a whim, mid-tuning, by anyone — and that
// is only safe if running one cannot change the world. "We were careful" is not
// a guarantee; an import added six months from now is. So this walks the ACTUAL
// transitive module graph of every harness and fails if the database layer is
// anywhere in it.
//
// Runs with the normal suite (`pnpm test`), not with `pnpm sim`, because a
// guard that only runs when you remember to run it is not a guard.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

/** Anything that can reach Postgres, the world blob, or the network. */
const FORBIDDEN = [
  "lib/server", // the whole server layer: store, world, pipeline, accounts
  "@supabase", // the client itself
  "next/", // server actions, cookies, headers
  "node:http",
  "node:https",
];

/** Resolve an import specifier to a file on disk, or null if it is external. */
function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // bare package — checked by name, not walked

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function importsOf(file: string): string[] {
  const src = fs.readFileSync(file, "utf8");
  // Strip comments first: this very file names "lib/server" in its prose, and a
  // guard that trips on its own documentation is a guard nobody keeps.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return [...code.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)].map((m) => m[1]!);
}

/** Every file reachable from an entry point, with the path that got there. */
function walk(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue: { file: string; trail: string[] }[] = [{ file: entry, trail: [entry] }];

  while (queue.length) {
    const { file, trail } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.set(file, trail);
    for (const spec of importsOf(file)) {
      const resolved = resolveImport(spec, file);
      if (resolved) queue.push({ file: resolved, trail: [...trail, resolved] });
      else seen.set(`pkg:${spec}`, [...trail, `pkg:${spec}`]);
    }
  }
  return seen;
}

const rel = (f: string) => path.relative(ROOT, f);

const HARNESS_DIR = path.join(ROOT, "simulations", "harnesses");
const harnessFiles = fs.readdirSync(HARNESS_DIR).filter((f) => f.endsWith(".ts"));

describe("the harnesses cannot touch the database", () => {
  it("has harnesses to check", () => {
    expect(harnessFiles.length).toBeGreaterThan(0);
  });

  for (const file of harnessFiles) {
    it(`${file} reaches nothing that can write`, () => {
      const graph = walk(path.join(HARNESS_DIR, file));
      const offenders: string[] = [];

      for (const [node, trail] of graph) {
        const name = node.startsWith("pkg:") ? node.slice(4) : rel(node);
        if (FORBIDDEN.some((f) => name.includes(f))) {
          offenders.push(`${name}\n      via ${trail.map((t) => (t.startsWith("pkg:") ? t.slice(4) : rel(t))).join("\n        → ")}`);
        }
      }

      expect(offenders, `${file} can reach:\n    ${offenders.join("\n    ")}`).toEqual([]);
    });
  }

  it("the whole graph is engine and constants only", () => {
    const packages = new Set<string>();
    for (const file of harnessFiles) {
      for (const node of walk(path.join(HARNESS_DIR, file)).keys()) {
        if (node.startsWith("pkg:")) packages.add(node.slice(4));
      }
    }
    // Whatever a harness pulls in from outside the repo, it is not a database
    // driver, an HTTP client, or a Next.js server primitive.
    for (const p of packages) {
      expect(FORBIDDEN.some((f) => p.includes(f)), `unexpected package: ${p}`).toBe(false);
    }
  });
});

describe("the runner writes only where it is told", () => {
  it("touches the filesystem only under an explicit env flag", () => {
    const src = fs.readFileSync(path.join(ROOT, "simulations", "run.ts"), "utf8");
    // Reports and the baseline are files, not database rows — but they are
    // still a side effect, and side effects must be asked for.
    expect(src).toContain("SIM_WRITE");
    expect(src).toContain("SIM_BASELINE");
    // The only writes in the runner are inside those two branches.
    const writes = [...src.matchAll(/writeFileSync|writeBaseline|mkdirSync/g)].length;
    expect(writes).toBeGreaterThan(0);
    expect(src).not.toMatch(/saveWorld|supabase|createClient/);
  });
});
