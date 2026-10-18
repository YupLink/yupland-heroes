import { ArrowLeft, Check, LockKeyhole, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import swords from "@/assets/harvest/swords.webp";
import pack from "@/assets/quests/yupik-pack.webp";
import frog from "@/assets/quests/runaway-frog.webp";
import scroll from "@/assets/quests/scroll-v2.webp";
import "./castle-quest-board.css";

type Localized = { ru: string; en: string };
type QuestStep = { id: string; title: Localized; how: Localized; done: boolean };
type QuestStatus = "active" | "locked" | "done";
type QuestPhase = QuestStatus | "ready";
type QuestReward = { kind: "xp"; amount?: number } | { kind: "other"; label: Localized; amount?: number };
export type QuestProgress = { current: number; claimed: boolean };
type QuestTemplate = {
  id: string;
  status: QuestStatus;
  image: string;
  imageKind?: "resource";
  title: Localized;
  listTitle?: Localized;
  summary: Localized;
  why: Localized;
  progress: { current: number; target: number };
  rewards: QuestReward[];
  unlock?: Localized;
  steps: QuestStep[];
  destination?: "barracks" | "world";
  destinationLabel?: Localized;
};
type CastleQuestBoardProps = {
  ru: boolean;
  onClose: () => void;
  onBarracks: () => void;
  onWorld: () => void;
  progressByQuest?: Record<string, QuestProgress>;
  onClaimReward?: (questId: string) => void | Promise<void>;
};

const copy = (value: Localized, ru: boolean) => ru ? value.ru : value.en;
const rewardText = (reward: QuestReward, ru: boolean) => {
  const name = reward.kind === "xp" ? ru ? "Опыт" : "Experience" : copy(reward.label, ru);
  return reward.amount == null ? name : `${name} +${reward.amount}`;
};
const tabs: { id: QuestStatus; name: Localized; compact: Localized }[] = [
  { id: "active", name: { ru: "Активные", en: "Active" }, compact: { ru: "Активные", en: "Active" } },
  { id: "locked", name: { ru: "Недоступные", en: "Locked" }, compact: { ru: "Закрытые", en: "Locked" } },
  { id: "done", name: { ru: "Выполненные", en: "Completed" }, compact: { ru: "Архив", en: "Archive" } },
];

// Static content fixture. Every quest uses the same list and detail components.
// All six review quests start active; progress is not connected to gameplay.
const quests: QuestTemplate[] = [
  {
    id: "pack", status: "active", image: pack,
    title: { ru: "Открой первый пак", en: "Open your first pack" },
    summary: { ru: "Открой любой пак", en: "Open any pack" },
    why: { ru: "Подойдёт любой доступный тебе пак.", en: "Any pack available to you counts." },
    progress: { current: 0, target: 1 },
    rewards: [{ kind: "xp" }],
    destination: "barracks", destinationLabel: { ru: "В тренировочный лагерь", en: "Training camp" },
    steps: [
      { id: "open", title: { ru: "Открой любой пак", en: "Open any pack" }, how: { ru: "Перейди в тренировочный лагерь, выбери любой доступный пак и открой его.", en: "Go to Barracks, choose any available pack and open it." }, done: false },
    ],
  },
  {
    id: "frog", status: "active", image: frog,
    title: { ru: "Победи Лягушку-Убегушку", en: "Defeat the Runaway Frog" },
    listTitle: { ru: "Победи лягушку", en: "Defeat the frog" },
    summary: { ru: "Победи первого босса", en: "Defeat your first boss" },
    why: { ru: "Получи первую победу над боссом.", en: "Claim your first boss victory." },
    progress: { current: 0, target: 1 },
    rewards: [{ kind: "xp" }],
    destination: "world", destinationLabel: { ru: "В мир", en: "World" },
    steps: [
      { id: "win", title: { ru: "Победи Лягушку-Убегушку", en: "Defeat the Runaway Frog" }, how: { ru: "Найди босса в мире и заверши бой победой.", en: "Find the boss in the world and win the fight." }, done: false },
    ],
  },
  {
    id: "mobs", status: "active", image: swords, imageKind: "resource",
    title: { ru: "Победи 10 любых мобов", en: "Defeat any 10 mobs" },
    summary: { ru: "Выиграй 10 боёв с мобами", en: "Win 10 fights against mobs" },
    why: { ru: "Засчитываются победы над любыми мобами.", en: "Victories over any mobs count." },
    progress: { current: 0, target: 10 },
    rewards: [{ kind: "xp" }],
    destination: "world", destinationLabel: { ru: "В мир", en: "World" },
    steps: [{ id: "wins", title: { ru: "Победи 10 мобов", en: "Defeat 10 mobs" }, how: { ru: "Побеждай любых мобов в мире. Цель: 10 побед.", en: "Defeat any mobs in the world. Goal: 10 victories." }, done: false }],
  },
  {
    id: "gold", status: "active", image: "/resources/gold.png", imageKind: "resource",
    title: { ru: "Собери первое золото", en: "Collect your first gold" },
    summary: { ru: "Получи золото впервые", en: "Get gold for the first time" },
    why: { ru: "Первое пополнение запасов золота.", en: "Add gold to your stores for the first time." },
    progress: { current: 0, target: 1 },
    rewards: [{ kind: "xp" }],
    steps: [{ id: "collect", title: { ru: "Получи золото", en: "Get gold" }, how: { ru: "Собери хотя бы одну единицу золота.", en: "Collect at least one unit of gold." }, done: false }],
  },
  {
    id: "wood", status: "active", image: "/resources/wood.png", imageKind: "resource",
    title: { ru: "Собери первое дерево", en: "Collect your first wood" },
    summary: { ru: "Получи дерево впервые", en: "Get wood for the first time" },
    why: { ru: "Первое пополнение запасов дерева.", en: "Add wood to your stores for the first time." },
    progress: { current: 0, target: 1 },
    rewards: [{ kind: "xp" }],
    steps: [{ id: "collect", title: { ru: "Получи дерево", en: "Get wood" }, how: { ru: "Собери хотя бы одну единицу дерева.", en: "Collect at least one unit of wood." }, done: false }],
  },
  {
    id: "diamond", status: "active", image: "/resources/crystal.png", imageKind: "resource",
    title: { ru: "Собери первый алмаз", en: "Collect your first diamond" },
    summary: { ru: "Получи алмаз впервые", en: "Get a diamond for the first time" },
    why: { ru: "Первое пополнение запасов алмазов.", en: "Add diamonds to your stores for the first time." },
    progress: { current: 0, target: 1 },
    rewards: [{ kind: "xp" }],
    steps: [{ id: "collect", title: { ru: "Получи алмаз", en: "Get a diamond" }, how: { ru: "Собери хотя бы один алмаз.", en: "Collect at least one diamond." }, done: false }],
  },
];

export function CastleQuestBoard({ ru, onClose, onBarracks, onWorld, progressByQuest = {}, onClaimReward }: CastleQuestBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<QuestStatus>("active");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const listButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastOpenedId = useRef<string | null>(null);
  const activeQuest = quests.find(quest => quest.id === activeId);
  const progressFor = (quest: QuestTemplate) => Math.max(0, Math.min(quest.progress.target, progressByQuest[quest.id]?.current ?? quest.progress.current));
  const phaseFor = (quest: QuestTemplate): QuestPhase => {
    if (quest.status === "locked") return "locked";
    if (quest.status === "done" || progressByQuest[quest.id]?.claimed) return "done";
    return progressFor(quest) >= quest.progress.target ? "ready" : "active";
  };
  const activePhase = activeQuest ? phaseFor(activeQuest) : null;
  const visibleQuests = quests.filter(quest => (phaseFor(quest) === "ready" ? "active" : phaseFor(quest)) === tab);

  useEffect(() => {
    if (activeId) backButton.current?.focus();
    else if (lastOpenedId.current) listButtons.current[lastOpenedId.current]?.focus();
    else closeButton.current?.focus();
  }, [activeId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelectorAll('[role="dialog"]').length !== 1) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (activeId) setActiveId(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activeId, onClose]);

  const openQuest = (id: string) => {
    lastOpenedId.current = id;
    setClaimError(false);
    setActiveId(id);
  };
  const onDestination = () => {
    if (activeQuest?.destination === "barracks") onBarracks();
    if (activeQuest?.destination === "world") onWorld();
  };
  const claimReward = async () => {
    if (!activeQuest || activePhase !== "ready" || !onClaimReward || claiming) return;
    setClaiming(true);
    setClaimError(false);
    try {
      await onClaimReward(activeQuest.id);
      setTab("done");
    } catch {
      setClaimError(true);
    } finally {
      setClaiming(false);
    }
  };

  return <div className={`quest-review ${activeQuest ? "quest-review--detail" : visibleQuests.length <= 2 ? "quest-review--short" : ""}`}>
    <header className="quest-review__top">
      {activeQuest
        ? <button ref={backButton} className="quest-review__back" type="button" onClick={() => setActiveId(null)}><ArrowLeft size={20} aria-hidden="true" />{ru ? "К заданиям" : "All quests"}</button>
        : <img className="quest-review__scroll-icon" src={scroll} alt="" />}
      <div className="quest-review__heading">
        <h2 id="quest-preview-title">{activeQuest ? copy(activeQuest.title, ru) : ru ? "Задание" : "Quest"}</h2>
        {!activeQuest && <p>{ru ? "Играй и выполняй задания" : "Play and complete quests"}</p>}
      </div>
      <button ref={closeButton} className="quest-review__close" type="button" onClick={onClose} aria-label={ru ? "Закрыть задания" : "Close quests"}><X size={22} /></button>
    </header>
    {!activeQuest && <nav className="quest-review__tabs" aria-label={ru ? "Категории заданий" : "Quest categories"}>
      {tabs.map(item => <button key={item.id} type="button" className={`quest-review__tab ${tab === item.id ? "quest-review__tab--active" : ""}`} aria-label={copy(item.name, ru)} aria-pressed={tab === item.id} onClick={() => { content.current?.scrollTo(0, 0); setTab(item.id); }}><span className="quest-review__tab-full">{copy(item.name, ru)}</span><span className="quest-review__tab-compact">{copy(item.compact, ru)}</span></button>)}
    </nav>}
    <div ref={content} className="quest-review__content" key={activeId ?? "list"}>
      {activeQuest ? <div className="quest-review__detail">
        <div className="quest-review__summary">
          <div className={`quest-review__summary-art ${activeQuest.imageKind === "resource" ? "quest-review__summary-art--resource" : ""}`}><img src={activeQuest.image} alt="" /></div>
          <div>
            <p><strong>{ru ? "Что:" : "Goal:"}</strong> {copy(activeQuest.summary, ru)}</p>
            <p><strong>{ru ? "Зачем:" : "Why:"}</strong> {copy(activeQuest.why, ru)}</p>
            {activePhase === "locked" && activeQuest.unlock
              ? <span className="quest-review__unlock"><LockKeyhole size={16} aria-hidden="true" />{copy(activeQuest.unlock, ru)}</span>
              : <span className="quest-review__count">{activePhase === "ready" ? ru ? "Задание выполнено" : "Quest complete" : activePhase === "done" ? ru ? "Награда получена" : "Reward claimed" : `${ru ? "Прогресс" : "Progress"}: ${progressFor(activeQuest)} ${ru ? "из" : "of"} ${activeQuest.progress.target}`}</span>}
            <div className="quest-review__reward-line"><Sparkles size={17} aria-hidden="true" /><span><strong>{ru ? "Награда:" : "Reward:"}</strong> {activeQuest.rewards.map(reward => rewardText(reward, ru)).join(", ")}</span></div>
          </div>
        </div>
        {activePhase !== "locked" && <ol className="quest-review__steps">
          {activeQuest.steps.map(step => <li className="quest-review__step" key={step.id}>
            <span className={`quest-review__check ${step.done || activePhase === "ready" || activePhase === "done" ? "quest-review__check--done" : ""}`} role="img" aria-label={step.done || activePhase === "ready" || activePhase === "done" ? ru ? "Выполнено" : "Completed" : ru ? "Не выполнено" : "Not completed"}>{(step.done || activePhase === "ready" || activePhase === "done") && <Check size={24} strokeWidth={3} />}</span>
            <div><h3>{copy(step.title, ru)}</h3><p><strong>{ru ? "Как:" : "How:"}</strong> {copy(step.how, ru)}</p></div>
          </li>)}
        </ol>}
        {activePhase === "active" && activeQuest.destination && <button className="quest-review__destination" type="button" onClick={onDestination}>{copy(activeQuest.destinationLabel!, ru)}</button>}
        {activePhase === "ready" && <button className="quest-review__destination" type="button" onClick={() => void claimReward()} disabled={!onClaimReward || claiming}>{claiming ? ru ? "Получаем…" : "Claiming…" : ru ? "Забрать награду" : "Claim reward"}</button>}
        {claimError && <p className="quest-review__claim-error" role="alert">{ru ? "Не получилось забрать награду. Попробуй ещё раз." : "Could not claim the reward. Try again."}</p>}
      </div> : <div className="quest-review__list">
        {visibleQuests.map(quest => { const phase = phaseFor(quest); return <article className={`quest-review__card quest-review__card--${phase}`} key={quest.id}>
          <div className={`quest-review__art ${quest.imageKind === "resource" ? "quest-review__art--resource" : ""}`}><img src={quest.image} alt="" /></div>
          <div className="quest-review__info"><h3>{copy(quest.listTitle ?? quest.title, ru)}</h3><p>{copy(quest.unlock ?? quest.summary, ru)}</p><div className="quest-review__meta"><span className="quest-review__list-count">{phase === "done" ? <><Check size={14} aria-hidden="true" />{ru ? "Получено" : "Claimed"}</> : phase === "locked" ? <><LockKeyhole size={13} aria-hidden="true" />{ru ? "Закрыто" : "Locked"}</> : phase === "ready" ? ru ? "Готово" : "Ready" : `${progressFor(quest)}/${quest.progress.target}`}</span><span className="quest-review__reward-small"><Sparkles size={13} aria-hidden="true" />{ru ? "Награда:" : "Reward:"} {quest.rewards.map(reward => rewardText(reward, ru)).join(", ")}</span></div></div>
          <button ref={element => { listButtons.current[quest.id] = element; }} type="button" className="quest-review__action" onClick={() => openQuest(quest.id)}>{phase === "done" ? ru ? "Смотреть" : "View" : phase === "locked" ? ru ? "Условия" : "Unlock" : phase === "ready" ? ru ? "Открыть" : "Open" : ru ? "Начать" : "Start"}</button>
        </article>; })}
        {visibleQuests.length === 0 && <p className="quest-review__empty">{tab === "done" ? ru ? "Выполненных заданий пока нет" : "No completed quests yet" : tab === "locked" ? ru ? "Недоступных заданий пока нет" : "No locked quests yet" : ru ? "Пока нет активных заданий" : "No active quests yet"}</p>}
      </div>}
    </div>
  </div>;
}
