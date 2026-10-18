// Прихожая v2 — онбординг-песочница. Тап → осознанность (× звёзды сильнейшей
// фишки), реген тап-пула, сундук-гача (L5 → фишки), 30-дн марафон, выпуск в
// игру. HallwayBody переиспользуется в /join (чистый layout).
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type RefObject,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  Lock,
  Box,
  Star,
  Zap,
  Settings,
  Trophy,
  HelpCircle,
  X,
  ChevronsUp,
  ChevronDown,
  Home,
  ShoppingBag,
  CalendarCheck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { NftImage } from "@/components/NftImage";
import { ChipImage, chipPanelClasses } from "@/components/ChipImage";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getSession } from "@/server/api/user-auth";
import {
  getMyHallwayState,
  tapYupik,
  buyOpenChest,
  marathonClaim,
  releaseHallway,
  openHallwayChest,
} from "@/server/api/hallway";
import { HallwayMarathon } from "./HallwayTasks";
import { HomeChestButton, InventoryTab, HallwayStarShop, RewardModal } from "./HallwayChests";
import { humanError } from "@/lib/humanError";

export const Route = createFileRoute("/hallway")({
  component: HallwayPage,
});

function HallwayPage() {
  const t = useT();
  const walletConnected = useAppStore((s) => s.walletConnected);
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  if (!walletConnected && !session.data?.wallet) {
    return (
      <AppShell hideNav>
        <div className="mx-auto max-w-2xl px-4 py-12 text-center">
          <Lock className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-bold">{t("hallway.connect_wallet")}</h1>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell hideNav>
      <HallwayBody showAdminLink={session.data?.isAdmin} />
    </AppShell>
  );
}

const STAR_LABEL = (s: number) => (s === 1 ? "1★" : `${s}★`);

/** Тело прихожей без внешнего layout. /hallway (AppShell) и /join (чистый). */
export function HallwayBody({ showAdminLink = false }: { showAdminLink?: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [floaters, setFloaters] = useState<{ id: number; v: number }[]>([]);
  const floaterId = useRef(0);
  // Якоря для пошагового тура (подсветка области)
  const tapRef = useRef<HTMLButtonElement>(null);
  const levelRef = useRef<HTMLDivElement>(null);
  const chestRef = useRef<HTMLButtonElement>(null);
  const marathonRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const [reward, setReward] = useState<null | Record<string, unknown>>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [tab, setTab] = useState<"home" | "inventory" | "shop">("home");
  const [chipsOpen, setChipsOpen] = useState(false); // блок «Фишки» на главной свёрнут по умолчанию
  // Всплывающее окно выпуска: показываем ОДИН раз на каждый вход (маунт), если
  // собрано ≥10 фишек. Ref не сбрасывается на рефетчах (не мигает каждые 20с).
  const [releasePrompt, setReleasePrompt] = useState(false);
  const releasePromptShown = useRef(false);
  // Тур наводится на элементы «Главной» — открываем всегда на ней.
  const openTutorial = () => {
    setTab("home");
    setTutorial(true);
  };

  useEffect(() => {
    try {
      if (!localStorage.getItem("hallway_tutorial_seen")) setTutorial(true);
    } catch {
      /* ignore */
    }
  }, []);
  const closeTutorial = () => {
    try {
      localStorage.setItem("hallway_tutorial_seen", "1");
    } catch {
      /* ignore */
    }
    setTutorial(false);
  };

  const state = useQuery({
    queryKey: ["hallway-state"],
    queryFn: () => getMyHallwayState(),
    refetchInterval: 20_000,
  });
  const s = state.data;

  // Собрал ≥10 → при входе (маунт) показываем окно-напоминание один раз.
  const eligible = !!state.data?.release?.eligible;
  useEffect(() => {
    if (eligible && !releasePromptShown.current) {
      releasePromptShown.current = true;
      setReleasePrompt(true);
    }
  }, [eligible]);

  // Уже прошёл прихожу (released) → сразу в Фишки, экран «пройдена» пропускаем.
  const navigate = useNavigate();
  const released = !!state.data?.released;
  useEffect(() => {
    if (released) navigate({ to: "/chips" });
  }, [released, navigate]);

  // Живой тап-пул: клиентская интерполяция (плавный тик +1). Серверу НЕ звонит —
  // чистый JS поверх последнего серверного значения → нагрузка нулевая. Якорь
  // обновляется на каждое новое серверное tapPool (рефетч 20с или ответ тапа).
  const [poolAnchor, setPoolAnchor] = useState<{ pool: number; at: number }>({
    pool: 0,
    at: 0,
  });
  useEffect(() => {
    if (s) setPoolAnchor({ pool: s.tapPool, at: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.tapPool]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["hallway-state"] });

  // ТАП-БУФЕРИЗАЦИЯ. Раньше каждый клик = свой tapYupik → прямая запись в БД на
  // тап + ответ перезаписывал счётчик (отскоки при быстром тапе + нагрузка на
  // сервер). Теперь копим тапы локально (оптимистично, мгновенно) и шлём ПАЧКОЙ
  // раз в ~500мс или по 25 тапов. Один UPDATE на пачку.
  const pendingRef = useRef(0); // неотправленные тапы (источник истины для флаша)
  const [pendingTaps, setPendingTaps] = useState(0); // зеркало для оптимистичного UI
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);

  const flushTaps = useCallback(async () => {
    if (flushingRef.current) return; // уже летит пачка
    const n = pendingRef.current;
    if (n < 1) return;
    flushingRef.current = true;
    try {
      const r = await tapYupik({ data: { taps: n } });
      // УСПЕХ: снимаем ровно отправленные n (тапы, пришедшие за время полёта,
      // остаются в pendingRef и уйдут следующей пачкой). Сервер авторитетен:
      // садим осознанность/пул из ответа, оставшийся pending рисуется поверх.
      pendingRef.current = Math.max(0, pendingRef.current - n);
      qc.setQueryData(["hallway-state"], (old: typeof s) =>
        old
          ? {
              ...old,
              awareness: r.ok ? r.awareness : old.awareness,
              tapPool: r.tapPool,
            }
          : old
      );
      setPoolAnchor({ pool: r.tapPool, at: Date.now() });
      if (!r.ok) toast.message(t("hallway.toast_pool_empty"));
    } catch {
      // Ошибка (сеть/абуз-гард) — тапы НЕ теряем: pendingRef не трогаем, повторим
      // на следующем тике. Экономику это не ломает (сервер клампит по пулу).
    } finally {
      flushingRef.current = false;
      setPendingTaps(pendingRef.current);
      if (pendingRef.current > 0) {
        if (flushTimer.current) clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(() => void flushTaps(), 700);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  // Не терять неотправленные тапы: флашим при уходе со вкладки и размонтировании.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushTaps();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (flushTimer.current) clearTimeout(flushTimer.current);
      void flushTaps();
    };
  }, [flushTaps]);

  const open = useMutation({
    mutationFn: () => buyOpenChest(),
    onSuccess: (r) => {
      setReward(r.reward as Record<string, unknown>);
      invalidate();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Открыть неоткрытый сундук из инвентаря (марафонные)
  const openPending = useMutation({
    mutationFn: () => openHallwayChest(),
    onSuccess: (r) => {
      setReward(r.reward as Record<string, unknown>);
      invalidate();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const claimMarathon = useMutation({
    mutationFn: () => marathonClaim(),
    onSuccess: (r) => {
      toast.success(t("hallway.toast_marathon_day", { day: r.day }));
      invalidate();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const release = useMutation({
    mutationFn: () => releaseHallway(),
    onSuccess: (r) => {
      setConfirmRelease(false);
      toast.success(t("hallway.toast_release", { count: r.chips }));
      invalidate();
      qc.invalidateQueries({ queryKey: ["session"] });
      // После прихожи сразу в Фишки (там вся игра), а не на Главную/дропы.
      setTimeout(() => (window.location.href = "/chips"), 1500);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (state.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  // Ошибка/пусто НЕ маскируем пустым экраном (раньше `return null` скрывал
  // серверные сбои → загадочный чёрный экран у новых игроков). Показываем
  // причину и кнопку повторить.
  if (state.isError || !s) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-3 text-sm text-muted-foreground">
          {t("hallway.load_error")}
          {state.error instanceof Error ? `: ${state.error.message}` : ""}
        </p>
        <button
          type="button"
          onClick={() => state.refetch()}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950"
        >
          {t("hallway.retry")}
        </button>
      </div>
    );
  }
  // Прошёл прихожу → идёт редирект в Фишки (см. эффект выше), показываем лоадер.
  if (s.released) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const expPct = s.expToNext > 0 ? Math.min(100, (s.exp / s.expToNext) * 100) : 100;
  // Живой пул = серверное значение + целые тапы, накопившиеся с момента якоря
  // (та же формула, что на сервере в settleRegen — при тапе/рефетче совпадёт,
  // без «отскока»). Тикает по +1 каждые ~60/rpm сек.
  const livePool = Math.min(
    s.poolLimit,
    poolAnchor.pool +
      Math.floor(((nowMs - poolAnchor.at) / 1000) * (s.regenPerMin / 60))
  );
  // Оптимистичный оверлей неотправленных тапов: мгновенный отклик, без отскока
  // (та же математика, что на сервере — round(base*mult*taps, 2)).
  const displayPool = Math.max(0, livePool - pendingTaps);
  const pendingGain = Math.round((s.tapUnitGain ?? 0) * pendingTaps * 100) / 100;
  const displayAwareness = Math.round((s.awareness + pendingGain) * 100) / 100;
  const poolPct =
    s.poolLimit > 0 ? Math.min(100, (displayPool / s.poolLimit) * 100) : 0;
  const doTap = () => {
    if (s.released) return;
    // Пул считаем по pendingRef (актуальнее state) — не даём тапнуть в минус,
    // иначе сервер кламнит и оптимистичный счётчик отскочит.
    if (Math.max(0, livePool - pendingRef.current) < 1) return;
    pendingRef.current += 1;
    setPendingTaps((p) => p + 1);
    const gid = ++floaterId.current;
    const v = Math.round((s.tapUnitGain ?? 0) * 100) / 100;
    setFloaters((f) => [...f.slice(-6), { id: gid, v }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== gid)), 950);
    // Флаш реже (1.2с) и бóльшими пачками (40): при 1000 юзерах это в ~3× меньше
    // записей в БД, чем при 500мс. Отображение мгновенное (оптимистично), так что
    // задержка записи не видна. Пачкой уходит max(40 тапов, накопленное за 1.2с).
    if (pendingRef.current >= 40) void flushTaps();
    else {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => void flushTaps(), 1200);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pb-24 pt-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold leading-tight">{t("hallway.title")}</h1>
          <p className="text-xs text-muted-foreground">
            {t("hallway.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openTutorial}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-secondary/40"
            aria-label={t("hallway.help_aria")}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          {showAdminLink && (
            <Link
              to="/admin/hallway"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-secondary/40"
            >
              <Settings className="h-4 w-4" />
            </Link>
          )}
        </div>
      </header>

      {tab === "home" && (
        <>
      {/* Юпик + уровень + тап */}
      <div className="relative rounded-2xl border border-gold/25 bg-card/60 p-5 text-center">
        <div
          ref={levelRef}
          className="mb-1 flex items-center justify-center gap-2 text-xs text-muted-foreground"
        >
          <span className="rounded-md bg-gold/15 px-2 py-0.5 font-semibold text-gold">
            L{s.level}
          </span>
          <span>{t("hallway.window_hours", { h: s.windowHours })}</span>
          {s.strongestStar > 0 && (
            <span className="rounded-md bg-secondary/60 px-2 py-0.5">
              ×{s.strongestMult} ({STAR_LABEL(s.strongestStar)})
            </span>
          )}
        </div>
        {/* EXP bar */}
        <div className="mx-auto mb-3 h-1.5 w-40 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-neon" style={{ width: `${expPct}%` }} />
        </div>
        <button
          ref={tapRef}
          type="button"
          onClick={doTap}
          disabled={displayPool < 1}
          className={cn(
            "relative mx-auto flex h-40 w-40 select-none items-center justify-center rounded-full transition active:scale-95",
            displayPool < 1
              ? "bg-secondary/40 text-muted-foreground"
              : "gradient-gold text-gold-foreground shadow-gold"
          )}
        >
          <span className="h-36 w-36 overflow-hidden rounded-full border-2 border-gold-foreground/30 bg-black/20">
            <NftImage src={s.yupikImageUrl} className="h-full w-full object-cover" />
          </span>
          {floaters.map((f) => (
            <span
              key={f.id}
              onAnimationEnd={() =>
                setFloaters((cur) => cur.filter((x) => x.id !== f.id))
              }
              className="pointer-events-none absolute left-1/2 top-6 animate-float-tap text-lg font-bold text-neon"
            >
              +{f.v}
            </span>
          ))}
        </button>
        <div className="mt-3 text-2xl font-bold text-gold">
          {displayAwareness % 1 === 0 ? displayAwareness : displayAwareness.toFixed(2)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {t("hallway.awareness_label")}
          </span>
        </div>
        {/* Тап-пул */}
        <div className="mx-auto mt-2 max-w-[240px]">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" /> {t("hallway.taps_count", { cur: displayPool, max: s.poolLimit })}
            </span>
            <span>{t("hallway.regen_per_min", { n: s.regenPerMin })}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-gold" style={{ width: `${poolPct}%` }} />
          </div>
        </div>
      </div>

      {/* Сундук */}
      <HomeChestButton
        awareness={s.awareness}
        chestPrice={s.chestPrice}
        chipsUnlocked={s.chipsUnlocked}
        chipUnlockLevel={s.chipUnlockLevel}
        openPending={open.isPending}
        onOpen={() => open.mutate()}
        chestRef={chestRef}
      />

      {/* Инвентарь триал-фишек — свёрнут: основная инфа, разворот = карточки */}
      <div ref={chipsRef} className="rounded-2xl border border-border bg-card/60 p-4">
        <button
          type="button"
          onClick={() => setChipsOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-sm font-bold"
        >
          <span className="flex items-center gap-1.5">
            <Star className="h-4 w-4 text-gold" /> {t("hallway.chips")}
          </span>
          <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            {t("hallway.chips_summary", { count: s.chipCount, top: s.topChipCount })}
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", chipsOpen && "rotate-180")}
            />
          </span>
        </button>
        {chipsOpen &&
          (s.chipCount === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-border bg-secondary/20 p-4 text-center text-xs text-muted-foreground">
              {t("hallway.chips_empty_short", { lvl: s.chipUnlockLevel })}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[3, 2.5, 2, 1.5, 1].map((star) => {
                const n = s.chipsByStar[String(star)] ?? 0;
                if (n === 0) return null;
                return (
                  <div
                    key={star}
                    className={cn(
                      "overflow-hidden rounded-2xl p-2 backdrop-blur",
                      chipPanelClasses(star)
                    )}
                  >
                    <ChipImage
                      src={s.chipImages?.[String(star)] ?? ""}
                      level={star}
                      alt={STAR_LABEL(star)}
                      className="w-full"
                    />
                    <div className="mt-1.5 text-center text-xs font-semibold text-muted-foreground">
                      × {n}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
      </div>

      {/* Марафон */}
      <HallwayMarathon
        marathon={s.marathon}
        claimPending={claimMarathon.isPending}
        onClaim={() => claimMarathon.mutate()}
        marathonRef={marathonRef}
      />

      {/* Выпуск — обучение: собрал 10, можешь уйти ИЛИ фармить сильнее */}
      {s.release.eligible && (
        <div className="space-y-2 rounded-2xl border border-gold/40 bg-gold/5 p-3">
          <p className="text-xs leading-snug text-muted-foreground">
            {t("hallway.release_card_intro")}
            <b className="text-gold">{t("hallway.release_word")}</b>
            {t("hallway.release_card_rest")}
          </p>
          <button
            type="button"
            onClick={() => setConfirmRelease(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground shadow-gold"
          >
            <Trophy className="h-4 w-4" />
            {t("hallway.release_cta")}
          </button>
          <p className="text-[11px] leading-snug text-muted-foreground/70">
            {t("hallway.exchange_later")}
          </p>
        </div>
      )}
        </>
      )}

      {/* Вкладка «Инвентарь» — все тренировочные фишки */}
      {tab === "inventory" && (
        <InventoryTab
          chipCount={s.chipCount}
          chipUnlockLevel={s.chipUnlockLevel}
          topChipCount={s.topChipCount}
          pendingChests={s.pendingChests}
          chipsByStar={s.chipsByStar}
          chipImages={s.chipImages}
          openPendingPending={openPending.isPending}
          onOpenPending={() => openPending.mutate()}
        />
      )}

      {/* Вкладка «Магазин» — покупка фишек за Telegram Stars */}
      {tab === "shop" && (
        <div className="space-y-3">
          <h2 className="font-display text-lg font-bold">{t("hallway.shop")}</h2>
          <HallwayStarShop />
        </div>
      )}

      {/* Нижняя панель прихожи: Главная · Магазин · Инвентарь */}
      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md items-stretch border-t border-border/70 bg-card/95 px-4 pb-[calc(6px+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
        {(
          [
            { key: "home", label: t("hallway.nav_home"), icon: Home },
            { key: "shop", label: t("hallway.nav_shop"), icon: ShoppingBag },
            { key: "inventory", label: t("hallway.nav_inventory"), icon: Star },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition",
                on ? "text-gold" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", on && "fill-gold/20")} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Модалка награды сундука */}
      {reward && <RewardModal reward={reward} onClose={() => setReward(null)} />}

      {/* Модалка подтверждения выпуска */}
      {/* Напоминание при входе (собрал ≥10): можно выпуститься ИЛИ остаться */}
      {releasePrompt && eligible && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-gold/40 bg-card p-6 text-center">
            <div className="mb-1 text-3xl">🎉</div>
            <h2 className="text-lg font-bold">{t("hallway.collected_10")}</h2>

            {/* Вариант 1: выпуск — текст, затем кнопка */}
            <p className="mt-3 text-sm leading-snug text-muted-foreground">
              <b className="text-gold">{t("hallway.release_word")}</b>
              {t("hallway.release_prompt_rest1")}
              <b className="text-gold">{t("hallway.release_prompt_strongest")}</b>
              {t("hallway.release_prompt_rest2")}
            </p>
            <button
              type="button"
              onClick={() => {
                // Не выпускаем сразу — открываем окно ПОДТВЕРЖДЕНИЯ с превью
                // фишек, которые перейдут.
                setReleasePrompt(false);
                setConfirmRelease(true);
              }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl gradient-gold py-3 text-sm font-bold text-gold-foreground shadow-gold"
            >
              <Trophy className="h-4 w-4" /> {t("hallway.release_cta")}
            </button>

            {/* Вариант 2: остаться — текст, затем кнопка */}
            <p className="mt-4 text-sm leading-snug text-muted-foreground">
              <b>{t("hallway.release_prompt_or")}</b>
              {t("hallway.release_prompt_stay1")}
              <b className="text-gold">3★</b>
              {t("hallway.release_prompt_stay2")}
            </p>
            <button
              type="button"
              onClick={() => setReleasePrompt(false)}
              className="mt-2 w-full rounded-xl border border-border bg-secondary/40 py-2.5 text-sm font-medium text-muted-foreground"
            >
              {t("hallway.stay_and_farm")}
            </button>

            {/* Приписка мелким шрифтом */}
            <p className="mt-3 text-[11px] leading-snug text-muted-foreground/70">
              {t("hallway.exchange_later")}
            </p>
          </div>
        </div>
      )}

      {confirmRelease && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-gold/40 bg-card p-6 text-center">
            <Trophy className="mx-auto mb-2 h-9 w-9 text-gold" />
            <h2 className="text-lg font-bold">{t("hallway.confirm_release_title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("hallway.confirm_release_these")}
              <b className="text-gold">{t("hallway.confirm_release_count", { count: s.releaseCount })}</b>
              {t("hallway.confirm_release_rest")}
            </p>

            {/* Какие фишки перейдут — топ-N + все купленные (совпадает с сервером) */}
            <div className="mt-3 text-left text-[11px] font-semibold text-muted-foreground">
              {t("hallway.will_transfer")}
            </div>
            <div className="mt-1.5 grid grid-cols-5 gap-1.5">
              {[3, 2.5, 2, 1.5, 1].map((star) => {
                const cnt = s.releaseChips?.[String(star)] ?? 0;
                if (cnt === 0) return null;
                return (
                  <div
                    key={star}
                    className={cn(
                      "overflow-hidden rounded-xl p-1",
                      chipPanelClasses(star)
                    )}
                  >
                    <ChipImage
                      src={s.chipImages?.[String(star)] ?? ""}
                      level={star}
                      className="w-full"
                    />
                    <div className="mt-0.5 text-center text-[10px] font-bold text-muted-foreground">
                      ×{cnt}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground/70">
              {t("hallway.exchange_later")}
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmRelease(false)}
                className="flex-1 rounded-xl border border-border bg-secondary/40 py-2.5 text-sm font-medium"
              >
                {t("hallway.cancel")}
              </button>
              <button
                type="button"
                onClick={() => release.mutate()}
                disabled={release.isPending}
                className="flex-1 rounded-xl gradient-gold py-2.5 text-sm font-bold text-gold-foreground"
              >
                {release.isPending ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  t("hallway.enter_game")
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Обучалка — пошаговый тур с подсветкой области */}
      {tutorial && (
        <CoachTour
          onClose={closeTutorial}
          steps={[
            {
              ref: tapRef,
              icon: <Sparkles className="h-5 w-5 text-gold" />,
              title: t("hallway.tutorial_tap_title"),
              text: t("hallway.tutorial_tap_text"),
            },
            {
              ref: levelRef,
              icon: <Zap className="h-5 w-5 text-gold" />,
              title: t("hallway.tutorial_level_title"),
              text: t("hallway.tutorial_level_text"),
            },
            {
              ref: chestRef,
              icon: <Box className="h-5 w-5 text-gold" />,
              title: t("hallway.tutorial_chest_title"),
              text: t("hallway.tutorial_chest_text"),
            },
            {
              ref: marathonRef,
              icon: <CalendarCheck className="h-5 w-5 text-gold" />,
              title: t("hallway.tutorial_marathon_title"),
              text: t("hallway.tutorial_marathon_text"),
            },
            {
              ref: chipsRef,
              icon: <Trophy className="h-5 w-5 text-gold" />,
              title: t("hallway.tutorial_goal_title"),
              text: t("hallway.tutorial_goal_text"),
            },
          ]}
        />
      )}
    </div>
  );
}

// ──────── Пошаговый обучающий тур (спотлайт + инфо-карточка) ────────
type TourStep = {
  ref: RefObject<HTMLElement | null>;
  icon: ReactNode;
  title: string;
  text: string;
};

function CoachTour({
  steps,
  onClose,
}: {
  steps: TourStep[];
  onClose: () => void;
}) {
  const t = useT();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  // Пока тур открыт — блокируем РУЧНОЙ скролл (авто-скролл к цели через
  // scrollIntoView остаётся, он программный), иначе спотлайт рассинхронится.
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    window.addEventListener("wheel", prevent, { passive: false });
    window.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      window.removeEventListener("wheel", prevent);
      window.removeEventListener("touchmove", prevent);
    };
  }, []);

  useEffect(() => {
    const el = steps[i]?.ref.current;
    if (!el) {
      setRect(null);
      return;
    }
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    // Мгновенный центр-скролл к цели + повторы: бьём scroll-restoration после
    // перезагрузки/переоткрытия (иначе спотлайт остаётся на старой позиции).
    const align = () => {
      el.scrollIntoView({ block: "center", behavior: "auto" });
      measure();
    };
    align();
    const timers = [50, 150, 300, 500].map((ms) => setTimeout(align, ms));
    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  const next = () => (last ? onClose() : setI((n) => n + 1));
  const back = () => setI((n) => Math.max(0, n - 1));

  const PAD = 10;
  const box = rect
    ? {
        top: Math.max(6, rect.top - PAD),
        left: Math.max(6, rect.left - PAD),
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // Инфо-карточку ставим на СВОБОДНУЮ сторону, чтобы не перекрыть подсветку.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const targetMid = rect ? rect.top + rect.height / 2 : vh / 2;
  const cardAtBottom = targetMid < vh * 0.55;

  return (
    <div className="fixed inset-0 z-[95]">
      {/* Спотлайт: прозрачная зона + огромная тень затемняет всё вокруг */}
      {box ? (
        <div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-gold transition-all duration-300 ease-out"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.82)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/80" />
      )}
      {/* Тап по затемнённому фону — следующий шаг */}
      <button
        type="button"
        aria-label={t("hallway.tour_next_aria")}
        onClick={next}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      {/* Инфо-карточка */}
      <div
        className={cn(
          "absolute inset-x-0 mx-auto w-[min(92%,26rem)]",
          cardAtBottom ? "bottom-6" : "top-6"
        )}
      >
        <div className="rounded-2xl border border-gold/30 bg-card p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("hallway.tour_step_counter", { n: i + 1, total: steps.length })}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-secondary/40"
              aria-label={t("hallway.tour_skip_aria")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex gap-3">
            <div className="mt-0.5 shrink-0">{step.icon}</div>
            <div>
              <div className="text-base font-bold">{step.title}</div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {step.text}
              </p>
            </div>
          </div>
          {/* прогресс-точки */}
          <div className="mt-3 flex justify-center gap-1.5">
            {steps.map((_, k) => (
              <span
                key={k}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  k === i ? "w-5 bg-gold" : "w-1.5 bg-secondary"
                )}
              />
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            {i > 0 && (
              <button
                type="button"
                onClick={back}
                className="flex-1 rounded-xl border border-border bg-secondary/40 py-2.5 text-sm font-medium"
              >
                {t("hallway.back")}
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="flex-[2] rounded-xl gradient-gold py-2.5 text-sm font-bold text-gold-foreground"
            >
              {last ? t("hallway.tour_done") : t("hallway.tour_next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
