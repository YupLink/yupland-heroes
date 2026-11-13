// Шапка главного экрана замка (дизайн Ангелины, design/app-preview/CastleMainHud):
// золото, лайки, энергия и строка действующих эффектов героя. Билетов нет с
// 20.10.2026 (§8.61): их место заняло золото — всегда коротко K/M, полное число в
// подписи, «+» — окно покупки золота (§8.66). При переносе
// 07.10.2026 панель выпала вместе с мастерской — вернул на настоящих данных:
// те же общие ключи, что у Казны, рейда и окон трат (без перезагрузки),
// «+» открывают настоящие окна покупки игры, а не примерку из мастерской.
import { type ReactNode, lazy, Suspense, useLayoutEffect, useRef, useState } from "react";
import { Info, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { myLikeBalance } from "@/server/api/likes";
import { getSession } from "@/server/api/user-auth";
import { getBetaRaidState } from "@/server/api/beta-raid";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { useResources } from "@/lib/hooks/useResources";
import { compactGold } from "@/lib/goldShop";
import { CastleEffectsStrip, type CastleActiveEffects } from "@/components/beta-raid/CastleEffectsStrip";
import { CastleLikesInfo } from "./CastleLikesInfo";
import { isWalletLinked } from "@/lib/walletLinked";
import { EnergyRecoveryCountdown } from "./EnergyRecoveryCountdown";
import "./castle-main-hud.css";

const EnergyBuyDialog = lazy(() =>
  import("./energy-buy/EnergyBuyDialog").then((m) => ({ default: m.EnergyBuyDialog })),
);
const GoldBuyDialog = lazy(() =>
  import("./gold-buy/GoldBuyDialog").then((m) => ({ default: m.GoldBuyDialog })),
);

type Item = "gold" | "likes" | "energy";
type Buy = "gold" | "energy";
const ICONS: Record<Item, string> = {
  gold: "/resources/gold.webp",
  likes: "/resources/likes.webp",
  energy: "/resources/energy.webp",
};

function compactNumber(value: string): string {
  const number = Number(value.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(number) || number < 1_000) return value;
  const unit = number >= 1_000_000 ? "M" : "K";
  const scaled = number / (unit === "M" ? 1_000_000 : 1_000);
  return `${scaled < 10 ? Math.floor(scaled * 10) / 10 : Math.floor(scaled)}${unit}`;
}

/** Число целиком, а не влезает — сокращённо (12,5K), полное — в подписи. */
function HudValue({ value }: { value: string }) {
  const box = useRef<HTMLElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [short, setShort] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      if (box.current && probe.current)
        setShort(probe.current.getBoundingClientRect().width > box.current.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (box.current) observer.observe(box.current);
    if (probe.current) observer.observe(probe.current);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
    // Новое число меняет ширину пробы — её и так ловит наблюдатель (после
    // раскладки кадра). Перезапуск на каждое значение (энергия — на каждый шаг
    // героя) заставлял браузер раскладывать страницу синхронно посреди шага.
  }, []);
  return (
    <strong ref={box} title={value} aria-label={value} data-compact={short || undefined}>
      <span aria-hidden="true">{short ? value.split("/").map(compactNumber).join("/") : value}</span>
      <span ref={probe} className="castle-main-hud__probe" aria-hidden="true">
        {value}
      </span>
    </strong>
  );
}

/** Золото — всегда K/M (Ангелина: «устойчивое сокращение»), полное — в подписи. */
function GoldValue({ value, full }: { value: number; full: string }) {
  return (
    <strong title={full} aria-label={full}>
      <span aria-hidden="true">{compactGold(value)}</span>
    </strong>
  );
}

