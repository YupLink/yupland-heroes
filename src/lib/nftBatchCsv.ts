// Парсинг CSV для батч-раздачи NFT.
//
// Договорённость (задаёт юзер):
//   • ТАЙТЛ NFT берётся из ИМЕНИ ФАЙЛА без расширения и без хвоста после
//     последнего "_" (хвост = объявленное кол-во). Подчёркивания → пробелы.
//       "Gypsy_microphone_(soon)_40.csv" → title "Gypsy microphone (soon)", qty 40
//   • ПОЛУЧАТЕЛИ — из содержимого: строки "wallet,count" (заголовок wallet,count
//     пропускается). Разделители: запятая/точка-с-запятой/таб.

export interface CsvRecipient {
  wallet: string;
  count: number;
}

export interface ParsedNftCsv {
  title: string;
  declaredQty: number | null; // хвост _N из имени файла
  recipients: CsvRecipient[];
  totalCount: number; // сумма count по получателям
  warnings: string[];
}

/** Имя файла → { тайтл, объявленное кол-во }. */
export function parseNftFilename(filename: string): {
  title: string;
  declaredQty: number | null;
} {
  // отрезаем путь и расширение
  let base = filename.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]+$/i, "");
  let declaredQty: number | null = null;
  const lastUS = base.lastIndexOf("_");
  if (lastUS > 0) {
    const tail = base.slice(lastUS + 1);
    if (/^\d+$/.test(tail)) {
      declaredQty = parseInt(tail, 10);
      base = base.slice(0, lastUS);
    }
  }
  const title = base.replace(/_/g, " ").trim();
  return { title, declaredQty };
}

/** Полный разбор: имя файла + содержимое. */
export function parseNftCsv(filename: string, content: string): ParsedNftCsv {
  const { title, declaredQty } = parseNftFilename(filename);
  const warnings: string[] = [];
  const recipients: CsvRecipient[] = [];

  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parts = line.split(/[,;\t]/).map((p) => p.trim());
    const wallet = parts[0] ?? "";
    const countRaw = parts[1] ?? "";
    if (!wallet) continue;
    if (/^wallet$/i.test(wallet)) continue; // заголовок
    if (!/^\d+$/.test(countRaw)) {
      warnings.push(`Пропущена строка (count не число): "${line}"`);
      continue;
    }
    const count = parseInt(countRaw, 10);
    if (count <= 0) {
      warnings.push(`Пропущена строка (count ≤ 0): "${line}"`);
      continue;
    }
    recipients.push({ wallet, count });
  }

  const totalCount = recipients.reduce((s, r) => s + r.count, 0);

  if (!title) warnings.push("Не удалось определить тайтл NFT из имени файла");
  if (recipients.length === 0)
    warnings.push("В файле нет валидных получателей (строк wallet,count)");
  if (declaredQty != null && declaredQty !== totalCount)
    warnings.push(
      `Хвост имени файла = ${declaredQty}, а сумма count в файле = ${totalCount}`
    );

  return { title, declaredQty, recipients, totalCount, warnings };
}

/**
 * Раскладывает token_id'ы по получателям по их count'ам (по порядку).
 * Требует tokenIds.length >= сумме count. Возвращает плоский список переводов.
 */
export function buildTransfers(
  recipients: CsvRecipient[],
  tokenIds: string[]
): Array<{ tokenId: string; recipient: string }> {
  const out: Array<{ tokenId: string; recipient: string }> = [];
  let idx = 0;
  for (const r of recipients) {
    for (let i = 0; i < r.count; i++) {
      if (idx >= tokenIds.length) return out; // защита; вызывающий валидирует заранее
      out.push({ tokenId: tokenIds[idx++], recipient: r.wallet });
    }
  }
  return out;
}

/**
 * Раскладывает: имеющиеся token_id → переводы (по порядку получателей), а то,
 * на что токенов не хватило → минт (дефицит по каждому получателю).
 */
export function allocate(
  recipients: CsvRecipient[],
  tokenIds: string[]
): {
  transfers: Array<{ tokenId: string; recipient: string }>;
  mints: Array<{ wallet: string; count: number }>;
} {
  const transfers: Array<{ tokenId: string; recipient: string }> = [];
  const mints: Array<{ wallet: string; count: number }> = [];
  let idx = 0;
  for (const r of recipients) {
    let remaining = r.count;
    while (remaining > 0 && idx < tokenIds.length) {
      transfers.push({ tokenId: tokenIds[idx++], recipient: r.wallet });
      remaining--;
    }
    if (remaining > 0) mints.push({ wallet: r.wallet, count: remaining });
  }
  return { transfers, mints };
}
