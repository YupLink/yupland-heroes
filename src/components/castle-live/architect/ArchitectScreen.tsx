import "@/components/chips/auctions/auction-screen.css";
// Содержимое окна Архитектора: уровень и заготовки шахт по видам. Все четыре
// вида изготавливаются (с нужного уровня или выбранным героем-Строителем) за
// ресурсы и товары цены; заготовка ложится в рюкзак выбранного героя, товары
// берутся оттуда же. Админу — «Изменить цены» (ArchitectPriceEditor). Окно
// открыли — цены и товары у героя перечитываются: могли купить или продать.
//
// Ключ нажатия живёт до успеха (как у починки шахты): ответ потерялся или
// выдача упала после оплаты — повтор с тем же ключом сервер доводит без второй
// оплаты (статус 'repeat'). Свой ключ у каждого вида: оплата помнит вид.
// Оплату по ключу вернули (отказ «уже отменена» или метка на ошибке выдачи,
// castleArchitectMark) — ключ сбрасываем, текст игроку — исходный.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pencil, Check, Info } from "lucide-react";
import { craftMineBlueprint } from "@/server/api/castle-architect/craft";
import { buyMineBoost } from "@/server/api/castle-architect/mine-boost";
import { MINE_PLAN_KEY } from "@/components/beta-raid/mine-build/mineBuildStore";
import {getMyBackpack} from '@/server/api/beta-raid/market-backpack-read';
import { getSession } from "@/server/api/user-auth";
import { architectErrorText } from "@/lib/castleArchitectText";
import { attemptClosed } from "@/lib/castleArchitectMark";
import { blueprintLabel, mineBlueprintOf, type BlueprintResource } from "@/lib/mineBlueprint";
import { newOpId } from "@/lib/opId";
import {
  ARCHITECT_KEY,
  refreshArchitectData,
  useArchitectResources,
  useCastleArchitect,
} from "@/components/castle-live/useWithArchitect";
import { ArchitectBlueprintRow } from "./ArchitectBlueprintRow";
import { ArchitectPriceEditor } from "./ArchitectPriceEditor";

