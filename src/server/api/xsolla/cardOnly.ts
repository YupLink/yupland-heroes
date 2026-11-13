// «Только Google» платит за золото и подписки картой ($) или DARAI со счёта (владелец,
// 13.11.2026: «тут должно быть именно $» → «должна быть возможность купить за дараи —
// этот ресурс попадается на карте»; ПРАВИЛА §8.127 п. 3). USDT и звёзды — отказ.
import { getSessionTgId } from "../../auth";
import { isGoogleOnlyTg } from "@/lib/auth/googleTg";

export function assertNotCardOnly(token: string): void {
  if (token !== "Darai" && isGoogleOnlyTg(getSessionTgId())) throw new Error("card.only");
}
