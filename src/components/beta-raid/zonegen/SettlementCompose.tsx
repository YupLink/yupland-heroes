// Сборка состава под тип поселения: нажал — список заполнился.
//
// Прежние «Жилой набор» и «Всё по одной» набирали 36 шаблонов с весами, и
// городок выходил «по паре каждой твари»: две Ратуши, два Храма, два Бара.
// Теперь кнопка одна и привязана к типу из селекта: лагерь — это костёр и
// пара дворов, городок — ратуша, таверна, склад и улицы лавок.
import { Hammer, Wand2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { SettlementPreset } from "@/lib/raid/zonegen/settlement-types";

const BTN =
  "flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[10px] font-semibold disabled:opacity-40";

export function SettlementCompose({
  preset,
  disabled,
  offer,
  onCompose,
  onClear,
}: {
  preset: SettlementPreset;
  /** Справочник ещё не приехал — собирать нечего. */
  disabled: boolean;
  /** Тип сменили, а состав остался прежним — предлагаем пересобрать. */
  offer: boolean;
  onCompose: () => void;
  onClear: () => void;
}) {
  const t = useT();
  const kind = t(`zonegen.preset_${preset}`);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={onCompose}
          disabled={disabled}
          title={t("zonegen.set_compose_title")}
          className={`${BTN} border-gold/50 bg-gold/10 text-gold`}
        >
          <Wand2 className="h-3 w-3" />
          {t("zonegen.set_compose", { kind })}
        </button>
        <button
          type="button"
          onClick={onClear}
          className={`${BTN} border-border bg-secondary/40 text-muted-foreground`}
        >
          {t("zonegen.set_clear")}
        </button>
      </div>
      {offer && (
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-amber-300">
          <Hammer className="h-3 w-3 shrink-0" />
          <span className="min-w-0 flex-1">{t("zonegen.set_recompose", { kind })}</span>
          <button
            type="button"
            onClick={onCompose}
            disabled={disabled}
            className={`${BTN} border-amber-300/50 bg-amber-300/10 text-amber-200`}
          >
            {t("zonegen.set_recompose_do")}
          </button>
        </div>
      )}
    </div>
  );
}
