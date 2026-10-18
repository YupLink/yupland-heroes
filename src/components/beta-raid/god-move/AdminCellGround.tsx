// Строки окна клетки про то, что лежит на земле: сундук и мешочки — с
// «Переместить». Состав — useCellGround (сервер, любая клетка карты).
import { useT } from "@/lib/i18n";
import { Row } from "@/components/beta-raid/AdminCellRow";
import { GodMoveButton } from "@/components/beta-raid/god-move/GodMoveButton";
import type { GodMovePick } from "@/components/beta-raid/god-move/useGodMove";
import type { GroundView } from "@/server/api/beta-raid/god-move/move-ground";

export function AdminCellGround({
  ground,
  onMove,
}: {
  ground: GroundView | undefined;
  onMove: (pick: GodMovePick) => void;
}) {
  const t = useT();
  const chest = ground?.chest;
  const bags = ground?.bags;
  return (
    <>
      {chest && (
        <Row label={t("godmove.row.chest")}>
          {chest.name || t("godmove.kind.chest")}
          {chest.buried && <span className="text-muted-foreground">· {t("godmove.buried")}</span>}
          <GodMoveButton
            onClick={() =>
              onMove({ kind: "chest", ref: chest.ref, name: chest.name || t("godmove.kind.chest") })
            }
          />
        </Row>
      )}
      {bags && (
        <Row label={t("godmove.row.bags")}>
          {bags.ids.length}
          <GodMoveButton
            onClick={() =>
              onMove({ kind: "bags", ref: bags.ids.join(","), name: String(bags.ids.length) })
            }
          />
        </Row>
      )}
    </>
  );
}
