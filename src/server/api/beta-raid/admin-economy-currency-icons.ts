// Иконки валют/ресурсов для сводки Экономики.
//
// Картинки собираются с трёх сторон:
//   • ресурсы (gold/stone/wood/…) — статические пути из public/resources;
//   • токены/паки/герои/арты — картинки шаблонов;
//   • custom-товары — картинка первого найденного маркета.
//
// Один общий источник, потому что сам «ключ валюты» у игрока формы
// `gold`/`token:DARAI`/`custom:name:пшеница` / `pack:XXX`, и клиенту без
// сервера правильных ссылок не собрать: у него нет доступа к таблицам.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

const RESOURCE_ICON: Record<string, string> = {
  gold: "/resources/gold.webp",
  stone: "/resources/stone.webp",
  wood: "/resources/wood.webp",
  diamonds: "/resources/crystal.webp",
  crystal: "/resources/crystal.webp",
  likes: "/resources/likes.webp",
  energy: "/resources/energy.webp",
};

const CURRENCY_LABEL: Record<string, string> = {
  likes: "Лайки",
  tickets: "Билеты",
  energy: "Энергия",
  gold: "Золото",
  stone: "Камень",
  wood: "Дерево",
  diamonds: "Алмазы",
  crystal: "Кристаллы",
};

/** Человеко-читаемое имя валюты (единый порядок и подписи для клиента). */
export function labelForCurrency(key: string): string {
  if (CURRENCY_LABEL[key]) return CURRENCY_LABEL[key];
  if (key.startsWith("token:")) return key.slice("token:".length);
  if (key.startsWith("resource:token:")) return key.slice("resource:token:".length);
  if (key.startsWith("resource:")) return labelForCurrency(key.slice("resource:".length));
  if (key.startsWith("custom:name:")) return key.slice("custom:name:".length);
  if (key.startsWith("pack:")) return `Пак ${key.slice("pack:".length).slice(0, 8)}`;
  if (key.startsWith("hero:")) return `Герой ${key.slice("hero:".length).slice(0, 8)}`;
  if (key.startsWith("art:")) return `Арт ${key.slice("art:".length).slice(0, 8)}`;
  if (key.startsWith("boss:")) return `Босс ${key.slice("boss:".length).slice(0, 8)}`;
  return key;
}

/**
 * Собрать иконки для всех ключей игроков. Ресурсы — статикой из public/,
 * токены и custom — из маркета, паки/герои/арты — из mystic_item_template,
 * боссы — из raid_boss_template (у них своё хранилище картинок).
 */
export async function fetchCurrencyIcons(keys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const tokens = new Set<string>();
  const customNames = new Set<string>();
  const templateIds = new Set<string>();
  const bossIds = new Set<string>();

  for (const k of keys) {
    if (RESOURCE_ICON[k]) {
      out.set(k, RESOURCE_ICON[k]);
      continue;
    }
    if (k.startsWith("token:")) tokens.add(k.slice("token:".length));
    else if (k.startsWith("custom:name:")) customNames.add(k.slice("custom:name:".length));
    else if (k.startsWith("boss:")) bossIds.add(k.slice("boss:".length));
    else if (
      k.startsWith("pack:") ||
      k.startsWith("hero:") ||
      k.startsWith("art:")
    ) {
      templateIds.add(k.slice(k.indexOf(":") + 1));
    }
  }

  // Токены и custom-товары — картинки берём из маркета: она уже показана
  // игроку, и совпадёт с тем, что он видел при покупке.
  if (tokens.size > 0 || customNames.size > 0) {
    const filters: string[] = [];
    if (tokens.size > 0) {
      const list = [...tokens].map((t) => sqlStr(t)).join(",");
      filters.push(`(kind='resource' AND ref_id='token' AND give_token IN (${list}))`);
    }
    if (customNames.size > 0) {
      const list = [...customNames].map((n) => sqlStr(n)).join(",");
      filters.push(`(kind='custom' AND lower(trim(name)) IN (${list}))`);
    }
    const rows = (await mcpExec(
      `SELECT DISTINCT ON (kind, coalesce(give_token, lower(trim(name))))
              kind, give_token, name, image
         FROM yuplink.raid_market_item
        WHERE image IS NOT NULL AND (${filters.join(" OR ")});`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{
      kind: string;
      give_token: string | null;
      name: string;
      image: string | null;
    }>;
    for (const r of rows ?? []) {
      if (!r.image) continue;
      if (r.kind === "resource" && r.give_token) {
        out.set(`token:${r.give_token}`, r.image);
      } else if (r.kind === "custom") {
        out.set(`custom:name:${r.name.trim().toLowerCase().replace(/\s+/g, " ")}`, r.image);
      }
    }
  }

  // Паки/герои/арты — из шаблонов (land = картинка).
  if (templateIds.size > 0) {
    const list = [...templateIds].map((id) => sqlStr(id)).join(",");
    const rows = (await mcpExec(
      `SELECT id, kind, land FROM yuplink.mystic_item_template
        WHERE id IN (${list}) AND land IS NOT NULL;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ id: string; kind: string; land: string | null }>;
    for (const r of rows ?? []) {
      if (!r.land) continue;
      const prefix = r.kind === "artifact" ? "art" : r.kind;
      out.set(`${prefix}:${r.id}`, r.land);
    }
  }

  // Боссы — своё хранилище (image_url; fallback на land).
  if (bossIds.size > 0) {
    const list = [...bossIds].map((id) => sqlStr(id)).join(",");
    const rows = (await mcpExec(
      `SELECT id, coalesce(image_url, land) AS img FROM yuplink.raid_boss_template
        WHERE id IN (${list}) AND coalesce(image_url, land) IS NOT NULL;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{ id: string; img: string | null }>;
    for (const r of rows ?? []) {
      if (!r.img) continue;
      out.set(`boss:${r.id}`, r.img);
    }
  }

  return out;
}

/**
 * Порядок валют для UI сводки: сначала «деньги» (лайки/билеты/энергия →
 * ресурсы → токены), затем всё материальное (custom/пак/герой/арт/босс).
 * Внутри группы — по алфавиту подписи. Клиент кладёт в таблицу в этом же
 * порядке, никакого «отсортируй заново».
 */
const CURRENCY_ORDER: Record<string, number> = {
  likes: 0,
  tickets: 1,
  energy: 2,
  gold: 10,
  stone: 11,
  wood: 12,
  diamonds: 13,
  crystal: 14,
};

export function currencyGroup(key: string): { g: number; r: number } {
  if (CURRENCY_ORDER[key] != null) return { g: 0, r: CURRENCY_ORDER[key] };
  if (key.startsWith("token:") || key.startsWith("resource:token:")) return { g: 1, r: 0 };
  if (key.startsWith("resource:")) return { g: 0, r: 100 };
  if (key.startsWith("custom:")) return { g: 2, r: 0 };
  if (key.startsWith("pack:")) return { g: 3, r: 0 };
  if (key.startsWith("hero:")) return { g: 4, r: 0 };
  if (key.startsWith("art:")) return { g: 5, r: 0 };
  if (key.startsWith("boss:")) return { g: 6, r: 0 };
  return { g: 9, r: 0 };
}

export function sortCurrencyKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ga = currencyGroup(a);
    const gb = currencyGroup(b);
    if (ga.g !== gb.g) return ga.g - gb.g;
    if (ga.r !== gb.r) return ga.r - gb.r;
    return labelForCurrency(a).localeCompare(labelForCurrency(b));
  });
}
