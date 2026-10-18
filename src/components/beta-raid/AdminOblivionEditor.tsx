// Настройка постройки «Забвение» в режиме бога: цена, уровень и время действия
// — прямо на живой карте.
//
// Цена — тем же редактором строк, что у портала, алтаря и столба («ресурс +
// сколько», берутся все разом). Уровень и время — одним полем в формате
// проекта: «1», «1-3», «30», «10-20». Пара — по правилу владельца
// (lib/hero/oblivionRule.ts): N — столько забвений (с временем — пока оно идёт),
// «0» — без счёта и только с временем. «0» или пусто без времени — строка
// ошибки, и в очередь выгрузки такая правка не уходит: своей кнопки
// «Сохранить» здесь нет, правка ложится в очередь сразу.
// Черновик держим до первого касания: поздний ответ сервера иначе затирал бы
// уже введённое.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookMinus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { PortalPricesEditor } from "@/components/admin/hex-editor/PortalPricesEditor";
import { oblivionConfigDraft, type OblivionCellConfig } from "@/lib/oblivionConfig";
import { OBLIVION_SETUP_ERR, oblivionMode } from "@/lib/hero/oblivionRule";

const FIELD =
  "w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-40";
const LABEL = "mb-0.5 block text-[10px] uppercase text-muted-foreground";

export function AdminOblivionEditor({
  config,
  onSave,
}: {
  config: Record<string, unknown> | null;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const t = useT();
  const tokensQ = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  const tokens = (tokensQ.data ?? []).map((x: { symbol: string }) => x.symbol);
  const [draft, setDraft] = useState<OblivionCellConfig | null>(null);
  const value = draft ?? oblivionConfigDraft(config);
  const valid = oblivionMode(value.level, value.minutes) !== null;
  const put = (next: OblivionCellConfig) => {
    setDraft(next);
    // Соседние ключи конфига клетки не трогаем — они живут рядом.
    if (oblivionMode(next.level, next.minutes)) onSave({ ...(config ?? {}), oblivion: next });
  };

  return (
    <div className="mb-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
      <p className="mb-2 flex items-center justify-center gap-1 text-center text-[11px] text-violet-300">
        <BookMinus className="h-3 w-3" />
        Забвение ЭТОЙ клетки
      </p>

      <PortalPricesEditor
        prices={value.prices}
        tokens={tokens}
        onChange={(prices) => put({ ...value, prices })}
        title="Цена"
      />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className={LABEL}>Уровень</span>
          <input
            value={value.level}
            onChange={(e) => put({ ...value, level: e.target.value })}
            placeholder={t("oblivion.level_ph")}
            inputMode="text"
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className={LABEL}>Время действия, мин</span>
          <input
            value={value.minutes}
            onChange={(e) => put({ ...value, minutes: e.target.value })}
            placeholder="30 или 10-20"
            inputMode="text"
            className={FIELD}
          />
        </label>
      </div>
      {!valid && <p className="mt-1 text-[10px] text-destructive">{t(OBLIVION_SETUP_ERR)}</p>}
    </div>
  );
}
