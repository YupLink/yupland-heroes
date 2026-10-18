// Чужой магический сундук (владелец, 29–30.09.2026): пока охрана жива — бой
// (тот же, что у шахты); победа ничего не забирает сама. Охраны нет —
// «Открыть · N⚡» (занятые ячейки сети хозяина, не меньше 1; каждое открытие
// платит): видна сеть хозяина, берёшь выбранное «сколько» (сколько влезет,
// зелья — в сумку) и кладёшь собранное — оно становится сетью хозяина.
// «Забрать сундук» открепляет сундук от сети хозяина: нет места — сундук
// падает мешочком; последний сундук хозяина — его содержимое тебе (в рюкзак,
// сколько влезет, остальное мешочком), сначала цифры. «Закопать» — с лопатой.
// Закрыл окно — вход закрыт.
import { Loader2, PackageOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { MineGuardFight } from "@/components/beta-raid/mine/MineGuardFight";
import { invalidateChests } from "@/components/beta-raid/chest/chestLive";
import { useChestGuard, useChestNet } from "@/components/beta-raid/chest/useChestViews";
import { ChestSpinner } from "@/components/beta-raid/chest/ChestSpinner";
import { ChestOwnerPanel } from "@/components/beta-raid/chest/ChestOwnerPanel";
import { ChestPickupConfirm } from "@/components/beta-raid/chest/ChestPickupConfirm";
import { useChestPickup } from "@/components/beta-raid/chest/useChestPickup";
import { ChestBuryButton } from "@/components/beta-raid/chest/ChestBuryButton";
import { OpenButton } from "@/components/beta-raid/open-pass/OpenButton";
import { useOpenStorage } from "@/components/beta-raid/open-pass/useOpenStorage";

export function ChestForeignPanel({
  q,
  r,
  onClose,
}: {
  q: number;
  r: number;
  /** Сундук забран — окна больше нет. */
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const view = useChestGuard(q, r);
  // Перечтение упало (сундук забрали, закопали — chest.gone): прежний ответ не рисуем.
  const d = view.isError ? undefined : view.data;
  const guarded = !!d?.guard;
  const net = useChestNet(q, r, !!d && !guarded);
  const pass = useOpenStorage({ q, r });
  const pick = useChestPickup(q, r, onClose);

  if (view.isLoading) return <ChestSpinner />;
  if (!d) {
    return (
      <p className="py-3 text-center text-xs text-destructive">
        {serverErrorText(view.error, t, t("braid.open_failed"))}
      </p>
    );
  }
  if (d.guard) {
    return (
      <MineGuardFight
        q={q}
        r={r}
        guardian={d.guard}
        title={t("chest.guard_title")}
        onHit={() => invalidateChests(qc)}
        onDefeated={() => invalidateChests(qc)}
      />
    );
  }
  return (
    <div className="space-y-2.5">
      {net.isLoading ? (
        <ChestSpinner />
      ) : !net.data ? (
        <p className="py-3 text-center text-xs text-destructive">
          {serverErrorText(net.error, t, t("braid.open_failed"))}
        </p>
      ) : net.data.locked ? (
        <OpenButton
          price={net.data.price ?? 0}
          busy={pass.isPending}
          onOpen={(price) => pass.mutate({ price })}
        />
      ) : (
        <ChestOwnerPanel q={q} r={r} foreign />
      )}
      <button
        type="button"
        onClick={pick.start}
        disabled={pick.busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-gold/50 px-4 py-3 text-sm font-semibold text-gold disabled:opacity-50"
      >
        {pick.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageOpen className="h-4 w-4" />}
        {t("chest.pickup")}
      </button>
      <ChestBuryButton q={q} r={r} busy={pick.busy} onDone={onClose} />
      {pick.confirming && (
        <ChestPickupConfirm q={q} r={r} busy={pick.busy} onConfirm={pick.confirm} onClose={pick.cancel} />
      )}
    </div>
  );
}
