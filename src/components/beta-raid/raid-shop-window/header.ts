// Server upload filenames are lookup identifiers, not bundled image dependencies.
// Individual matching art takes priority over semantic fallback for other skins.
// The two concept headers have no corresponding building in the game.
const headers: Record<string, { file: string; position: string }> = {
  "ax3WuS6u8x.webp": { file: "bakery", position: "center 52%" },
  "qfv5rMuKdK.webp": { file: "armory", position: "center top" },
  "sk17da2ca599.png": { file: "grocery-white", position: "center 45%" },
  "JuOJJt_PBD.webp": { file: "heroes", position: "center 52%" },
  "UFczwMvU03.webp": { file: "food-market", position: "center 52%" },
  "5-xw27C95Y.webp": { file: "construction", position: "center 52%" },
  "2VdBpx7hUy.webp": { file: "seedlings", position: "center 45%" },
  "iRaIDO2wNV.webp": { file: "barracks", position: "center 38%" },
  "3k-4JcBQ-T.png": { file: "forest-barracks", position: "center 45%" },
  "4L5ZQJyp2m.webp": { file: "forge", position: "center 45%" },
  "Z5MnDvJ45J.webp": { file: "pawn", position: "center 52%" },
  "vo2fltwiAU.webp": { file: "enchant", position: "center 45%" },
  "D1mBVX_8v4.webp": { file: "smelter", position: "center 45%" },
};

type ShopContext = {name?: string | null; kind?: string | null; repair?: boolean};

/** Keep individual approved art; unknown skins use the shop's semantic role. */
function fallbackHeader({name, kind, repair}: ShopContext) {
  const label = (name ?? '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е');
  if (repair) return 'forge';
  if (kind === 'enchant') return 'enchant';
  const rules: Array<[RegExp, string]> = [
    [/кузниц|мастерск|forge|smith|workshop/, 'forge'],
    [/плавил|smelt/, 'smelter'],
    [/зачар|enchant/, 'enchant'],
    [/лесн.*казарм|forest.*barrack/, 'forest-barracks'],
    [/казарм|найм.*во[ийе]н|barrack|recruit/, 'barracks'],
    [/ломбард|pawn/, 'pawn'],
    [/пекар|лепеш|выпеч|bakery|baker/, 'bakery'],
    [/сажен|seedling|nursery/, 'seedlings'],
    [/оруж|armory|armoury|weapon/, 'armory'],
    [/геро|hero/, 'heroes'],
    [/строител|строймат|каменщик|construction|building material/, 'construction'],
    [/алхим|зель|alchem|potion/, 'enchant'],
  ];
  return rules.find(([pattern]) => pattern.test(label))?.[1] ?? (kind === 'market' ? 'food-market' : null);
}

export function raidShopHeader(imageUrl: string | null | undefined, context: ShopContext = {}) {
  let match: {file: string; position: string} | undefined;
  if (imageUrl) {
    try {
      const pathname = new URL(imageUrl, 'https://yuplink.invalid').pathname;
      if (pathname.startsWith('/uploads/tasks/')) {
        // Image optimisation may change only the file extension.
        const stem = pathname.slice('/uploads/tasks/'.length).replace(/\.(?:png|webp|jpe?g)$/i, '');
        match = Object.entries(headers).find(([file]) => file.replace(/\.[^.]+$/, '') === stem)?.[1];
      }
    } catch { /* Malformed or missing artwork must not remove a shop's header. */ }
  }
  const file = match?.file ?? fallbackHeader(context);
  return file ? {src: `/raid-shops/headers/${file}.webp?v=light-20261101`, position: match?.position ?? 'center 45%'} : null;
}

