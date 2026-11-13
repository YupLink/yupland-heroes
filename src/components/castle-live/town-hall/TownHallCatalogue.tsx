import { TownHallArchitectPrice } from "../TownHallArchitect";
import packbase from "./assets/appearance-packs/base.webp";
import packelven from "./assets/appearance-packs/elven.webp";
import packwinter from "./assets/appearance-packs/winter.webp";
import packinfernal from "./assets/appearance-packs/infernal.webp";
import packbuckwheat from "./assets/appearance-packs/buckwheat.webp";
import packcelestial from "./assets/appearance-packs/celestial.webp";
import armorybase from "./assets/town-hall-armory/base.webp";
import { TownHallOwnedBuildings } from "./TownHallOwnedBuildings";import { serviceOf, serviceTitle } from "./townHallServices";
import progression from "./townHallProgression.json";
import { capacityState, buildGate } from "./townHallCapacity";
import { usePricing, useTownHall, Price, costRows } from "./townHallPricing";
import baseStylePreview from "./assets/town-hall-style-base.webp";
import { townHallDecorPreviews } from "./townHallDecorPreviews";
import elvenStylePreview from "./assets/town-hall-style-elven.webp";
import winterStylePreview from "./assets/town-hall-style-winter.webp";
import infernalStylePreview from "./assets/town-hall-style-infernal.webp";
import buckwheatStylePreview from "./assets/town-hall-style-buckwheat.webp";
import celestialStylePreview from "./assets/town-hall-style-celestial.webp";
import gates from './assets/shared/gates-png-optimized.webp';
import { useEffect, useRef, useState } from "react";
import type { Ref } from "react";
import { CastlePaths } from "@/components/castle-live/CastlePathLayer";
import hall from "./assets/shared/town-hall-png-optimized.webp";
import tavern from "./assets/shared/tavern-png-optimized.webp";
import warehouse from "./assets/shared/warehouse-png-optimized.webp";
import tradingHouse from "./assets/shared/trading-house-png-optimized.webp";
import market from "./assets/shared/market-png-optimized.webp";
import temple from "./assets/shared/temple-png-optimized.webp";
import trainingCamp from "./assets/shared/training-camp-png-optimized.webp";
import glory from "./assets/shared/glory-png-optimized.webp";
import reference from "./assets/town-hall-approved-layout-png-optimized.webp";
import capacityScene from "./assets/town-hall-capacity-art-png-optimized.webp";
import successCastle from "./assets/town-hall-success-castle-png-optimized.webp";
import goldIcon from "./assets/town-hall-gold.png";
import castleIcon from "./assets/town-hall-icon-castle-png-optimized.webp";
import paletteIcon from "./assets/town-hall-icon-palette-png-optimized.webp";
import upgradeIcon from "./assets/town-hall-icon-upgrade-png-optimized.webp";
import auctionArt from "./assets/town-hall-auction-l1.webp";
import casinoArt from "./assets/town-hall-casino.webp";
import baseDecorShopArt from "./assets/town-hall-base-decor-shop-jpg-optimized.webp";
import decorTree from "./assets/decor-tree.webp";
import decorLamp from "./assets/decor-lamp.webp";
import decorFountain from "./assets/decor-fountain.webp";
import decorBench from "./assets/decor-bench.webp";
import decorCornerBench from "./assets/decor-bench-corner.webp";
import decorFlowerbed from "./assets/decor-flowerbed.webp";
import decorRoads from "./assets/decor-roads.webp";
import "./town-hall-purchase-preview.css";

type Appearance = "decor" | "buildings" | "atmosphere";
type Style = "Базовый" | "Эльфийский" | "Зимний" | "Адский" | "Гречневый" | "Небесный";
type DecorStyle = "Базовый" | "Эльфийский" | "Зимний" | "Адский" | "Гречневый" | "Небесный";
type Atmosphere = "Обычный" | "Лунная ночь" | "Рассвет" | "Туман";

// Approved raster supplies scenic art; UI icons are separate transparent assets.
function ScenicCrop({ x, y, width, height, className = "" }: { x: number; y: number; width: number; height: number; className?: string }) {
  const sourceWidth = 849;
  const sourceHeight = 1853;
  return <span aria-hidden="true" className={`thg-scenic ${className}`} style={{
    aspectRatio: `${width} / ${height}`,
    backgroundImage: `url(${reference})`,
    backgroundSize: `${sourceWidth / width * 100}% auto`,
    backgroundPosition: `${x / (sourceWidth - width) * 100}% ${y / (sourceHeight - height) * 100}%`,
  }} />;
}

function IconArt({ src, className }: { src: string; className: string }) {
  return <span aria-hidden="true" className={className} style={{ backgroundImage: `url(${src})` }} />;
}

