import Link from "next/link";
import { notFound } from "next/navigation";
import { ElderAgeDetail } from "@/components/ElderAges";
import { Panel } from "@/components/Panel";
import { ELDER_AGES, groupForAge } from "@/lib/lore/elderAges";

const RACE_ICON: Record<string, string> = {
  Human: "🧑",
  Elf: "🏹",
  Orc: "🐗",
  Troll: "🪓",
  Dwarf: "⛏",
  Gnoll: "🐺",
};

export const dynamic = "force-dynamic";

export default async function ElderAgePage({ params }: { params: Promise<{ age: string }> }) {
  const { age } = await params;
  const n = Number(age);
  const a = ELDER_AGES.find((x) => x.age === n);
  if (!a) notFound();

  const group = groupForAge(a.age);
  const nums = ELDER_AGES.map((x) => x.age).sort((x, y) => x - y);
  const prev = nums.filter((x) => x < a.age).pop();
  const next = nums.find((x) => x > a.age);
  const mark = a.victorIsEmpire ? "🛡" : a.victorRace ? RACE_ICON[a.victorRace] ?? "" : "";

  return (
    <>
      <p style={{ margin: "0 0 8px", fontSize: 12.5 }}>
        <Link href="/annals">← The Annals</Link> · <span style={{ color: "var(--ink-soft)" }}>{group.title}</span>
      </p>

      <Panel title={`⚜ Age ${a.age} — ${a.name}`}>
        <p className="elder-detail-head">
          <span className="elder-span">{a.span}</span>
          <span className="elder-card-victor">
            🏆 {a.victor} {mark}
          </span>
        </p>
        <ElderAgeDetail age={a} />
      </Panel>

      <nav className="elder-pager" aria-label="Browse the elder ages">
        {prev ? (
          <Link href={`/annals/age/${prev}`} className="elder-pager-link">
            ← Age {prev}
          </Link>
        ) : (
          <span />
        )}
        <Link href="/annals" className="elder-pager-link">
          All ages
        </Link>
        {next ? (
          <Link href={`/annals/age/${next}`} className="elder-pager-link">
            Age {next} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
