// The living War Records of the current age, drawn in the same hand as the
// sealed Elder Ages (reusing LeaderTable) so this age reads like history the
// moment it is made. The tables themselves are assembled server-side by
// lib/server/eraTables (buildEraTables / battleTables).

import { LeaderTable } from "./ElderAges";
import { battleTables } from "@/lib/server/eraTables";
import { eraRecordsEmpty, type EraRecords } from "@/lib/engine";
import type { ElderTable } from "@/lib/lore/elderAges";

/** Render a pre-assembled set of record tables (the current age or a sealed one). */
export function EraTablesView({ tables }: { tables: ElderTable[] }) {
  if (tables.length === 0) {
    return (
      <p style={{ fontSize: 14.5, fontStyle: "italic" }}>
        No deed of arms is yet recorded. When the first blade falls, the age&apos;s records begin.
      </p>
    );
  }
  return (
    <div className="elder-detail">
      {tables.map((t, i) => (
        <LeaderTable key={i} t={t} />
      ))}
    </div>
  );
}

/** Backwards-compatible view for ages sealed before the full record set existed
 *  (they carry only the five battle leaderboards). */
export function EraRecordsView({ records }: { records?: EraRecords }) {
  if (eraRecordsEmpty(records)) {
    return (
      <p style={{ fontSize: 14.5, fontStyle: "italic" }}>
        No deed of arms is yet recorded. When the first blade falls, the age&apos;s records begin.
      </p>
    );
  }
  return <EraTablesView tables={battleTables(records!)} />;
}
