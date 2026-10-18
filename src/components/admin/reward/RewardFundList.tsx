// Фонд наград: строки «что кладём и сколько».
//
// Виды: лайки, энергия, токен, билеты — и два новых, РЕСУРС (золото/камень/
// дерево/алмазы, идут на счёт аккаунта) и СВОЙ ТОВАР маркета (уедет в рюкзак
// героя). Токен ресурсом не подменяется: у него залог пула карты, у ресурса —
// счёт, и «Darai ресурсом» обошёл бы пул.
import { Boxes, Coins, Heart, Pickaxe, Plus, Ticket, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { type RewardResource } from "@/lib/rewardKinds";
import { clampNum, type DraftConfig, type DraftFiller, type FillerKind } from "./rewardDraft";
import { CustomItemGrid, RewardResourceSelect } from "./RewardKindPickers";

// Иконка/подпись вида — админские, русские (переводы админке не нужны).
const KIND_META: Record<FillerKind, { label: string; Icon: typeof Heart; tint: string }> = {
  likes: { label: "Лайки", Icon: Heart, tint: "text-rose-400" },
  energy: { label: "Энергия", Icon: Zap, tint: "text-gold" },
  tickets: { label: "Билеты", Icon: Ticket, tint: "text-gold" },
  token: { label: "Токен", Icon: Coins, tint: "text-neon" },
  resource: { label: "Ресурс", Icon: Pickaxe, tint: "text-amber-300" },
  custom: { label: "Свой товар", Icon: Boxes, tint: "text-fuchsia-300" },
};

export function RewardFundList({
  cfg,
  setCfg,
  tokens,
  allowTickets,
  allowExtras,
}: {
  cfg: DraftConfig;
  setCfg: (patch: Partial<DraftConfig>) => void;
  tokens: string[];
  allowTickets: boolean;
  /** Ресурс и свой товар — только там, где их умеют выдавать (карта бета-рейда). */
  allowExtras: boolean;
}) {
  const setFiller = (i: number, patch: Partial<DraftFiller>) =>
    setCfg({ fillers: cfg.fillers.map((fl, j) => (j === i ? { ...fl, ...patch } : fl)) });

  const KIND_OPTIONS: FillerKind[] = [
    "likes",
    "energy",
    "token",
    ...(allowTickets ? (["tickets"] as const) : []),
    ...(allowExtras ? (["resource", "custom"] as const) : []),
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Фонд наград</span>
        <button
          type="button"
          onClick={() =>
            setCfg({ fillers: [...cfg.fillers, { kind: "likes", amount: "0", token: null }] })
          }
          className="inline-flex items-center gap-1 rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-medium text-gold"
        >
          <Plus className="h-3.5 w-3.5" /> Добавить
        </button>
      </div>
      {cfg.fillers.length === 0 && (
        <p className="rounded-lg border border-dashed border-border/60 p-2.5 text-center text-[11px] text-muted-foreground">
          Пусто. Добавь лайки, энергию или токены в фонд.
        </p>
      )}
      {cfg.fillers.map((fl, i) => {
        // текущий kind всегда в списке опций — иначе (напр.) tickets в рейде
        // выпал бы из выбора.
        const kindOpts = KIND_OPTIONS.includes(fl.kind) ? KIND_OPTIONS : [...KIND_OPTIONS, fl.kind];
        return (
          // Сетка товаров живёт ОТДЕЛЬНОЙ строкой под контролами: на 360 px
          // она занимает всю ширину и в общий ряд не влезает.
          <div key={i} className="space-y-1.5">
            {/* flex-wrap: на телефоне контролы переносятся на строку ниже, а
                не сжимаются в неюзабельное поле. */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Тип наполнителя — КНОПКИ (не нативный <select>): в Telegram-вебвью
                  Xiaomi нативный дропдаун не коммитил выбор («не работает выбор
                  вариантов»). Сегменты работают на любом webview. */}
              <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-background p-0.5">
                {kindOpts.map((k) => {
                  const M = KIND_META[k];
                  const KIcon = M.Icon;
                  const active = k === fl.kind;
                  return (
                    <button
                      key={k}
                      type="button"
                      // Ресурс без кода фонд выбрасывает при сохранении,
                      // поэтому переключение сразу кладёт золото: админ
                      // вписывал сумму и уходил, не заметив пустого селекта.
                      onClick={() =>
                        setFiller(
                          i,
                          k === "resource" && !fl.resource
                            ? { kind: k, resource: "gold" }
                            : { kind: k },
                        )
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium transition",
                        active
                          ? "gradient-gold text-gold-foreground shadow-gold"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <KIcon className={cn("h-3.5 w-3.5", !active && M.tint)} />
                      {M.label}
                    </button>
                  );
                })}
              </div>
              {fl.kind === "token" && (
                <div className="inline-flex flex-wrap items-center gap-1">
                  {tokens.length === 0 && (
                    <span className="text-xs text-muted-foreground">нет токенов</span>
                  )}
                  {tokens.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFiller(i, { token: s })}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-sm font-medium transition",
                        fl.token === s
                          ? "border-gold/50 bg-gold/15 text-gold"
                          : "border-border bg-background text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {fl.kind === "resource" && (
                <RewardResourceSelect
                  value={fl.resource}
                  onChange={(res: RewardResource) => setFiller(i, { resource: res })}
                />
              )}
              {/* Товар штучный, как пак: не делится долями, а достаётся первым
                  N местам целиком. Пусто — только победителю. */}
              {fl.kind === "custom" && (
                <span className="inline-flex shrink-0 items-center gap-1">
                  <span className="text-xs text-muted-foreground">топ</span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={fl.toPlace ?? "1"}
                    onChange={(e) => setFiller(i, { toPlace: e.target.value })}
                    onBlur={() =>
                      setFiller(i, {
                        toPlace: String(
                          clampNum(fl.toPlace ?? "1", 1, Number.MAX_SAFE_INTEGER, true),
                        ),
                      })
                    }
                    className="w-14 rounded-lg border border-border bg-background px-2 py-2 text-base"
                  />
                </span>
              )}
              {/* У товара сумма — ШТУКИ на каждое место, поэтому шаг целый и
                  подпись другая: пол-слитка железа не выдают. */}
              <input
                type="number"
                step={fl.kind === "custom" ? "1" : "0.1"}
                min={0}
                inputMode={fl.kind === "custom" ? "numeric" : "decimal"}
                value={fl.amount}
                onChange={(e) => setFiller(i, { amount: e.target.value })}
                onBlur={() =>
                  setFiller(i, {
                    amount: String(
                      clampNum(fl.amount, 0, Number.MAX_SAFE_INTEGER, fl.kind === "custom"),
                    ),
                  })
                }
                placeholder={fl.kind === "custom" ? "штук" : "всего"}
                className="min-w-[110px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-base"
              />
              <button
                type="button"
                onClick={() => setCfg({ fillers: cfg.fillers.filter((_, j) => j !== i) })}
                className="ml-auto shrink-0 rounded-lg p-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {fl.kind === "custom" && (
              <CustomItemGrid itemId={fl.itemId} onPick={(id) => setFiller(i, { itemId: id })} />
            )}
          </div>
        );
      })}
    </div>
  );
}
