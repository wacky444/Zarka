import type { MatchRecord } from "../../models/types";
import type {
  ActionId,
  PlayerCharacter,
  ReplayActionDone,
  ReplayActionTarget,
  ReplayPlayerEvent,
  Axial,
  HexTileSnapshot,
} from "@shared";
import { ActionLibrary, getSkillEffectTotal, neighbors } from "@shared";
import {
  isTargetProtected,
  resolvePlanDestination,
  type PlannedActionParticipant,
} from "./utils";
import { collectTargets } from "./targeting";
import { getUsableExtraExecutions } from "../../utils/energy";
import { BaseAction } from "./classes/BaseAction";
import { triggerTrapsForTransition } from "./placeTrap";

const CURRENT_CELL_DISTANCE = 0;

function reduceEnergy(character: PlayerCharacter, amount: number): number {
  if (!character.stats?.energy) {
    return 0;
  }
  const energy = character.stats.energy;
  const previous = typeof energy.current === "number" ? energy.current : 0;
  const spent = Math.min(previous, amount);
  energy.current = previous - spent;
  return spent;
}

function sameCoord(left: Axial, right: Axial): boolean {
  return left.q === right.q && left.r === right.r;
}

function randomAdjacentDestination(
  match: MatchRecord,
  origin: Axial
): { tileId: string; coord: Axial } | undefined {
  const candidates: HexTileSnapshot[] = [];
  for (const coord of neighbors(origin)) {
    for (const tile of match.map?.tiles ?? []) {
      if (
        sameCoord(tile.coord, coord) &&
        tile.walkable !== false &&
        tile.meta?.destroyed !== true
      ) {
        candidates.push(tile);
        break;
      }
    }
  }
  const tile = candidates[Math.floor(Math.random() * candidates.length)];
  return tile
    ? { tileId: tile.id, coord: { q: tile.coord.q, r: tile.coord.r } }
    : undefined;
}

export class ScareAction extends BaseAction {
  protected processRoster(
    roster: PlannedActionParticipant[],
    match: MatchRecord
  ): ReplayPlayerEvent[] {
    const events: ReplayPlayerEvent[] = [];
    for (const participant of roster) {
      const actionId = participant.plan.actionId as ActionId;
      if (!actionId) {
        this.clearPlan(participant);
        continue;
      }
      const extraExecutions = getUsableExtraExecutions(
        participant.character,
        participant.plan,
        ActionLibrary.scare,
        true
      );
      const selection = collectTargets(actionId, participant, match, {
        allowMultiple: extraExecutions > 0,
        filter: (candidate) =>
          !isTargetProtected(candidate.character) &&
          candidate.distance === CURRENT_CELL_DISTANCE,
      });
      const origin = participant.character.position?.coord;
      const requestedTargets = participant.plan.targetPlayerIds ?? [];
      const pushingTwoPlayers =
        extraExecutions > 0 && requestedTargets.length > 1;
      const chosenDestination =
        extraExecutions > 0 && !pushingTwoPlayers
          ? resolvePlanDestination(match, participant.plan)
          : undefined;
      this.clearPlan(participant);
      if (!origin || selection.length === 0) {
        continue;
      }

      const targets = pushingTwoPlayers ? selection.slice(0, 2) : selection.slice(0, 1);
      for (const targetSelection of targets) {
        const target = match.playerCharacters?.[targetSelection.id];
        if (!target) {
          continue;
        }
        if (getSkillEffectTotal(target, "scare_immunity") > 0) {
          const action: ReplayActionDone = {
            actionId,
            originLocation: origin,
          };
          const targetEvent: ReplayActionTarget = {
            targetId: targetSelection.id,
            metadata: { immuneToScare: true },
          };
          events.push({
            kind: "player",
            actorId: participant.playerId,
            action,
            targets: [targetEvent],
          });
          continue;
        }
        const destination = pushingTwoPlayers
          ? randomAdjacentDestination(match, target.position?.coord ?? origin)
          : chosenDestination ??
            randomAdjacentDestination(match, target.position?.coord ?? origin);
        if (!destination) {
          continue;
        }
        const previous = target.position;
        target.position = {
          tileId: destination.tileId,
          coord: destination.coord,
        };
        const energyLost = reduceEnergy(target, 3);
        if (!match.playerCharacters) {
          match.playerCharacters = {};
        }
        match.playerCharacters[targetSelection.id] = target;
        const action: ReplayActionDone = {
          actionId,
          originLocation: origin,
          targetLocation: destination.coord,
        };
        const metadata: Record<string, unknown> = {
          movedTo: destination.coord,
          energyLost,
        };
        if (previous?.coord) {
          metadata.movedFrom = previous.coord;
        }
        const targetEvent: ReplayActionTarget = {
          targetId: targetSelection.id,
          metadata,
        };
        events.push({
          kind: "player",
          actorId: participant.playerId,
          action,
          targets: [targetEvent],
        });
        if (previous?.coord && previous.tileId) {
          events.push(
            ...triggerTrapsForTransition(match, targetSelection.id, previous, {
              tileId: destination.tileId,
              coord: destination.coord,
            }),
          );
        }
      }
    }
    return events;
  }
}

const scareAction = new ScareAction();

export function executeScareAction(
  participants: PlannedActionParticipant[],
  match: MatchRecord
): ReplayPlayerEvent[] {
  return scareAction.execute(participants, match);
}
