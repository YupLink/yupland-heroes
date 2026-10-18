// Окно «Купить энергию» в замке — дизайн Ангелины (design/app-preview/
// CastlePurchaseDialog, ветка энергии) на настоящих данных: подписка, разовые
// пакеты, «+N за лайки». Экраны: каталог → способ оплаты → подтверждение →
// (пополнить звёзды) → готово. Цена на подтверждении — всегда текущая с сервера.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { gameSpent, subOpts, type PackCard, type PayOpt } from "./energyOffers";
import { useEnergyBuy } from "./useEnergyBuy";
import { EnergyHead } from "./EnergyHead";
import { EnergyCatalog } from "./EnergyCatalog";
import { PackMethods, SubMethods } from "./EnergyMethods";
import { EnergyConfirm, EnergyDone, EnergyTopUp, type Reward } from "./EnergyConfirm";
import { EnergyTierGlyph } from "./energyGlyphs";
import { boxesWord, energyWord, num, tierGlyph } from "./energyFormat";
import "./energy-buy.css";

type Stage = "catalog" | "methods" | "confirm" | "top-up" | "success";
type Sel = { kind: "pack"; id: string } | { kind: "sub"; index: number };
export type EnergyReturn = { packId: string; optionKey: string; origin: "catalog" | "methods"; catalogScroll: number };

