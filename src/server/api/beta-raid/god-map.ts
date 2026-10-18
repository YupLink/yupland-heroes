// Карта режима бога — та, где админ сейчас стоит (этажи — отдельные карты,
// владелец 07.10.2026). Раньше правки режима бога шли в главную карту: с
// другого этажа они легли бы по тем же координатам чужого мира.
//
// Проверяет и права: звать можно вместо requireAdmin().
import { requireAdmin } from "../../auth";
import { myMapId } from "./encounter-where";

export async function godMapId(): Promise<string> {
  return myMapId(requireAdmin());
}
