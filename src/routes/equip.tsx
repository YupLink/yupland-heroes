// Превью-страница «Экипировка героя» в стиле Heroes-3: кукла героя со слотами
// по бокам, в слоты ставятся артефакты (по полю slot). Отдельная страница,
// пока для превью раскладки (экипировка — клиентское состояние, без сервера).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2, X, Users } from "lucide-react";
import { listMyItems } from "@/server/api/items";
import { heroRarity, metaLabel, stripStatSuffix } from "@/components/heroMeta";
import { StatBadge } from "@/components/itemStat";
import { thumb } from "@/lib/image";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/equip")({
  head: () => ({
    meta: [
      { title: "Экипировка героя — YupLink" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EquipPage,
});

type Item = Awaited<ReturnType<typeof listMyItems>>[number];
const LEFT_SLOTS = ["Голова", "Шея", "Тело", "Ноги"] as const;
const RIGHT_SLOTS = ["Правая рука", "Левая рука", "Руки", "Карманы"] as const;
const RARITY_RING: Record<string, string> = {
  common: "#9aa4bd",
  rare: "#5b9bff",
  epic: "#b46bff",
  legendary: "#f5c451",
};
const artRing = (it: Item) =>
  it.rarity ? RARITY_RING[it.rarity] ?? "#9aa4bd" : "#9aa4bd";

function EquipPage() {
  const lang = useLang();
  const items = useQuery({
    queryKey: ["my-game-items"],
    queryFn: () => listMyItems(),
  });
  const [equipped, setEquipped] = useState<Record<string, string | null>>({});
  const [heroId, setHeroId] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [heroPicker, setHeroPicker] = useState(false);

  const all = items.data ?? [];
  const artifacts = all.filter((i) => i.kind === "artifact");
  const heroes = all.filter((i) => i.kind === "hero");
  const hero = heroes.find((h) => h.id === heroId) ?? heroes[0] ?? null;
  const equippedItem = (slot: string) =>
    artifacts.find((a) => a.id === equipped[slot]);
  const forSlot = (slot: string) => artifacts.filter((a) => a.slot === slot);
  const heroColor = hero ? heroRarity(hero.level).color : "#41d3c6";

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_50%_at_25%_15%,rgba(255,184,0,0.14),transparent_70%),radial-gradient(50%_50%_at_85%_70%,rgba(56,189,248,0.08),transparent_70%)]"
      />
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/60 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <Link
            to="/home"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-xs font-medium transition hover:bg-secondary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            YupLink
          </Link>
          <div className="text-base font-bold uppercase tracking-[0.2em]">
            Экипировка
          </div>
          <span className="w-16" />
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-16 pt-4">
        {items.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Кукла: слева слоты — центр герой — справа слоты */}
            <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-3xl border border-border/70 bg-card/40 p-3 sm:gap-5 sm:p-5">
              <div className="flex flex-col gap-2 sm:gap-3">
                {LEFT_SLOTS.map((s) => (
                  <SlotCell
                    key={s}
                    label={metaLabel(s, lang)}
                    item={equippedItem(s)}
                    onClick={() => setPicker(s)}
                    onClear={() => setEquipped((e) => ({ ...e, [s]: null }))}
                  />
                ))}
              </div>

              {/* Портрет героя */}
              <button
                type="button"
                onClick={() => setHeroPicker(true)}
                className="mx-auto flex flex-col items-center gap-2"
              >
                <div
                  className="relative aspect-[3/4] w-full max-w-[220px] overflow-hidden rounded-2xl border-2 bg-secondary/40"
                  style={{ borderColor: heroColor + "99" }}
                >
                  {hero?.imageUrl ? (
                    <img
                      src={thumb(hero.imageUrl, 520)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className="grid h-full place-items-center text-6xl"
                      style={{ color: heroColor }}
                    >
                      ♞
                    </div>
                  )}
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white">
                    {hero ? stripStatSuffix(hero.name) : "выбери героя"}
                  </span>
                </div>
                {hero && (hero.race || hero.specialization) && (
                  <div className="text-[11px] text-muted-foreground">
                    {[hero.race, hero.specialization]
                      .filter(Boolean)
                      .map((v) => metaLabel(v, lang))
                      .join(" · ")}
                  </div>
                )}
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                  <Users className="h-3 w-3" /> сменить героя
                </span>
              </button>

              <div className="flex flex-col gap-2 sm:gap-3">
                {RIGHT_SLOTS.map((s) => (
                  <SlotCell
                    key={s}
                    label={metaLabel(s, lang)}
                    item={equippedItem(s)}
                    onClick={() => setPicker(s)}
                    onClear={() => setEquipped((e) => ({ ...e, [s]: null }))}
                  />
                ))}
              </div>
            </div>

            {/* Инвентарь артефактов */}
            <div className="mt-4">
              <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Артефакты · {artifacts.length}
              </div>
              {artifacts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
                  Артефактов пока нет.
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {artifacts.map((a) => (
                    <ArtMini
                      key={a.id}
                      it={a}
                      onClick={() =>
                        a.slot && setEquipped((e) => ({ ...e, [a.slot!]: a.id }))
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {picker && (
        <PickerModal
          title={picker}
          arts={forSlot(picker)}
          onPick={(id) => {
            setEquipped((e) => ({ ...e, [picker]: id }));
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {heroPicker && (
        <HeroPickerModal
          heroes={heroes}
          onPick={(id) => {
            setHeroId(id);
            setHeroPicker(false);
          }}
          onClose={() => setHeroPicker(false)}
        />
      )}
    </div>
  );
}

function SlotCell({
  label,
  item,
  onClick,
  onClear,
}: {
  label: string;
  item: Item | undefined;
  onClick: () => void;
  onClear: () => void;
}) {
  const ring = item ? artRing(item) : "#3a4152";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onClick}
        className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-xl border-2 bg-secondary/40 transition hover:brightness-110 sm:h-16 sm:w-16"
        style={{ borderColor: ring + (item ? "99" : "55") }}
      >
        {item ? (
          <>
            <img
              src={thumb(item.imageUrl, 120)}
              alt=""
              className="h-full w-full object-cover"
            />
            {item.statType && (
              <span className="absolute right-0.5 top-0.5 scale-90">
                <StatBadge stat={item.statType} amount={item.statAmount} />
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="absolute left-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-white"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </>
        ) : (
          <span className="text-[8px] leading-tight text-muted-foreground">
            +
          </span>
        )}
      </button>
      <span className="max-w-[64px] truncate text-[8px] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function ArtMini({ it, onClick }: { it: Item; onClick: () => void }) {
  const lang = useLang();
  const ring = artRing(it);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!it.slot}
      className="relative aspect-square overflow-hidden rounded-xl border-2 bg-secondary/40 transition hover:brightness-110 disabled:opacity-40"
      style={{ borderColor: ring + "77" }}
      title={it.slot ? `Надеть: ${metaLabel(it.slot, lang)}` : "Слот не задан"}
    >
      {it.imageUrl ? (
        <img src={thumb(it.imageUrl, 120)} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center text-lg" style={{ color: ring }}>
          ◆
        </div>
      )}
      {it.statType && (
        <span className="absolute right-0.5 top-0.5 scale-90">
          <StatBadge stat={it.statType} amount={it.statAmount} />
        </span>
      )}
    </button>
  );
}

function PickerModal({
  title,
  arts,
  onPick,
  onClose,
}: {
  title: string;
  arts: Item[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const lang = useLang();
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-bold">Слот: {metaLabel(title, lang)}</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        {arts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Нет артефактов для этого слота.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {arts.map((a) => (
              <ArtMini key={a.id} it={a} onClick={() => onPick(a.id)} />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function HeroPickerModal({
  heroes,
  onPick,
  onClose,
}: {
  heroes: Item[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-4 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-bold">Выбери героя</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        {heroes.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Героев пока нет.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {heroes.map((h) => (
              <button
                key={h.id}
                onClick={() => onPick(h.id)}
                className="overflow-hidden rounded-xl border-2 bg-secondary/40"
                style={{ borderColor: heroRarity(h.level).color + "77" }}
              >
                <div className="aspect-square w-full">
                  {h.imageUrl ? (
                    <img src={thumb(h.imageUrl, 200)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-2xl">♞</div>
                  )}
                </div>
                <div className="truncate p-1 text-[10px] font-semibold">
                  {stripStatSuffix(h.name)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
