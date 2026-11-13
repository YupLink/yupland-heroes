// Окно мешочков клетки (ПРАВИЛА §8.21): открывается вплотную — тапом рядом или
// по прибытии маршрута; сервер тоже отдаёт содержимое только вплотную. Мешочек
// — как склад: слева рюкзак, справа мешочек (LootBagGrid), «сколько» —
// QtyDialog склада. Несколько мешочков на клетке — вкладками, каждый своим
// окном (выбор держится за id). Сгорела ближайшая порция — окно перечитывается
// само. Всё забрали, всё сгорело или герой отошёл — окно закрывается.
//
// Тап по клетке с мешочком открывает окно, поэтому «Идти сюда» (встать на
// клетку — мешочек её не перекрывает) и постройка под мешочком — кнопками.
//
// «Забрать всё» — над плитками, а не под ними (владелец, 23.10): под длинным
// рюкзаком кнопку не было видно без прокрутки, и стопки носили по одной.
//
// Содержимое — только внутри оплаченного входа (§8.23): закрытый мешочек
// показывает «Открыть · 1⚡», каждое открытие платит; окно закрыли — открытые
// им входы мешочков закрыты (useOpenStorage), вход в сундук под ними — нет.
//
// Рыба от красного динамита (30.10.2026) — тот же мешочек, окно зовёт её «Рыба».
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Backpack, Building2, Footprints, Loader2, Package, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";
import { bagTimeLeft } from "@/lib/lootBag";
import { getLootBagsAt } from "@/server/api/beta-raid/loot-bag/bag-read";
import { getMyBackpack } from "@/server/api/beta-raid/market-backpack-read";
import { ChestSheet } from "@/components/beta-raid/chest/ChestSheet";
import { ChestSpinner } from "@/components/beta-raid/chest/ChestSpinner";
import { QtyDialog } from "@/components/beta-raid/QtyDialog";
import { useRewardClock } from "@/components/beta-raid/hud/useRewardClock";
import { LootBagGrid } from "@/components/beta-raid/loot-bag/LootBagGrid";
import { bagsAtKey } from "@/components/beta-raid/loot-bag/lootBagLive";
import { useLootBagActions } from "@/components/beta-raid/loot-bag/useLootBagActions";
import { OpenButton } from "@/components/beta-raid/open-pass/OpenButton";
import { ShovelButton } from "@/components/beta-raid/tool/ShovelButton";
import { useOpenStorage } from "@/components/beta-raid/open-pass/useOpenStorage";
import {
  movableOf,
  putPick,
  takePick,
  type BagPick,
} from "@/components/beta-raid/loot-bag/lootBagPick";

const BTN =
  "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold disabled:opacity-50";
const FOOT_BTN =
  "flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold";

