// Рейтинг «Короны гречневого королевства»: по грече и по коронам из копилки
// (buckwheat_stats). Десять первых и своё место, если ты ниже.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { namesOf } from "../tournament/tour-board";

export type BwRatingRow = {
  place: number;
  name: string;
  grecha: number;
  crowns: number;
  own: boolean;
};
export type BwRating = { grecha: BwRatingRow[]; crowns: BwRatingRow[] };

const TOP = 10;
type Raw = { account_id: string; grecha: number; crowns: number; place: number };

async function board(account: string, by: "grecha" | "crowns"): Promise<Raw[]> {
  const order = by === "grecha" ? "grecha DESC, crowns DESC" : "crowns DESC, grecha DESC";
  return ((await mcpExec(
    `WITH r AS (
       SELECT account_id, grecha, crowns,
              row_number() OVER (ORDER BY ${order}, updated_at ASC) AS place
         FROM yuplink.buckwheat_stats WHERE games > 0)
     SELECT account_id, grecha, crowns, place FROM r
      WHERE place <= ${TOP} OR account_id = ${sqlStr(account)}
      ORDER BY place;`,
    { wrapJson: true },
  )) ?? []) as Raw[];
}

export async function ratingFor(account: string): Promise<BwRating> {
  const [g, c] = await Promise.all([board(account, "grecha"), board(account, "crowns")]);
  const names = await namesOf([...g, ...c].map((r) => r.account_id));
  const rows = (list: Raw[]): BwRatingRow[] =>
    list.map((r) => ({
      place: Number(r.place),
      name: names.get(r.account_id) ?? "—",
      grecha: Number(r.grecha) || 0,
      crowns: Number(r.crowns) || 0,
      own: r.account_id === account,
    }));
  return { grecha: rows(g), crowns: rows(c) };
}
