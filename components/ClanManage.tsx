// Leadership roster controls (spec/clans.md): the Leader appoints a Vice and
// up to three Officers, may pass the mantle, and any leadership seat may remove
// members ranked below them. Rendered on /clan only, for leadership viewers.

import Link from "next/link";
import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { LEADERSHIP } from "@/lib/constants";
import { clanRank, clanRoleOf, type Clan } from "@/lib/engine";
import type { World } from "@/lib/server/store";

const ROLE_LABEL: Record<string, string> = { leader: "👑 Leader", vice: "🗡 Vice", officer: "⚜ Officer", member: "Member" };

function RoleBtn({ path, targetId, role, children, title }: { path: string; targetId: string; role: string; children: React.ReactNode; title: string }) {
  return (
    <CmdForm name="clanSetRole" path={path}>
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="role" value={role} />
      <Btn className="btn btn-mini" title={title}>{children}</Btn>
    </CmdForm>
  );
}

export function ClanManage({ world, clan, viewerId, path }: { world: World; clan: Clan; viewerId: string; path: string }) {
  const isLeader = clan.leaderId === viewerId;
  const myRank = clanRank(clan, viewerId);
  const hasVice = Boolean(clan.viceLeaderId);

  // Leadership seats first, then the rank-and-file, each resolvable to a player.
  const members = clan.members
    .map((id) => world.players[id])
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .sort((a, b) => clanRank(clan, b.id) - clanRank(clan, a.id));

  return (
    <div className="clanmanage">
      <p className="clanmanage-hint">
        {isLeader
          ? `You lead. Appoint one Vice and up to ${LEADERSHIP.OFFICERS} Officers, pass the mantle, or remove members below you.`
          : "As leadership you may remove members ranked below you. Only the Leader appoints roles."}
      </p>
      <table className="tbl clanmanage-tbl">
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const role = clanRoleOf(clan, m.id);
            const rank = clanRank(clan, m.id);
            const self = m.id === viewerId;
            const canKick = !self && myRank >= 1 && myRank > rank;
            return (
              <tr key={m.id}>
                <td>
                  <Link href={`/empire/${m.id}`}>{m.name}</Link>
                  {self && " (you)"}
                </td>
                <td>{ROLE_LABEL[role]}</td>
                <td>
                  <div className="clanmanage-actions">
                    {/* Appointments — leader only, never on the leader's own seat */}
                    {isLeader && !self && role !== "leader" && (
                      <>
                        {role === "member" && (
                          <RoleBtn path={path} targetId={m.id} role="officer" title="Promote to Officer">▲ Officer</RoleBtn>
                        )}
                        {role === "officer" && !hasVice && (
                          <RoleBtn path={path} targetId={m.id} role="vice" title="Promote to Vice-Leader">▲ Vice</RoleBtn>
                        )}
                        {role === "officer" && (
                          <RoleBtn path={path} targetId={m.id} role="member" title="Demote to member">▼ Ranks</RoleBtn>
                        )}
                        {role === "vice" && (
                          <>
                            <RoleBtn path={path} targetId={m.id} role="officer" title="Demote to Officer">▼ Officer</RoleBtn>
                            <RoleBtn path={path} targetId={m.id} role="member" title="Demote to member">▼ Ranks</RoleBtn>
                          </>
                        )}
                        <CmdForm name="clanTransferLead" path={path}>
                          <input type="hidden" name="targetId" value={m.id} />
                          <ReqTip
                            heading={`Make ${m.name} the Leader`}
                            body={`Pass the mantle of ${clan.name} to ${m.name}. You step down to a plain member — they may re-appoint you afterward.`}
                            note="Do this before you leave: a leader can't abandon a clan that still has members."
                          >
                            <Btn className="btn btn-mini btn-crown" title="Pass leadership">👑 Crown</Btn>
                          </ReqTip>
                        </CmdForm>
                      </>
                    )}
                    {/* Removal — any leadership seat, on lower ranks only */}
                    {canKick && (
                      <CmdForm name="clanKick" path={path}>
                        <input type="hidden" name="targetId" value={m.id} />
                        <ReqTip
                          heading={`Remove ${m.name}`}
                          body={`Cast ${m.name} out of ${clan.name}. Their deposited resources are forfeit (they stay in the pool).`}
                          note="Counts toward their per-era departure limit and starts their 48-hour rejoin cooldown."
                        >
                          <Btn className="btn btn-mini btn-kick" title="Remove from clan">✕ Kick</Btn>
                        </ReqTip>
                      </CmdForm>
                    )}
                    {self && <span className="clanmanage-self">—</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
