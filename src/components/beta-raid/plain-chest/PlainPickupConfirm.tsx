// Подтверждение «Забрать сундук» (обычный): цифрами — что ляжет в рюкзак (сам
// сундук и то, что влезло) и что выпадет мешочком на клетке. «Забрать» шлёт
// отпечаток этих цифр: поменялся сундук или рюкзак — сервер не заберёт, окно
// перечитает цифры. Шапка и кнопки закреплены, тело крутится само; на
// телефоне — шторка над нижней панелью.
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import type { LootPick } from "@/lib/magicChest";
import type { PlainChestSlot, PlainPickupView } from "@/lib/plainChest";
import { getPlainPickup } from "@/server/api/beta-raid/plain-chest/pchest-pickup";
import { ChestItemList, type ChestItemRow } from "@/components/beta-raid/chest/ChestItemList";
import { ChestSpinner } from "@/components/beta-raid/chest/ChestSpinner";
import { plainPickupKey } from "@/components/beta-raid/plain-chest/plainChestLive";

/** Строки списка по выбору: имя и картинка — из сундука. */
const rowsOf = (picks: readonly LootPick[], slots: readonly PlainChestSlot[]): ChestItemRow[] =>
  picks.map((p) => {
    const s = slots.find((x) => x.stackKey === p.stackKey);
    return { key: p.stackKey, name: s?.name ?? p.stackKey, image: s?.image ?? null, qty: p.qty };
  });

/** В рюкзак: сундук и то, что из него влезло. */
const intoBag = (v: PlainPickupView): ChestItemRow[] => [
  { key: "chest", name: v.chest.name, image: v.chest.image, qty: 1 },
  ...rowsOf(v.taken, v.slots),
];

export function PlainPickupConfirm({
  q,
  r,
  busy,
  onConfirm,
  onClose,
}: {
  q: number;
  r: number;
  busy: boolean;
  /** sig — отпечаток цифр, которые игрок видит. */
  onConfirm: (sig: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const view = useQuery({
    queryKey: plainPickupKey(q, r),
    queryFn: () => getPlainPickup({ data: { q, r } }),
    staleTime: 0,
    retry: false,
  });
  const v = view.data;
  // Пока цифры перечитываются (или перечтение упало), подтверждать нечего.
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
          <h4 className="truncate font-display text-sm font-bold">{t("pchest.pickup")}</h4>
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
              <ChestItemList title={t("chest.to_backpack")} rows={intoBag(v)} />
              <ChestItemList title={t("pchest.to_bag")} rows={rowsOf(v.bagged, v.slots)} />
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
            onClick={() => v && onConfirm(v.sig)}
            disabled={busy || blocked}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
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