const appearancePackPreviews: Record<string,string> = {"Базовый":packbase,"Эльфийский":packelven,"Зимний":packwinter,"Адский":packinfernal,"Гречневый":packbuckwheat,"Небесный":packcelestial};
const buildingArts = [tavern, hall, gates];
const buildingStylePreviews: Record<string, string> = {
  "Базовый": baseStylePreview,
  "Эльфийский": elvenStylePreview,
  "Зимний": winterStylePreview,
  "Адский": infernalStylePreview,
  "Гречневый": buckwheatStylePreview,
  "Небесный": celestialStylePreview,
};
const decorStyles: DecorStyle[] = ["Базовый", "Зимний", "Гречневый", "Адский", "Эльфийский", "Небесный"];
const baseDecorItems = [
  { name: "Дерево", art: decorTree },
  { name: "Фонарь", art: decorLamp },
  { name: "Фонтан", art: decorFountain },
  { name: "Лавочка", art: decorBench },
  { name: "Угловая лавочка", art: decorCornerBench },
  { name: "Клумба", art: decorFlowerbed },
  { name: "Дорожки", art: decorRoads },
] as const;
function AppearanceArt({ kind, name }: { kind: "buildings" | "atmosphere"; name: string }) {
  if (kind === "buildings") {
    const preview = buildingStylePreviews[name];
    return <span className={`thg-option-scene thg-appearance-card-art ${preview ? "thg-building-style-preview" : "thg-style-base"}`}>{preview ? <img src={preview} alt="Ратуша, таверна и врата" /> : buildingArts.map(art => <img key={art} src={art} alt="" />)}</span>;
  }
  return <span className={`thg-option-scene thg-appearance-card-art thg-atmosphere-${name === "Обычный" ? "day" : name === "Лунная ночь" ? "moon" : name === "Рассвет" ? "dawn" : "fog"}`}><img src={hall} alt="" /></span>;
}
const additionalBuildings = [9, 10, 11, 12, 13, 15, 16, 17, 14];



