import { describe, expect, it } from "vitest";
import { compileExpr, evalCurve, type Curve } from "./curves";
import {
  buildingCostMultiplier,
  caravanDeliveryTurnsAt,
  storageShelterAtLevel,
  wallBonusAtLevel,
  wallHealthAtLevel,
  wallsScoreAtLevel,
  researchOutputAtLevel,
  workerOutputAtLevel,
} from "./derived";
import { researchOrdinalCost } from "./research";

describe("curve kinds", () => {
  it("constant / linear / geometric / exponential / polynomial", () => {
    expect(evalCurve({ kind: "constant", value: 7 }, 99)).toBe(7);
    expect(evalCurve({ kind: "linear", base: 110, perX: -10 }, 4)).toBe(70);
    expect(evalCurve({ kind: "geometric", base: 2, ratio: 3 }, 3)).toBe(54);
    expect(evalCurve({ kind: "exponential", base: 1, rate: 0 }, 5)).toBe(1);
    expect(evalCurve({ kind: "polynomial", coefficients: [0, 0, 100] }, 6)).toBe(3600);
  });

  it("steps: step-lookup of the last point at or below x", () => {
    const c: Curve = { kind: "steps", points: [[0, 1], [40, 5], [90, 20]] };
    expect(evalCurve(c, 0)).toBe(1);
    expect(evalCurve(c, 39)).toBe(1);
    expect(evalCurve(c, 40)).toBe(5);
    expect(evalCurve(c, 500)).toBe(20);
    expect(evalCurve(c, -5)).toBe(1); // clamps to the first point
  });

  it("expr: full equations with the site variable", () => {
    expect(evalCurve({ kind: "expr", formula: "2000 * 1.3 ^ (x - 1)" }, 1)).toBe(2000);
    expect(evalCurve({ kind: "expr", formula: "min(500, 50 * level)" }, 20)).toBe(500);
    expect(evalCurve({ kind: "expr", formula: "floor(sqrt(n) * 10)" }, 9)).toBe(30);
  });

  it("throws on a non-finite result", () => {
    expect(() => evalCurve({ kind: "expr", formula: "1 / (x - x)" }, 3)).toThrowError(/produced/);
  });
});

describe("the expression parser", () => {
  const f = (formula: string, x = 0) => compileExpr(formula)(x);

  it("precedence and associativity", () => {
    expect(f("2 + 3 * 4")).toBe(14);
    expect(f("(2 + 3) * 4")).toBe(20);
    expect(f("2 ^ 3 ^ 2")).toBe(512); // right-associative
    expect(f("-2 ^ 2")).toBe(-4); // unary minus binds looser than ^
    expect(f("2 ^ -2")).toBe(0.25);
    expect(f("10 - 4 - 3")).toBe(3); // left-associative
    expect(f("12 / 4 / 3")).toBe(1);
  });

  it("functions, nesting, and multiple args", () => {
    expect(f("max(1, 2, 3)")).toBe(3);
    expect(f("min(x + 1, 10)", 99)).toBe(10);
    expect(f("round(abs(-2.6))")).toBe(3);
    expect(f("ceil(log(exp(2)))")).toBe(2);
  });

  it("rejects anything off the whitelist", () => {
    expect(() => f("x; process.exit()")).toThrowError(/Bad token/);
    expect(() => f("evil(x)")).toThrowError(/Unknown identifier/);
    expect(() => f("y + 1")).toThrowError(/Unknown identifier/);
    expect(() => f("1 +")).toThrowError(/ended unexpectedly/);
    expect(() => f("1 2")).toThrowError(/Trailing tokens/);
  });
});

describe("the default curves reproduce the classic formulas exactly", () => {
  it("building cost multiplier: 1.5^(level−1)", () => {
    expect(buildingCostMultiplier(1)).toBe(1);
    expect(buildingCostMultiplier(4)).toBeCloseTo(1.5 ** 3);
  });

  it("research ordinal cost: 2000 × 1.3^(N−1), rounded", () => {
    expect(researchOrdinalCost(1)).toBe(2000);
    expect(researchOrdinalCost(2)).toBe(2600);
    expect(researchOrdinalCost(12)).toBe(Math.round(2000 * 1.3 ** 11));
  });

  it("worker output, wall bonus, walls score, storage, delivery", () => {
    expect(workerOutputAtLevel(1)).toBe(5);
    expect(workerOutputAtLevel(10)).toBe(50);
    // Scholars kept the old rate — research is not a resource.
    expect(researchOutputAtLevel(1)).toBe(50);
    expect(researchOutputAtLevel(10)).toBe(500);
    expect(wallBonusAtLevel(10)).toBeCloseTo(0.5); // flat edge — level buys health, not bonus
    expect(wallHealthAtLevel(10)).toBe(1_000_000); // the Citadel, the 10-bombard anchor
    expect(wallHealthAtLevel(5)).toBe(250_000);
    expect(wallsScoreAtLevel(8)).toBe(6400);
    expect(storageShelterAtLevel(6)).toBe(120000);
    expect(caravanDeliveryTurnsAt(1)).toBe(100);
    expect(caravanDeliveryTurnsAt(10)).toBe(10);
    expect(caravanDeliveryTurnsAt(15)).toBe(10); // floored
  });
});
