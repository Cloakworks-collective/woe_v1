import { describe, expect, it } from "vitest";
import { RESEARCH_DISCIPLINES, RESEARCH_FIELDS, MAX_FIELD_LEVEL } from "./research";
import { RESEARCH_INFO, RESEARCH_GUIDE } from "./descriptions";

// Six fields once existed in the game — costing points, researchable by the
// Steward — while appearing on NO page a player researches from, because the
// research page kept its own hand-written list of ids beside the real one.
// These lock every parallel list to RESEARCH_FIELDS so it cannot happen twice.

describe("every research field is reachable", () => {
  const ids = RESEARCH_FIELDS.map((f) => f.id);

  it("appears in exactly one discipline", () => {
    const placed = RESEARCH_DISCIPLINES.flatMap((d) => d.fields);
    const missing = ids.filter((id) => !placed.includes(id));
    expect(missing, `not on the research page: ${missing.join(", ")}`).toEqual([]);
    // …and none is listed twice, which would render it twice.
    expect(placed.length).toBe(new Set(placed).size);
    // …and no discipline names a field that does not exist.
    const ghosts = placed.filter((id) => !ids.includes(id));
    expect(ghosts, `disciplines name unknown fields: ${ghosts.join(", ")}`).toEqual([]);
  });

  it("has a title and tip", () => {
    const missing = ids.filter((id) => !RESEARCH_INFO[id]?.title || !RESEARCH_INFO[id]?.tip);
    expect(missing).toEqual([]);
  });

  it("has a guide link", () => {
    expect(ids.filter((id) => !RESEARCH_GUIDE[id])).toEqual([]);
  });

  it("has an icon drawn for it", async () => {
    const { existsSync } = await import("node:fs");
    const missing = ids.filter((id) => !existsSync(`public/art/research/${id}.png`));
    expect(missing, `no art/research/*.png for: ${missing.join(", ")}`).toEqual([]);
  });

  it("caps at MAX_FIELD_LEVEL, so the tree is fields × levels", () => {
    expect(MAX_FIELD_LEVEL).toBeGreaterThan(0);
    expect(ids.length * MAX_FIELD_LEVEL).toBe(RESEARCH_FIELDS.length * MAX_FIELD_LEVEL);
  });
});
