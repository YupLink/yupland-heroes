import { BattleMusic } from "./BattleMusic";
// Окна поверх карты рейда: герой, постройка, энкаунтер, итоги боя.
// Вынесено из BetaRaidScreen — экран остаётся оркестратором (§13.6).
import { useCastleMode } from "./castleMode";
import { HeroPickerModal } from "./HeroPickerModal";
import { HudAsyncDialog } from "./HudAsyncDialog";
import { useLang } from "@/lib/i18n";
import { CastleModal } from "./castle/CastleModal";
import { BuildModal } from "./BuildModal";
import { ShipModal } from "./ShipModal";
import type { ShipMark } from "./useShips";
import { BetaEncounterModal } from "./BetaEncounterModal";
import { BetaFightSummary } from "./BetaFightSummary";
import { RaidFightResult } from "@/components/raid/RaidFightResult";
import { BetaFightActions } from "@/components/beta-raid/fight/BetaFightActions";
import type { RaidFightUi } from "@/components/beta-raid/fight/useRaidFight";
import type { RaidHeroUi } from "./useRaidHeroUi";

const loadHeroQuickModal = () => import("./HeroQuickModal").then(m => ({ default: m.HeroQuickModal }));

export function BetaRaidOverlays({
  hero,
  building,
  ship,
  shipAboard,
  shipUnderfoot,
  fight,
  bossEncounter = false,
  energy,
  slowExtra,
  onCloseBuilding,
  onGoToBuilding,
  onCloseShip,
}: {
  /** Героические окна: выбор героя (без режима) и замок (в режиме). */
  hero: RaidHeroUi;
  building: { q: number; r: number } | null;
  ship: { q: number; r: number; mark: ShipMark } | null;
  /** Игрок стоит именно на этом судне — тогда окно предлагает сойти на берег. */
  shipAboard: boolean;
  /** Судно под ногами, но экипаж не наш: вернуться на борт можно даром. */
  shipUnderfoot?: boolean;
  /** Окно цели и итог боя (fight/useRaidFight). */
  fight: RaidFightUi;
  bossEncounter?: boolean;
  energy: number;
  /** Замедление: пока висит, посадка на корабль тоже дороже — окно это покажет. */
  slowExtra: number;
  onCloseBuilding: () => void;
  /** «Идти сюда» из окна постройки. Проброшено в BuildModal. */
  onGoToBuilding?: (q: number, r: number) => void;
  onCloseShip: () => void;
}) {
  const castleMode = useCastleMode();
  const ru = useLang() === "ru";
  return (
    <>
      <BattleMusic active={castleMode?.musicActive !== false && (bossEncounter || fight.result?.kind === "boss")} />
      {hero.picker && <HeroPickerModal onClose={hero.closePicker} />}

      {/* Замок открывается только из режима героя и только на своей клетке —
          кнопка входа появляется там же (BetaRaidHud). */}
      {hero.castle && <CastleModal onClose={hero.closeCastle} atCastle={hero.atCastle} />}

      {/* Окно героя с карты: второе нажатие на кнопку героя в HUD. Замку не
          мешает — у замка своё окно, и открыты они никогда не бывают вместе. */}
      {hero.quick && !hero.castle && <HudAsyncDialog load={loadHeroQuickModal} props={{ onClose: hero.closeQuick, onProfile: castleMode?.openProfile ? () => { hero.closeQuick(); castleMode.openProfile?.(); } : undefined }} onClose={hero.closeQuick} ru={ru} />}

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

      {fight.encounter && (
        <BetaEncounterModal
          objectId={fight.encounter.objectId}
          q={fight.encounter.q}
          r={fight.encounter.r}
          energy={energy}
          fighting={fight.fighting}
          /* Состав собирается в самом окне боя: замок отряд помнит, но выбор
             перед каждым боссом остаётся за игроком. */
          onAttack={fight.onAttack}
          onClose={fight.onCloseEncounter}
        />
      )}

      {fight.result && (
        <RaidFightResult
          autoResult={{
            killed: fight.result.killed,
            dealt: fight.result.dealt,
            bossHpAfter: fight.result.hpAfter,
            bossMaxHp: fight.result.maxHp,
          }}
          targetLabel={fight.result.badgeLabel}
          showForwardHint={false}
          overlayZ="z-[110]"
          onClose={fight.onCloseResult}
          /* Вместо «ОК»: повтор удара на месте, окно цели и «Закрыть». */
          actions={
            <BetaFightActions
              killed={fight.result.killed}
              busy={fight.fighting}
              cost={fight.againCost}
              onAgain={fight.onAgain}
              onInfo={fight.onInfo}
              onClose={fight.onCloseResult}
            />
          }
        >
          <BetaFightSummary
            log={fight.result.log ?? []}
            abilityLog={fight.result.abilityLog ?? []}
            totals={fight.result.abilityTotals}
            rounds={fight.result.rounds}
            wiped={fight.result.wiped}
            /* Герой в бою был невидим: сервер шлёт бонусы и состав отряда
               с каждым ударом, а показать их некому. */
          />
        </RaidFightResult>
      )}
    </>
  );
}

