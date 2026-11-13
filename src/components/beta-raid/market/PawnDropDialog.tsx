// Окно уведомления после сдачи героя в ломбард (владелец, 23.10.2026; ПРАВИЛА
// §8.73 п. 4): рюкзак героя выпал мешочком на клетку основного героя, надетые
// артефакты сняты в инвентарь. Слой 200 — поверх окна лавки на карте (≥160).
import { createPortal } from "react-dom";
import { useLang, useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { closePawnDrop, usePawnDrop } from "./pawnDropBus";
import { numText } from "./num";

export function PawnDropDialog() {
  const t = useT();
  const lang = useLang();
  const drop = usePawnDrop();
  if (!drop) return null;
  const node = (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("pawndrop.title")}
    >
      <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border/60 bg-background p-4">
        <h2 className="text-center text-base font-bold text-gold">{t("pawndrop.title")}</h2>
        {drop.items.length > 0 && (
          <>
            <p className="text-center text-xs text-muted-foreground">
              {t("pawndrop.cell", { q: drop.q, r: drop.r })}
            </p>
            <ul className="max-h-[45dvh] space-y-1 overflow-y-auto">
              {drop.items.map((it, i) => (
                <li
                  key={`${it.name}:${i}`}
                  className="flex items-center gap-2 rounded-lg bg-secondary/30 px-2 py-1 text-sm"
                >
                  <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-secondary/50">
                    {it.image && (
                      <img
                        src={thumb(it.image, 64)}
                        alt=""
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{localizeAssetName(it.name, lang)}</span>
                  <span className="font-bold tabular-nums">×{numText(it.count)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {drop.arts > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            {t("pawndrop.arts", { n: drop.arts })}
          </p>
        )}
        <button
          type="button"
          onClick={closePawnDrop}
          className="flex h-11 w-full items-center justify-center rounded-xl gradient-gold text-sm font-bold text-gold-foreground"
        >
          OK
        </button>
      </div>
    </div>
  );
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
