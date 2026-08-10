// Who may strike whom (spec/combat.md). Pure — the caller supplies the world
// context; this decides only whether the blow is allowed to land.

import { ACTION_TURNS, XP } from "../../constants";
import { rankingScore } from "../score";
import type { AttackMode, Player } from "../types";

export interface AttackContext {
  currentTick: number;
  eraStartedAtTick: number;
  eraPeaceTicks: number;
  revengeWindowTicks: number;
  clanWar: boolean;
  /** A clan-bombardment revenge (spec/clans.md) lets any member who was in the
   *  clan at the time deliver the single answering blow. */
  clanRevengeAuthorized?: boolean;
  vacationReattackCooldownTicks?: number;
}

export function validateAttack(
  attacker: Player,
  defender: Player,
  mode: AttackMode,
  ctx: AttackContext,
): string | null {
  if (attacker.id === defender.id) return "You cannot attack yourself.";
  if (attacker.starving) return "Starving armies will not march.";
  if (attacker.onVacation) return "You are away from the world — come back first.";
  if (attacker.turnsAvailable < ACTION_TURNS.ATTACK_COST) {
    return `An attack costs ${ACTION_TURNS.ATTACK_COST} action turns.`;
  }
  if (ctx.currentTick - ctx.eraStartedAtTick < ctx.eraPeaceTicks) {
    return "The era peace holds — no attacks in the opening days.";
  }
  if (defender.shieldUntilTick > ctx.currentTick) {
    return "That empire is under the newcomer shield.";
  }

  if (mode === "revenge") {
    const personalOpen =
      !!attacker.recentAttackers.find(
        (a) => a.playerId === defender.id && ctx.currentTick - a.tick <= ctx.revengeWindowTicks,
      ) && !attacker.revengeUsed.includes(defender.id);
    if (!personalOpen && !ctx.clanRevengeAuthorized) {
      return attacker.revengeUsed.includes(defender.id)
        ? "You have already taken your revenge."
        : "No revenge window is open against that empire.";
    }
    // Revenge ignores the refusal band, the yield, and the re-attack cooldown.
    // It does NOT reach someone who is away — but nobody can leave with a
    // revenge hanging over them, so the door was never open to duck through.
    if (defender.onVacation) return "They have left the world. Your quarrel will have to keep.";
    return null;
  }

  if (
    attacker.vacationEndedAtTick !== undefined &&
    ctx.vacationReattackCooldownTicks &&
    ctx.currentTick - attacker.vacationEndedAtTick < ctx.vacationReattackCooldownTicks
  ) {
    return "Your host is still mustering after your absence — no fresh attacks so soon after returning.";
  }

  if (defender.onVacation) return "They are away from the world and cannot be touched.";

  // The refusal band, and it applies to BOMBARD as well as to assaults. Its
  // job is to stop a small account making itself a permanent nuisance to a
  // large one with nothing to lose. A siege specialist is not locked out of
  // their own strategy by it, because engineers and defensive works both count
  // toward ranking — the investment shows even though the siege train does not.
  const ratio = rankingScore(defender) / Math.max(1, rankingScore(attacker));
  if (ratio >= XP.REFUSAL_RATIO) {
    return "Your captains refuse — that empire is far beyond your weight.";
  }
  return null;
}
