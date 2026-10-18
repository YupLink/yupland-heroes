// PvP-бои фишек (admin-only). UX по CapsGame: верхние табы «Все/Мои/История»,
// большая «+» как первая карточка, ниже карточки чужих/своих ставок
// с ником, временем и фишками.

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Plus,
  RefreshCw,
  Star,
  Swords,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { myChipInventory } from "@/server/api/chips-pack";
import { humanError } from "@/lib/humanError";
import {
  createPvpBattle,
  cancelPvpBattle,
  joinPvpBattle,
  listOpenPvpBattles,
  listMyPvpBattles,
  getChipPvpPowerTable,
} from "@/server/api/chipsPvp";

export const Route = createFileRoute("/chips/pvp")({
  head: () => ({
    meta: [{ title: "YupLink · PvP" }, { name: "robots", content: "noindex" }],
  }),
  component: PvpRedirector,
});

// Deep-link /chips/pvp → ставим вкладку 'pvp' и редиректим в /chips.
// Не своя страница (с back-кнопкой и без BottomNav), а вкладка
// внутри ChipsPage — чтобы нижняя панель оставалась видимой и работали
// родные tab-переходы.
function PvpRedirector() {
  useEffect(() => {
    try {
      window.localStorage.setItem("chips-active-tab", "pvp");
    } catch {
      /* ignore */
    }
  }, []);
  return <Navigate to="/chips" replace />;
}

type Tab = "all" | "mine" | "history";

/**
 * Содержимое PvP-вкладки. Рендерится из routes/chips.tsx когда активна
 * вкладка 'pvp'. onBack — возврат на главный таб (через ChipsPage.setTab).
 */
export function PvpScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [joining, setJoining] = useState<null | {
    battleId: string;
    levels: number[];
  }>(null);
  const [rulesAck, setRulesAck] = useState(false);

  return (
    <div className="space-y-4 pt-2">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          aria-label={t("common.back")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <Swords className="h-4 w-4 text-rose-400" />
        <div className="text-sm font-bold">{t("pvp.title")}</div>
      </header>

      <TabBar tab={tab} setTab={setTab} />

      {tab === "all" && (
        <AllTab
          onCreate={() => setCreateOpen(true)}
          onJoin={(b) => setJoining(b)}
        />
      )}
      {tab === "mine" && <MineTab />}
      {tab === "history" && <HistoryTab />}

      {createOpen && (
        <CreateModal onClose={() => setCreateOpen(false)} />
      )}
      {joining && (
        <JoinModal
          battleId={joining.battleId}
          requiredLevels={joining.levels}
          onClose={() => setJoining(null)}
        />
      )}
      {!rulesAck && (
        <RulesToast onAck={() => setRulesAck(true)} />
      )}
    </div>
  );
}

// ── TabBar ──
function TabBar({
  tab,
  setTab,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const items: Array<{ key: Tab; label: string }> = [
    { key: "all", label: t("pvp.tab_all") },
    { key: "mine", label: t("pvp.tab_mine") },
    { key: "history", label: t("pvp.tab_history") },
  ];
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 items-center gap-1.5">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => setTab(it.key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition",
              tab === it.key
                ? "bg-rose-500 text-white shadow-[0_0_18px_rgba(244,63,94,0.45)]"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            {it.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          qc.invalidateQueries({ queryKey: ["pvp"] });
        }}
        className="rounded-full bg-secondary p-2 text-muted-foreground transition hover:text-foreground"
        aria-label={t("pvp.refresh")}
      >
        <RefreshCw className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── All tab ──
function AllTab({
  onCreate,
  onJoin,
}: {
  onCreate: () => void;
  onJoin: (b: { battleId: string; levels: number[] }) => void;
}) {
  const t = useT();
  const open = useQuery({
    queryKey: ["pvp", "open"],
    queryFn: () => listOpenPvpBattles(),
    refetchInterval: 20_000,
  });
  return (
    <div className="space-y-3">
      <CreateBanner onClick={onCreate} />
      {open.isLoading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      ) : (open.data ?? []).length === 0 ? (
        <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center text-xs text-muted-foreground">
          {t("pvp.empty_open")}
        </div>
      ) : (
        (open.data ?? []).map((b) => (
          <BattleCard
            key={b.id}
            creator={
              (b.creatorUsername ?? b.creatorWallet) + (b.isMine ? t("pvp.you_suffix") : "")
            }
            createdAt={b.createdAt}
            chips={b.chips}
            status={b.isMine ? t("pvp.waiting_opponent") : t("pvp.accepting_bets")}
            // На свой бой кнопку «Принять» не показываем — обработай
            // его во вкладке «Мои» (отозвать).
            actionLabel={b.isMine ? undefined : t("pvp.accept")}
            onAction={
              b.isMine
                ? undefined
                : () =>
                    onJoin({
                      battleId: b.id,
                      levels: b.chips.map((c) => c.level),
                    })
            }
          />
        ))
      )}
    </div>
  );
}

