// Довыбор приза: КАКОЙ токен, ресурс, бокс, артефакт или герой.
//
// Пикеры — те же, что у наград и раздач админки: артефакт/герой —
// ItemPickerSelect (картинка + редкость), токены — справочник listRewardTokens,
// ресурсы — REWARD_RESOURCES (ровно то, что умеет подарок: золото, камень,
// дерево, алмазы) со спрайтами из resourceIcons. Ключи кэша общие с соседями.
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { REWARD_RESOURCES, rewardKindImage, rewardKindLabelKey } from "@/lib/rewardKinds";
import { TOUR_DARAI } from "@/lib/tournament/types";
import { isUsdt } from "@/lib/usdtBanned";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { adminListItems } from "@/server/api/items";
import { ItemPickerSelect } from "@/components/admin/ItemPickerSelect";
import type { ItemRow } from "@/components/admin/itemsAdminShared";
import { TourPackSelect } from "./TourPackSelect";
import { TourCustomSelect } from "./TourCustomSelect";
import { TourArtRarityPick } from "./TourArtRarityPick";
import { chipCls } from "./tourCls";
import type { PrizeDraft, PrizeUiKind } from "./tourDraft";

type Patch = Partial<PrizeDraft>;

/** Подписи ресурсов в словаре строчные («золото») — на кнопке с заглавной. */
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function TourPrizeRefPicker({
  ui,
  prize,
  onPatch,
}: {
  ui: PrizeUiKind;
  prize: PrizeDraft;
  onPatch: (p: Patch) => void;
}) {
  if (ui === "token")
    return <TokenChips value={prize.refId} onPick={(s) => onPatch({ refId: s })} />;
  if (ui === "resource")
    return <ResourceChips value={prize.refId} onPick={(r) => onPatch({ refId: r })} />;
  if (ui === "pack") {
    return (
      <TourPackSelect
        value={prize.refId}
        onPick={(p) => onPatch({ refId: p.id, title: p.name, image: p.image })}
      />
    );
  }
  if (ui === "custom") {
    return (
      <TourCustomSelect
        value={prize.refId}
        onPick={(c) => onPatch({ refId: c.id, title: c.name, image: c.image })}
      />
    );
  }
  if (ui === "art_rarity") return <TourArtRarityPick prize={prize} onPatch={onPatch} />;
  if (ui === "art" || ui === "hero" || ui === "item")
    return <ItemPick ui={ui} prize={prize} onPatch={onPatch} />;
  return null;
}

function TokenChips({ value, onPick }: { value: string | null; onPick: (s: string) => void }) {
  const t = useT();
  const q = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  // DARAI — тоже токен (владелец, 04.10): первым в списке. USDT — нет (§8.49а).
  const rest = (q.data ?? []).map((x) => x.symbol).filter((s) => s !== TOUR_DARAI && !isUsdt(s));
  const symbols = [TOUR_DARAI, ...rest];
  return (
    <div className="flex flex-wrap items-center gap-1">
      {!q.isLoading && symbols.length === 0 && (
        <span className="text-xs text-muted-foreground">{t("tour.adm.no_tokens")}</span>
      )}
      {symbols.map((s) => (
        <button key={s} type="button" onClick={() => onPick(s)} className={chipCls(value === s)}>
          {s}
        </button>
      ))}
    </div>
  );
}

function ResourceChips({ value, onPick }: { value: string | null; onPick: (r: string) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1">
      {REWARD_RESOURCES.map((r) => {
        const src = rewardKindImage(r);
        const key = rewardKindLabelKey(r);
        return (
          <button
            key={r}
            type="button"
            onClick={() => onPick(r)}
            className={cn(chipCls(value === r), "inline-flex items-center gap-1.5")}
          >
            {src && <img src={src} alt="" className="h-5 w-5 object-contain" />}
            {cap(key ? t(key) : r)}
          </button>
        );
      })}
    </div>
  );
}

/** Артефакт, герой или (пришедший с сервера) предмет — из справочника шаблонов. */
function ItemPick({
  ui,
  prize,
  onPatch,
}: {
  ui: "art" | "hero" | "item";
  prize: PrizeDraft;
  onPatch: (p: Patch) => void;
}) {
  const t = useT();
  const arts = useQuery({
    queryKey: ["admin-items", "artifact"],
    queryFn: () => adminListItems({ data: { kind: "artifact" } }),
    enabled: ui !== "hero",
  });
  const heroes = useQuery({
    queryKey: ["admin-items", "hero"],
    queryFn: () => adminListItems({ data: { kind: "hero" } }),
    enabled: ui !== "art",
  });
  const pool: ItemRow[] =
    ui === "art"
      ? (arts.data ?? [])
      : ui === "hero"
        ? (heroes.data ?? [])
        : [...(arts.data ?? []), ...(heroes.data ?? [])];
  // Выключенное из игры как приз не предлагаем; уже выбранное — видно.
  const items = pool.filter((i) => i.active || i.id === prize.refId);
  return (
    <ItemPickerSelect
      items={items}
      value={prize.refId ?? ""}
      placeholder={t(ui === "hero" ? "tour.adm.pick_hero" : "tour.adm.pick_art")}
      onChange={(id) => {
        const it = items.find((x) => x.id === id);
        if (!it) return;
        // Вид подарка — по шаблону, как у выдачи предмета (server items.ts).
        const kind = it.kind === "hero" ? "hero" : it.kind === "artifact" ? "art" : "item";
        onPatch({ kind, refId: it.id, title: it.name, image: it.imageUrl ?? null });
      }}
    />
  );
}
