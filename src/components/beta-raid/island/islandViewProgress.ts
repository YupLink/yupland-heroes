import { ISLAND_ITEMS } from "@/lib/raid/island/catalog";

export type IslandViewedStep = "hero" | "chest_backpack";
export const isIslandViewedStep = (step: string): step is IslandViewedStep => step === "hero" || step === "chest_backpack";
const VIEWS: ReadonlyArray<{ step: IslandViewedStep; selector: string }> = [
  { step: "hero", selector: "[data-island-hero-view]" },
  { step: "chest_backpack", selector: `.hero-items-unified .hero-items-cell[data-stack-key="custom:${ISLAND_ITEMS.goldIngot}"], .hero-items-item-head[data-stack-key="custom:${ISLAND_ITEMS.goldIngot}"]` },
];

/** Observe real views independently of the current guide, Show, or OK buttons. */
export function watchIslandViews(mapId: string, done: ReadonlySet<string>, record: (step: IslandViewedStep, mapId: string) => Promise<{ recorded: boolean }>): () => void {
  const rules = VIEWS.filter(v => !done.has(v.step) && !done.has(`skip:${v.step}`));
  if (!rules.length) return () => {};
  const targets = new Map<Element, IslandViewedStep>();
  const visible = new Set<Element>();
  const confirmed = new Set<IslandViewedStep>();
  const pending = new Set<IslandViewedStep>();
  let active = true;
  const exposed = (el: Element) => el.isConnected && !el.closest('[inert], [aria-hidden="true"]') && getComputedStyle(el).visibility !== "hidden";
  const recordVisible = () => {
    if (!active || document.visibilityState === "hidden") return;
    for (const el of visible) {
      const step = targets.get(el);
      if (!step || !exposed(el) || pending.has(step) || confirmed.has(step)) continue;
      pending.add(step);
      void record(step, mapId).then(result => { if (result.recorded) confirmed.add(step); })
        .catch(() => { /* retry a failed request while the view is still visible */ })
        .finally(() => pending.delete(step));
    }
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      // The hero card can be in view even when its header has scrolled away.
      const minimum = targets.get(entry.target) === "hero" ? 0.01 : 0.25;
      if (entry.isIntersecting && entry.intersectionRatio >= minimum) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    recordVisible();
  }, { threshold: [0.01, 0.25] });
  const sync = () => {
    const found = new Map<Element, IslandViewedStep>();
    for (const rule of rules) for (const el of document.querySelectorAll(rule.selector)) {
      if (!exposed(el)) continue;
      found.set(el, rule.step);
      if (!targets.has(el)) observer.observe(el);
    }
    for (const el of targets.keys()) if (!found.has(el)) { observer.unobserve(el); visible.delete(el); }
    targets.clear();
    for (const [el, step] of found) targets.set(el, step);
  };
  sync();
  const mutations = new MutationObserver(sync);
  mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["inert", "aria-hidden", "hidden", "class", "data-stack-key", "data-island-hero-view"] });
  const resume = () => { sync(); recordVisible(); };
  document.addEventListener("visibilitychange", resume);
  const retry = window.setInterval(recordVisible, 4000);
  return () => {
    active = false;
    observer.disconnect(); mutations.disconnect(); window.clearInterval(retry);
    document.removeEventListener("visibilitychange", resume);
  };
}
