import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, UserRound } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { getMySelectedHero } from "@/server/api/heroes-select";
import { TavernDialog } from "@/components/castle-live/TavernDialog";
import { CastleModal } from "./castle/CastleModal";
import { SatietyBar } from "./SatietyBar";
import type { CastleTab } from "./castle/CastleTabs";
import { onMineBuildStart } from "./mine-build/mineBuildStore";
import { onTreeMapStart } from "./tree-map/treeMapEvents";
import { onHandStart } from "./hand/handStore";
import { onLadderStart } from "./sight/ladderMode";
import { ReferralRewardDot } from "@/components/referrals/ReferralRewardDot";
import "@/components/castle-live/tavern.css";
import "@/components/castle-live/tavern-immersive.css";
import "@/components/castle-live/tavern-hero-cards.css";
import "./raid-map-navigation.css";
import "./hero-quick-screen.css";

/** Same component and action guards as TavernWindow. Viewing never selects a hero. */
export function HeroQuickModal({ onClose, onProfile, initialTab = "gear" }: { onClose: () => void; onProfile?: () => void; initialTab?: CastleTab }) {
  const ru = useLang() === "ru";
  const [tab, setTab] = useState<CastleTab>(initialTab);
  const selected = useQuery({ queryKey: ["my-selected-hero"], queryFn: () => getMySelectedHero() });
  const heroId = selected.data?.heroId;
  // «Поставить» шахту из рюкзака: карта входит в режим стройки — окно уходит,
  // откуда бы его ни открыли (кнопка героя, «Рюкзак» на карте, оверлеи рейда).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => onMineBuildStart(() => closeRef.current()), []);
  useEffect(() => onHandStart(() => closeRef.current()), []);
  useEffect(() => onLadderStart(() => closeRef.current()), []);
  useEffect(() => onTreeMapStart(() => closeRef.current()), []);
  return <TavernDialog title={ru ? "Герой" : "Hero"} onClose={onClose} className="raid-hero-dialog raid-hero-screen" overlayClassName="fixed inset-0 z-[120] flex bg-[#0e1419]">
    <div className="raid-hero-dialog__toolbar">
      <button type="button" onClick={initialTab === "gear" && tab !== "gear" ? () => setTab("gear") : onClose}><ArrowLeft aria-hidden="true" />{initialTab === "gear" && tab !== "gear" ? (ru ? "Снаряжение" : "Equipment") : (ru ? "Рейд" : "Raid")}</button>
      {selected.isSuccess && heroId && tab !== "spells" && <SatietyBar ru={ru} className="raid-hero-dialog__satiety" />}
      <div className="raid-hero-dialog__actions">
        {onProfile && <button type="button" onClick={onProfile}><UserRound aria-hidden="true" />{ru ? "Профиль" : "Profile"}<ReferralRewardDot className="ml-1" /></button>}
      </div>
    </div>
    <div className="raid-hero-dialog__body" data-tavern-detail>
      {selected.isError ? <div role="alert"><p>{ru ? "Не удалось загрузить героя" : "Could not load hero"}</p><button type="button" onClick={() => void selected.refetch()}>{ru ? "Повторить" : "Retry"}</button></div>
        : selected.isPending ? <p role="status">{ru ? "Загрузка…" : "Loading…"}</p>
        : !heroId ? <p>{ru ? "Активный герой не выбран. Выбери героя в Таверне." : "No active hero. Choose a hero in the Tavern."}</p>
        : <>
          <CastleModal key={heroId} viewedHeroId={heroId} embedded embeddedTab={tab} onEmbeddedTabChange={setTab} activeHero allowLevelUp onClose={onClose} />
        </>}
    </div>
  </TavernDialog>;
}

