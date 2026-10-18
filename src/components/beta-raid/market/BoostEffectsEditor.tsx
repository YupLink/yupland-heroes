// Список эффектов буста: характеристика, сколько пунктов и на сколько минут.
//
// Общий редактор на два места — алтарь на клетке и свой товар маркета.
// Эффектов может быть сколько угодно: зелье умеет дать и скорость, и удачу.
//
// Числа вводятся ОДНИМ полем в общем формате проекта: «2» — точное значение,
// «1-10» — от 1 до 10 (тот же разбор, что у урона босса). Полей «от» и «до»
// здесь нет намеренно: два поля на каждое число — это четыре поля на строку,
// и на телефоне они не живут.
//
// У иммунитета вместо «Пунктов» — выбор дебаффа: список строится из каталога
// способностей (boostImmune.ts), новые дебаффы появляются в нём сами.
// У забвения вместо «Пунктов» — «Уровень», и пара «уровень + минуты» живёт по
// правилу владельца (oblivionRule.ts): N — столько забвений (с минутами — пока
// идёт время), «0» — без счёта и только с минутами. «0» или пусто без минут —
// строка ошибки под эффектом; «Сохранить» у формы тогда неактивна.
import { Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  BOOST_STAT_KEYS,
  BOOST_STAT_LABELS,
  defaultImmuneAbility,
  emptyBoostEffect,
  type BoostEffect,
  type BoostStat,
} from "@/lib/hero/boost";
import { IMMUNE_TARGETS, immuneTargetLabel, type ImmuneTarget } from "@/lib/hero/boostImmune";
import { OBLIVION_SETUP_ERR, oblivionMode } from "@/lib/hero/oblivionRule";

const FIELD =
  "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-40";

export function BoostEffectsEditor({
  effects,
  onChange,
  stats = BOOST_STAT_KEYS,
}: {
  effects: BoostEffect[];
  onChange: (next: BoostEffect[]) => void;
  /** Какие эффекты можно выбрать: у товара сытость — своим полем, не здесь. */
  stats?: BoostStat[];
}) {
  const t = useT();
  const patch = (i: number, p: Partial<BoostEffect>) =>
    onChange(effects.map((e, j) => (j === i ? { ...e, ...p } : e)));
  // Смена стата: иммунитету нужен вид дебаффа, прибавке — нет; забвение
  // начинается с уровня 1 без времени.
  const setStat = (i: number, stat: BoostStat) =>
    patch(
      i,
      stat === "immune"
        ? { stat, value: "1", ability: effects[i]?.ability ?? defaultImmuneAbility() }
        : stat === "oblivion"
          ? { stat, value: "1", minutes: "", ability: undefined }
          : stat === "satiety"
            ? { stat, value: "100", minutes: "", ability: undefined }
            : { stat, ability: undefined },
    );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Что даёт
        </span>
        <button
          type="button"
          onClick={() => onChange([...effects, emptyBoostEffect()])}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          <Plus className="h-3 w-3" /> Эффект
        </button>
      </div>

      {effects.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          Эффектов нет — игроку о бустах не пишут ни строки.
        </p>
      )}

      {effects.map((e, i) => (
        <div key={i} className="rounded-lg border border-border/60 p-2">
          <div className="mb-1.5 flex items-center gap-2">
            <select
              value={e.stat}
              onChange={(ev) => setStat(i, ev.target.value as BoostStat)}
              className={FIELD}
            >
              {stats.map((k) => (
                <option key={k} value={k}>
                  {BOOST_STAT_LABELS[k].ru}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onChange(effects.filter((_, j) => j !== i))}
              aria-label="Убрать эффект"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-destructive/40 text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {e.stat === "immune" ? (
              <label className="block">
                <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
                  Дебафф
                </span>
                <select
                  value={e.ability ?? defaultImmuneAbility()}
                  onChange={(ev) => patch(i, { ability: ev.target.value as ImmuneTarget })}
                  className={FIELD}
                >
                  {IMMUNE_TARGETS.map((k) => (
                    <option key={k} value={k}>
                      {k === "all" ? "Все" : immuneTargetLabel(k, "ru")}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block">
                <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
                  {e.stat === "oblivion" ? "Уровень" : "Пунктов"}
                </span>
                <input
                  value={e.value}
                  onChange={(ev) => patch(i, { value: ev.target.value })}
                  placeholder={e.stat === "oblivion" ? t("oblivion.level_ph") : "2 или 1-10"}
                  inputMode="text"
                  className={FIELD}
                />
              </label>
            )}
            {/* Сытость (еда) — прибавка к шкале, без срока: минут нет. */}
            {e.stat !== "satiety" && (
              <label className="block">
                <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
                  Минут
                </span>
                <input
                  value={e.minutes}
                  onChange={(ev) => patch(i, { minutes: ev.target.value })}
                  placeholder={e.stat === "oblivion" ? t("oblivion.minutes_ph") : "30 или 10-20"}
                  inputMode="text"
                  className={FIELD}
                />
              </label>
            )}
          </div>
          {e.stat === "oblivion" && !oblivionMode(e.value, e.minutes) && (
            <p className="mt-1 text-[10px] text-destructive">{t(OBLIVION_SETUP_ERR)}</p>
          )}
        </div>
      ))}

      <p className="text-[10px] text-muted-foreground">
        Одно число — точное значение, «1-10» — случайное от 1 до 10. Пункты целые, буст временный:
        висит указанные минуты и снимается сам.
      </p>
    </div>
  );
}
