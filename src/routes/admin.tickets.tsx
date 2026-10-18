import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTicketEvent,
  deleteTicketEvent,
  listTicketEvents,
} from "@/server/api/admin-tickets";
import { getTicketEventClaimers } from "@/server/api/admin-stats";
import {
  TitleMultiSelect,
  type MultiTitle,
} from "@/components/TitleMultiSelect";
import { toast } from "sonner";
import {
  Plus,
  Power,
  Loader2,
  Ticket,
  X,
  ChevronDown,
  Users,
  Layers,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";

export const Route = createFileRoute("/admin/tickets")({
  component: AdminTickets,
});

// Требование = title + count. Title выбирается мульти-селектом сверху,
// count редактируется отдельно в строке.
type Requirement = {
  title: string;
  image: string | null;
  totalNfts: number;
  count: string; // строкой — пользователь может стереть полностью
};

const COOLDOWN_HOURS = 24; // фиксированный cooldown между клеймами

function AdminTickets() {
  const qc = useQueryClient();
  const formRef = useRef<HTMLDivElement>(null);

  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [reward, setReward] = useState("1");
  // Аккордеон «Новое правило». По умолчанию свёрнут — при входе на
  // первом плане список существующих правил, а не большая форма.
  const [createOpen, setCreateOpen] = useState(false);

  // Sync: TitleMultiSelect value ↔ reqs.
  const multiValue: MultiTitle[] = reqs.map((r) => ({
    title: r.title,
    image: r.image,
    count: r.totalNfts,
  }));
  const onMultiChange = (next: MultiTitle[]) => {
    setReqs((prev) => {
      const prevByTitle = new Map(prev.map((p) => [p.title, p]));
      return next.map((n) => {
        const existing = prevByTitle.get(n.title);
        return (
          existing ?? {
            title: n.title,
            image: n.image,
            totalNfts: n.count,
            count: "1",
          }
        );
      });
    });
  };

  const list = useQuery({
    queryKey: ["admin", "ticket-events"],
    queryFn: () => listTicketEvents(),
  });

  const create = useMutation({
    mutationFn: createTicketEvent,
    onSuccess: () => {
      toast.success("Правило создано");
      setReqs([]);
      setReward("1");
      setCreateOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "ticket-events"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteTicketEvent({ data: { id } }),
    onSuccess: () => {
      toast.success("Правило отключено");
      qc.invalidateQueries({ queryKey: ["admin", "ticket-events"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const rewardNum = Number(reward.replace(",", "."));
  const validReqs = reqs.filter((r) => Number(r.count) > 0);
  const canSubmit =
    validReqs.length > 0 &&
    Number.isFinite(rewardNum) &&
    rewardNum > 0 &&
    !create.isPending;

  const onSubmit = () => {
    if (validReqs.length === 0) {
      toast.error("Добавь хотя бы одно требование с NFT");
      return;
    }
    if (!Number.isFinite(rewardNum) || rewardNum <= 0) {
      toast.error("Награда должна быть положительным числом");
      return;
    }
    create.mutate({
      data: {
        requirements: validReqs.map((r) => ({
          title: r.title,
          count: Math.max(1, Math.floor(Number(r.count))),
        })),
        rewardTickets: rewardNum,
        holdDurationSec: COOLDOWN_HOURS * 3600,
      },
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold/10 text-gold ring-1 ring-gold/20">
            <Ticket className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-3xl font-bold leading-tight">
              Билеты за NFT
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Держишь набор — забираешь билеты
            </p>
          </div>
        </div>
        {/* Главный акцент экрана — открыть форму создания (по умолчанию свёрнута). */}
        <button
          onClick={() => {
            setCreateOpen((v) => {
              const next = !v;
              if (next) {
                setTimeout(() => {
                  formRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }, 50);
              }
              return next;
            });
          }}
          className="inline-flex items-center gap-2 rounded-full gradient-gold px-4 py-2 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" />
          Новое правило
        </button>
      </header>

      {/* Create form — аккордеон. По умолчанию свёрнут, на первом плане
          список правил. Раскрывается кнопкой «Новое правило». */}
      {createOpen && (
        <div
          ref={formRef}
          className="rounded-2xl border border-border/50 bg-card p-5"
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plus className="h-4 w-4 text-gold" />
              Новое правило
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary/30 px-2 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Свернуть
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                Какие NFT держать
              </label>
              <TitleMultiSelect value={multiValue} onChange={onMultiChange} />
              {reqs.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Сколько каждого
                  </div>
                  {reqs.map((r) => (
                    <div
                      key={r.title}
                      className="flex items-center gap-3 rounded-xl border border-border/50 bg-secondary/20 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {r.title}
                      </span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={r.count}
                        onChange={(e) =>
                          setReqs((cur) =>
                            cur.map((x) =>
                              x.title === r.title
                                ? { ...x, count: e.target.value }
                                : x
                            )
                          )
                        }
                        className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm outline-none focus:border-gold/50"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setReqs((cur) =>
                            cur.filter((x) => x.title !== r.title)
                          )
                        }
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400"
                        title="Убрать требование"
                        aria-label="Убрать требование"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Ticket className="h-3.5 w-3.5" />
                Сколько билетов
              </label>
              <input
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                placeholder="1"
                inputMode="decimal"
                className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
              />
              <div
                className="mt-1 text-[11px] text-muted-foreground"
                title={`Можно дробное, например 0.01. Повтор через ${COOLDOWN_HOURS}ч.`}
              >
                Можно дробное · cooldown {COOLDOWN_HOURS}ч
              </div>
            </div>

            <button
              onClick={onSubmit}
              disabled={!canSubmit}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-gold px-5 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
            >
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Создать правило
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Layers className="h-4 w-4 text-gold" />
          Активные правила
        </div>
        {list.isLoading ? (
          <div className="rounded-2xl border border-border/50 bg-card p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Загрузка…
          </div>
        ) : (list.data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Пока пусто. Жми «Новое правило».
          </div>
        ) : (
          <div className="space-y-2">
            {(list.data ?? []).map((e) => (
              <TicketEventCard
                key={e.id}
                e={e}
                onDelete={() => {
                  if (confirm(`Отключить это правило?`)) del.mutate(e.id);
                }}
                deleting={del.isPending}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type TicketEventRow = Awaited<ReturnType<typeof listTicketEvents>>[number];

function TicketEventCard({
  e,
  onDelete,
  deleting,
}: {
  e: TicketEventRow;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const claimers = useQuery({
    queryKey: ["admin", "ticket-event-claimers", e.id],
    queryFn: () => getTicketEventClaimers({ data: { eventId: e.id } }),
    enabled: expanded,
  });

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 transition hover:border-border/80">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Бейджи: награда · получений · cooldown */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 font-medium text-gold">
              <Ticket className="h-3 w-3" />+{e.rewardTickets} билетов
            </span>
            <span
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-muted-foreground"
              title={`Получений · выдано ${e.ticketsTotalAwarded.toFixed(4)} билетов`}
            >
              <Users className="h-3 w-3" />
              {e.claimsCount}
            </span>
            {e.tokensInCooldown > 0 && (
              <span
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-400"
                title="Уникальные NFT, у которых ещё не истёк перерыв перед повтором. Считается per-TG: после перепродажи новый владелец может забрать сразу."
              >
                <Clock className="h-3 w-3" />
                {e.tokensInCooldown}
              </span>
            )}
          </div>
          {/* Требуемые NFT — чипы */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {e.requirements.map((r, i) => (
              <span
                key={`${r.title}-${i}`}
                className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-secondary/30 px-2 py-0.5 text-[11px]"
              >
                <span className="text-foreground">{r.title}</span>
                <span className="text-muted-foreground">×{r.count}</span>
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-50"
          title="Отключить правило"
          aria-label="Отключить правило"
        >
          <Power className="h-4 w-4" />
        </button>
      </div>

      {e.claimsCount > 0 && (
        <div className="mt-3 border-t border-border/50 pt-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-[11px] text-muted-foreground transition hover:bg-secondary/30 hover:text-foreground"
          >
            <Users className="h-3.5 w-3.5" />
            <span>Кто получал</span>
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 transition",
                expanded && "rotate-180 text-gold"
              )}
            />
          </button>
          {expanded && (
            <div className="mt-2">
              {claimers.isLoading ? (
                <div className="flex items-center gap-2 px-2 py-2 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Загружаю…
                </div>
              ) : (claimers.data ?? []).length === 0 ? (
                <div className="px-2 py-2 text-[11px] text-muted-foreground">
                  Пока никто не забирал.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border/40 text-left">
                        <th className="py-1.5 pr-2 font-normal">Кошелёк</th>
                        <th className="py-1.5 px-2 text-right font-normal">
                          Получений
                        </th>
                        <th className="py-1.5 pl-2 text-right font-normal">
                          Выдано
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(claimers.data ?? []).map((c) => (
                        <tr
                          key={c.wallet}
                          className="border-b border-border/30 last:border-b-0"
                        >
                          <td className="py-1.5 pr-2 font-mono text-foreground">
                            {c.wallet}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono">
                            ×{c.claimsCount}
                          </td>
                          <td className="py-1.5 pl-2 text-right font-mono text-gold">
                            {c.ticketsTotal.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
