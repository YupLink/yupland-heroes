// Окно «Подарки»: что прислала команда игры и кнопка забрать.
//
// Подарок не зачисляется молча — он ждёт здесь, пока игрок не нажмёт. Так
// человек видит, ЧТО ему дали и за что; раньше админское начисление выглядело
// как внезапно изменившийся баланс без объяснений.
//
// Срок (48 ч или бессрочно) — в карточке; сгоревший исчезает сам (минутный тик).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { giftHoursLeft, isLiveGift } from "@/lib/giftExpiry";
import { rewardKindLabelKey, rewardShownAmount } from "@/lib/rewardKinds";
import { claimAllGifts, claimGift, type MyGift } from "@/server/api/gifts";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { HudModal } from "./HudModal";
import { GiftIcon } from "./GiftIcon";
import { GIFTS_KEY } from "./useHarvest";

/** Имя подарка: своё, иначе ресурс по коду («Дерево», а не безликое «Ресурс»), иначе вид. */
function giftName(g: MyGift, t: (key: string) => string): string {
  const res = g.kind === "resource" ? rewardKindLabelKey(g.kind, g.refId) : null;
  if (g.title) return g.title;
  if (!res) return t(`gifts.kind.${g.kind}`);
  const name = t(res);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Штучное считаем «×N», меру (энергию, лайки, монеты) пишем числом. */
const COUNTABLE = new Set(["pack", "hero", "art", "item", "boss"]);

/** Что обновлять после выдачи: подарком бывает что угодно, трогаем всё. */
const TOUCHED: string[][] = [
  [...GIFTS_KEY],
  [...ENERGY_KEY],
  [...RESOURCES_KEY],
  ["my-like-balance"],
  ["my-chip-packs"],
  ["my-chip-inventory"],
  ["my-game-items"],
  ["my-heroes"],
  ["beta-raid-state"],
  // Боксы подписки ложатся в инвентарь мистических паков, счёт — в кошелёк.
  ["my-mystic-packs"],
  ["acc-balances"],
  ["my-hero-backpack"], // босс (охрана DARAI-шахты) — в рюкзак героя
];

/** Заметка «esub:Эксперт|Expert» (подписка) или «kit:Имя|Name» (купленный
 *  набор) → имя на языке игрока. */
function noteText(
  note: string | null,
  lang: string,
  t: (k: string, p?: Record<string, string>) => string,
) {
  if (note === "island:") return t("island.gift_note");
  if (note === "dmine-guard:") return t("dmine.guard_gift_note");
  const m = /^(esub|kit):(.*)$/.exec(note ?? "");
  if (!m) return note;
  const [ru, en] = m[2].split("|");
  const name = (lang === "en" ? en : ru) || ru || "";
  return m[1] === "kit" ? t("kits.gift_note", { name }) : t("esub.gift_note", { tier: name });
}

export function GiftsModal({
  gifts,
  onClose,
  presentation = "sheet",
  onOpenPacks,
  onViewGift,
}: {
  gifts: MyGift[];
  onClose: () => void;
  onOpenPacks?: (gift: MyGift) => void;
  onViewGift?: (gift: MyGift) => void;
  /** «centered» — окно замка: по центру, своё оформление (castle-reward-rail.css),
   *  поверх всего через портал. У рейда — прежний «sheet». */
  presentation?: "sheet" | "centered";
}) {
  const castle = presentation === "centered";
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  // Часы окна: раз в минуту, чтобы подпись срока и список жили без опроса.
  const [now, setNow] = useState(() => Date.now());
  const [claimedGift, setClaimedGift] = useState<MyGift | null>(null);
  const successAction = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (claimedGift) successAction.current?.focus(); }, [claimedGift]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const live = gifts.filter((g) => isLiveGift(g.expiresAt, now));

  const refreshAll = () => {
    for (const key of TOUCHED) qc.invalidateQueries({ queryKey: key, refetchType: "all" });
  };
  // Отказ («уже забран», «сгорел») — повод перечитать список: карточки,
  // которых у сервера больше нет, не должны висеть в окне.
  const onFail = (e: Error) => {
    toast.error(humanError(e));
    qc.invalidateQueries({ queryKey: [...GIFTS_KEY], refetchType: "all" });
  };

  const expiryLabel = (g: MyGift): string | null => {
    const h = giftHoursLeft(g.expiresAt, now);
    if (h == null) return null;
    if (g.note?.startsWith("esub:")) return t("esub.gift_today"); // подписка — день в день
    return h > 0 ? t("gifts.expires_in", { n: h }) : t("gifts.expires_soon");
  };

  const one = useMutation({
    // op — ключ ЭТОГО нажатия: повтор запроса (мост, обрыв) приходит с тем же
    // ключом и получает свой же подарок, а не «уже забран».
    mutationFn: (id: string) =>
      claimGift({ data: { id, op: `${id}:${Math.random().toString(36).slice(2, 10)}` } }),
    onSuccess: async (_result, id) => {
      const received = gifts.find((gift) => gift.id === id) ?? null;
      await qc.cancelQueries({ queryKey: GIFTS_KEY });
      qc.setQueryData<MyGift[]>(GIFTS_KEY, rows => rows?.filter(g => g.id !== id));
      if (received) setClaimedGift(received);
      else toast.success(t("gifts.claimed_toast"));
      refreshAll();
    },
    onError: onFail,
  });

  const all = useMutation({
    mutationFn: () => claimAllGifts(),
    onSuccess: async (res) => {
      if (res.failed === 0 && res.claimed >= live.length && res.claimed > 0) {
        await qc.cancelQueries({ queryKey: GIFTS_KEY });
        const claimedIds = new Set(live.map(g => g.id));
        qc.setQueryData<MyGift[]>(GIFTS_KEY, rows => rows?.filter(g => !claimedIds.has(g.id)));
      }
      toast.success(t("gifts.claimed_n", { n: res.claimed }));
      refreshAll();
      if (res.claimed > 0) onClose();
    },
    onError: onFail,
  });

  const busy = one.isPending || all.isPending;
  const canOpenPack = claimedGift?.kind === "pack" && claimedGift.refId?.startsWith("cp_") && !!onOpenPacks;
  const canViewGift = (claimedGift?.kind === "hero" || claimedGift?.kind === "art") && !!onViewGift;

  const modal = (
    <HudModal
      title={t("gifts.title")}
      subtitle={claimedGift ? undefined : t("gifts.hint")}
      icon={castle ? undefined : <Gift className="h-4 w-4 text-pink-300" />}
      onClose={onClose}
      presentation={presentation}
      modalKind={castle ? "gifts" : undefined}
      footer={
        claimedGift ? undefined : live.length > 1 ? (
          <button
            data-game-button="primary"
            type="button"
            onClick={() => all.mutate()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-40"
          >
            {all.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Gift className="h-4 w-4" />
            )}
            {t("gifts.claim_all")}
          </button>
        ) : undefined
      }
    >
      {claimedGift ? (
        <div role="status" className="space-y-4 py-3 text-center">
          <div className="text-sm font-semibold">{t("gifts.claimed_toast")}</div>
          <p className="text-sm text-gold">{giftName(claimedGift, t)} {COUNTABLE.has(claimedGift.kind) ? `×${claimedGift.amount}` : rewardShownAmount(claimedGift.kind, claimedGift.amount)}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {canOpenPack && <button ref={successAction} data-gift-next-action data-game-button="primary" type="button" className="min-h-11 px-4 text-sm" onClick={() => onOpenPacks?.(claimedGift)}>{t("gifts.open_pack")}</button>}
            {canViewGift && <button ref={successAction} data-gift-next-action data-game-button="primary" type="button" className="min-h-11 px-4 text-sm" onClick={() => onViewGift?.(claimedGift)}>{t(claimedGift.kind === "hero" ? "gifts.view_hero" : "gifts.view_artifact")}</button>}
            <button ref={canOpenPack || canViewGift ? undefined : successAction} data-gift-dismiss data-game-button="secondary" type="button" className="min-h-11 px-4 text-sm" onClick={() => live.length ? setClaimedGift(null) : onClose()}>{live.length ? t("gifts.other_gifts") : t("gifts.done")}</button>
          </div>
        </div>
      ) : live.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-muted-foreground">{t("gifts.empty")}</p>
      ) : (
        <div className="space-y-2">
          {live.map((g) => (
            <div
              key={g.id}
              data-gift-card
              className="flex items-center gap-3 rounded-xl border border-pink-400/30 bg-pink-400/5 p-2.5"
            >
              <div
                data-gift-icon
                className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary/40"
              >
                <GiftIcon g={g} />
              </div>
              <div data-gift-details className="min-w-0 flex-1">
                {/* Количество пишем ВСЕГДА: «Энергия» без числа не отвечает на
                    главный вопрос — сколько дали. У штучного (пак, герой,
                    артефакт) это «×2», у меры (энергия, лайки) — само число. */}
                <div data-gift-title className="truncate text-sm font-semibold">
                  {giftName(g, t)}{" "}
                  <span data-gift-amount className="text-gold">
                    {COUNTABLE.has(g.kind) ? `×${g.amount}` : rewardShownAmount(g.kind, g.amount)}
                  </span>
                </div>
                <div data-gift-note className="truncate text-[11px] text-muted-foreground">
                  {noteText(g.note, lang, t) || t("gifts.from_admin")}
                </div>
                {expiryLabel(g) && (
                  <div data-gift-expiry className="truncate text-[10px] text-gold/70">
                    {expiryLabel(g)}
                  </div>
                )}
              </div>
              <button
                data-gift-action
                data-game-button="secondary"
                type="button"
                onClick={() => one.mutate(g.id)}
                disabled={busy}
                className="shrink-0 rounded-xl border border-pink-400/50 px-3 py-1.5 text-[11px] font-bold text-pink-200 disabled:opacity-40"
              >
                {one.isPending && one.variables === g.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  t("gifts.claim")
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </HudModal>
  );
  // Замок: окно над картой и полосой наград — через портал в body.
  return castle && typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
