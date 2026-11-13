// Строка окна Архитектора: вид шахты, цена заготовки (ресурсы и товары),
// «Изготовить» и под ней «Усилить» чертёж (lib/mineBoost: захват и постановка
// шахт этого вида дороже). Закрытый вид — «скоро» или нужный уровень вместо
// кнопки; ресурса или товара не хватает — цифра красная, кнопка выключена.
import { Loader2, Wrench, Lock, AlertCircle, ChevronsUp } from "lucide-react";
import "./architect-boost.css";
import { ARCHITECT_RES, canAfford, type ArchitectCost, type CraftProblem } from "@/lib/castleArchitect";
import { goodsOk, type ArchitectGoodView } from "@/lib/castleArchitectGoods";
import { blueprintLabel, type BlueprintResource } from "@/lib/mineBlueprint";
import { RES_ICON } from "./architectIcons";
import { blueprintArt, Resource } from '../mine-buildings/Art';
import { ArchitectGoodItem } from "./ArchitectGoodItem";

export function ArchitectBlueprintRow({
  ru,
  kind,
  cost,
  goods,
  needLevel,
  problem,
  resources,
  pending,
  busy,
  onCraft,
  inventory,
  boost,
  boostPending,
  onBoost,
}: {
  ru: boolean;
  kind: BlueprintResource;
  cost: ArchitectCost;
  goods: ArchitectGoodView[];
  needLevel: number;
  problem: CraftProblem;
  resources: Record<string, number>;
  pending: boolean;
  busy: boolean;
  onCraft: () => void;
  inventory?: number;
  /** Усиление чертежа; нет (старый ответ сервера) — кнопки нет. */
  boost?: { level: number; mult: number; capture: number; next: { diamonds: number; mult: number } | null };
  boostPending?: boolean;
  onBoost?: () => void;
}) {
  const soon = problem === "soon";
  const fmt = (n: number) => n.toLocaleString(ru ? "ru-RU" : "en-US");
  const affordable=canAfford(cost,resources)&&goodsOk(goods);
  const open=!soon&&problem!=='level'&&!!boost;
  const boostCash=!!boost?.next&&(resources.diamonds??0)>=boost.next.diamonds;
  return <li className="mb-blueprint">
    <img className="mb-blueprint-art" src={blueprintArt[kind]} alt=""/>
    <div className="mb-blueprint-info">
      <h3>{blueprintLabel(kind,ru)}</h3>
      <p className="mb-inventory-count">{ru?'В рюкзаке героя:':'In the hero’s backpack:'} <b>{inventory===undefined?'—':fmt(inventory)}</b></p>
      {!soon&&<div className="mb-price">
        {ARCHITECT_RES.filter(r=>cost[r]>0).map(r=><span key={r} className={(resources[r]??0)<cost[r]?'mb-danger':''}><Resource kind={r} lang={ru?'ru':'en'}/><b>{fmt(cost[r])}</b></span>)}
        {goods.map(g=><ArchitectGoodItem key={g.key} good={g} ru={ru} className="mb-good" okClassName="" lackClassName="mb-danger" imgClassName="mb-resource"/>)}
      </div>}
      {open&&boost.level>0&&<p className="mb-boost-now">{ru?'Захват и постановка':'Seize and place'} ×{boost.mult} · {fmt(boost.capture)} ⚡</p>}
      {problem==='level'?<p className="mb-reason"><Lock size={14}/>{ru?`Нужен уровень здания ${needLevel} или герой-Строитель`:`Requires building level ${needLevel} or a Builder hero`}</p>:!soon&&!affordable?<p className="mb-reason mb-danger"><AlertCircle size={14}/>{ru?'Не хватает ресурсов или товаров':'Not enough resources or goods'}</p>:null}
    </div>
    <div className="mb-blueprint-acts">
      <button type="button" className="mb-gold mb-craft" disabled={busy||soon||problem==='level'||!affordable} onClick={onCraft}>
        {pending?<Loader2 className="mb-spin" size={16}/>:problem?<Lock size={16}/>:<Wrench size={16}/>}
        <span>{soon?(ru?'Скоро':'Coming soon'):(ru?'Изготовить':'Craft')}</span>
      </button>
      {open&&<button type="button" className="mb-outline mb-boost" disabled={busy||!boostCash} onClick={onBoost}>
        {boostPending?<Loader2 className="mb-spin" size={14}/>:<ChevronsUp size={14}/>}
        {boost.next?<>
          <span>{ru?'Усилить':'Boost'} ×{boost.next.mult}</span>
          <span className={boostCash?'mb-boost-price':'mb-boost-price mb-danger'}><img src={RES_ICON.diamonds} alt=""/>{fmt(boost.next.diamonds)}</span>
        </>:<span>×{boost.mult}</span>}
      </button>}
    </div>
  </li>;
}
