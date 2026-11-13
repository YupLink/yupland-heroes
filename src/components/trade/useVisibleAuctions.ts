import { useEffect, useState } from "react";
import { getSession } from "@/server/api/user-auth";
import { useQueryClient } from "@tanstack/react-query";
import { markAuctionsSeen, type AuctionUnread } from "@/server/api/game-auction";
import { auctionUnreadKey, useAuctionUnread } from "./useAuctionUnread";
import { createAuctionSeenQueue } from "./auctionSeenQueue";

/** Observe cards, not list requests or opening the trade menu. No layout changes. */
export function useVisibleAuctions() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const { viewer, enabled } = useAuctionUnread();
  const qc = useQueryClient();
  useEffect(() => {
    if (!container || !viewer || !enabled || typeof IntersectionObserver === "undefined") return;
    let disposed = false;
    const key = auctionUnreadKey(viewer);
    const active = () => !disposed && qc.getQueryData<{ wallet?: string }>(["session"])?.wallet === viewer;
    const queue = createAuctionSeenQueue({
      active,
      send: async auctionIds => {
        if (!active()) return;
        await qc.cancelQueries({ queryKey: key, exact: true });
        if (!active()) return;
        // Verify the server identity too: a cookie can change before cached session data.
        const session = await getSession();
        if (!active() || session?.wallet !== viewer) {
          void qc.invalidateQueries({ queryKey: ["session"] });
          throw new Error("Auction viewer changed");
        }
        const result = await markAuctionsSeen({ data: { auctionIds } });
        if (!active()) return;
        // A polling request may have started during the mutation; its old result must not win.
        await qc.cancelQueries({ queryKey: key, exact: true });
        if (active()) qc.setQueryData<AuctionUnread>(key, result);
      },
    });
    const visible = new Map<Element, IntersectionObserverEntry>();
    const watched = new Set<Element>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.set(entry.target, entry);
        else visible.delete(entry.target);
      }
    }, { threshold: [0, .25, .5, .75, 1] });
    const sync = () => {
      const cards = new Set(container.querySelectorAll<HTMLElement>("[data-auction-seen-id]"));
      watched.forEach(card => { if (!cards.has(card as HTMLElement)) { observer.unobserve(card); watched.delete(card); visible.delete(card); } });
      cards.forEach(card => { if (!watched.has(card)) { watched.add(card); observer.observe(card); } });
    };
    const mutations = new MutationObserver(sync);
    mutations.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-auction-seen-id"] });
    sync();
    const inspect = () => {
      if (!active() || document.hidden) return;
      const ids: string[] = [];
      visible.forEach((entry, card) => {
        const id = card.getAttribute("data-auction-seen-id");
        const bounds = card.getBoundingClientRect();
        let left = Math.max(0, bounds.left), top = Math.max(0, bounds.top);
        let right = Math.min(innerWidth, bounds.right), bottom = Math.min(innerHeight, bounds.bottom);
        for (let parent = card.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          const rect = parent.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
        }
        const area = { x: left, y: top, width: Math.max(0, right-left), height: Math.max(0, bottom-top) };
        const viewport = entry.rootBounds;
        if (!id || !card.isConnected || !viewport || area.height < Math.min(bounds.height, viewport.height) / 2 || area.width < Math.min(bounds.width, viewport.width) / 2) return;
        // Require most of the visible area to be unobstructed, not just a single centre point.
        let clear = 0;
        for (const dx of [.2, .5, .8]) for (const dy of [.2, .5, .8]) {
          const front = document.elementFromPoint(area.x + area.width * dx, area.y + area.height * dy);
          if (front && card.contains(front)) clear++;
        }
        if (clear >= 7) ids.push(id);
      });
      void queue.add(ids);
    };
    const timer = window.setInterval(inspect, 1000);
    return () => { disposed = true; queue.stop(); window.clearInterval(timer); observer.disconnect(); mutations.disconnect(); };
  }, [container, viewer, enabled, qc]);
  return setContainer;
}
