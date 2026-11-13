// Окно кузницы — вкладками (владелец, 23.10.2026; ПРАВИЛА §8.72): «В кузнице
// кнопка для починки — отдельная вкладка, в дизайне приложения».
//
// Кузница-лавка (у клетки витрина маркета) — «Лавка | Ремонт», декоративная —
// одна вкладка «Ремонт». Переключатель — как у вкладок замка (CastleTabs):
// значок и подпись, активная — золотом. Видна, только если сервер отдал
// offer.repair (кузница и ремонт открыт: админ или флаг запуска), — иначе окно
// кузницы прежнее и вкладок нет вовсе (рисует BuildModal).
import { useContext, useState } from "react";
import { Store, Wrench } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { BuildingExtra } from "@/lib/buildingEffect";
import { BuildingExtraBlock } from "../BuildingExtraBlock";
import { ForgeRepairPanel } from "./ForgeRepairPanel";
import { MarketSecondaryAction } from "../market/MarketSecondaryAction";
import "./forge-shop.css";

type ForgeTab = "shop" | "repair";

const TABS: ReadonlyArray<{ id: ForgeTab; icon: typeof Store; key: string }> = [
  { id: "shop", icon: Store, key: "artfix.tab_shop" },
  { id: "repair", icon: Wrench, key: "artfix.tab_repair" },
];

export function ForgeTabs({
  q,
  r,
  extra,
  onDone,
}: {
  q: number;
  r: number;
  /** Что умеет клетка кроме ремонта: у кузницы-лавки — витрина маркета. */
  extra: BuildingExtra;
  onDone: () => void;
}) {
  const t = useT();
  const travelAction = useContext(MarketSecondaryAction);
  const shop = !!extra;
  const [tab, setTab] = useState<ForgeTab>(shop ? "shop" : "repair");
  const shown = TABS.filter((x) => shop || x.id === "repair");
  const active: ForgeTab = shop ? tab : "repair";
  return (
    <div data-forge-tabs className="space-y-3">
      <div
        role="tablist"
        className="flex gap-1 rounded-2xl border border-border bg-secondary/30 p-1"
      >
        {shown.map(({ id, icon: Icon, key }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            onClick={() => setTab(id)}
            className={cn(
              "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition",
              active === id ? "bg-gold/15 text-gold" : "text-muted-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t(key)}</span>
          </button>
        ))}
      </div>
      {active === "shop" ? (
        <BuildingExtraBlock q={q} r={r} extra={extra} onDone={onDone} />
      ) : (
        <><ForgeRepairPanel q={q} r={r} />{travelAction}</>
      )}
    </div>
  );
}

