// Подтверждение «Забрать сундук»: цифрами — что ляжет в рюкзак (сундук, целая
// охрана, товары сети) и что — мешочком на клетке (не влезшее; у чужого без
// места — и сам сундук), и строкой — «охрана ранена — не вернётся». Ничего не
// пропадает (дополнение №3 владельца, 29.09). Шапка и кнопки закреплены, тело
// крутится само; на телефоне — шторка над нижней панелью.
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import type { ChestPickupView, ChestSlot, LootPick } from "@/lib/magicChest";
import { useChestPickupView } from "@/components/beta-raid/chest/useChestViews";
import { ChestItemList, type ChestItemRow } from "@/components/beta-raid/chest/ChestItemList";
import { ChestSpinner } from "@/components/beta-raid/chest/ChestSpinner";

/** Строки списка по выбору: имя и картинка — из сети. */
const rowsOf = (picks: readonly LootPick[], slots: readonly ChestSlot[]): ChestItemRow[] =>
  picks.map((p) => {
    const s = slots.find((x) => x.stackKey === p.stackKey);
    return { key: p.stackKey, name: s?.name ?? p.stackKey, image: s?.image ?? null, qty: p.qty };
  });

const chestRow = (v: ChestPickupView): ChestItemRow => ({
  key: "chest",
  name: v.chest.name,
  image: v.chest.image,
  qty: 1,
});

/** В рюкзак: сундук (если влез), охрана и товары сети, что влезли. */
const intoBackpack = (v: ChestPickupView): ChestItemRow[] => [
  ...(v.chestBagged ? [] : [chestRow(v)]),
  ...(v.guard ? [{ key: "guard", name: v.guard.name, image: v.guard.image, qty: 1 }] : []),
  ...rowsOf(v.taken, v.slots),
];

/** Мешочком на клетке: сундук (не влез к чужому) и не влезшее из сети. */
const intoBag = (v: ChestPickupView): ChestItemRow[] => [
  ...(v.chestBagged ? [chestRow(v)] : []),
  ...rowsOf(v.bagged ?? [], v.slots),
];

export function ChestPickupConfirm({
  q,
  r,
  busy,
  onConfirm,
  onClose,
}: {
  q: number;
  r: number;
  busy: boolean;
  /** woundedOk — игрок видел строку «охрана ранена»; sig — отпечаток цифр. */
  onConfirm: (woundedOk: boolean, sig?: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const view = useChestPickupView(q, r);
  const v = view.data;
  // Окно прошлой версии сервера знало «пропадёт» — покажем, если пришло.
  const lost = v ? rowsOf(v.lost ?? [], v.slots) : [];
  // Пока цифры перечитываются (или перечтение упало), подтверждать нечего:
  // на экране прошлые цифры, а сервер посчитает заново.
  const blocked = !v || !v.fits || view.isFetching || view.isError;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl border border-border bg-background pb-[calc(env(safe-area-inset-bottom)+84px)] sm:max-h-[88vh] sm:rounded-3xl sm:pb-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h4 className="truncate font-display text-sm font-bold">{t("chest.pickup")}</h4>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-4">
          {view.isLoading ? (
            <ChestSpinner />
          ) : !v ? (
            <p className="py-3 text-center text-xs text-destructive">
              {serverErrorText(view.error, t, t("braid.open_failed"))}
            </p>
          ) : !v.fits ? (
            <p className="py-3 text-center text-xs text-destructive">
              {serverErrorText(new Error(`market.backpack_need:${v.need}:${v.free}`), t)}
            </p>
          ) : (
            <>
              <ChestItemList title={t("chest.to_backpack")} rows={intoBackpack(v)} />
              <ChestItemList title={t("chest.to_bag")} rows={intoBag(v)} />
              <ChestItemList title={t("chest.lost")} rows={lost} lost />
              {v.guardWounded && (
                <p className="text-xs font-semibold text-destructive">{t("chest.guard_wounded")}</p>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border p-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-border px-4 py-3 text-sm font-semibold"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(v?.guardWounded === true, v?.sig)}
            disabled={busy || blocked}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-50",
              lost.length > 0 || v?.guardWounded
                ? "bg-destructive text-white"
                : "gradient-gold text-gold-foreground",
            )}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("chest.pickup_do")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