export function EnergyBuyDialog({
  open,
  ru,
  walletView,
  onClose,
  returnFocus,
  onNeedTickets,
  resume,
}: {
  open: boolean;
  ru: boolean;
  /** Вид игрока с кошельком; звездочнику — звёзды первыми и без лишних цен. */
  walletView: boolean;
  onClose: () => void;
  returnFocus: () => void;
  onNeedTickets?: (selection: EnergyReturn) => void;
  resume?: EnergyReturn | null;
}) {
  const data = useEnergyBuy(open);
  const [stage, setStage] = useState<Stage>("catalog");
  const [sel, setSel] = useState<Sel | null>(null);
  const [pick, setPick] = useState<{ key: string; opId: string } | null>(null);
  const [origin, setOrigin] = useState<"catalog" | "methods">("methods");
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [doneTitle, setDoneTitle] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const catalogScroll = useRef(0);

  useLayoutEffect(() => {
    if (!open) return;
    catalogScroll.current = resume?.catalogScroll ?? 0;
    setStage(resume ? "confirm" : "catalog");
    setSel(resume ? { kind: "pack", id: resume.packId } : null);
    setPick(resume ? { key: resume.optionKey, opId: newOpId() } : null);
    setOrigin(resume?.origin ?? "methods");
    setError("");
  }, [open, resume]);
  useLayoutEffect(() => {
    if (dialogRef.current) dialogRef.current.scrollTop = stage === "catalog" ? catalogScroll.current : 0;
  }, [stage]);

  // Всё — из свежих данных: ступень лестницы или курс сменились — видна новая цена.
  const card = sel?.kind === "pack" ? (data.cards.find((c) => c.id === sel.id) ?? null) : null;
  const tier = sel?.kind === "sub" ? (data.tiers[sel.index] ?? null) : null;
  const opts: PayOpt[] = card ? [...(card.game ? [card.game] : []), ...card.others] : tier ? subOpts(tier) : [];
  const opt = pick ? (opts.find((o) => o.key === pick.key) ?? null) : null;

  useEffect(() => {
    const selectionSettled = sel?.kind === "pack"
      ? (sel.id === "likes" ? data.sectionStatus.like !== "loading" : data.sectionStatus.packs !== "loading")
      : data.sectionStatus.subs !== "loading";
    if ((stage === "confirm" || stage === "top-up") && !opt && !busyKey && selectionSettled) {
      setStage("catalog");
      setError(ru ? "Предложение изменилось. Выбери его заново." : "This offer changed. Select it again.");
    }
  }, [stage, opt, busyKey, data.sectionStatus.packs, data.sectionStatus.like, data.sectionStatus.subs, sel, ru]);

  const leaveCatalog = () => {
    if (stage === "catalog") catalogScroll.current = dialogRef.current?.scrollTop ?? 0;
    setError("");
  };
  const choose = (o: PayOpt, from: "catalog" | "methods") => {
    leaveCatalog();
    setPick({ key: o.key, opId: newOpId() });
    setOrigin(from);
    setStage("confirm");
  };
  const goBack = () => {
    setError("");
    setStage(stage === "top-up" ? "confirm" : stage === "confirm" ? origin : "catalog");
  };

  const run = async (o: PayOpt, title: string, opId?: string) => {
    if (gameSpent(o)) { setError(ru ? "Лимит на сегодня исчерпан." : "Today’s limit is reached."); return; }
    setBusyKey(o.key);
    setError("");
    try {
      await data.pay(o, opId);
      setDoneTitle(title);
      setPick(null);
      setStage("success");
    } catch (e) {
      setError(humanError(e as Error));
    } finally {
      setBusyKey(null);
    }
  };
  const packTitle = (c: PackCard) => `+${num(c.amount, ru)} ${energyWord(ru)}`;
  const buyGame = (c: PackCard) => {
    const g = c.game;
    if (!g || busyKey) return;
    setSel({ kind: "pack", id: c.id });
    choose(g, "catalog");
  };

  const tierIdx = sel?.kind === "sub" ? sel.index : 0;
  const tierName = tier ? (!ru && tier.nameEn ? tier.nameEn : tier.name) : "";
  const reward: Reward | null = card
    ? { art: <img src="/resources/energy.png" alt="" />, title: packTitle(card) }
    : tier
      ? {
          art: <EnergyTierGlyph tier={tierGlyph(tierIdx, data.tiers.length)} />,
          title: `${tierName} · ${tier.days} ${ru ? "дней" : "days"}`,
          sub: `${num(tier.energyPerDay, ru)} ${energyWord(ru)}${tier.boxesPerDay > 0 ? ` + ${tier.boxesPerDay} ${boxesWord(tier.boxesPerDay, ru)}` : ""} ${ru ? "ежедневно" : "daily"}`,
        }
      : null;

  const flow = stage === "methods" || stage === "confirm" || stage === "success";
  const cls = [
    "energy-buy energy-buy--bundle-study",
    stage === "catalog" && "energy-buy--subscription-led",
    stage === "catalog" && data.cards.length > 0 && "energy-buy--energy-catalog",
    flow && "energy-buy--energy-flow",
    stage === "confirm" && "energy-buy--purchase-confirm",
    stage === "methods" && sel?.kind === "pack" && "energy-buy--other-methods",
    stage === "methods" && sel?.kind === "sub" && "energy-buy--subscription-methods",
  ]
    .filter(Boolean)
    .join(" ");
  const title =
    stage === "top-up"
      ? ru ? "Пополнить Stars" : "Top up Stars"
      : sel?.kind === "sub" && stage !== "catalog"
        ? ru ? "Подписка на энергию" : "Energy subscription"
        : ru ? "Купить энергию" : "Buy energy";
  const contentCls = `energy-buy__content${stage === "top-up" ? " energy-buy__top-up" : stage === "success" ? " energy-buy__success" : ""}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busyKey && onClose()}>
      <DialogContent
        ref={dialogRef}
        className={cls}
        closeLabel={ru ? "Закрыть" : "Close"}
        tabIndex={-1}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          dialogRef.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus();
        }}
      >
        <EnergyHead
          ru={ru}
          title={title}
          back={stage !== "catalog" && stage !== "success"}
          busy={!!busyKey}
          pack={stage === "methods" && card ? packTitle(card) : null}
          topUp={stage === "top-up"}
          onBack={goBack}
          onClose={onClose}
        />

        <div className={contentCls} role={stage === "success" ? "status" : undefined}>
          {stage === "catalog" && (
            <>
              {error && <p className="energy-buy__error" role="alert">{error}</p>}
              {data.status === "loading" && <p className="energy-buy__status" role="status">{ru ? "Загружаем предложения…" : "Loading offers…"}</p>}
              {data.status === "error" && (
                <div className="energy-buy__status" role="alert">
                  {ru ? "Не удалось загрузить предложения." : "Could not load offers."}
                  <button type="button" onClick={data.retry}>{ru ? "Повторить" : "Retry"}</button>
                </div>
              )}
              {data.status === "ready" && data.sectionStatus.subs === "error" && (
                <div className="energy-buy__section-alert" role="alert">
                  <span>{ru ? "Подписки не загрузились." : "Subscriptions could not load."}</span>
                  <button type="button" onClick={data.retrySubs}>{ru ? "Повторить" : "Retry"}</button>
                </div>
              )}
              {data.status === "ready" && data.sectionStatus.packs === "error" && (
                <div className="energy-buy__section-alert" role="alert">
                  <span>{ru ? "Разовые пакеты не загрузились." : "One-time packs could not load."}</span>
                  <button type="button" onClick={data.retryPacks}>{ru ? "Повторить" : "Retry"}</button>
                </div>
              )}
              {data.status === "ready" && data.sectionStatus.like === "error" && (
                <div className="energy-buy__section-alert" role="alert">
                  <span>{ru ? "Предложение за лайки не загрузилось." : "The likes offer could not load."}</span>
                  <button type="button" onClick={data.retryLike}>{ru ? "Повторить" : "Retry"}</button>
                </div>
              )}
              {data.status === "ready" && (
                data.sectionStatus.subs === "loading" || data.sectionStatus.packs === "loading" ||
                data.sectionStatus.like === "loading"
              ) && (
                <p className="energy-buy__section-alert" role="status">
                  {ru ? "Загружаем остальные предложения…" : "Loading more offers…"}
                </p>
              )}
              {data.status === "ready" && data.cards.length === 0 && data.tiers.length === 0 &&
                data.sectionStatus.packs === "ready" && data.sectionStatus.subs === "ready" &&
                data.sectionStatus.like === "ready" && (
                <p className="energy-buy__status">{ru ? "Сейчас нет доступных предложений." : "No offers are available right now."}</p>
              )}
              {data.status === "ready" && (
                <EnergyCatalog
                  ru={ru}
                  walletView={walletView}
                  cards={data.cards}
                  tiers={data.tiers}
                  mine={data.mine}
                  savings={data.savings}
                  busyKey={busyKey}
                  onTier={(index) => {
                    leaveCatalog();
                    setSel({ kind: "sub", index });
                    setStage("methods");
                  }}
                  onGame={buyGame}
                  onPrice={(c, o) => {
                    setSel({ kind: "pack", id: c.id });
                    choose(o, "catalog");
                  }}
                  onAll={(c) => {
                    leaveCatalog();
                    setSel({ kind: "pack", id: c.id });
                    setStage("methods");
                  }}
                />
              )}
            </>
          )}
          {stage === "methods" && card && <PackMethods ru={ru} opts={opts} onPick={(o) => choose(o, "methods")} />}
          {stage === "methods" && tier && (
            <SubMethods
              ru={ru}
              tier={tier}
              glyph={tierGlyph(tierIdx, data.tiers.length)}
              saving={walletView ? (data.savings[tierIdx] ?? null) : null}
              opts={opts}
              onPick={(o) => choose(o, "methods")}
            />
          )}
          {stage === "confirm" && opt && reward && (
            <EnergyConfirm
              ru={ru}
              reward={reward}
              opt={opt}
              balance={data.balanceOf(opt)}
              error={error}
              pending={busyKey === opt.key}
              onPay={() => void run(opt, reward.title, pick?.opId)}
              onTopUp={() => setStage("top-up")}
              onNeedTickets={card && opt && onNeedTickets
                ? () => onNeedTickets({ packId: card.id, optionKey: opt.key, origin, catalogScroll: catalogScroll.current })
                : undefined}
            />
          )}
          {stage === "top-up" && opt && (
            <EnergyTopUp ru={ru} opt={opt} balance={data.balanceOf(opt)} onBack={() => setStage("confirm")} />
          )}
          {stage === "success" && <EnergyDone ru={ru} title={doneTitle} onBack={() => setStage("catalog")} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