export function ArchitectScreen({ ru, onUpgrade }: { ru: boolean; onUpgrade?: () => void }) {
  const qc = useQueryClient();
  const [help,setHelp]=useState(false);
  const backpack=useQuery({queryKey:['my-hero-backpack'],queryFn:()=>getMyBackpack(),staleTime:0});
  const counts=backpack.isSuccess&&!backpack.isError?Object.fromEntries(['wood','stone','gold','diamonds'].map(k=>[k,backpack.data.stacks.reduce((n,s)=>mineBlueprintOf(s.stackKey)===k?n+s.count:n,0)])):undefined;
  const q = useCastleArchitect();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const admin = session.data?.isAdmin === true;
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    // Уже идущий запрос не рвём: он и так свежий.
    void qc.invalidateQueries({ queryKey: ARCHITECT_KEY }, { cancelRefetch: false });
  }, [qc]);
  const ops = useRef<Partial<Record<BlueprintResource, string>>>({});
  const craft = useMutation({
    mutationFn: (kind: BlueprintResource) => {
      const opId = (ops.current[kind] ??= newOpId());
      return craftMineBlueprint({ data: { kind, opId } });
    },
    onSuccess: (r, kind) => {
      delete ops.current[kind];
      toast.success(
        ru
          ? `Заготовка «${blueprintLabel(r.kind, true)}» в рюкзаке`
          : `${blueprintLabel(r.kind, false)} blueprint is in the backpack`,
      );
    },
    onError: (e: unknown, kind) => {
      // Оплату по ключу уже вернули — следующее нажатие начнёт новую попытку.
      if (attemptClosed(e)) delete ops.current[kind];
      toast.error(architectErrorText(e, ru));
    },
    onSettled: () => refreshArchitectData(qc),
  });

  // Усилить чертёж (lib/mineBoost): уровень, который видит игрок, — двойное нажатие не купит два.
  const boost = useMutation({
    mutationFn: (b: { kind: BlueprintResource; from: number }) => buyMineBoost({ data: b }),
    onSuccess: (r, b) => {
      if (r.bought)
        toast.success(
          ru ? `Чертёж «${blueprintLabel(b.kind, true)}» усилен` : `${blueprintLabel(b.kind, false)} blueprint boosted`,
        );
    },
    onError: (e: unknown) => toast.error(architectErrorText(e, ru)),
    // Цена постановки уже положенного чертежа тоже выросла — перечитать его.
    onSettled: () => {
      refreshArchitectData(qc);
      void qc.invalidateQueries({ queryKey: MINE_PLAN_KEY });
    },
  });

  const a = q.data;
  const have = useArchitectResources(a?.resources);
  if (admin && editing) return <ArchitectPriceEditor ru={ru} onClose={() => setEditing(false)} />;
  if (!a) {
    return q.isError ? (
      <p role="alert" className="auction-ledger text-[#f0948a]">
        {architectErrorText(q.error, ru)}
      </p>
    ) : (
      <div className="auction-ledger grid place-items-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-[#edc36b]" aria-label={ru ? "Загрузка" : "Loading"} />
      </div>
    );
  }
  return (
    <section className="mb-blueprints" aria-labelledby="architect-title">
      <div className="mb-architect-level">
        <span className="mb-building-level-label">{ru?'Уровень здания':'Building level'} <b>{a.level}</b></span>
        {a.level>=a.maxLevel?<span className="mb-level-max"><Check size={16}/>{ru?'Максимальный уровень':'Maximum level'}</span>:a.level>0?<button type="button" className="mb-upgrade-link" onClick={onUpgrade}>{ru?'Улучшить в Ратуше':'Upgrade in Town Hall'}</button>:<span>{ru?'Здание не построено':'Building not built'}</span>}
      </div>
      <header><h2 id="architect-title">{ru?'Шахты для рейда':'Mines for raids'}</h2><button type="button" className="mb-architect-info" aria-label={ru?'Как работают заготовки':'How blueprints work'} aria-expanded={help} onClick={()=>setHelp(!help)}><Info size={20}/></button></header>
      <p className="mb-help">{ru?'Изготовь заготовку и установи шахту из рюкзака героя на карте рейда.':'Craft a blueprint, then place the mine from your hero’s backpack on the raid map.'}</p>
      {help&&<p className="mb-blueprint-help">{ru?'Чтобы поставить шахту, открой рюкзак героя на карте рейда и выбери заготовку.':'To place the mine, open your hero’s backpack on the raid map and select its blueprint.'}</p>}
      {a.hero?.builder&&<p className="mb-builder">{ru?'Герой-Строитель: доступны все виды шахт':'Builder hero: all mine types available'}</p>}
      {backpack.isError&&<p role="alert">{ru?'Не удалось загрузить рюкзак.':'Could not load the backpack.'} <button type="button" className="mb-upgrade-link" onClick={()=>void backpack.refetch()}>{ru?'Повторить':'Retry'}</button></p>}
      <ul className="mb-blueprint-list">
        {a.blueprints.map((b) => (
          <ArchitectBlueprintRow
            key={b.kind}
            inventory={counts?.[b.kind]}
            ru={ru}
            kind={b.kind}
            cost={b.cost}
            goods={b.goods}
            needLevel={b.needLevel}
            problem={b.problem}
            resources={have}
            pending={craft.isPending && craft.variables === b.kind}
            busy={craft.isPending || boost.isPending}
            onCraft={() => craft.mutate(b.kind)}
            boost={b.boost}
            boostPending={boost.isPending && boost.variables?.kind === b.kind}
            onBoost={() => boost.mutate({ kind: b.kind, from: b.boost.level })}
          />
        ))}
      </ul>
      {admin && (
        <button type="button" className="mb-outline" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {ru ? "Изменить цены" : "Edit prices"}
        </button>
      )}
    </section>
  );
}

