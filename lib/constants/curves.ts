// Curves — pluggable formula shapes for balance.ts (spec/overview.md §Curves).
//
// A Curve is PURE DATA describing y = f(x). The tuning file picks a shape per
// site (growth, costs, research price…) and the engine evaluates it through
// evalCurve — so an era can swap "geometric research costs" for "linear" (or a
// hand-written equation) by editing data, never engine code.
//
// Kinds:
//   constant     y = value
//   linear       y = base + perX·x
//   geometric    y = base · ratio^x
//   exponential  y = base · e^(rate·x)
//   polynomial   y = c0 + c1·x + c2·x² + …          (coefficients: [c0, c1, …])
//   steps        y = y of the last point with px ≤ x (step lookup table)
//   expr         y = your own equation as a string — "2000 * 1.3 ^ (x - 1)"
//
// The `expr` kind is evaluated by the small parser below: NO eval(), a strict
// whitelist of tokens, deterministic. Variables `x`, `level`, and `n` are
// aliases for the site's input. Allowed: numbers, + - * / ^ ( ), and the
// functions min max floor ceil round sqrt abs log exp. `-` binds looser than
// `^` (so "-2^2" = −4) and `^` is right-associative ("2^3^2" = 512).

export type Curve =
  | { kind: "constant"; value: number }
  | { kind: "linear"; base: number; perX: number }
  | { kind: "geometric"; base: number; ratio: number }
  | { kind: "exponential"; base: number; rate: number }
  | { kind: "polynomial"; coefficients: number[] }
  | { kind: "steps"; points: [x: number, y: number][] }
  | { kind: "expr"; formula: string };

/** Evaluate a curve at x. Throws on a malformed `expr` formula or a non-finite
 *  result — loudly, at dev time, never silently. */
export function evalCurve(curve: Curve, x: number): number {
  let y: number;
  switch (curve.kind) {
    case "constant":
      y = curve.value;
      break;
    case "linear":
      y = curve.base + curve.perX * x;
      break;
    case "geometric":
      y = curve.base * curve.ratio ** x;
      break;
    case "exponential":
      y = curve.base * Math.exp(curve.rate * x);
      break;
    case "polynomial":
      y = curve.coefficients.reduce((sum, c, i) => sum + c * x ** i, 0);
      break;
    case "steps": {
      const pts = curve.points;
      if (pts.length === 0) throw new Error("steps curve needs at least one point");
      y = pts[0][1];
      for (const [px, py] of pts) {
        if (px <= x) y = py;
        else break;
      }
      break;
    }
    case "expr":
      y = compileExpr(curve.formula)(x);
      break;
  }
  if (!Number.isFinite(y)) {
    throw new Error(`Curve ${JSON.stringify(curve)} produced ${y} at x=${x}`);
  }
  return y;
}

// ── The expression compiler (recursive descent, whitelisted, cached) ────────

type ExprFn = (x: number) => number;

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log,
  exp: Math.exp,
};
const VARIABLES = new Set(["x", "level", "n"]);

const cache = new Map<string, ExprFn>();

export function compileExpr(formula: string): ExprFn {
  const hit = cache.get(formula);
  if (hit) return hit;

  // Tokenize.
  type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };
  const tokens: Tok[] = [];
  const re = /\s*(?:(\d+\.?\d*|\.\d+)|([a-zA-Z_]\w*)|([+\-*/^(),]))/y;
  let pos = 0;
  while (pos < formula.length) {
    re.lastIndex = pos;
    const m = re.exec(formula);
    if (!m || m.index !== pos) {
      // allow trailing whitespace
      if (/^\s+$/.test(formula.slice(pos))) break;
      throw new Error(`Bad token in formula at "${formula.slice(pos, pos + 10)}"`);
    }
    pos = re.lastIndex;
    if (m[1] !== undefined) tokens.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ t: "id", v: m[2] });
    else if (m[3] !== undefined) tokens.push({ t: "op", v: m[3] });
  }

  // Parse (precedence: + - < * / < unary - < ^, with ^ right-associative).
  let i = 0;
  const peek = () => tokens[i];
  const take = () => tokens[i++];
  const expect = (op: string) => {
    const t = take();
    if (!t || t.t !== "op" || t.v !== op) throw new Error(`Expected "${op}" in formula "${formula}"`);
  };

  function parseExpr(): ExprFn {
    let left = parseTerm();
    while (peek()?.t === "op" && (peek()!.v === "+" || peek()!.v === "-")) {
      const op = (take() as { v: string }).v;
      const right = parseTerm();
      const l = left;
      left = op === "+" ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
    }
    return left;
  }

  function parseTerm(): ExprFn {
    let left = parseUnary();
    while (peek()?.t === "op" && (peek()!.v === "*" || peek()!.v === "/")) {
      const op = (take() as { v: string }).v;
      const right = parseUnary();
      const l = left;
      left = op === "*" ? (x) => l(x) * right(x) : (x) => l(x) / right(x);
    }
    return left;
  }

  function parseUnary(): ExprFn {
    if (peek()?.t === "op" && peek()!.v === "-") {
      take();
      const inner = parseUnary();
      return (x) => -inner(x);
    }
    return parsePower();
  }

  function parsePower(): ExprFn {
    const base = parsePrimary();
    if (peek()?.t === "op" && peek()!.v === "^") {
      take();
      const exp = parseUnary(); // right-associative; allows 2^-3
      return (x) => base(x) ** exp(x);
    }
    return base;
  }

  function parsePrimary(): ExprFn {
    const t = take();
    if (!t) throw new Error(`Formula ended unexpectedly: "${formula}"`);
    if (t.t === "num") {
      const v = t.v;
      return () => v;
    }
    if (t.t === "id") {
      if (VARIABLES.has(t.v)) return (x) => x;
      const fn = FUNCTIONS[t.v];
      if (fn) {
        expect("(");
        const args: ExprFn[] = [parseExpr()];
        while (peek()?.t === "op" && peek()!.v === ",") {
          take();
          args.push(parseExpr());
        }
        expect(")");
        return (x) => fn(...args.map((a) => a(x)));
      }
      throw new Error(`Unknown identifier "${t.v}" in formula "${formula}"`);
    }
    if (t.t === "op" && t.v === "(") {
      const inner = parseExpr();
      expect(")");
      return inner;
    }
    throw new Error(`Unexpected "${t.v}" in formula "${formula}"`);
  }

  const fn = parseExpr();
  if (i < tokens.length) throw new Error(`Trailing tokens in formula "${formula}"`);
  cache.set(formula, fn);
  return fn;
}
