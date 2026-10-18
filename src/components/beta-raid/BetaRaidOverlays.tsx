// Окна поверх карты рейда: герой, постройка, энкаунтер, итоги боя.
// Вынесено из BetaRaidScreen — экран остаётся оркестратором (§13.6).
import { useCastleMode } from "./castleMode";
import { HeroPickerModal } from "./HeroPickerModal";
import { HeroQuickModal } from "./HeroQuickModal";
import { CastleModal } from "./castle/CastleModal";
import { BuildModal } from "./BuildModal";
import { ShipModal } from "./ShipModal";
import type { ShipMark } from "./useShips";
import { BetaEncounterModal } from "./BetaEncounterModal";
import { BetaFightSummary } from "./BetaFightSummary";
import { RaidFightResult } from "@/components/raid/RaidFightResult";
import type { LineChip } from "@/components/game/ChipSquadPicker";
import type { AttackResult } from "./useBetaEncounter";
import type { RaidHeroUi } from "./useRaidHeroUi";

export function BetaRaidOverlays({
  hero,
  building,
  ship,
  shipAboard,
  shipUnderfoot,
  encounter,
  fightResult,
  energy,
  slowExtra,
  fighting,
  onAttack,
  onCloseBuilding,
  onGoToBuilding,
  onCloseShip,
  onCloseEncounter,
  onCloseResult,
}: {
  /** Героические окна: выбор героя (без режима) и замок (в режиме). */
  hero: RaidHeroUi;
  building: { q: number; r: number } | null;
  ship: { q: number; r: number; mark: ShipMark } | null;
  /** Игрок стоит именно на этом судне — тогда окно предлагает сойти на берег. */
  shipAboard: boolean;
  /** Судно под ногами, но экипаж не наш: вернуться на борт можно даром. */
  shipUnderfoot?: boolean;
  encounter: { objectId: string; q: number; r: number } | null;
  fightResult: AttackResult | null;
  energy: number;
  /** Замедление: пока висит, посадка на корабль тоже дороже — окно это покажет. */
  slowExtra: number;
  fighting: boolean;
  onAttack: (lineup: LineChip[]) => void;
  onCloseBuilding: () => void;
  /** «Идти сюда» из окна постройки. Проброшено в BuildModal. */
  onGoToBuilding?: (q: number, r: number) => void;
  onCloseShip: () => void;
  onCloseEncounter: () => void;
  onCloseResult: () => void;
}) {
  const castleMode = useCastleMode();
  return (
    <>
      {hero.picker && <HeroPickerModal onClose={hero.closePicker} />}

      {/* Замок открывается только из режима героя и только на своей клетке —
          кнопка входа появляется там же (BetaRaidHud). */}
      {hero.castle && <CastleModal onClose={hero.closeCastle} atCastle={hero.atCastle} />}

      {/* Окно героя с карты: второе нажатие на кнопку героя в HUD. Замку не
          мешает — у замка своё окно, и открыты они никогда не бывают вместе. */}
      {hero.quick && !hero.castle && <HeroQuickModal onClose={hero.closeQuick} onProfile={castleMode?.openProfile ? () => { hero.closeQuick(); castleMode.openProfile?.(); } : undefined} />}

      {building && (
        <BuildModal
          q={building.q}
          r={building.r}
          onClose={() => onCloseBuilding()}
          onGoTo={onGoToBuilding}
        />
      )}

      {ship && (
        <ShipModal
          q={ship.q}
          r={ship.r}
          ship={ship.mark}
          aboard={shipAboard}
          underfoot={shipUnderfoot}
          slowExtra={slowExtra}
          stepDiscount={hero.stepDiscount}
          onClose={() => onCloseShip()}
        />
      )}

      {encounter && (
        <BetaEncounterModal
          objectId={encounter.objectId}
          q={encounter.q}
          r={encounter.r}
          energy={energy}
          fighting={fighting}
          /* Состав собирается в самом окне боя: замок отряд помнит, но выбор
             перед каждым боссом остаётся за игроком. */
          onAttack={onAttack}
          onClose={() => onCloseEncounter()}
        />
      )}

      {fightResult && (
        <RaidFightResult
          autoResult={{
            killed: fightResult.killed,
            dealt: fightResult.dealt,
            bossHpAfter: fightResult.hpAfter,
            bossMaxHp: fightResult.maxHp,
          }}
          targetLabel={fightResult.badgeLabel}
          showForwardHint={false}
          overlayZ="z-[110]"
          onClose={() => onCloseResult()}
        >
          <BetaFightSummary
            log={fightResult.log ?? []}
            abilityLog={fightResult.abilityLog ?? []}
            totals={fightResult.abilityTotals}
            rounds={fightResult.rounds}
            wiped={fightResult.wiped}
            /* Герой в бою был невидим: сервер шлёт бонусы и состав отряда
               с каждым ударом, а показать их некому. */
          />
        </RaidFightResult>
      )}
    </>
  );
}
