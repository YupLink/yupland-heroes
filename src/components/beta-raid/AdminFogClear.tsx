// Кнопка админа «Очистить туман войны» — в панели правки карты.
//
// Подтверждения нет нарочно: действие обратимо тем же нажатием и ничего не
// пишет ни в базу, ни в разведанное — спрашивать не о чем.
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import { godText } from "./adminCellText";
import { setAdminFogReveal, useAdminFogReveal } from "./adminFogReveal";
import { useMapProgressive } from "./useMapProgressive";

export function AdminFogClear() {
  const t = godText(useLang());
  // Тот же ключ и та же свежесть, что у экрана рейда: карта уже загружена,
  // лишнего запроса не будет — а проп пришлось бы вести через весь экран.
  // Тот же запрос, что у экрана рейда (снимок + дельты): второй раз не пойдёт.
  const mapQ = useMapProgressive();
  const mapId = mapQ.data?.map?.id ?? null;
  const on = useAdminFogReveal(mapId);

  if (!mapId) return null;

  const toggle = () => {
    setAdminFogReveal(mapId, !on);
    // id у тоста один: тумблер щёлкают подряд, а надпись должна быть одна.
    toast(on ? t.fogRestoredToast : t.fogRevealedToast, { id: "admin-fog-reveal" });
  };

  return (
    <div className="mx-2 mt-1 flex items-center gap-2 rounded-2xl border border-gold/30 bg-card p-2">
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold",
          on ? "bg-gold/15 text-gold" : "bg-secondary/40 text-muted-foreground",
        )}
      >
        {on ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {on ? t.fogRevealOff : t.fogRevealOn}
      </button>
      <p className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground">
        {on ? t.fogRevealHint : t.fogHiddenHint}
      </p>
    </div>
  );
}
