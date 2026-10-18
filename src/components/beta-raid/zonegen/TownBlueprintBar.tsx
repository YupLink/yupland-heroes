// Строка шаблонов города: выбрать — применить — сохранить своё — удалить.
//
// Владелец, 24.09.2026: «наборы я уже сделал, их бы в шаблоны, а потом просто
// расположение менять». Шаблон переносит в рецепт весь блок поселения
// (планировка, размер, плотность, дорога, флаги, состав, автоподбор) — дальше
// админ крутит только сид и количество.
//
// Готовые и свои приезжают одним списком с сервера; удалять можно только свои
// (у готовых id с префиксом «preset:», и в базе их нет).
import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import type { SettlementRecipe } from "@/lib/raid/zonegen/settlement-types";
import {
  isPresetBlueprint,
  presetNameKey,
  type TownBlueprint,
} from "@/lib/raid/zonegen/blueprint-types";
import { blueprintPatch, canSaveBlueprint } from "./settlementAuto";
import { TownBlueprintSave } from "./TownBlueprintSave";
import { blueprintBody, useTownBlueprints } from "./useTownBlueprints";

const BTN =
  "inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[10px] font-semibold disabled:opacity-40";
const PLAIN = `${BTN} border-border bg-secondary/40 text-muted-foreground`;
const SELECT =
  "min-w-0 flex-1 rounded border border-border bg-secondary/40 px-1.5 py-1 text-[11px] text-foreground";

/** Забытая на экране красная кнопка опаснее её отсутствия (как «Раздать»). */
const CONFIRM_MS = 6000;

export function TownBlueprintBar({
  settlement,
  onApply,
}: {
  settlement: SettlementRecipe;
  /** Перенести шаблон в рецепт — частичной правкой блока поселений. */
  onApply: (part: Partial<SettlementRecipe>) => void;
}) {
  const t = useT();
  const { list, save, remove } = useTownBlueprints();
  const [pick, setPick] = useState("");
  const [naming, setNaming] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const all = useMemo(() => list.data ?? [], [list.data]);
  const presets = useMemo(() => all.filter((b) => isPresetBlueprint(b.id)), [all]);
  const own = useMemo(() => all.filter((b) => !isPresetBlueprint(b.id)), [all]);
  const chosen = useMemo(() => all.find((b) => b.id === pick) ?? null, [all, pick]);

  // Подтверждение живёт секунды и гаснет при смене шаблона: второй тап через
  // полчаса был бы уже случайным.
  useEffect(() => {
    if (!confirm) return;
    const id = setTimeout(() => setConfirm(false), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [confirm]);
  useEffect(() => setConfirm(false), [pick]);

  const busy = save.isPending || remove.isPending;
  const canSave = canSaveBlueprint(settlement);
  const canDelete = !!chosen && !isPresetBlueprint(chosen.id);
  const err = save.error ?? remove.error ?? list.error;

  // Имя и пометка готового шаблона переводятся по id; нет перевода —
  // остаётся русское запасное с сервера (t возвращает ключ, когда его не знает).
  const tr = (key: string, fallback: string): string => {
    const text = t(key);
    return text === key ? fallback : text;
  };
  const label = (b: TownBlueprint): string =>
    isPresetBlueprint(b.id) ? tr(presetNameKey(b.id), b.name) : b.name;
  // Пометки своих шаблонов пишет админ — их не переводим, показываем как есть.
  const noteOf = (b: TownBlueprint): string | null =>
    b.note === null || !isPresetBlueprint(b.id)
      ? b.note
      : tr(`${presetNameKey(b.id)}_note`, b.note);

  const apply = () => {
    if (!chosen) return;
    // Только поля блока: id, имя и пометка шаблона в рецепте поселения лишние;
    // дорогу готового шаблона берём из рецепта (blueprintPatch).
    onApply(blueprintPatch(blueprintBody(chosen), settlement, isPresetBlueprint(chosen.id)));
    setNote(t("zonegen.bp_applied", { name: label(chosen) }));
  };

  const doSave = (clean: string) => {
    save.mutate(
      { name: clean, settlement: blueprintBody(settlement) },
      { onSuccess: () => setNaming(false) },
    );
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-[10px] text-muted-foreground">
          {t("zonegen.bp_label")}
        </span>
        <select
          value={pick}
          onChange={(e) => {
            setPick(e.target.value);
            setNote(null);
          }}
          className={SELECT}
        >
          <option value="">{t("zonegen.bp_pick")}</option>
          <optgroup label={t("zonegen.bp_presets")}>
            {presets.map((b) => (
              <option key={b.id} value={b.id}>
                {label(b)}
              </option>
            ))}
          </optgroup>
          {own.length > 0 && (
            <optgroup label={t("zonegen.bp_mine")}>
              {own.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {list.isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </label>

      {chosen && noteOf(chosen) && (
        <p className="pl-[104px] text-[9px] leading-tight text-muted-foreground/80">
          {noteOf(chosen)}
        </p>
      )}

      {naming ? (
        <TownBlueprintSave
          busy={save.isPending}
          onSave={doSave}
          onCancel={() => setNaming(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={apply}
            disabled={!chosen}
            title={t("zonegen.bp_apply_title")}
            className={`${BTN} border-gold/50 bg-gold/10 text-gold`}
          >
            {t("zonegen.bp_apply")}
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(true);
              setNote(null);
            }}
            disabled={!canSave}
            title={canSave ? t("zonegen.bp_save") : t("zonegen.bp_empty_set")}
            className={PLAIN}
          >
            <Save className="h-3 w-3" />
            {t("zonegen.bp_save")}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() =>
                confirm
                  ? remove.mutate(chosen.id, { onSuccess: () => setPick("") })
                  : setConfirm(true)
              }
              disabled={busy}
              className={`${BTN} ml-auto ${
                confirm
                  ? "border-rose-400/60 bg-rose-500/20 text-rose-200"
                  : "border-border bg-secondary/40 text-muted-foreground"
              }`}
            >
              {remove.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              {confirm ? t("zonegen.bp_delete_confirm") : t("zonegen.bp_delete")}
            </button>
          )}
        </div>
      )}

      {err ? (
        <p className="text-[10px] text-rose-300">{humanError(err)}</p>
      ) : (
        note && <p className="text-[10px] text-emerald-300">{note}</p>
      )}
    </div>
  );
}