function CreateBanner({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-2xl border border-border bg-card/60 p-4 text-left transition hover:border-rose-500/40"
    >
      <div className="text-sm font-bold">{t("pvp.create_banner")}</div>
      <div className="mt-3 flex items-center gap-4">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-rose-500 text-white shadow-[0_0_28px_rgba(244,63,94,0.55)] transition group-hover:scale-[1.04]">
          <Plus className="h-10 w-10" />
        </div>
        <div className="grid h-20 w-20 place-items-center rounded-full border-2 border-dashed border-muted-foreground/30 text-[10px] text-muted-foreground">
          {t("pvp.pick_chips")}
        </div>
      </div>
    </button>
  );
}

// ── Mine tab ──
function MineTab() {
  const t = useT();
  const qc = useQueryClient();
  const open = useQuery({
    queryKey: ["pvp", "open"],
    queryFn: () => listOpenPvpBattles(),
    refetchInterval: 20_000,
  });
  const cancel = useMutation({
    mutationFn: (battleId: string) => cancelPvpBattle({ data: { battleId } }),
    onSuccess: () => {
      toast.success(t("pvp.challenge_withdrawn"));
      qc.invalidateQueries({ queryKey: ["pvp"] });
      qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const mine = (open.data ?? []).filter((b) => b.isMine);
  if (open.isLoading)
    return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />;
  if (mine.length === 0)
    return (
      <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center text-xs text-muted-foreground">
        {t("pvp.empty_mine")}
      </div>
    );
  return (
    <div className="space-y-3">
      {mine.map((b) => (
        <BattleCard
          key={b.id}
          creator={(b.creatorUsername ?? b.creatorWallet) + t("pvp.you_suffix")}
          createdAt={b.createdAt}
          chips={b.chips}
          status={t("pvp.waiting_opponent")}
          actionLabel={t("pvp.withdraw")}
          actionVariant="danger"
          onAction={() => {
            if (confirm(t("pvp.withdraw_confirm"))) cancel.mutate(b.id);
          }}
        />
      ))}
    </div>
  );
}

// ── History tab ──
function HistoryTab() {
  const t = useT();
  const my = useQuery({
    queryKey: ["pvp", "my"],
    queryFn: () => listMyPvpBattles(),
    refetchInterval: 30_000,
  });
  if (my.isLoading)
    return <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />;
  const done = (my.data ?? []).filter((b) => b.status === "done");
  if (done.length === 0)
    return (
      <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center text-xs text-muted-foreground">
        {t("pvp.empty_history")}
      </div>
    );
  return (
    <div className="space-y-3">
      {done.map((b) => {
        const mySide = b.iAmCreator ? "creator" : "opponent";
        const wins = (b.pairs ?? []).filter(
          (p) => p.winnerSide === mySide
        ).length;
        const losses = (b.pairs ?? []).filter(
          (p) => p.winnerSide !== mySide && p.winnerSide !== "draw"
        ).length;
        const draws = (b.pairs ?? []).filter(
          (p) => p.winnerSide === "draw"
        ).length;
        const overall =
          wins > losses ? "win" : wins < losses ? "loss" : "draw";
        return (
          <div
            key={b.id}
            className="rounded-2xl border border-border bg-card/60 p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <Trophy
                className={cn(
                  "h-4 w-4",
                  overall === "win"
                    ? "text-success"
                    : overall === "draw"
                      ? "text-muted-foreground"
                      : "text-destructive"
                )}
              />
              <div className="text-sm font-semibold">
                {overall === "win"
                  ? t("pvp.outcome_win")
                  : overall === "draw"
                    ? t("pvp.outcome_draw")
                    : t("pvp.outcome_loss")}
              </div>
              <div className="ml-auto text-[10px] text-muted-foreground">
                {wins}–{losses}
                {draws ? ` ${t("pvp.draws_short", { n: draws })}` : ""}
              </div>
            </div>
            <div className="mb-2 flex items-center gap-2 text-[11px]">
              <div className="text-muted-foreground">
                {b.iAmCreator ? t("pvp.you") : "@" + (b.creatorUsername ?? b.creatorWallet)}
              </div>
              <Swords className="h-3 w-3 text-rose-400" />
              <div className="text-muted-foreground">
                {b.iAmCreator
                  ? "@" + (b.opponentUsername ?? b.opponentWallet ?? "—")
                  : t("pvp.you")}
              </div>
            </div>
            <ChipsStrip
              chips={b.iAmCreator ? b.creatorChips : b.opponentChips}
            />
            <div className="my-1 text-center text-[10px] text-muted-foreground">
              vs
            </div>
            <ChipsStrip
              chips={b.iAmCreator ? b.opponentChips : b.creatorChips}
            />
            <div className="mt-3 space-y-1">
              {(b.pairs ?? []).map((p, i) => {
                const won = p.winnerSide === mySide;
                const draw = p.winnerSide === "draw";
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center justify-between rounded-md px-2 py-1 text-[11px]",
                      draw
                        ? "bg-secondary/40"
                        : won
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive"
                    )}
                  >
                    <span>{t("pvp.power_label")}: {b.iAmCreator ? p.creatorStr : p.opponentStr}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span>{b.iAmCreator ? p.opponentStr : p.creatorStr}</span>
                    <span className="font-bold">
                      {draw ? t("pvp.draw") : won ? t("pvp.win") : t("pvp.loss")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Battle card (used in All/Mine) ──
type ChipDisplay = {
  id: string;
  level: number;
  imageUrl: string | null;
  templateNo: number | null;
  name: string;
};

function BattleCard({
  creator,
  createdAt,
  chips,
  status,
  actionLabel,
  actionVariant,
  onAction,
}: {
  creator: string;
  createdAt: string;
  chips: ChipDisplay[];
  status: string;
  actionLabel?: string;
  actionVariant?: "danger";
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="text-sm font-semibold">@{creator}</div>
        <div className="text-[10px] text-muted-foreground">
          {relTime(createdAt)}
        </div>
      </div>
      <ChipsStrip chips={chips} />
      <div className="mt-3 flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground">{status}</div>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-bold transition",
              actionVariant === "danger"
                ? "border border-destructive/40 bg-destructive/10 text-destructive"
                : "bg-rose-500 text-white shadow-[0_0_18px_rgba(244,63,94,0.45)] hover:bg-rose-400"
            )}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function ChipsStrip({ chips }: { chips: ChipDisplay[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {chips.map((c) => (
        <ChipAvatar key={c.id} chip={c} />
      ))}
    </div>
  );
}

function ChipAvatar({ chip }: { chip: ChipDisplay }) {
  const ringClass = levelRingClass(chip.level);
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          "relative h-16 w-16 overflow-hidden rounded-full border-2",
          ringClass
        )}
      >
        {chip.imageUrl ? (
          <img
            src={chip.imageUrl}
            alt={chip.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary text-xl">
            🎯
          </div>
        )}
      </div>
      <div className="absolute -left-1 -top-1 rounded-full bg-purple-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
        #{chip.templateNo ?? "?"}
      </div>
      <div className="mt-1 flex items-center justify-center gap-0.5">
        {Array.from({ length: Math.ceil(chip.level) }, (_, i) => (
          <Star
            key={i}
            className={cn(
              "h-2.5 w-2.5",
              i < Math.floor(chip.level)
                ? "fill-gold text-gold"
                : "fill-gold/40 text-gold/40"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function levelRingClass(level: number): string {
  // Цвет рамки по уровню — как у CapsGame (Common серый → Diamond белый/cyan).
  if (level >= 5) return "border-cyan-300";
  if (level >= 4.5) return "border-amber-300";
  if (level >= 4) return "border-amber-400";
  if (level >= 3.5) return "border-purple-300";
  if (level >= 3) return "border-purple-500";
  if (level >= 2.5) return "border-blue-400";
  if (level >= 2) return "border-blue-500";
  if (level >= 1.5) return "border-emerald-500";
  return "border-gray-500";
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "только что";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

// ── Create modal ──
function CreateModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const inv = useQuery({
    queryKey: ["my-chip-inventory"],
    queryFn: () => myChipInventory(),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const flat = useMemo(() => {
    const out: ChipDisplay[] = [];
    for (const g of inv.data ?? []) {
      for (const c of g.chips ?? []) {
        out.push({
          id: c.id,
          level: g.level,
          imageUrl: g.imageUrl ?? null,
          templateNo: g.templateNo,
          name: g.templateName,
        });
      }
    }
    out.sort((a, b) => b.level - a.level);
    return out;
  }, [inv.data]);
  const create = useMutation({
    mutationFn: (chipIds: string[]) =>
      createPvpBattle({ data: { chipIds } }),
    onSuccess: () => {
      toast.success(t("pvp.bet_created"));
      qc.invalidateQueries({ queryKey: ["pvp"] });
      qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
      onClose();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  return (
    <Modal title={t("pvp.make_bet")} onClose={onClose}>
      <div className="mb-2 text-[11px] text-muted-foreground">
        {t("pvp.bet_lock_hint")}
      </div>
      {inv.isLoading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      ) : flat.length === 0 ? (
        <div className="rounded-lg border border-border bg-secondary/40 p-4 text-center text-xs text-muted-foreground">
          {t("pvp.no_chips_for_bet")}
        </div>
      ) : (
        <ChipGrid
          chips={flat}
          selected={selected}
          onToggle={(id) =>
            setSelected((s) => {
              const next = new Set(s);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        />
      )}
      <PrimaryButton
        disabled={selected.size === 0 || create.isPending}
        onClick={() => create.mutate([...selected])}
      >
        {create.isPending ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        ) : (
          t("pvp.create_bet", { n: selected.size })
        )}
      </PrimaryButton>
    </Modal>
  );
}

// ── Join modal ──
type PairDetail = {
  creatorChipId: string;
  opponentChipId: string;
  creatorStr: number;
  opponentStr: number;
  winnerSide: "creator" | "opponent" | "draw";
  creatorChip: ChipDisplay | null;
  opponentChip: ChipDisplay | null;
};

function JoinModal({
  battleId,
  requiredLevels,
  onClose,
}: {
  battleId: string;
  requiredLevels: number[];
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const inv = useQuery({
    queryKey: ["my-chip-inventory"],
    queryFn: () => myChipInventory(),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<PairDetail[] | null>(null);

  const flat = useMemo(() => {
    const out: ChipDisplay[] = [];
    for (const g of inv.data ?? []) {
      for (const c of g.chips ?? []) {
        out.push({
          id: c.id,
          level: g.level,
          imageUrl: g.imageUrl ?? null,
          templateNo: g.templateNo,
          name: g.templateName,
        });
      }
    }
    out.sort((a, b) => b.level - a.level);
    return out;
  }, [inv.data]);

  const need = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of requiredLevels) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  }, [requiredLevels]);
  const have = useMemo(() => {
    const m = new Map<number, number>();
    for (const id of selected) {
      const f = flat.find((x) => x.id === id);
      if (!f) continue;
      m.set(f.level, (m.get(f.level) ?? 0) + 1);
    }
    return m;
  }, [selected, flat]);
  const matches = useMemo(() => {
    if (need.size !== have.size) return false;
    for (const [l, n] of need) if (have.get(l) !== n) return false;
    return true;
  }, [need, have]);

  const join = useMutation({
    mutationFn: (chipIds: string[]) =>
      joinPvpBattle({ data: { battleId, chipIds } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["pvp"] });
      qc.invalidateQueries({ queryKey: ["my-chip-inventory"] });
      setResult(r.pairs as PairDetail[]);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Фаза «результат» — показываем разбивку по парам.
  if (result) {
    return (
      <Modal title={t("pvp.battle_played")} onClose={onClose}>
        <BattleResult pairs={result} mySide="opponent" />
        <PrimaryButton onClick={onClose}>{t("pvp.done")}</PrimaryButton>
      </Modal>
    );
  }

  return (
    <Modal title={t("pvp.accept_challenge")} onClose={onClose}>
      <div className="mb-2 text-[11px] text-muted-foreground">
        {t("pvp.opponent_lineup")}:{" "}
        {[
          ...requiredLevels.reduce<Map<number, number>>(
            (m, l) => m.set(l, (m.get(l) ?? 0) + 1),
            new Map()
          ),
        ]
          .sort((a, b) => b[0] - a[0])
          .map(([l, n]) => `${l}★×${n}`)
          .join(" ") || "—"}
      </div>
      <div className="mb-2 text-[10px] text-muted-foreground">
        {t("pvp.pairing_hint")}
      </div>
      {inv.isLoading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      ) : flat.length === 0 ? (
        <div className="rounded-lg border border-border bg-secondary/40 p-4 text-center text-xs text-muted-foreground">
          {t("pvp.no_chips")}
        </div>
      ) : (
        <ChipGrid
          chips={flat}
          selected={selected}
          onToggle={(id) =>
            setSelected((s) => {
              const next = new Set(s);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        />
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">
        {t("pvp.your_lineup")}:{" "}
        {[...have]
          .sort((a, b) => b[0] - a[0])
          .map(([l, n]) => `${l}★×${n}`)
          .join(" ") || "—"}
      </div>
      <PrimaryButton
        disabled={!matches || join.isPending}
        onClick={() => join.mutate([...selected])}
      >
        {join.isPending ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        ) : matches ? (
          t("pvp.go_battle")
        ) : (
          t("pvp.lineup_mismatch")
        )}
      </PrimaryButton>
    </Modal>
  );
}

// Экран разбора боя по парам. mySide — какой стороне ты принадлежишь
// (creator или opponent), чтобы пометить «твой» / «соперник».
function BattleResult({
  pairs,
  mySide,
}: {
  pairs: PairDetail[];
  mySide: "creator" | "opponent";
}) {
  const t = useT();
  const wins = pairs.filter((p) => p.winnerSide === mySide).length;
  const losses = pairs.filter(
    (p) => p.winnerSide !== mySide && p.winnerSide !== "draw"
  ).length;
  const draws = pairs.filter((p) => p.winnerSide === "draw").length;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
        <div className="text-2xl font-bold">
          <span className="text-success">+{wins}</span>
          <span className="mx-2 text-muted-foreground">/</span>
          <span className="text-destructive">−{losses}</span>
          {draws > 0 && (
            <span className="ml-2 text-muted-foreground">·{draws} {t("pvp.draws_abbr")}</span>
          )}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {t("pvp.result_summary", { won: wins, lost: losses })}
        </div>
      </div>
      <div className="space-y-2">
        {pairs.map((p, i) => {
          const my = mySide === "creator" ? p.creatorChip : p.opponentChip;
          const opp = mySide === "creator" ? p.opponentChip : p.creatorChip;
          const myStr = mySide === "creator" ? p.creatorStr : p.opponentStr;
          const oppStr = mySide === "creator" ? p.opponentStr : p.creatorStr;
          const won = p.winnerSide === mySide;
          const draw = p.winnerSide === "draw";
          return (
            <div
              key={i}
              className={cn(
                "rounded-xl border p-3",
                draw
                  ? "border-border bg-secondary/30"
                  : won
                    ? "border-success/40 bg-success/10"
                    : "border-destructive/40 bg-destructive/10"
              )}
            >
              <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("pvp.pair_label", { n: i + 1 })} · {my?.level ?? "?"}★ vs {opp?.level ?? "?"}★
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                {/* Твоя фишка */}
                <div className="flex flex-col items-center gap-1">
                  {my && <ChipAvatar chip={my} />}
                  <div
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      won ? "text-success" : draw ? "" : "text-destructive"
                    )}
                  >
                    {myStr}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{t("pvp.yours")}</div>
                </div>

                {/* Разделитель */}
                <div className="flex flex-col items-center gap-1">
                  <Swords className="h-4 w-4 text-muted-foreground" />
                  <div className="text-[10px] font-bold uppercase">
                    {draw ? t("pvp.draw") : won ? t("pvp.win") : t("pvp.loss_abbr")}
                  </div>
                </div>

                {/* Фишка соперника */}
                <div className="flex flex-col items-center gap-1">
                  {opp && <ChipAvatar chip={opp} />}
                  <div
                    className={cn(
                      "text-lg font-bold tabular-nums",
                      !won && !draw
                        ? "text-success"
                        : draw
                          ? ""
                          : "text-destructive"
                    )}
                  >
                    {oppStr}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{t("pvp.opponent")}</div>
                </div>
              </div>
              {!draw && (
                <div className="mt-2 text-center text-[11px]">
                  {won ? (
                    <span className="text-success">
                      {t("pvp.chip_won")}
                    </span>
                  ) : (
                    <span className="text-destructive">
                      {t("pvp.chip_lost")}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Common modal ──
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative mb-[calc(72px+env(safe-area-inset-bottom))] max-h-[80vh] w-full max-w-md overflow-y-auto rounded-3xl border border-rose-500/30 bg-card/95 p-4 sm:mb-0 sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-sm font-bold">{title}</div>
        {children}
      </div>
    </div>
  );
}
function PrimaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "mt-3 w-full rounded-full py-2.5 text-sm font-bold transition",
        disabled
          ? "cursor-not-allowed bg-secondary text-muted-foreground"
          : "bg-rose-500 text-white shadow-[0_0_18px_rgba(244,63,94,0.45)] hover:bg-rose-400"
      )}
    >
      {children}
    </button>
  );
}

function ChipGrid({
  chips,
  selected,
  onToggle,
}: {
  chips: ChipDisplay[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
      {chips.map((c) => {
        const active = selected.has(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(c.id)}
            className={cn(
              "relative overflow-hidden rounded-xl border p-1 transition",
              active
                ? "border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/40"
                : "border-border bg-secondary/30 hover:border-rose-500/40"
            )}
          >
            <div
              className={cn(
                "aspect-square overflow-hidden rounded-full border-2",
                levelRingClass(c.level)
              )}
            >
              {c.imageUrl ? (
                <img
                  src={c.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xl">
                  🎯
                </div>
              )}
            </div>
            <div className="mt-1 flex items-center justify-center gap-0.5">
              {Array.from({ length: Math.ceil(c.level) }, (_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-2.5 w-2.5",
                    i < Math.floor(c.level)
                      ? "fill-gold text-gold"
                      : "fill-gold/40 text-gold/40"
                  )}
                />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Power table ──
function PowerTable() {
  const t = useT();
  const q = useQuery({
    queryKey: ["pvp", "power-table"],
    queryFn: () => getChipPvpPowerTable(),
    staleTime: 1000 * 60 * 30,
  });
  return (
    <section className="rounded-2xl border border-border bg-card/40 p-3">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        {t("pvp.power_by_level")}
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {(q.data ?? []).map((p) => (
          <div
            key={p.level}
            className="rounded-lg border border-border bg-secondary/40 p-2 text-center"
          >
            <div className="flex items-center justify-center gap-0.5">
              {Array.from({ length: Math.ceil(p.level) }, (_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-3 w-3",
                    i < Math.floor(p.level)
                      ? "fill-gold text-gold"
                      : "fill-gold/40 text-gold/40"
                  )}
                />
              ))}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {t("pvp.power_range", { min: p.min, max: p.max })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Rules toast (как «В PvP можно выиграть или проиграть фишки» в CapsGame) ──
function RulesToast({ onAck }: { onAck: () => void }) {
  const t = useT();
  return (
    <div className="fixed inset-x-0 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border border-border bg-card/95 p-3 shadow-card backdrop-blur">
      <div className="flex items-center gap-2">
        <div className="text-xs">
          {t("pvp.rules_warning")}
        </div>
        <button
          type="button"
          onClick={onAck}
          className="ml-auto rounded-full bg-rose-500 px-4 py-1 text-xs font-bold text-white shadow-[0_0_18px_rgba(244,63,94,0.45)]"
        >
          {t("pvp.ok")}
        </button>
      </div>
    </div>
  );
}
