// Серийники при вводе NFT в игру.
//
// Тираж коллекции — жёсткий потолок: номер либо СВОЙ (закреплён за этой NFT
// при выводе), либо свободный из [1..тираж]. Раньше при исчерпанном тираже
// выдавался max+1, и у «Retro figurine» появились номера 5001-5013 при
// тираже 5000.
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";
import type { CycleBinding } from "@/lib/nftCycle";
import { secureRandomInt } from "@/lib/secureRandom";

/**
 * Свободный serial в коллекции.
 *
 * Раньше при исчерпанном тираже выдавался max+1 — так у «Retro figurine»
 * появились номера 5001-5013 при тираже 5000. Тираж — жёсткий потолок:
 * если свободных номеров нет, ввод не проходит.
 */
export async function pickFreeSerial(collectionId: string): Promise<number> {
  const col = await pg.chipCollections.findOne({ id: collectionId });
  const supply = col?.initial_supply ?? 0;
  const { data: usedRows } = await pg.userChipInventory
    .raw()
    .select("serial_no")
    .eq("collection_id", collectionId);
  const used = new Set<number>();
  for (const r of (usedRows ?? []) as Array<{ serial_no: number | null }>) {
    if (r.serial_no != null) used.add(r.serial_no);
  }
  const free: number[] = [];
  for (let i = 1; i <= supply; i++) if (!used.has(i)) free.push(i);
  if (free.length > 0) return free[secureRandomInt(0, free.length)];
  throw new Error(
    `В коллекции «${col?.name ?? collectionId}» не осталось свободных номеров тиража — ввод NFT невозможен`,
  );
}

/**
 * Номер для вводимой NFT: прежде всего её СОБСТВЕННЫЙ, закреплённый при выводе.
 * Привязка живёт в chip_nft_mints (contract, token_id) и не зависит от того,
 * кто именно вводит NFT обратно. Нет привязки или номер уже занят живой
 * фишкой — берём свободный из тиража.
 */
export async function serialForDeposit(
  contract: string,
  tokenId: string,
  collectionId: string,
): Promise<number> {
  const rows = (await mcpExec(
    `SELECT chip_id, serial_no FROM yuplink.chip_nft_mints
      WHERE contract = ${sqlStr(contract)} AND token_id = ${sqlStr(tokenId)}
        AND serial_no IS NOT NULL LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ chip_id: string | null; serial_no: number }>;
  const own = rows?.[0];
  if (own) {
    // Строка, за которой номер числился до вывода, освобождает его.
    if (own.chip_id) {
      await mcpExec(
        `UPDATE yuplink.user_chip_inventory SET serial_no = NULL
          WHERE id = ${sqlStr(own.chip_id)} AND serial_no = ${own.serial_no};`,
      );
    }
    const busy = (await mcpExec(
      `SELECT 1 AS x FROM yuplink.user_chip_inventory
        WHERE collection_id = ${sqlStr(collectionId)} AND serial_no = ${own.serial_no} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ x: number }>;
    if (!busy || busy.length === 0) return own.serial_no;
  }
  return pickFreeSerial(collectionId);
}

/**
 * Закрепить номер за NFT, у которой привязки не было (пришла со стороны).
 * Со следующего ввода она вернётся с этим же номером.
 */
export async function bindSerialToNft(args: {
  contract: string;
  tokenId: string;
  collectionId: string;
  templateId: string;
  level: number;
  serialNo: number;
  wallet: string;
}): Promise<void> {
  await mcpExec(
    `INSERT INTO yuplink.chip_nft_mints
       (contract, token_id, chip_id, collection_id, template_id, level, serial_no,
        minted_by, minted_at, returned_at, returned_to)
     VALUES (${sqlStr(args.contract)}, ${sqlStr(args.tokenId)}, NULL,
             ${sqlStr(args.collectionId)}, ${sqlStr(args.templateId)}, ${Number(args.level)},
             ${Number(args.serialNo)}, ${sqlStr(args.wallet)}, now(), now(), ${sqlStr(args.wallet)})
     ON CONFLICT (contract, token_id) DO UPDATE
        SET serial_no = COALESCE(yuplink.chip_nft_mints.serial_no, EXCLUDED.serial_no),
            returned_at = now(), returned_to = EXCLUDED.returned_to;`,
  ).catch((e) => console.warn("[nft-input] привязка номера не записалась:", e));
}

/**
 * Номер фишки, возвращаемой по кругу NFT.
 *
 * Свой номер круга — тот, под которым фишку вывели (привязка круга). Его
 * освобождает сожжённая при выводе фишка, и он возвращается хозяину NFT. Если
 * номер держит ДРУГАЯ живая фишка — чужое не трогаем: выдаём свободный из
 * тиража и громко пишем в лог (так проявляются старые двойные выдачи).
 * Привязки нет (NFT пришла со стороны или выехала мимо учёта) — прежнее
 * правило: закреплённый за NFT номер, иначе свободный.
 */
export async function serialForCycle(opts: {
  binding: CycleBinding | null;
  contract: string;
  tokenId: string;
  collectionId: string;
}): Promise<{ serial: number; own: boolean }> {
  const b = opts.binding;
  if (!b || b.serial == null) {
    const serial = await serialForDeposit(opts.contract, opts.tokenId, opts.collectionId);
    return { serial, own: false };
  }
  if (b.chipId) {
    await mcpExec(
      `UPDATE yuplink.user_chip_inventory SET serial_no = NULL
        WHERE id = ${sqlStr(b.chipId)} AND serial_no = ${b.serial} AND status = 'burned';`,
    );
  }
  const holders = (await mcpExec(
    `SELECT id, status FROM yuplink.user_chip_inventory
      WHERE collection_id = ${sqlStr(opts.collectionId)} AND serial_no = ${b.serial} LIMIT 3;`,
    { wrapJson: true },
  )) as Array<{ id: string; status: string }>;
  if (!holders || holders.length === 0) return { serial: b.serial, own: true };
  console.warn(
    `[nft-cycle] номер #${b.serial} NFT ${opts.tokenId} занят (${holders
      .map((h) => `${h.id}:${h.status}`)
      .join(", ")}) — выдаём свободный`,
  );
  return { serial: await pickFreeSerial(opts.collectionId), own: false };
}
