// Окно обычного сундука (ПРАВИЛА §8.22): как склад и мешочек — слева рюкзак,
// справа десять ячеек сундука, «сколько» — QtyDialog склада. Ниже — «Забрать
// сундук» (с подтверждением цифр) и «Закопать» (без лопаты кнопка неактивна).
// Сундук забрали или закопали (здесь или соседом), герой отошёл — окно
// закрывается: сундука на клетке больше нет. Ячейки — только внутри
// оплаченного входа (§8.23): закрытый сундук показывает «Открыть · N⚡».
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Backpack, Footprints, Loader2, Package, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { getMyBackpack } from "@/server/api/beta-raid/market-backpack-read";
import { ChestSheet } from "@/components/beta-raid/chest/ChestSheet";
import { ChestSpinner } from "@/components/beta-raid/chest/ChestSpinner";
import type { OpenChest } from "@/components/beta-raid/chest/useMagicChests";
import { QtyDialog } from "@/components/beta-raid/QtyDialog";
import {
  movableOf,
  putPick,
  takePick,
  type BagPick,
} from "@/components/beta-raid/loot-bag/lootBagPick";
import { PlainChestGrid } from "@/components/beta-raid/plain-chest/PlainChestGrid";
import { PlainPickupConfirm } from "@/components/beta-raid/plain-chest/PlainPickupConfirm";
import { ShovelButton } from "@/components/beta-raid/tool/ShovelButton";
import { OpenButton } from "@/components/beta-raid/open-pass/OpenButton";
import { useOpenStorage } from "@/components/beta-raid/open-pass/useOpenStorage";
import {
  usePlainChestActions,
  usePlainChestView,
} from "@/components/beta-raid/plain-chest/usePlainChest";

const BTN =
  "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold disabled:opacity-50";

/** Отказы, после которых окну нечего показывать: сундука здесь больше нет. */
const GONE = /pchest\.(gone|buried)|chest\.approach|braid\.void/;

export function PlainChestWindow({
  chest,
  onClose,
  onGoTo,
}: {
  chest: OpenChest;
  onClose: () => void;
  /** «Идти сюда»: тап по сундуку открывает окно, а встать на клетку надо уметь. */
  onGoTo?: (q: number, r: number) => void;
}) {
  const t = useT();
  const lang = useLang();
  const { q, r } = chest;
  const view = usePlainChestView(q, r);
  const bp = useQuery({ queryKey: ["my-hero-backpack"], queryFn: () => getMyBackpack() });
  const [pick, setPick] = useState<BagPick | null>(null);
  const act = usePlainChestActions(q, r, { onMoved: () => setPick(null), onGone: onClose });
  const pass = useOpenStorage(chest);

  // Сундука больше нет (забрали, закопали, отошёл) — окно закрывается.
  const err = view.error instanceof Error ? view.error.message : "";
  const gone = !!view.error && GONE.test(err);
  useEffect(() => {
    if (!gone) return;
    toast.error(serverErrorText(view.error, t));
    onClose();
  }, [gone, view.error, t, onClose]);

  const d = view.data;
  const submit = (qty: number) => {
    if (!pick) return;
    const v = { stackKey: pick.stackKey, qty };
    if (pick.mode === "put") act.put.mutate(v);
    else act.take.mutate(v);
  };

  return (
    <>
      <ChestSheet
        title={localizeAssetName(d?.name ?? chest.name, lang) || t("pchest.title")}
        subtitle={t("pchest.shared")}
        tone="loot"
        onClose={onClose}
      >
        {view.isLoading || !d ? (
          view.error && !gone ? (
            <p className="py-3 text-center text-xs text-destructive">
              {serverErrorText(view.error, t, t("braid.open_failed"))}
            </p>
          ) : (
            <ChestSpinner />
          )
        ) : (
          <div className="space-y-2.5">
            {d.open === false ? (
              <OpenButton
                price={d.price ?? 0}
                busy={pass.isPending}
                onOpen={(price) => pass.mutate({ price })}
              />
            ) : (
              <PlainChestGrid
                view={d}
                backpack={bp.data}
                busyKey={act.put.isPending || act.take.isPending ? (pick?.busyKey ?? null) : null}
                onPut={(c) => {
                  const s = bp.data?.stacks.find((x) => x.stackKey === c.stack.stackKey);
                  const movable = s ? movableOf(s) : 0;
                  if (movable > 0) setPick(putPick(c, movable));
                  else toast.error(t("braid.tool_worn_stays"));
                }}
                onTake={(c) => setPick(takePick(c))}
              />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={act.busy}
                onClick={() => act.pickup.mutate(undefined)}
                className={`${BTN} gradient-gold text-gold-foreground`}
              >
                {act.pickup.isPending && !act.confirming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PackageOpen className="h-4 w-4" />
                )}
                {t("pchest.pickup")}
              </button>
              <ShovelButton
                label="bag.bury"
                busy={act.bury.isPending}
                disabled={act.busy}
                onDig={() => act.bury.mutate()}
                className={`${BTN} border border-border text-foreground`}
              />
            </div>
            {onGoTo && (
              <button
                type="button"
                onClick={() => onGoTo(q, r)}
                className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold"
              >
                <Footprints className="h-4 w-4" />
                {t("braid.go_here")}
              </button>
            )}
          </div>
        )}
      </ChestSheet>
      {pick && (
        <QtyDialog
          key={pick.busyKey}
          name={pick.name}
          image={pick.image}
          haveKey={pick.mode === "put" ? "braid.backpack_have" : "pchest.have"}
          total={pick.total}
          cell={pick.cell}
          icon={pick.mode === "put" ? Package : Backpack}
          label={t(pick.mode === "put" ? "pchest.put" : "pchest.take")}
          tone="gold"
          busy={act.put.isPending || act.take.isPending}
          onSubmit={submit}
          onClose={() => setPick(null)}
        />
      )}
      {act.confirming && (
        <PlainPickupConfirm
          q={q}
          r={r}
          busy={act.pickup.isPending}
          onConfirm={(sig) => act.pickup.mutate(sig)}
          onClose={act.cancelConfirm}
        />
      )}
    </>
  );
}