export function TownHallCatalogue({onBack,backRef,mainCastleConfirmed}:{onBack:()=>void;backRef?:Ref<HTMLButtonElement>;onMakeMainCastle?:()=>void;mainCastleConfirmed:boolean}) {
  const {model,pending,available,run,renderService}=useTownHall();
  const getPrice=usePricing();
  const auctionBuildCost=costRows(getPrice("building:9"));
  const casinoBuildCost=costRows(getPrice("building:10"));
  const levels=model?.levels??progression.levels;

  const [opened, setOpened] = useState<Appearance | null>(null);
  const buildingStripRef = useRef<HTMLDivElement>(null);
  const [buildingScroll, setBuildingScroll] = useState({ left: false, right: true });
  const [buildingConfirm, setBuildingConfirm] = useState(false);
  const templeBuilt=!!model?.buildings.some(b=>b.id==="temple");
  const [purchaseBuilding, setPurchaseBuilding] = useState<number | null>(null);
  const auctionBuilt=!!model?.buildings.some(b=>b.id==="auction");
  const casinoBuilt=!!model?.buildings.some(b=>b.id==="casino");
  const [selectedDecorStyle, setSelectedDecorStyle] = useState<DecorStyle>("Базовый");
  const baseDecorOwned=!!model?.decor.includes("Базовый");
  const [decorPurchaseOpen, setDecorPurchaseOpen] = useState(false);
  const [decorPurchaseStep, setDecorPurchaseStep] = useState<"details" | "confirm" | "success">("details");
  const [selectedBuildingStyle, setSelectedBuildingStyle] = useState<Style>("Базовый");
  const [selectedAtmosphere, setSelectedAtmosphere] = useState<Atmosphere>("Обычный");
  const ownedBuildings=model?.buildingStyles??[];
  const [ownedAtmospheres, setOwnedAtmospheres] = useState<Atmosphere[]>(["Обычный"]);
  const activeBuildingStyle=model?.activeBuildingStyle??null;
  const [activeAtmosphere, setActiveAtmosphere] = useState<Atmosphere>("Обычный");
  const [appearanceDialog, setAppearanceDialog] = useState<"buildings" | "atmosphere" | null>(null);
  const [appearanceStep, setAppearanceStep] = useState<"details" | "confirm" | "success">("details");
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [capacityStep, setCapacityStep] = useState<"overview" | "confirm" | "success">("overview");
  const capacityLevel=model?.level??0;
  const mainCastle=mainCastleConfirmed;
  const [upgradeSelection, setUpgradeSelection] = useState<string | null>(null);
  const [atmosphereComingOpen, setAtmosphereComingOpen] = useState(false);
  const [upgradesOpen, setUpgradesOpen] = useState(false);
  const purchasedBuildingCount=model?.used??0;
  const capacity = model?capacityState(levels, capacityLevel, purchasedBuildingCount):null;
  const capacityLimit = capacity?.current.purchaseLimit ?? 0;
  const nextCapacityLevel = capacity?.next?.level ?? capacityLevel;
  const nextCapacityLimit = capacity?.next?.purchaseLimit ?? capacityLimit;
  const capacityGain = capacity?.gain ?? 0;
  const capacityPriceId = capacity?.next?.priceId ?? "";
  const canUpgrade = !!capacity?.next && !!getPrice(capacityPriceId);
  const constructedBuildings=model?.buildings??[];
  const upgradeBuilding = constructedBuildings.find(building => building.id === upgradeSelection);
  useEffect(() => {
    if (!atmosphereComingOpen && !upgradesOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (upgradeSelection) setUpgradeSelection(null);
      else { setAtmosphereComingOpen(false); setUpgradesOpen(false); }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [atmosphereComingOpen, upgradesOpen, upgradeSelection]);
  const buildBuilding = async (building:9|10|11|14) => {
    const id=building===9?"auction":building===10?"casino":building===11?"temple":"armory";
    const priceId=building===14?"building:armory":`building:${building}`;
    const gate=buildGate(capacity,!!getPrice(priceId),!!model?.buildings.some(b=>b.id===id));
    if(gate==="expand"||gate==="maximum"){setBuildingConfirm(false);setCapacityStep("overview");setCapacityOpen(true);return;}
    if(gate!=="confirm"||!model)return;
    if(!buildingConfirm){setBuildingConfirm(true);return;}
    if(await run({kind:"build",id,priceId,revision:model.revision})){setBuildingConfirm(false);setPurchaseBuilding(null);}
  };

  useEffect(() => {
    if (!decorPurchaseOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setDecorPurchaseOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [decorPurchaseOpen]);

  useEffect(() => {
    if (!capacityOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCapacityOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [capacityOpen]);

  useEffect(() => {
    if (purchaseBuilding === null || capacityOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPurchaseBuilding(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [purchaseBuilding, capacityOpen]);

  useEffect(() => {
    const strip = buildingStripRef.current;
    if (!strip) return;
    const update = () => {
      const left = strip.scrollLeft > 2;
      const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2;
      setBuildingScroll(current => current.left === left && current.right === right ? current : { left, right });
    };
    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(strip);
    return () => resizeObserver.disconnect();
  }, []);

  const scrollBuildings = (direction: -1 | 1) => {
    const strip = buildingStripRef.current;
    const card = strip?.querySelector<HTMLElement>(".thg-building-preview-card");
    if (!strip || !card) return;
    strip.scrollBy({ left: direction * (card.getBoundingClientRect().width + 5), behavior: "smooth" });
  };

  const choose = (section: Appearance) => { if(section === "atmosphere") {setAtmosphereComingOpen(true); return;} setOpened(current => current === section ? null : section); };
  const actionFor = (owned: boolean, active: boolean) => active ? "Установлен" : owned ? "Применить" : "Купить";
  const ownedDecor=model?.decor??[];
  const decorOwned = selectedDecorStyle === "Базовый" ? baseDecorOwned : ownedDecor.includes(selectedDecorStyle);
  const decorPriceId = `decor:${selectedDecorStyle}`;
  const appearanceName = appearanceDialog === "buildings" ? selectedBuildingStyle : selectedAtmosphere;
  const appearancePriceId = `${appearanceDialog}:${appearanceName}`;
  const appearanceOwned = appearanceDialog === "buildings" ? ownedBuildings.includes(selectedBuildingStyle) : ownedAtmospheres.includes(selectedAtmosphere);
  const appearanceActive = appearanceDialog === "buildings" ? activeBuildingStyle === selectedBuildingStyle : activeAtmosphere === selectedAtmosphere;
  const applyAppearance = async () => {
    if(!model||appearanceDialog!=="buildings"||!model.buildingStyles.includes(selectedBuildingStyle))return;
    if(await run({kind:"apply-style",id:selectedBuildingStyle,revision:model.revision}))setAppearanceDialog(null);
  };

  useEffect(() => {
    if (!appearanceDialog) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setAppearanceDialog(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [appearanceDialog]);

  useEffect(()=>{
    const handle=(event:KeyboardEvent)=>{if(event.key!=="Escape")return;event.stopImmediatePropagation();event.preventDefault();
      if(capacityOpen)setCapacityOpen(false);else if(purchaseBuilding!==null)setPurchaseBuilding(null);else if(decorPurchaseOpen)setDecorPurchaseOpen(false);else if(appearanceDialog)setAppearanceDialog(null);else if(atmosphereComingOpen)setAtmosphereComingOpen(false);else if(upgradesOpen)setUpgradesOpen(false);else onBack();};
    window.addEventListener("keydown",handle,true);return()=>window.removeEventListener("keydown",handle,true);
  },[capacityOpen,purchaseBuilding,decorPurchaseOpen,appearanceDialog,atmosphereComingOpen,upgradesOpen,onBack]);
  useEffect(() => {
    if (!upgradesOpen) return;
    const townHallScroll = window.scrollY;
    window.scrollTo(0, 0);
    return () => { window.scrollTo(0, townHallScroll); };
  }, [upgradesOpen]);

  useEffect(()=>{
    if(!capacityOpen&&purchaseBuilding===null&&!decorPurchaseOpen&&!appearanceDialog&&!atmosphereComingOpen)return;
    const dialog=document.querySelector<HTMLElement>(".thg-host [role=dialog]");if(!dialog)return;
    const previous=document.activeElement as HTMLElement|null;
    const focusable=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]')).filter(el=>!el.hidden);
    focusable()[0]?.focus();
    const trap=(event:KeyboardEvent)=>{if(event.key!=="Tab")return;const items=focusable();const first=items[0],last=items[items.length-1];if(!first){event.preventDefault();return;}if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};
    dialog.addEventListener("keydown",trap);return()=>{dialog.removeEventListener("keydown",trap);if(previous?.isConnected)previous.focus();};
  },[capacityOpen,purchaseBuilding,decorPurchaseOpen,appearanceDialog,atmosphereComingOpen,capacityStep,decorPurchaseStep,appearanceStep]);

  if (upgradesOpen) return <main className="thg-page thg-owned-page">
    <section className="thg-owned-screen" aria-labelledby="thg-service-title">
      <nav aria-label="Навигация"><button type="button" className="thg-service-back" onClick={() => setUpgradesOpen(false)}>← Назад к ратуше</button></nav>
      {!model ? <><h2 id="thg-service-title">Мои постройки</h2><p role="status">Данные о постройках пока недоступны.</p></> : <TownHallOwnedBuildings buildings={constructedBuildings} hallNext={capacity?.next?.level ?? null} hallPriceId={capacityPriceId} onHall={() => {setUpgradesOpen(false);setCapacityStep("overview");setCapacityOpen(true);}} />}
    </section>
  </main>;

  return <main className="thg-page">
    <div className="thg-shell" inert={capacityOpen||purchaseBuilding!==null||decorPurchaseOpen||!!appearanceDialog||atmosphereComingOpen}>
      <header className="thg-hero">
        <div className="thg-title-row">
          <button type="button" className="thg-back" ref={backRef} onClick={onBack} aria-label="Назад в замок"><span aria-hidden="true">←</span> Замок</button>
          <h1 id="castle-window-title">Ратуша</h1>
          {mainCastle && <div className="thg-main-castle">Основной замок</div>}
        </div>
      </header>

      <div className="thg-content">
        <section className="thg-panel thg-development" aria-labelledby="thg-development-title">
          <h2 id="thg-development-title"><IconArt src={castleIcon} className="thg-section-art thg-section-art--castle" />Развитие замка <small>Расширяй и развивай свой замок</small></h2>
          <div className="thg-expansion">
            <span className="thg-expansion-art thg-capacity-scene" style={{ backgroundImage: `url(${capacityScene})` }} aria-hidden="true" />
            <div className="thg-expansion-copy">
              <h3>{!capacity ? "Развитие замка" : !capacity.next ? "Все уровни открыты" : "Следующий уровень"}</h3>
              <p>{!capacity ? "Увеличивай лимит покупки зданий." : !capacity.next ? `Лимит покупки зданий — ${capacityLimit}.` : `Увеличь лимит покупки зданий с ${capacityLimit} до ${nextCapacityLimit}.`}</p>
              <button className="thg-gold-button" type="button" aria-haspopup="dialog" onClick={() => { setCapacityStep("overview"); setCapacityOpen(true); }}>Смотреть</button>
            </div>
          </div>
        </section>

        <section className="thg-panel thg-new-buildings" aria-labelledby="thg-buildings-title">
          <h2 id="thg-buildings-title"><IconArt src={castleIcon} className="thg-section-art thg-section-art--castle" />Новые постройки <small>Каждая постройка оплачивается отдельно</small></h2>
          <div className="thg-building-carousel">
            <div className="thg-building-preview" ref={buildingStripRef} onScroll={event => {
              const strip = event.currentTarget;
              const left = strip.scrollLeft > 2;
              const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2;
              setBuildingScroll(current => current.left === left && current.right === right ? current : { left, right });
            }} aria-label="Новые постройки, прокрутка по горизонтали">
              {additionalBuildings.filter(building => (!serviceOf(building) || model?.services?.some(service => service.id === serviceOf(building))) && !(building === 9 && auctionBuilt || building === 10 && (casinoBuilt || model?.casinoClosed) || building === 11 && templeBuilt || building===14 && model?.buildings.some(b=>b.id==="armory"))).map(building => {
                const service=serviceOf(building)?model?.services?.find(s=>s.id===serviceOf(building)):null;
                const known = !!service || building === 9 || building === 10 || building === 11 || building === 14;
                const name = service?.name ?? (building === 14 ? "Оружейная" : building === 9 ? "Аукционный дом" : building === 10 ? "Казино" : "Храм");
                const built = building === 14 ? false : building === 9 ? auctionBuilt : building === 10 ? casinoBuilt : templeBuilt;
                const cost = costRows(getPrice(building===14?"building:armory":`building:${building}`));
                return <div className={`thg-building-preview-card ${known ? "" : "is-unavailable"} ${purchaseBuilding === building ? "is-selected" : ""}`} key={building}>
                  {known ? <>
                    <strong className="thg-building-preview-name">{name}</strong>
                    <div className="thg-building-preview-auction"><img src={service?.art ?? (building === 14 ? armorybase : building === 9 ? auctionArt : building === 10 ? casinoArt : temple)} alt="" /></div>
                    <div className="thg-building-card-cost" role="group" aria-label="Стоимость строительства">
                      {service?.id === "architect" ? <TownHallArchitectPrice /> : <>{cost.length === 0 && <span aria-label="Стоимость пока не определена">—</span>}{cost.map(resource => <span key={resource.name} aria-label={`${resource.name}: ${resource.amount}`}><img src={resource.icon} alt="" />{resource.amount}</span>)}</>}
                    </div>
                    <button className="thg-building-buy" type="button" onClick={() => {setBuildingConfirm(false);setPurchaseBuilding(building);}} aria-haspopup="dialog" aria-label={`Открыть ${name}`}><span>{service ? "" : built ? "Построено" : getPrice(building===14?"building:armory":`building:${building}`) ? "Построить" : "Скоро"}{service?"":" · "}Подробнее</span></button>
                  </> : <><span className="thg-building-lock" aria-hidden="true" /><strong className="thg-building-unavailable-title">Пока недоступно</strong><span className="thg-building-unavailable-copy">Постройка появится позже</span></>}
                </div>;
              })}
            </div>
            <button className="thg-building-scroll thg-building-scroll--left" type="button" onClick={() => scrollBuildings(-1)} disabled={!buildingScroll.left} aria-label="Прокрутить постройки влево"><span aria-hidden="true" /></button>
            <button className="thg-building-scroll thg-building-scroll--right" type="button" onClick={() => scrollBuildings(1)} disabled={!buildingScroll.right} aria-label="Прокрутить постройки вправо"><span aria-hidden="true" /></button>
          </div>
        </section>

        <section className="thg-panel thg-appearance" aria-labelledby="thg-appearance-title">
          <h2 id="thg-appearance-title"><IconArt src={paletteIcon} className="thg-section-art thg-section-art--palette" />Оформление замка <small>Стили зданий и декор в одном наборе</small></h2>

          <div className={`thg-appearance-group thg-decor-group thg-other-appearance ${opened === "decor" ? "is-open" : ""}`}>
            {/* Use only the scenery left of the raster's baked-in button. */}
            <button type="button" className="thg-appearance-tile" onClick={() => choose("decor")} aria-expanded={opened === "decor"}>
              <ScenicCrop x={280} y={1008} width={350} height={145} className="thg-tile-art" />
              <span className="thg-tile-copy"><strong>Тематические наборы</strong><span>Стиль всех зданий и декор замка</span></span>
              {opened === "decor" ? <span className="thg-decor-collapse" aria-hidden="true">⌃</span> : <span className="thg-tile-action">Смотреть</span>}
            </button>
            <div className="thg-decor-reveal" inert={opened !== "decor"} aria-hidden={opened !== "decor"}><div className="thg-detail" aria-label="Наборы декора">
              <div className="thg-option-grid thg-option-grid--decor" role="region" aria-label="Коллекции декора, прокрутка по горизонтали" tabIndex={0}>
                {decorStyles.map(style => <button type="button" key={style} className={`thg-option ${decorPurchaseOpen && selectedDecorStyle === style ? "is-selected" : ""} ${style === "Базовый" ? "thg-option--available" : "thg-option--coming"}`} onClick={() => { setSelectedDecorStyle(style); setDecorPurchaseStep("details"); setDecorPurchaseOpen(true); }} aria-haspopup="dialog">
                  <strong>{style}</strong>
                  <span className="thg-option-scene">
                    <img className="thg-base-decor-thumb thg-decor-cover-image" src={appearancePackPreviews[style] ?? baseDecorShopArt} alt="" />
                    
                  </span>
                  <span className="thg-decor-card-footer">
                    {(style === "Базовый" ? baseDecorOwned : ownedDecor.includes(style)) ? <span className="thg-decor-owned"><span aria-hidden="true">✓</span>Куплен</span> : getPrice(`decor:${style}`) ? <span className="thg-decor-buy"><Price id={`decor:${style}`} /></span> : <span className="thg-decor-soon">Скоро</span>}
                    <span className="thg-decor-more">Подробнее <span aria-hidden="true">›</span></span>
                  </span>
                </button>)}
              </div>
            </div></div>
          </div>

          <div className="thg-appearance-group thg-decor-group thg-other-appearance">
            <button type="button" className="thg-appearance-tile" onClick={() => choose("atmosphere")}>
              <ScenicCrop x={280} y={1322} width={350} height={135} className="thg-tile-art" />
              <span className="thg-tile-copy"><strong>Фон и освещение</strong><span>Измени атмосферу своего замка</span></span>
              <span className="thg-tile-action">Скоро</span>
            </button>
          </div>
        </section>

        <div className="thg-secondary-grid">
          <button type="button" className="thg-panel thg-secondary" onClick={() => { setUpgradeSelection(null); setUpgradesOpen(true); }}><IconArt src={upgradeIcon} className="thg-secondary-art thg-secondary-art--upgrade" /><span><strong>Улучшения</strong><small>Развивай постройки</small></span><span aria-hidden="true">›</span></button>
        </div>

      </div>
    </div>
    {atmosphereComingOpen && <div className="thg-capacity-overlay thg-decor-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) { setUpgradesOpen(false); setAtmosphereComingOpen(false); setUpgradeSelection(null); } }}>
      <section className="thg-capacity-sheet thg-decor-modal thg-service-window" role="dialog" aria-modal="true" aria-labelledby="thg-service-title">
        <button type="button" className="thg-capacity-close" aria-label="Закрыть окно" onClick={() => { setUpgradesOpen(false); setAtmosphereComingOpen(false); setUpgradeSelection(null); }} autoFocus>×</button>
        <div className="thg-service-coming"><h2 id="thg-service-title">Фон и освещение</h2><p>Скоро появится</p><button type="button" className="thg-gold-button" onClick={()=>setAtmosphereComingOpen(false)}>Понятно</button></div>
      </section>
    </div>}
    {appearanceDialog && <div className={`thg-capacity-overlay ${appearanceStep !== "details" ? "thg-decor-modal-overlay" : ""}`} onMouseDown={event => { if (event.target === event.currentTarget) setAppearanceDialog(null); }}>
      <section className={`thg-capacity-sheet thg-decor-purchase-sheet ${appearanceStep !== "details" ? "thg-decor-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="thg-appearance-dialog-title">
        {appearanceStep === "details" && <div className="thg-capacity-handle" aria-hidden="true" />}
        <button type="button" className="thg-capacity-close" aria-label="Закрыть" onClick={() => setAppearanceDialog(null)} autoFocus>×</button>
        <h2 id="thg-appearance-dialog-title">{appearanceStep === "confirm" ? "Подтвердить покупку" : appearanceStep === "success" ? "Покупка завершена" : appearanceName}</h2>
        {appearanceStep === "details" ? <>
          <div className="thg-appearance-detail-art"><AppearanceArt kind={appearanceDialog} name={appearanceName} /></div>
          <p className="thg-appearance-description">{appearanceDialog === "buildings" ? "Оформление построек замка" : "Фон и освещение твоего замка"}</p>
          <div className="thg-decor-purchase-footer">
            {!appearanceOwned && <div className="thg-decor-purchase-cost"><span>Стоимость</span><strong><Price id={appearancePriceId} /></strong></div>}
            <button type="button" className="thg-gold-button thg-decor-purchase-action" disabled={!available || pending || appearanceActive || (!appearanceOwned && !getPrice(appearancePriceId))} onClick={() => appearanceOwned ? applyAppearance() : getPrice(appearancePriceId) && setAppearanceStep("confirm")}>{!appearanceOwned && !getPrice(appearancePriceId) ? "Скоро" : actionFor(appearanceOwned, appearanceActive)}</button>
          </div>
        </> : <div className="thg-decor-payment">
          <div className="thg-decor-payment-product"><AppearanceArt kind={appearanceDialog} name={appearanceName} /><div><h3>{appearanceName}</h3><p>{appearanceDialog === "buildings" ? "Стиль зданий" : "Фон и освещение"}</p></div></div>
          {appearanceStep === "confirm" ? <>
            {/* Success follows a committed host response only. */}
            <button type="button" className="thg-gold-button thg-decor-purchase-action" disabled={!getPrice(appearancePriceId)} onClick={async () => {if(model&&getPrice(appearancePriceId)&&await run({kind:"buy-style",id:selectedBuildingStyle,priceId:appearancePriceId,revision:model.revision}))setAppearanceStep("success");}}><span>Купить</span><Price id={appearancePriceId} /></button>
            <button type="button" className="thg-decor-payment-back" onClick={() => setAppearanceStep("details")}>Назад к описанию</button>
          </> : <>
            <p role="status">Теперь оформление можно применить к замку.</p>
            <button type="button" className="thg-gold-button thg-decor-purchase-action" onClick={applyAppearance}>Применить</button>
            <button type="button" className="thg-decor-payment-back" onClick={() => setAppearanceDialog(null)}>Готово</button>
          </>}
        </div>}
      </section>
    </div>}
    {decorPurchaseOpen && <div className={`thg-capacity-overlay ${decorPurchaseStep !== "details" ? "thg-decor-modal-overlay" : ""}`} onMouseDown={event => { if (event.target === event.currentTarget) setDecorPurchaseOpen(false); }}>
      <section className={`thg-capacity-sheet thg-decor-purchase-sheet ${decorPurchaseStep !== "details" ? "thg-decor-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="thg-decor-purchase-title">
        {decorPurchaseStep === "details" && <div className="thg-capacity-handle" aria-hidden="true" />}
        <button type="button" className="thg-capacity-close" aria-label="Закрыть покупку набора" onClick={() => setDecorPurchaseOpen(false)} autoFocus>×</button>
        <h2 id="thg-decor-purchase-title">{selectedDecorStyle === "Базовый" ? decorPurchaseStep === "success" ? "Базовый набор куплен" : decorPurchaseStep === "confirm" ? "Подтвердить покупку" : "Базовый набор оформления" : `${selectedDecorStyle} набор оформления`}</h2>
        {decorPurchaseStep !== "details" ? <div className="thg-decor-payment">
          <div className="thg-decor-payment-product">
            <img src={appearancePackPreviews[selectedDecorStyle] ?? baseDecorShopArt} alt="" />
            <div><h3>{selectedDecorStyle} набор оформления</h3><p>Декор и стиль зданий замка</p></div>
          </div>
          {decorPurchaseStep === "confirm" ? <>
            <button type="button" className="thg-gold-button thg-decor-purchase-action" disabled={!getPrice(decorPriceId)} onClick={async () => {if(model&&getPrice(decorPriceId)&&await run({kind:"buy-decor",id:selectedDecorStyle,priceId:decorPriceId,revision:model.revision}))setDecorPurchaseStep("success");}}><span>Купить</span><Price id={decorPriceId} /></button>
            <button type="button" className="thg-decor-payment-back" onClick={() => setDecorPurchaseStep("details")}>Назад к набору</button>
          </> : <>
            <p role="status">Покупка завершена. Набор добавлен в твою коллекцию.</p>
            <button type="button" className="thg-gold-button thg-decor-purchase-action" onClick={() => setDecorPurchaseOpen(false)}>Готово</button>
          </>}
        </div> : selectedDecorStyle === "Базовый" ? <>
          <p className="thg-decor-summary">Декор и стиль зданий входят в один набор</p>
          <div className="thg-decor-contents" aria-label="Состав набора">
            {baseDecorItems.map(item => <figure key={item.name} className={item.name === "Дорожки" ? "thg-decor-item thg-decor-item--roads" : "thg-decor-item"}>
              {item.name === "Дорожки" ? <svg className="thg-decor-road-strip" viewBox="0 300 400 64" aria-hidden="true"><CastlePaths cells={[]} routeShape="M-40 332H440" /></svg> : <img src={item.art} alt="" />}<figcaption>{item.name === "Дорожки" ? "Дорожки с бордюрами" : item.name}</figcaption>
            </figure>)}
          </div>
          <div className="thg-decor-purchase-footer">
          <div className="thg-decor-purchase-cost"><span>Стоимость набора</span><strong><Price id={decorPriceId} /></strong></div>
          {/* Ownership is supplied by the host. */}
          <button type="button" className="thg-gold-button thg-decor-purchase-action" disabled={decorOwned || !getPrice(decorPriceId)} onClick={() => {if(getPrice(decorPriceId)) setDecorPurchaseStep("confirm");}}>{decorOwned ? "Куплен" : getPrice(decorPriceId) ? "Купить" : "Скоро"}</button>
          </div>
        </> : <>
          <h3>Стиль зданий</h3>
          <AppearanceArt kind="buildings" name={selectedDecorStyle} />
          <p className="thg-decor-summary">Применяется ко всем зданиям замка</p>
          <h3>Декор</h3>
          <p className="thg-decor-summary">Обе части входят в один набор. Предметы отдельно не продаются.</p>
          <div className="thg-decor-contents" aria-label="Предметы набора">{townHallDecorPreviews[selectedDecorStyle]?.items.map(item => <figure key={item.name} className="thg-decor-item"><img src={item.art} alt="" loading="lazy" /><figcaption>{item.name}</figcaption></figure>)}</div>
          <div className="thg-decor-purchase-footer"><div className="thg-decor-purchase-cost"><span>Стоимость набора</span><Price id={decorPriceId} /></div><button type="button" className="thg-gold-button" disabled={decorOwned || !getPrice(decorPriceId)} onClick={() => {if(getPrice(decorPriceId)) setDecorPurchaseStep("confirm");}}>{decorOwned ? "Куплен" : getPrice(decorPriceId) ? "Купить" : "Скоро"}</button></div>
        </>}
      </section>
    </div>}
    {purchaseBuilding !== null && !capacityOpen && <div className="thg-capacity-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setPurchaseBuilding(null); }}>
      <section className="thg-capacity-sheet thg-auction-sheet" role="dialog" aria-modal="true" aria-labelledby="thg-building-dialog-title">
        <div className="thg-capacity-handle" aria-hidden="true" />
        <button type="button" className="thg-capacity-close" aria-label="Закрыть описание постройки" onClick={() => setPurchaseBuilding(null)} autoFocus>×</button>
        {serviceOf(purchaseBuilding) ? <><h2 id="thg-building-dialog-title">{serviceTitle(purchaseBuilding)}</h2>{renderService?.(serviceOf(purchaseBuilding) ?? "")}</> : purchaseBuilding === 14 && !buildingConfirm ? <>
          <h2 id="thg-building-dialog-title">Оружейная</h2>
          <img className="thg-auction-art" src={armorybase} alt="Оружейная · базовый стиль" />
          <div className="thg-auction-cost">Стоимость строительства <Price id="building:armory" /></div>
          <button type="button" className="thg-gold-button thg-auction-action" disabled={!getPrice("building:armory")} onClick={()=>buildBuilding(14)}>{getPrice("building:armory")?"Построить":"Скоро"}</button>
        </> : buildingConfirm ? <>
          <h2 id="thg-building-dialog-title">Подтвердить строительство</h2>
          <p>{purchaseBuilding === 14 ? "Оружейная" : purchaseBuilding === 9 ? "Аукционный дом" : purchaseBuilding === 10 ? "Казино" : "Храм"}</p>
          <div className="thg-auction-cost"><span>К оплате</span><Price id={purchaseBuilding===14?"building:armory":`building:${purchaseBuilding}`} /></div>
          <button className="thg-gold-button thg-auction-action" type="button" disabled={!getPrice(purchaseBuilding===14?"building:armory":`building:${purchaseBuilding}`)} onClick={() => buildBuilding(purchaseBuilding as 9 | 10 | 11 | 14)}>Подтвердить</button>
          <button className="thg-decor-payment-back" type="button" onClick={() => setBuildingConfirm(false)}>Назад к постройке</button>
        </> : purchaseBuilding === 9 ? <>
          <div className="thg-auction-intro">
            <img className="thg-auction-art" src={auctionArt} alt="" />
            <div className="thg-auction-copy">
              <h2 id="thg-building-dialog-title">Аукционный дом</h2>
              {auctionBuilt ? <p className="thg-auction-description">Аукционный дом построен. Теперь ты можешь выставлять лоты.</p> : <p className="thg-auction-description">Выставляй свои ресурсы, артефакты и вещи на торги. Делай ставки на лоты других игроков.</p>}
            </div>
          </div>
          <div className="thg-auction-level"><strong>Аукционный дом</strong><span>Условия улучшения — в «Моих постройках»</span></div>
          {!auctionBuilt && <><div className="thg-auction-cost"><span>Стоимость строительства</span><div>{auctionBuildCost.map(resource => <span key={resource.name} aria-label={`${resource.name}: ${resource.amount}`}><img src={resource.icon} alt="" />{resource.amount}</span>)}</div></div>
          <button className="thg-gold-button thg-auction-action" type="button" disabled={!getPrice("building:9")} onClick={() => buildBuilding(9)}>{getPrice("building:9") ? "Построить" : "Скоро"}</button></>}
        </> : purchaseBuilding === 11 ? <>
          <div className="thg-auction-intro">
            <img className="thg-auction-art" src={temple} alt="" />
            <div className="thg-auction-copy"><h2 id="thg-building-dialog-title">Храм</h2><p className="thg-auction-description">Молись в храме и получай бонусы.</p></div>
          </div>
          <div className="thg-auction-cost"><span>Стоимость строительства</span><div><Price id="building:11" /></div></div>
          <button className="thg-gold-button thg-auction-action" type="button" disabled={templeBuilt || !getPrice("building:11")} onClick={() => buildBuilding(11)}>{templeBuilt ? "Построено" : getPrice("building:11") ? "Построить" : "Скоро"}</button>
        </> : <>
          <div className="thg-auction-intro">
            <img className="thg-auction-art" src={casinoArt} alt="" />
            <div className="thg-auction-copy"><h2 id="thg-building-dialog-title">Казино</h2><p className="thg-auction-description">{casinoBuilt ? "Казино построено. Теперь ты можешь играть на автомате." : "Построй казино в замке, чтобы играть на автомате."}</p></div>
          </div>
          <div className="thg-auction-level"><strong>Казино</strong><span>Постройка без уровней</span></div>
          {!casinoBuilt && <><div className="thg-auction-cost"><span>Стоимость строительства</span><div>{casinoBuildCost.map(resource => <span key={resource.name} aria-label={`${resource.name}: ${resource.amount}`}><img src={resource.icon} alt="" />{resource.amount}</span>)}</div></div>
          <button className="thg-gold-button thg-auction-action" type="button" disabled={!getPrice("building:10")} onClick={() => buildBuilding(10)}>{getPrice("building:10") ? "Построить" : "Скоро"}</button></>}
        </>}
      </section>
    </div>}
    {capacityOpen && <div className="thg-capacity-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setCapacityOpen(false); }}>
      <section className={`thg-capacity-sheet ${capacityStep === "confirm" ? "thg-capacity-sheet--confirm" : capacityStep === "success" ? "thg-capacity-sheet--success" : ""}`} role="dialog" aria-modal="true" aria-labelledby="thg-capacity-title">
        <div className="thg-capacity-handle" aria-hidden="true" />
        {capacityStep !== "confirm" && <button type="button" className="thg-capacity-close" aria-label="Закрыть развитие замка" onClick={() => setCapacityOpen(false)} autoFocus>×</button>}
        {!capacity ? <><h2 id="thg-capacity-title">Развитие замка</h2><p>Условия развития скоро появятся.</p><button type="button" className="thg-gold-button" disabled>Скоро</button></> : capacityStep === "overview" ? <>
        <div className="thg-capacity-intro">
          <div className="thg-capacity-art" style={{ backgroundImage: `url(${capacityScene})` }} role="img" aria-label="Замок с постройками" />
          <h2 id="thg-capacity-title">Развитие замка</h2>
          <p className="thg-capacity-lead">Расширяй и развивай свой замок.<br />Каждый новый уровень увеличивает<br />лимит на покупку зданий.</p>
        </div>
        <p className="thg-capacity-confirm-note">Куплено зданий: {purchasedBuildingCount} из {capacityLimit}. Доступно для покупки: {capacity?.remaining ?? "—"}.</p>
        <div className="thg-capacity-levels" aria-label={`Уровень ${capacityLevel}, всего ${levels.length}`}>
          {levels.map(item => <span key={item.level} className={item.level === capacityLevel ? "is-current" : item.level === nextCapacityLevel && capacity?.next ? "is-next" : ""}>{item.level}</span>)}
        </div>
        {!!capacity?.next ? <><div className="thg-capacity-stats"><div><small>Сейчас</small><strong><em>{capacityLimit}</em> зданий</strong></div><span aria-hidden="true">→</span><div><small>Следующий уровень</small><strong><em>{nextCapacityLimit}</em> зданий</strong></div></div>
        <div className="thg-capacity-gain"><strong>+{capacityGain} к лимиту</strong><p>На следующем уровне<br />ты сможешь покупать<br />больше зданий.</p></div>
        <button type="button" className="thg-gold-button thg-capacity-continue" disabled={!canUpgrade} onClick={() => {if(canUpgrade) setCapacityStep("confirm");}}>
          <span>{canUpgrade ? "Улучшить" : "Скоро"}</span>{canUpgrade && <Price id={capacityPriceId} />}
        </button></> : <div className="thg-capacity-max"><strong>{capacityLimit} зданий</strong><span>Максимальный лимит покупки</span></div>}
        </> : capacityStep === "confirm" ? <div className="thg-capacity-confirm">
          <div className="thg-capacity-nav"><button type="button" className="thg-capacity-back" onClick={() => setCapacityStep("overview")} autoFocus>← К уровням</button><button type="button" className="thg-capacity-close" aria-label="Закрыть развитие замка" onClick={() => setCapacityOpen(false)}>×</button></div>
          <h2 id="thg-capacity-title">Уровень {nextCapacityLevel}</h2>
          <p className="thg-capacity-confirm-lead">Лимит покупки зданий увеличится</p>
          <div className="thg-capacity-confirm-numbers"><span><small>Сейчас</small><strong>{capacityLimit}</strong></span><span aria-hidden="true">→</span><span><small>После улучшения</small><strong>{nextCapacityLimit}</strong></span></div>
          <p className="thg-capacity-confirm-gain">+{capacityGain} к лимиту</p>
          <p className="thg-capacity-confirm-note">Ты сможешь купить ещё {capacityGain} зданий. Каждое здание покупается отдельно.</p>
          <button type="button" className="thg-gold-button thg-capacity-continue" disabled={!canUpgrade} onClick={async () => {if(model&&canUpgrade&&await run({kind:"capacity",level:nextCapacityLevel,priceId:capacityPriceId,revision:model.revision})){setBuildingConfirm(false);setCapacityStep("success");}}}><span>Подтвердить</span><Price id={capacityPriceId} /></button>
        </div> : <div className="thg-capacity-success">
          <div className="thg-capacity-success-main">
            <div className="thg-capacity-success-copy">
              <h2 id="thg-capacity-title">Уровень {capacityLevel}<br />открыт</h2>
              <div className="thg-capacity-success-rule" aria-hidden="true" />
              <strong>{capacityLimit} зданий</strong>
              <span>Новый лимит покупки</span>
            </div>
            <img src={successCastle} alt="" className="thg-capacity-success-art" />
          </div>
          <p>Дополнительные здания покупаются отдельно.</p>
          <button type="button" className="thg-gold-button thg-capacity-continue" onClick={() => { setCapacityOpen(false); if (purchaseBuilding === null) document.getElementById("thg-buildings-title")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{purchaseBuilding === null ? "К новым постройкам" : "К постройке"}</button>
        </div>}
      </section>
    </div>}
  </main>;
}


