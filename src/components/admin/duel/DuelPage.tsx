// Админ · Дуэль героев — песочница концепта (Ярослав 29.10.2026; владелец
// 04.11.2026: «только для админов, отдельной вкладкой пока что»). Открывается
// сразу полем боя, без настроек (владелец 07.11.2026); поле — из местности, где
// стоит герой, бойцы — фигурками с карты, ход виден: идут, бьют, всплывает урон
// (владелец 08.11.2026). НИЧЕГО не списывает: итог боя только показывает, что
// списал бы настоящий бой. До боя — свои бойцы из списка (до 4) и расстановка
// (владелец 09.11.2026), потом «В бой».
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Swords } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { createDuel } from "@/lib/duel/engine";
import { current } from "@/lib/duel/options";
import type { DuelState } from "@/lib/duel/types";
import type { DuelField, DuelMob } from "@/server/api/duel/duel-api";
import { MAX_MOBS } from "@/lib/duel/rules";
import { DuelCanvas } from "./DuelCanvas";
import { DuelBar } from "./DuelBar";
import { DuelDeployBar } from "./DuelDeployBar";
import { duelText, type DuelText } from "./duelText";
import { duelSides, useDuelSetup } from "./useDuelSetup";
import { DuelRoster } from "./DuelRoster";
import { spotsOf, withSpots, type Spots } from "./armySpots";
import { loadDuel, saveDuel } from "./duelSave";
import { useSaveMobHp } from "./useSaveMobHp";
import { useDuelBattle } from "./useDuelBattle";

/** Вы ходите сами, за противника — компьютер. */
const AI = { a: false, b: true } as const;

/** Ответ без поля (старый кэш) — голая земля и камни движка без картинок. */
const NO_FIELD: DuelField = { terrain: null, decor: [] };

const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const saveState = (st: DuelState) => saveDuel({ st });

function DuelBattle({
  initial,
  field,
  t,
  onAgain,
  roster,
  onDeployed,
  resume,
}: {
  initial: DuelState;
  field: DuelField;
  t: DuelText;
  onAgain: () => void;
  roster: {
    mobs: DuelMob[];
    picked: string[];
    onAdd: (id: string) => void;
    onRemove: (id: string) => void;
  };
  onDeployed: (st: DuelState) => void;
  resume: DuelState | null;
}) {
  const d = useDuelBattle(initial, AI, onDeployed, resume, saveState);
  useSaveMobHp(d.st);
  return (
    <div className="space-y-2">
      <DuelCanvas d={d} field={field} t={t} />
      {d.deploying ? (
        <>
          <DuelDeployBar onStart={d.startBattle} t={t} />
          <DuelRoster {...roster} t={t} />
        </>
      ) : (
        <DuelBar
          st={d.view}
          unit={current(d.view)}
          human={d.human}
          spell={d.spell}
          onSpell={d.setSpell}
          onDefend={() => d.run({ t: "defend" })}
          onEat={(slot) => d.run({ t: "eat", slot })}
          onFlee={() => d.run({ t: "flee" })}
          onOffer={d.offer}
          offerLeft={d.offerLeft}
          onAgain={onAgain}
          t={t}
        />
      )}
    </div>
  );
}

export function DuelPage() {
  const t = duelText(useLang());
  const s = useDuelSetup();
  // Расклад и сам бой — из памяти вкладки, если страница перезагрузилась (duelSave).
  const saved = useRef(loadDuel());
  const [seed, setSeed] = useState(() => saved.current?.seed || newSeed());
  /** Выбранные бойцы (id шаблонов, до 4) и где они стоят в вашей зоне. */
  const [army, setArmy] = useState<string[]>(() => saved.current?.army ?? []);
  const [spots, setSpots] = useState<Spots>(() => saved.current?.spots ?? {});
  useEffect(() => saveDuel({ seed, army, spots }), [seed, army, spots]);
  const setup = s.setup.data;
  const a = s.heroA.data;
  const b = s.heroB.data;
  const mobs = useMemo(
    () => army.map((id) => setup?.mobs.find((m) => m.id === id)).filter((m): m is DuelMob => !!m),
    [army, setup],
  );
  const initial = useMemo(
    () =>
      setup && a && b
        ? withSpots(createDuel(...duelSides(setup, a, b, mobs, seed), seed), "a", spots)
        : null,
    // Места меняет и сам бой (перестановка) — пересобирать поле из-за них не нужно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setup, a, b, mobs, seed],
  );
  const add = (id: string) => setArmy((cur) => (cur.length < MAX_MOBS ? [...cur, id] : cur));
  const remove = (id: string) =>
    setArmy((cur) => {
      const at = cur.lastIndexOf(id);
      return at < 0 ? cur : [...cur.slice(0, at), ...cur.slice(at + 1)];
    });
  const onDeployed = useCallback((st: DuelState) => setSpots(spotsOf(st, "a")), []);
  const failed = s.setup.error ?? s.heroA.error ?? s.heroB.error;

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3">
      <h1 className="flex items-center gap-2 text-lg font-bold">
        <Swords className="h-5 w-5 text-gold" />
        {t.title}
      </h1>
      {failed ? (
        <p className="text-[12px] text-destructive">{humanError(failed as Error)}</p>
      ) : s.noHero ? (
        <p className="text-[12px] text-muted-foreground">{t.noHero}</p>
      ) : !initial || !setup ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <DuelBattle
          key={seed}
          initial={initial}
          field={setup.field ?? NO_FIELD}
          t={t}
          onAgain={() => {
            saveDuel({ st: null });
            setSeed(newSeed());
          }}
          roster={{ mobs: setup.mobs, picked: army, onAdd: add, onRemove: remove }}
          onDeployed={onDeployed}
          resume={saved.current?.seed === seed ? saved.current.st : null}
        />
      )}
    </div>
  );
}
