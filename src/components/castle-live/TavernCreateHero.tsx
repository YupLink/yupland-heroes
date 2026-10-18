import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { myChipInventory } from "@/server/api/chips-pack";
import { getSession } from "@/server/api/user-auth";
import { CastleConvertToHeroModal } from "./CastleConvertToHeroModal";
import { chipBusyView, useNowTick } from "@/components/chips/chipBusy";
import { useLang, useT } from "@/lib/i18n";
import { ChipImage } from "@/components/ChipImage";
import { heroCandidates } from "./tavernItems";
export function TavernCreateHero() {
  const ru = useLang() === "ru";
  const titleRef = useRef<HTMLHeadingElement>(null);
  const chipRail = useRef<HTMLDivElement>(null);
  const t = useT();
  const now = useNowTick();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const inventory = useQuery({
    queryKey: ["my-chip-inventory"],
    queryFn: () => myChipInventory(),
    enabled: !!session.data?.features?.heroes,
  });
  const [selected, setSelected] = useState<{
    id: string;
    level: number;
    name: string;
    imageUrl: string | null;
  } | null>(null);
  const rows =
    session.isFetching || inventory.isFetching || session.isError || inventory.isError
      ? []
      : heroCandidates(inventory.data ?? []);
  useEffect(() => {
    const rail = chipRail.current;
    if (!rail) return;
    const sync = () => {
      const overflow = rail.scrollWidth > rail.clientWidth + 2;
      rail.parentElement?.toggleAttribute("data-rail-no-overflow", !overflow);
      rail.parentElement?.toggleAttribute(
        "data-rail-end",
        !overflow || rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2,
      );
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [rows.length]);
  useLayoutEffect(() => {
    const rail = chipRail.current;
    const wrap = rail?.parentElement;
    const scene = rail?.closest<HTMLElement>("[data-tavern-immersive]");
    const chip = rail?.querySelector<HTMLElement>("button");
    if (!wrap || !scene || !chip) return;

    let frame = 0;
    let active = true;
    const align = () => {
      wrap.style.setProperty("--chip-board-correction", "0px");
      const sceneRect = scene.getBoundingClientRect();
      const chipRect = chip.getBoundingClientRect();
      // The board is painted into tavern-interior.png (941 x 1672).
      const imageHeight = window.innerWidth <= 500 ? 900 : (sceneRect.width * 1672) / 941;
      const boardCenter = sceneRect.top + (imageHeight * 1070) / 1672;
      const chipCenter = (chipRect.top + chipRect.bottom) / 2;
      wrap.style.setProperty("--chip-board-correction", `${boardCenter - chipCenter}px`);
    };
    const schedule = () => {
      if (!active) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(align);
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(scene);
    observer.observe(chip);
    window.addEventListener("resize", schedule);
    void document.fonts.ready.then(schedule);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      wrap.style.removeProperty("--chip-board-correction");
    };
  }, [rows.length]);
  const error = session.isError || inventory.isError;
  const enabled = !!session.data?.features?.heroes;
  return (
    <section className="space-y-3" aria-labelledby="tavern-create">
      <h2 ref={titleRef} tabIndex={-1} id="tavern-create" className="font-semibold">
        {ru ? "Сделать героем" : "Create a hero"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {ru
          ? "Фишки 3+ · стоимость перед подтверждением"
          : "Level 3+ chips · cost shown before confirmation"}
      </p>
      {error ? (
        <div role="alert">
          <p>{ru ? "Не удалось загрузить фишки." : "Could not load chips."}</p>
          <button
            data-game-button="secondary"
            className="min-h-11 rounded border px-3"
            onClick={() => {
              void session.refetch();
              if (enabled) void inventory.refetch();
            }}
          >
            {ru ? "Повторить" : "Retry"}
          </button>
        </div>
      ) : session.isFetching || (enabled && inventory.isFetching) ? (
        <p role="status">{ru ? "Загрузка…" : "Loading…"}</p>
      ) : !enabled ? (
        <p className="text-sm">
          {ru
            ? "Создание героев пока недоступно этому аккаунту."
            : "Hero creation is not available for this account."}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm">
          {ru ? "Пока нет подходящих фишек уровня 3+." : "No eligible level 3+ chips yet."}
        </p>
      ) : (
        <>
          <div data-choice-rail-wrap>
            <div
              ref={chipRail}
              data-choice-rail
              onScroll={(e) => {
                const el = e.currentTarget;
                el.parentElement?.toggleAttribute(
                  "data-rail-end",
                  el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
                );
                el.parentElement?.toggleAttribute("data-rail-scrolled", el.scrollLeft > 2);
              }}
              className="flex gap-4 overflow-x-auto snap-x snap-proximity pb-2"
              aria-label={ru ? "Фишки для создания героя" : "Chips for hero creation"}
            >
              {rows.map((row) => {
                const busy = chipBusyView(row.chip, now, t);
                return (
                  <button
                    data-game-button="surface"
                    key={row.chip.id}
                    className="w-36 shrink-0 snap-start rounded-xl border border-border p-3 text-left disabled:opacity-50"
                    disabled={busy?.kind === "study"}
                    onClick={() =>
                      setSelected({
                        id: row.chip.id,
                        level: row.level,
                        name: row.name,
                        imageUrl: row.imageUrl,
                      })
                    }
                  >
                    {row.imageUrl && (
                      <ChipImage src={row.imageUrl} level={row.level} alt="" className="w-full" />
                    )}
                    <span data-chip-name className="block text-sm font-semibold" title={row.name}>
                      {row.name}
                    </span>

                    {busy && (
                      <span
                        data-chip-busy
                        className="block text-xs text-muted-foreground"
                        title={busy.hint}
                      >
                        {busy.hint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
      {selected && (
        <CastleConvertToHeroModal
          chipId={selected.id}
          chipLevel={selected.level}
          chipName={selected.name}
          chipImageUrl={selected.imageUrl}
          returnFocusRef={titleRef}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
