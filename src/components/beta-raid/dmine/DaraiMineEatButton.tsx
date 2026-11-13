// «Съесть · 5 алмазов» в окне гриба из рюкзака (владелец, 25.10.2026, §8.85):
// первое нажатие — цена перед съедением («Съесть гриб за ⚡50? Получишь …») и
// «Подтвердить» / «Отмена»; подтвердил — гриб с ближайшим выпадением съеден,
// энергия списана, награда на счёте, гриб исчез насовсем. Ключ нажатия — повтор
// после обрыва ни энергию, ни награду второй раз не трогает.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { serverErrorText } from "@/lib/serverErrorText";
import {
  MUSHROOM_EAT_ENERGY,
  MUSHROOM_EAT_REWARD,
  mushroomKindOfStack,
  type MushroomKind,
} from "@/lib/mushroomKinds";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { eatMushroom } from "@/server/api/beta-raid/dmine/dmine-eat";
import { invalidateDaraiMines } from "./useDaraiMines";

/** Отказ сервера ключом словаря («dmine.no_item») — не обрыв. */
const isRefusal = (e: Error): boolean => /^[a-z][a-z0-9]*\.[a-z0-9_]+(\||$)/i.test(e.message);

/** «5 алмазов», «25 000 DARAI» — на языке игрока. */
export function eatRewardText(
  kind: MushroomKind,
  t: (k: string, p?: Record<string, string | number>) => string,
  lang: string,
): string {
  const n = MUSHROOM_EAT_REWARD[kind].toLocaleString(lang === "en" ? "en-US" : "ru-RU");
  return t(`dmine.eat_reward.${kind}`, { n });
}

export function DaraiMineEatButton({
  stackKey,
  disabled = false,
  onEaten,
}: {
  stackKey: string;
  disabled?: boolean;
  onEaten?: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const op = useRef(newOpId());
  const [asking, setAsking] = useState(false);
  const kind = mushroomKindOfStack(stackKey);
  const eat = useMutation({
    // Цена, показанная в подтверждении, — без неё сервер не ест (dmine-eat).
    mutationFn: () =>
      eatMushroom({ data: { stackKey, op: op.current, cost: MUSHROOM_EAT_ENERGY } }),
    onSuccess: (res) => {
      op.current = newOpId();
      setAsking(false);
      toast.success(t("dmine.eaten_toast", { reward: eatRewardText(res.kind, t, lang) }));
      onEaten?.();
    },
    onError: (e: Error) => {
      // Отказ сервера — новый ключ; обрыв связи — тот же: повтор второй гриб не съест.
      if (isRefusal(e)) op.current = newOpId();
      toast.error(serverErrorText(e, t));
    },
    onSettled: () => {
      invalidateDaraiMines(qc);
      // Награда: золото и алмазы — счёт ресурсов, DARAI — счёт токенов.
      void qc.invalidateQueries({ queryKey: RESOURCES_KEY });
      void qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
      void qc.invalidateQueries({ queryKey: ENERGY_KEY });
    },
  });
  if (!kind) return null;
  const reward = eatRewardText(kind, t, lang);
  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        disabled={disabled}
        className={`${BTN} border-gold/40 text-gold`}
      >
        {t("dmine.eat", { reward })}
      </button>
    );
  }
  return (
    <EatConfirm
      text={t("dmine.eat_confirm", { n: MUSHROOM_EAT_ENERGY, reward })}
      cancel={t("common.cancel")}
      confirm={t("common.confirm")}
      busy={eat.isPending}
      disabled={disabled}
      onCancel={() => setAsking(false)}
      onConfirm={() => eat.mutate()}
    />
  );
}

const BTN =
  "flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50";

/** Цена перед съедением и «Отмена» / «Подтвердить» (вынесено ради теста без кликов). */
export function EatConfirm(p: {
  text: string;
  cancel: string;
  confirm: string;
  busy: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-gold/40 p-2" data-eat-confirm>
      <p className="text-center text-xs font-semibold text-gold">{p.text}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={p.onCancel}
          disabled={p.busy}
          className={`${BTN} border-border text-muted-foreground`}
        >
          {p.cancel}
        </button>
        <button
          type="button"
          onClick={p.onConfirm}
          disabled={p.disabled || p.busy}
          className={`${BTN} gradient-gold border-transparent text-gold-foreground`}
        >
          {p.busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {p.confirm}
        </button>
      </div>
    </div>
  );
}
