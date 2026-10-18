// Инструменты декора в админке (владелец, 05.10.2026): «нужна возможность
// настраивать сразу несколько видов топоров». Выбранные — списком (картинка,
// имя, «×»), ещё один — тем же пикером своих товаров; до 10, без повторов.
// Подходит игроку любой из списка (lib/raid/decorTools).
//
// Имена и картинки — из того же кэша, что у пикера (["market-ref", "custom",
// "all"]): открытый пикер и список не грузят справочник дважды.
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { TOOLS_MAX } from "@/lib/raid/decorTools";
import { MarketRefPicker } from "./market/MarketRefPicker";
import { RefThumb } from "./market/RefThumb";
import { fetchRefs } from "./market/refPickerSources";

export function AdminDecorTools({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useT();
  const refs = useQuery({
    queryKey: ["market-ref", "custom", "all"],
    queryFn: () => fetchRefs("custom"),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    enabled: value.length > 0,
  });
  const byId = new Map((refs.data ?? []).map((r) => [r.id, r]));

  return (
    <div className="space-y-1.5">
      {value.map((id) => {
        const ref = byId.get(id);
        return (
          <div
            key={id}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5"
          >
            <div className="h-9 w-9 shrink-0">
              <RefThumb image={ref?.image ?? null} />
            </div>
            <span className="min-w-0 flex-1 truncate text-sm">{ref?.name ?? id}</span>
            {/* «×» 36px, а нажатие — 44px: строки идут плотно, до 10 подряд. */}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== id))}
              aria-label={t("decor.tool_remove")}
              className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground after:absolute after:-inset-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      {value.length < TOOLS_MAX && (
        <MarketRefPicker
          kind="custom"
          value={null}
          onPick={(ref) => {
            if (!value.includes(ref.id)) onChange([...value, ref.id]);
          }}
        />
      )}
    </div>
  );
}
