import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import {
  listChipPacksPublic,
  myChipPackGrants,
  openChipPack,
  openChipPacks,
} from "@/server/api/chips-pack";
import { listChipCollectionsPublic } from "@/server/api/chips-stake";
import { listMyMysticPacks } from "@/server/api/mystic";
import { MysticBoxesSection } from "@/components/MysticBoxesSection";
import type { MysticRewardDestination } from "@/lib/mysticRewardDestination";
import { humanError } from "@/lib/humanError";
import { PackDetails, type OwnedPackStack } from "./PackDetails";
import { PackReveal } from "./PackReveal";
import { PackNftInputAction } from "@/components/chips/PackNftInputAction";

import { PackBuyShelfSlot } from "./PackBuyShelfSlot";

type RevealItem = Awaited<ReturnType<typeof openChipPack>>["results"][number];

export function MyPacksScreen({ onViewMysticReward, giftPack, onBuyPacks }: { onViewMysticReward?: (kind: MysticRewardDestination) => void; giftPack?: { giftId: string; packId: string } | null; onBuyPacks?: () => void } = {}) {
  const ru = useAppStore((state) => state.lang) === "ru";
  const queryClient = useQueryClient();
  const packs = useQuery({ queryKey: ["my-chip-packs"], queryFn: () => myChipPackGrants() });
  const boxes = useQuery({ queryKey: ["my-mystic-packs"], queryFn: () => listMyMysticPacks() });
  const [selected, setSelected] = useState<OwnedPackStack | null>(null);
  const isChips = selected?.kind === "chips";
  const [reveal, setReveal] = useState<{ title: string; items: RevealItem[] } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const giftOpened = useRef(false);
  const title = useRef<HTMLHeadingElement | null>(null);
  const details = useQuery({
    queryKey: ["public-chip-packs"],
    queryFn: () => listChipPacksPublic(),
    enabled: !!selected && isChips,
  });
  const collections = useQuery({
    queryKey: ["chip-collections-public"],
    queryFn: () => listChipCollectionsPublic(),
    enabled: !!selected && isChips,
  });
  const close = () => {
    setSelected(null);
    requestAnimationFrame(() => (trigger.current?.isConnected ? trigger.current : title.current)?.focus());
  };
  const open = useMutation({
    mutationFn: ({ id, count }: { id: string; count: number }) =>
      openChipPacks({ data: { chipPackId: id, count } }),
    onSuccess: (result, args) => {
      const current = selected;
      setSelected(null);
      setReveal({
        title: `${current?.name ?? (ru ? "Пак" : "Pack")}${result.opened > 1 ? ` ×${result.opened}` : ""}`,
        items: result.results,
      });
      void queryClient.invalidateQueries({ queryKey: ["my-chip-packs"] });
      void queryClient.invalidateQueries({ queryKey: ["my-chip-inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["my-chip-history"] });
      if (args.count > result.opened)
        toast.error(ru ? "Часть паков не открылась" : "Some packs were not opened");
    },
    onError: (error: Error) => {
      toast.error(humanError(error));
    },
  });
  const selectedCount =
    selected && packs.data
      ? packs.data.filter((grant) => grant.chipPackId === selected.id && !grant.openedAt).length
      : null;
  useEffect(() => {
    if (!selected || selectedCount == null || open.isPending || selectedCount === selected.count)
      return;
    setSelected(null);
    toast.info(
      ru
        ? "Количество паков изменилось. Открой карточку снова."
        : "The pack count changed. Open its details again.",
    );
  }, [open.isPending, ru, selected, selectedCount]);
  useEffect(() => {
    if (!selected || !packs.isError || open.isPending) return;
    setSelected(null);
    toast.error(
      ru
        ? "Не удалось проверить паки. Повтори загрузку списка."
        : "Could not verify packs. Reload the list.",
    );
  }, [open.isPending, packs.isError, ru, selected]);
  const stackMap = new Map<string, OwnedPackStack>();
  for (const grant of packs.data ?? []) {
    if (grant.openedAt) continue;
    const previous = stackMap.get(grant.chipPackId);
    if (previous) previous.count += 1;
    else
      stackMap.set(grant.chipPackId, {
        id: grant.chipPackId,
        name: grant.packName,
        imageUrl: grant.packImageUrl,
        count: 1,
        kind: "chips",
      });
  }
  const stacks = [...stackMap.values()].sort((a, b) => b.count - a.count);
  const unopenedBoxes = (boxes.data ?? []).filter((box) => !box.opened);
  const visibleStacks = stacks;
  const waitingCount = unopenedBoxes.length + visibleStacks.reduce((sum, stack) => sum + stack.count, 0);
  useEffect(() => {
    if (!giftPack || giftOpened.current || packs.isFetching || packs.isError || !packs.data) return;
    const granted = packs.data.find((grant) => grant.sourceRef === `gift:${giftPack.giftId}:p0` && !grant.openedAt);
    if (!granted) return;
    const stack = stacks.find((item) => item.id === granted.chipPackId);
    if (!stack) return;
    giftOpened.current = true;
    setSelected(stack);
  }, [giftPack, packs.data, packs.isError, packs.isFetching, stacks]);

  return (
    <div className="pack-inventory">
      <div className="pack-inventory-toolbar">
        {packs.isSuccess && boxes.isSuccess && waitingCount > 0 && (
          <h2 ref={title} tabIndex={-1} className="pack-inventory-title">
            {ru ? "Ждут открытия" : "Waiting to open"} · {waitingCount}
          </h2>
        )}
        <PackNftInputAction />
      </div>
      {boxes.isLoading && !boxes.data && (
        <p role="status" className="pack-inventory-state">
          {ru ? "Загружаем мистические боксы…" : "Loading mystic boxes…"}
        </p>
      )}
      {boxes.isError && !boxes.data && (
        <div role="alert" className="pack-inventory-state">
          <p>{ru ? "Не удалось загрузить мистические боксы" : "Unable to load mystic boxes"}</p>
          <button onClick={() => void boxes.refetch()}>{ru ? "Повторить" : "Retry"}</button>
        </div>
      )}
      {boxes.data && <MysticBoxesSection onViewMysticReward={onViewMysticReward} initialPackId={giftPack?.packId} />}
      {packs.isLoading ? (
        <p role="status" className="pack-inventory-state">
          {ru ? "Загружаем паки…" : "Loading packs…"}
        </p>
      ) : packs.isError ? (
        <div role="alert" className="pack-inventory-state">
          <p>{ru ? "Не удалось загрузить паки" : "Unable to load packs"}</p>
          <button onClick={() => void packs.refetch()}>{ru ? "Повторить" : "Retry"}</button>
        </div>
      ) : visibleStacks.length > 0 || onBuyPacks ? (
        <>
          <div className="pack-shelf-grid">
            {visibleStacks.map((stack) => (
              <div className="pack-shelf-item" key={stack.id}>
                <button
                  type="button"
                  className="pack-shelf-trigger"
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    setSelected(stack);
                  }}
                  aria-label={
                    ru
                      ? `${stack.name}, ${stack.count} шт., посмотреть состав${stack.kind === "chips" ? " и открыть" : ""}`
                      : `${stack.name}, ${stack.count} owned, view contents${stack.kind === "chips" ? " and open" : ""}`
                  }
                >
                  <span className="pack-shelf-art">
                    {stack.imageUrl ? (
                      <img src={stack.imageUrl} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="pack-shelf-empty">
                        {ru ? "Арт пака недоступен" : "Pack art unavailable"}
                      </span>
                    )}
                    {stack.count > 1 && <span className="pack-shelf-qty">×{stack.count}</span>}
                  </span>
                  <span className="pack-shelf-name">{stack.name}</span>
                </button>
              </div>
            ))}
            {onBuyPacks && <PackBuyShelfSlot count={visibleStacks.length} onClick={onBuyPacks} ru={ru} />}
          </div>
        </>
      ) : boxes.isSuccess && unopenedBoxes.length === 0 ? (
        <p className="pack-inventory-state">{ru ? "Все паки открыты" : "All packs opened"}</p>
      ) : null}
      {selected && (
        <PackDetails
          stack={selected}
          pack={details.data?.find((pack) => pack.id === selected.id)}
          collections={collections.data}
          detailsLoading={details.isLoading || collections.isLoading}
          detailsError={details.isError || collections.isError}
          pending={open.isPending}
          allowMultiOpen
          canOpen={!packs.isFetching && !packs.isError && selectedCount === selected.count}
          onClose={close}
          onOpen={(count) => open.mutate({ id: selected.id, count })}
          onRetryDetails={() => {
            void details.refetch();
            void collections.refetch();
          }}
        />
      )}
      {reveal &&
        createPortal(
          <PackReveal
            title={reveal.title}
            items={reveal.items}
            onClose={() => {
              setReveal(null);
              requestAnimationFrame(() =>
                (trigger.current?.isConnected ? trigger.current : title.current)?.focus(),
              );
            }}
          />,
          document.body,
        )}
    </div>
  );
}


