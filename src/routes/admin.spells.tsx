// Админ · Заклинания: каталог для книги героя (yuplink.raid_spell).
//
// Своя страница, а не вкладка «Редактора ассетов»: тот ведёт mystic_item_template
// (мобы, боссы, артефакты, местность), а заклинания живут своей таблицей со
// своими полями — цена в энергии, откат, порог интеллекта. Стоит рядом с
// редактором карт: заведённым здесь заклинаниям учат столбы на карте.
import { createFileRoute } from "@tanstack/react-router";
import { SpellCatalog } from "@/components/admin/spells/SpellCatalog";

export const Route = createFileRoute("/admin/spells")({
  head: () => ({ meta: [{ title: "Заклинания" }, { name: "robots", content: "noindex" }] }),
  component: SpellCatalog,
});