export function CastleMainHud({ ru, music }: { ru: boolean; music?: ReactNode }) {
  const fmt = new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 });
  const energy = useEnergy();
  const resources = useResources();
  const likes = useQuery({ queryKey: ["my-like-balance"], queryFn: () => myLikeBalance(), staleTime: 30_000 });
  // Эффекты — из того же ответа, что у карты рейда (общий ключ).
  const state = useQuery({ queryKey: ["beta-raid-state"], queryFn: () => getBetaRaidState() });
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const [likesInfo, setLikesInfo] = useState(false);
  const [buy, setBuy] = useState<Buy | null>(null);
  // Переключатель из дизайна Ангелины: окно покупки глазами игрока с кошельком
  // или звездочника (вход только через Telegram). Меняет только вид окна.
  const linked = isWalletLinked(session.data?.wallet);
  const walletView = linked;
  const buyButtons = useRef<Record<Buy, HTMLButtonElement | null>>({ gold: null, energy: null });
  const gold = resources.data?.gold;

  const values: Record<Item, { value: string | null; pending: boolean }> = {
    gold: {
      value: gold == null ? null : fmt.format(Math.floor(gold + 1e-9)),
      pending: resources.isPending,
    },
    likes: {
      value: likes.data?.available == null ? null : fmt.format(likes.data.available),
      pending: likes.isPending,
    },
    energy: {
      value: energy.data
        ? `${fmt.format(Math.floor(energy.data.energy))}/${fmt.format(energy.data.maxEnergy)}`
        : null,
      pending: energy.isPending,
    },
  };
  const labels = ru
    ? { gold: "Золото", likes: "Лайки", energy: "Энергия" }
    : { gold: "Gold", likes: "Likes", energy: "Energy" };
  const buyLabels = ru
    ? { gold: "Купить золото", energy: "Купить энергию" }
    : { gold: "Buy gold", energy: "Buy energy" };
  const effects = (state.data as { effects?: CastleActiveEffects } | undefined)?.effects ?? null;
  const closeBuy = () => {
    const item = buy;
    setBuy(null);
    requestAnimationFrame(() => item && buyButtons.current[item]?.focus());
  };

  return (
    <div className="castle-main-hud" aria-label={ru ? "Игровые ресурсы и эффекты" : "Game resources and effects"}>
      <div className="castle-main-hud__balances" role="group" aria-label={ru ? "Балансы" : "Balances"}>
        {(["gold", "likes", "energy"] as const).map((item) => (
          <div className={`castle-main-hud__balance castle-main-hud__balance--${item}`} key={item}>
            <img className={`castle-main-hud__icon castle-main-hud__icon--${item}`} src={ICONS[item]} alt="" />
            <div className="castle-main-hud__numbers">
              <span className="castle-main-hud__label-row">
                <span className="castle-main-hud__label">{labels[item]}</span>
                {item === "likes" && (
                  <button
                    type="button"
                    className="castle-main-hud__info"
                    aria-label={ru ? "Как получить лайки" : "How to get likes"}
                    onClick={() => setLikesInfo(true)}
                  >
                    <Info aria-hidden="true" />
                  </button>
                )}
              </span>
              {values[item].value == null ? (
                <strong aria-live="polite">{values[item].pending ? "…" : "—"}</strong>
              ) : item === "gold" && gold != null ? (
                <GoldValue value={gold} full={values.gold.value ?? ""} />
              ) : (
                <HudValue value={values[item].value} />
              )}
            </div>
            {item === "energy" && energy.data && <EnergyRecoveryCountdown ru={ru} {...energy.data} updatedAt={energy.dataUpdatedAt} />}
            {item !== "likes" && (
              <button
                type="button"
                ref={(node) => {
                  buyButtons.current[item] = node;
                }}
                className="castle-main-hud__buy"
                aria-label={buyLabels[item]}
                onClick={() => setBuy(item)}
              >
                <Plus aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
      </div>
      {music}
      <CastleEffectsStrip
        showWhenEmpty
        effects={effects}
        lang={ru ? "ru" : "en"}
        status={state.isError ? "error" : state.isPending ? "loading" : "ready"}
        onRetry={() => void state.refetch()}
      />
      <CastleLikesInfo ru={ru} open={likesInfo} onOpenChange={setLikesInfo} />
      <Suspense fallback={null}>
        {buy === "gold" && (
          <GoldBuyDialog open ru={ru} onClose={closeBuy} returnFocus={() => buyButtons.current.gold?.focus()} />
        )}
        {buy === "energy" && (
          <EnergyBuyDialog
            open
            ru={ru}
            walletView={walletView}
            onClose={closeBuy}
            returnFocus={() => buyButtons.current.energy?.focus()}
          />
        )}
      </Suspense>
    </div>
  );
}
