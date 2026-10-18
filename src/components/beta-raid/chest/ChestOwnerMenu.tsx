// Свой сундук: «Открыть · N⚡» (вход за энергию — занятые ячейки сети, не
// меньше 1, каждое открытие платит, §8.23) → сеть ↔ рюкзак и охрана; «Забрать
// сундук» (в рюкзак вместе с целой охраной) и — без охраны — «Закопать» (с
// лопатой, 29.09). Последний сундук с товарами сети забирается только после
// подтверждения с цифрами; окно закрыли — вход закрыт.
import { Loader2, PackageOpen } from "lucide-react";
import { useT } from "@/lib/i18n";
import { ChestOwnerPanel } from "@/components/beta-raid/chest/ChestOwnerPanel";
import { ChestPickupConfirm } from "@/components/beta-raid/chest/ChestPickupConfirm";
import { ChestBuryButton } from "@/components/beta-raid/chest/ChestBuryButton";
import { useChestPickup } from "@/components/beta-raid/chest/useChestPickup";
import { useGuardLite } from "@/components/beta-raid/chest/chestGuard";
import { useChestNet } from "@/components/beta-raid/chest/useChestViews";
import { ChestSpinner } from "@/components/beta-raid/chest/ChestSpinner";
import { OpenButton } from "@/components/beta-raid/open-pass/OpenButton";
import { useOpenStorage } from "@/components/beta-raid/open-pass/useOpenStorage";

export function ChestOwnerMenu({
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
  const net = useChestNet(q, r);
  const pass = useOpenStorage({ q, r });
  const pick = useChestPickup(q, r, onClose);
  // «Закопать» — только без охраны (слой охраны карты знает живую) и лопатой в руках.
  const { lite, ready } = useGuardLite(q, r);

  return (
    <div className="space-y-2.5">
      {net.isLoading ? (
        <ChestSpinner />
      ) : net.data?.locked ? (
        <OpenButton
          price={net.data.price ?? 0}
          busy={pass.isPending}
          onOpen={(price) => pass.mutate({ price })}
        />
      ) : (
        <ChestOwnerPanel q={q} r={r} />
      )}
      <button
        type="button"
        onClick={pick.start}
        disabled={pick.busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-gold/50 px-4 py-3 text-sm font-semibold text-gold disabled:opacity-50"
      >
        {pick.busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PackageOpen className="h-4 w-4" />
        )}
        {t("chest.pickup")}
      </button>
      {ready && !lite && <ChestBuryButton q={q} r={r} busy={pick.busy} onDone={onClose} />}
      {pick.confirming && (
        <ChestPickupConfirm
          q={q}
          r={r}
          busy={pick.busy}
          onConfirm={pick.confirm}
          onClose={pick.cancel}
        />
      )}
    </div>
  );
}
