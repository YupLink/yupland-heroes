// Что умеет достроенная постройка: верфь спускает корабль, вышка открывает округу.
//
// Блок живёт отдельно от окна постройки: у окна одна забота — тиры и цена
// перехода, а особые действия у каждой постройки свои.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { revealFromTower } from "@/server/api/beta-raid/tower-reveal";
import { revealFogCells } from "./fogReveal";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { TreeLevelAction } from "./TreeLevelAction";
import { SignModal } from "./SignModal";
import { UniversityAction } from "./university/UniversityAction";
import { MuseumAction } from "./museum/MuseumAction";
import { TavernAction } from "./TavernAction";
import { ShipyardAction } from "./ShipyardAction";
import { TournamentAction } from "./tournament/TournamentAction";
import { CasinoAction } from "./CasinoAction";
import { FieldAction } from "./FieldAction";
import { WarehouseAction } from "./WarehouseAction";
import { MineAction } from "./MineAction";
import { MarketAction } from "./MarketAction";
import { PortalAction } from "./PortalAction";
import { BoostAction } from "./BoostAction";
import { ChambersAction } from "./ChambersAction";
import { OblivionAction } from "./OblivionAction";
import { SpellPillarAction } from "./spell-pillar/SpellPillarAction";
import type { BuildingExtra } from "@/lib/buildingEffect";

export function BuildingExtraActions({
  q,
  r,
  extra,
  onDone,
}: {
  q: number;
  r: number;
  extra: BuildingExtra;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const t = useT();

  const reveal = useMutation({
    mutationFn: () => revealFromTower({ data: { q, r } }),
    onSuccess: (res) => {
      // Клетки уходят в туман сразу — карта светлеет, не дожидаясь запроса.
      revealFogCells(res.cells);
      toast.success(t("braid.scouted_toast", { n: res.cells.length }));
      qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
      // Вышка отработала — с этого мига по её клетке просто ходят.
      qc.invalidateQueries({ queryKey: ["beta-raid-tower-used"] });
      qc.invalidateQueries({ queryKey: ENERGY_KEY });
      onDone();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Ратушу и постройки голодающего города рисует BuildModal (town/TownExtra).
  if (!extra || extra.kind === "town_hall") return null;

  // Табличка: ничего не стоит и ничего не требует — открыл и прочитал.
  if (extra.kind === "sign") return <SignAction text={extra.text} />;

  // Алтарь-буст: постоянная прибавка к характеристике героя за плату.
  if (extra.kind === "boost") {
    return <BoostAction q={q} r={r} extra={extra} onDone={onDone} />;
  }

  if (extra.kind === "leveltree") {
    return <TreeLevelAction q={q} r={r} extra={extra} onDone={onDone} />;
  }

  // Покои: снять с игрока дебаффы за плату.
  if (extra.kind === "chambers") {
    return <ChambersAction q={q} r={r} extra={extra} onDone={onDone} />;
  }

  // Таверна: смена основного героя за лайки. Список героев большой, поэтому
  // он живёт своим окном, а здесь — только цена и вход.
  if (extra.kind === "tavern") {
    return (
      <TavernAction
        q={q}
        r={r}
        priceLikes={extra.priceLikes}
        swaps={extra.swaps}
        can={extra.can}
        reasonKey={extra.reasonKey}
        onDone={onDone}
      />
    );
  }

  // Грядка: поставить героя и забрать урожай. Своё окно — у поля свой учёт.
  if (extra.kind === "field") {
    return <FieldAction q={q} r={r} myHero={extra.myHero ?? null} onDone={onDone} />;
  }

  // Склад: две личные ячейки, восемь общих и рюкзак рядом.
  if (extra.kind === "warehouse") {
    return <WarehouseAction q={q} r={r} />;
  }

  // Маркет: витрина товаров, покупка за любой ресурс.
  if (extra.kind === "market") {
    return (
      <MarketAction
        q={q}
        r={r}
        items={extra.items}
        shopRaces={extra.shopRaces}
        shopSpecs={extra.shopSpecs}
        heroFits={extra.heroFits}
        townStarving={extra.townStarving}
        onDone={onDone}
      />
    );
  }

  // Столб заклинаний: тут учат заклинаниям и за «Цену забвения» забывают.
  if (extra.kind === "spellbook")
    return <SpellPillarAction q={q} r={r} extra={extra} onDone={onDone} />;

  // «Забвение»: за плату — эффект, с которым заклинание забывают из книги.
  if (extra.kind === "oblivion")
    return <OblivionAction q={q} r={r} extra={extra} onDone={onDone} />;

  // Портал: вход в сеть или платный проход через дверь.
  if (extra.kind === "portal") {
    return (
      <PortalAction
        q={q}
        r={r}
        group={extra.group}
        groupName={extra.groupName}
        prices={extra.prices}
        level={extra.level}
        exits={extra.exits}
        can={extra.can}
        reasonKey={extra.reasonKey}
        reasonParams={extra.reasonParams}
        island={extra.island}
        onDone={onDone}
      />
    );
  }

  // Шахта: захват за энергию, часовая добыча ресурса, свой таймер.
  if (extra.kind === "mine") {
    return (
      <MineAction
        q={q}
        r={r}
        resource={extra.resource}
        token={extra.token}
        yieldAmount={extra.yieldAmount}
        captureCost={extra.captureCost}
        mine={extra.mine}
        capturedAt={extra.capturedAt}
        claimedHours={extra.claimedHours}
        maxHours={extra.maxHours ?? null}
        pending={extra.pending}
        guardian={extra.guardian}
        can={extra.can}
        reasonKey={extra.reasonKey}
        onDone={onDone}
      />
    );
  }

  // Верфь: обычный корабль за лайки, большой — деревом и товаром.
  if (extra.kind === "shipyard") {
    return <ShipyardAction q={q} r={r} extra={extra} onDone={onDone} />;
  }

  // Университет: стейкинг фишек ради лайков — своим блоком (UniversityAction).
  if (extra.kind === "university") return <UniversityAction q={q} r={r} {...extra} />;

  // Музей: фарм билетов с собранных коллекций — та же механика, что во вкладке
  // Фишки, здесь у неё дом на карте.
  if (extra.kind === "museum") return <MuseumAction q={q} r={r} built={extra.built} />;

  // Турнир: плашки идущих и прошлых турниров, таблицы по местам.
  if (extra.kind === "tournament") return <TournamentAction q={q} r={r} />;

  // Казино: слот на золото на весь экран.
  if (extra.kind === "casino") return <CasinoAction />;

  return (
    <div className="space-y-1.5 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <div className="text-center text-sm">
        <b className="text-gold">{t("braid.scout_for", { r: extra.radius, e: extra.energy })}</b>
      </div>
      {extra.reasonKey && (
        <p className="text-center text-[11px] text-muted-foreground">
          {t(extra.reasonKey, extra.reasonParams)}
        </p>
      )}
      <button
        type="button"
        onClick={() => reveal.mutate()}
        disabled={reveal.isPending || !extra.can}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
      >
        {reveal.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
        {t("braid.reveal_terrain")}
      </button>
    </div>
  );
}

/** Кнопка «Прочитать» и само послание. Бесплатное действие. */
function SignAction({ text }: { text: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground"
      >
        <ScrollText className="h-4 w-4" />
        {t("braid.sign_read")}
      </button>
      {open && <SignModal text={text} onClose={() => setOpen(false)} />}
    </div>
  );
}
