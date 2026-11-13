import {createContext} from "react";
import type {ReactNode} from "react";

// Building navigation stays the same action; the shop places it beside checkout.
export const MarketSecondaryAction = createContext<ReactNode>(null);
