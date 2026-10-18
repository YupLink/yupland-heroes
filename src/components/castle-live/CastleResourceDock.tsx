import { useEffect, useRef, useState } from "react";
import { useResources } from "@/lib/hooks/useResources";
import "./castle-resource-dock.css";

const RESOURCE_ITEMS = [
  { key: "wood", ru: "Дерево", en: "Wood", icon: "wood" },
  { key: "stone", ru: "Камень", en: "Stone", icon: "stone" },
  { key: "gold", ru: "Золото", en: "Gold", icon: "gold" },
  { key: "diamonds", ru: "Кристаллы", en: "Crystals", icon: "crystal" },
] as const;

type ResourceKey = (typeof RESOURCE_ITEMS)[number]["key"];

function compactAmount(value: number, ru: boolean) {
  if (value < 1_000) return value.toLocaleString(ru ? "ru-RU" : "en-US");
  if (value < 1_000_000) {
    const thousands = value / 1_000;
    const amount =
      thousands < 100 ? thousands.toFixed(1).replace(/\.0$/, "") : String(Math.round(thousands));
    return `${amount}${ru ? "к" : "k"}`;
  }
  const millions = value / 1_000_000;
  return `${millions < 100 ? millions.toFixed(1).replace(/\.0$/, "") : Math.round(millions)}${ru ? "М" : "M"}`;
}

export function CastleResourceDock({ ru }: { ru: boolean }) {
  const resources = useResources();
  const [selected, setSelected] = useState<ResourceKey | null>(null);
  const [brokenIcons, setBrokenIcons] = useState<Partial<Record<ResourceKey, boolean>>>({});
  const itemRefs = useRef<Partial<Record<ResourceKey, HTMLButtonElement | null>>>({});
  const exactRef = useRef<HTMLButtonElement | null>(null);
  const lastSelected = useRef<ResourceKey | null>(null);
  const selectedItem = RESOURCE_ITEMS.find((item) => item.key === selected);
  const exactValue = selectedItem ? resources.data?.[selectedItem.key] : undefined;
  const showExact = !resources.isError && exactValue !== undefined;
  const exactName = selectedItem && (ru ? selectedItem.ru : selectedItem.en);

  useEffect(() => {
    if (selected && !showExact) {
      setSelected(null);
      return;
    }
    if (selected) {
      lastSelected.current = selected;
      exactRef.current?.focus();
    } else if (lastSelected.current) {
      itemRefs.current[lastSelected.current]?.focus();
      lastSelected.current = null;
    }
  }, [selected, showExact]);

  return (
    <section className="castle-resource-dock" aria-label={ru ? "Запасы замка" : "Castle supplies"}>
      <div
        className="castle-resource-dock__rail"
        data-selected={showExact}
        data-error={resources.isError}
      >
        {RESOURCE_ITEMS.map((item) => {
          const value = resources.data?.[item.key];
          const name = ru ? item.ru : item.en;
          return (
            <button
              key={item.key}
              ref={(element) => {
                itemRefs.current[item.key] = element;
              }}
              type="button"
              className="castle-resource-dock__item"
              aria-label={
                value === undefined
                  ? `${name}: ${resources.isError ? (ru ? "ошибка загрузки" : "loading error") : ru ? "загрузка" : "loading"}`
                  : `${name}: ${value.toLocaleString(ru ? "ru-RU" : "en-US")}`
              }
              aria-pressed={selected === item.key}
              disabled={value === undefined}
              onClick={() => setSelected(selected === item.key ? null : item.key)}
            >
              {brokenIcons[item.key] ? (
                <span className="castle-resource-dock__icon-fallback" aria-hidden="true">
                  {name.slice(0, 2)}
                </span>
              ) : (
                <img
                  src={`/resources/${item.icon}.webp`}
                  alt=""
                  onError={() => setBrokenIcons((current) => ({ ...current, [item.key]: true }))}
                />
              )}
              <span>
                {value === undefined ? (resources.isError ? "—" : "…") : compactAmount(value, ru)}
              </span>
            </button>
          );
        })}
        {showExact && selectedItem ? (
          <button
            ref={exactRef}
            type="button"
            className="castle-resource-dock__exact"
            onClick={() => setSelected(null)}
            aria-label={`${exactName}: ${exactValue.toLocaleString(ru ? "ru-RU" : "en-US")}. ${ru ? "Скрыть точное количество" : "Hide exact amount"}`}
          >
            {brokenIcons[selectedItem.key] ? (
              <span className="castle-resource-dock__icon-fallback" aria-hidden="true">
                {(exactName ?? "").slice(0, 2)}
              </span>
            ) : (
              <img
                src={`/resources/${selectedItem.icon}.webp`}
                alt=""
                onError={() =>
                  setBrokenIcons((current) => ({ ...current, [selectedItem.key]: true }))
                }
              />
            )}
            <span>{exactName}</span>
            <strong>{exactValue.toLocaleString(ru ? "ru-RU" : "en-US")}</strong>
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
        {resources.isError ? (
          <div className="castle-resource-dock__detail" role="alert">
            <span>{ru ? "Запасы недоступны" : "Supplies unavailable"}</span>
            <button type="button" onClick={() => void resources.refetch()}>
              {ru ? "Повторить" : "Retry"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
