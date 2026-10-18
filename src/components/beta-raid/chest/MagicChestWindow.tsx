// Окно магического сундука. Свой — «Открыть · N⚡», «Забрать сундук» и
// «Закопать»; чужой (29–30.09) — бой с живой охраной, без неё — «Открыть · N⚡»
// (берёт из сети хозяина и кладёт в неё собранное), «Забрать сундук» и
// «Закопать». Захвата и «Разграбить» больше нет.
import { Footprints } from "lucide-react";
import { useT, useLang } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { ChestSheet } from "@/components/beta-raid/chest/ChestSheet";
import { ChestOwnerMenu } from "@/components/beta-raid/chest/ChestOwnerMenu";
import { ChestForeignPanel } from "@/components/beta-raid/chest/ChestForeignPanel";
import { useChestGuard } from "@/components/beta-raid/chest/useChestViews";
import type { OpenChest, useMagicChests } from "@/components/beta-raid/chest/useMagicChests";
import { PlainChestWindow } from "@/components/beta-raid/plain-chest/PlainChestWindow";

export function MagicChestWindow({
  chest,
  onClose,
  onGoTo,
}: {
  chest: OpenChest;
  onClose: () => void;
  /** «Идти сюда»: тап по сундуку открывает окно, а встать на клетку надо уметь. */
  onGoTo?: (q: number, r: number) => void;
}) {
  const t = useT();
  const lang = useLang();
  const { q, r, mine } = chest;
  // Имя хозяина едет с охраной; панель чужого читает тот же ключ — запрос один.
  const owner = useChestGuard(q, r, !mine).data?.ownerName ?? null;
  const subtitle = mine
    ? t("chest.mine")
    : owner
      ? t("chest.owner", { name: owner })
      : t("chest.foreign");

  return (
    <ChestSheet
      title={localizeAssetName(chest.name, lang) || t("chest.title")}
      subtitle={subtitle}
      tone={mine ? "own" : "foreign"}
      onClose={onClose}
    >
      {mine ? (
        <ChestOwnerMenu q={q} r={r} onClose={onClose} />
      ) : (
        <ChestForeignPanel q={q} r={r} onClose={onClose} />
      )}

      {onGoTo && (
        <button
          type="button"
          onClick={() => onGoTo(q, r)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border px-4 py-2.5 text-sm font-semibold"
        >
          <Footprints className="h-4 w-4" />
          {t("braid.go_here")}
        </button>
      )}
    </ChestSheet>
  );
}

/** Окно открытого сундука для экрана рейда: «Идти сюда» закрывает окно и ведёт героя. */
export function MagicChestOverlay({
  layer,
  walkTo,
}: {
  layer: ReturnType<typeof useMagicChests>;
  walkTo: (q: number, r: number) => unknown;
}) {
  if (!layer.open) return null;
  const onGoTo = (q: number, r: number) => {
    layer.close();
    void walkTo(q, r);
  };
  // Ключ клетки: другой сундук — чистое окно (и свой вход, useOpenStorage).
  const key = `${layer.open.q},${layer.open.r}`;
  // Обычный сундук (lib/plainChest) — своё окно-склад.
  if (layer.open.plain) {
    return <PlainChestWindow key={key} chest={layer.open} onClose={layer.close} onGoTo={onGoTo} />;
  }
  return <MagicChestWindow key={key} chest={layer.open} onClose={layer.close} onGoTo={onGoTo} />;
}