export function LootBagWindow({
  at,
  onClose,
  onGoTo,
  onBuilding,
}: {
  at: { q: number; r: number };
  onClose: () => void;
  /** «Идти сюда» — встать на клетку мешочка (нет — герой уже на ней). */
  onGoTo?: () => void;
  /** На клетке постройка или сундук — открыть их окно. */
  onBuilding?: () => void;
}) {
  const t = useT();
  const q = useQuery({
    queryKey: bagsAtKey(at.q, at.r),
    queryFn: () => getLootBagsAt({ data: { q: at.q, r: at.r } }),
    // «Подойди» сразу после шага — сервер мог ещё не записать клетку: один повтор.
    retry: (n, e) => n < 1 && /bag\.approach/.test(e instanceof Error ? e.message : ""),
    retryDelay: 600,
    staleTime: 0,
  });
  const bp = useQuery({ queryKey: ["my-hero-backpack"], queryFn: () => getMyBackpack() });
  const [pick, setPick] = useState<(BagPick & { bagId: string }) | null>(null);
  const act = useLootBagActions(() => setPick(null));
  const pass = useOpenStorage(at, "bags");
  const qc = useQueryClient();
  /** Находка лопатой (§8.24 п. 6б): открыли — «Выкопано: …» по свежему окну. */
  const dugToast = (bagId: string) => {
    const fresh = qc.getQueryData<typeof q.data>(bagsAtKey(at.q, at.r))?.bags;
    const b = (Array.isArray(fresh) ? fresh : []).find((x) => x.id === bagId);
    const names = (b?.items ?? []).map((i) => i.name).filter(Boolean);
    if (names.length > 0) toast.success(t("dig.found", { name: names.join(", ") }));
  };
  const now = useRewardClock();
  const [selId, setSelId] = useState<string | null>(null);
  const gotAt = q.dataUpdatedAt;
  // Ответ читаем защищённо (§11.13в): форма могла приехать из другой версии.
  const list = q.data?.bags;
  const bags = (Array.isArray(list) ? list : []).filter(
    (b) => bagTimeLeft(b.leftMs, gotAt, now) !== null,
  );
  const bag = bags.find((b) => b.id === selId) ?? bags[0];
  const gone = q.isSuccess && bags.length === 0;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);
  // Закрываем только на первой загрузке: фоновая перечитка с ошибкой окно не рвёт.
  const failed = !!q.error && !q.data;
  useEffect(() => {
    if (!failed) return;
    toast.error(humanError(q.error));
    onClose();
  }, [failed, q.error, onClose]);
  // Сгорит ближайшая порция — перечитать: число позиции должно уменьшиться.
  const { refetch } = q;
  useEffect(() => {
    const ends = (Array.isArray(list) ? list : []).flatMap((b) => [
      b.leftMs,
      ...(Array.isArray(b.items) ? b.items.map((i) => i.leftMs) : []),
    ]);
    const next = Math.min(...ends.map((ms) => gotAt + ms).filter((t) => t > Date.now()));
    if (!Number.isFinite(next)) return;
    const id = setTimeout(() => void refetch(), Math.min(next - Date.now() + 200, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [list, gotAt, refetch]);

  /** Имя мешочка: бугорок, рыба (красный динамит) или мешочек. */
  const nameOf = (b: { buried: boolean; fish?: boolean } | undefined) =>
    t(b?.buried ? "bag.mound" : b?.fish ? "bag.fish" : "bag.title");
  const title = bags.length > 1 ? t("bag.title_many", { n: bags.length }) : nameOf(bag);
  const submit = (qty: number) => {
    if (!pick) return;
    const v = { bagId: pick.bagId, stackKey: pick.stackKey, qty };
    if (pick.mode === "put") act.put.mutate(v);
    else act.take.mutate(v);
  };

  return (
    <>
      <ChestSheet title={title} subtitle={t("bag.kicker")} tone="loot" onClose={onClose}>
        {q.isLoading || !bag ? (
          <ChestSpinner />
        ) : (
          <div className="space-y-2.5">
            {bags.length > 1 && (
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                {bags.map((b, i) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelId(b.id)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold",
                      b.id === bag.id ? "border-gold/70 text-gold" : "border-border",
                    )}
                  >
                    {nameOf(b)} {i + 1}
                  </button>
                ))}
              </div>
            )}
            {/* Окно прошлой версии сервера поля open не знает — считаем открытым. */}
            {!bag.buried && bag.open === false ? (
              <OpenButton
                price={bag.price ?? 1}
                busy={pass.isPending}
                onOpen={(price) =>
                  pass.mutate(
                    { bagId: bag.id, price },
                    { onSuccess: () => (bag.dig ? dugToast(bag.id) : undefined) },
                  )
                }
              />
            ) : (
              <>
                {!bag.buried && (
                  <button
                    type="button"
                    disabled={act.busy || bag.items.length === 0}
                    onClick={() => act.take.mutate({ bagId: bag.id })}
                    className={`${BTN} w-full gradient-gold text-gold-foreground`}
                  >
                    {act.take.isPending && !pick ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PackageOpen className="h-4 w-4" />
                    )}
                    {t("bag.take_all")}
                  </button>
                )}
                <LootBagGrid
                  bag={bag}
                  backpack={bp.data}
                  gotAt={gotAt}
                  now={now}
                  busyKey={act.busy ? (pick?.busyKey ?? null) : null}
                  onPut={(c) => {
                    const s = bp.data?.stacks.find((x) => x.stackKey === c.stack.stackKey);
                    const movable = s ? movableOf(s) : 0;
                    if (movable > 0) setPick({ ...putPick(c, movable), bagId: bag.id });
                    else toast.error(t("braid.tool_worn_stays"));
                  }}
                  onTake={(c) => setPick({ ...takePick(c), bagId: bag.id })}
                />
              </>
            )}
            <div className="flex gap-2">
              {/* Лопатой в руках (§8.24): нет в руках — «Взять», нет вовсе — «Нужна». */}
              <ShovelButton
                label={bag.buried ? "bag.dig" : "bag.bury"}
                busy={act.dig.isPending}
                disabled={act.busy}
                onDig={() => act.dig.mutate({ bagId: bag.id, bury: !bag.buried, at })}
                className={`${BTN} border border-border text-foreground`}
              />
            </div>
            {onGoTo && (
              <button type="button" onClick={onGoTo} className={FOOT_BTN}>
                <Footprints className="h-4 w-4" />
                {t("braid.go_here")}
              </button>
            )}
            {onBuilding && (
              <button type="button" onClick={onBuilding} className={FOOT_BTN}>
                <Building2 className="h-4 w-4" />
                {t("bag.open_building")}
              </button>
            )}
          </div>
        )}
      </ChestSheet>
      {pick && (
        <QtyDialog
          key={pick.busyKey}
          name={pick.name}
          image={pick.image}
          haveKey={pick.mode === "put" ? "braid.backpack_have" : "bag.have"}
          total={pick.total}
          cell={pick.cell}
          icon={pick.mode === "put" ? Package : Backpack}
          label={t(pick.mode === "put" ? "bag.put" : "bag.take")}
          tone="gold"
          busy={act.put.isPending || act.take.isPending}
          onSubmit={submit}
          onClose={() => setPick(null)}
        />
      )}
    </>
  );
}
