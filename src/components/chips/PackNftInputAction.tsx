import { useRef, useState } from "react";
import { Gem } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { NftInputModal } from "./NftInputModal";
import "./pack-nft-input-action.css";

/** The same NFT entry in every owned-packs screen. The existing modal owns the transfer. */
export function PackNftInputAction() {
  const ru = useAppStore((state) => state.lang) === "ru";
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected) trigger.current.focus();
    });
  };

  return <>
    <button
      ref={trigger}
      type="button"
      className="pack-nft-input-action"
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
    >
      <Gem aria-hidden="true" />
      <span>{ru ? "Внести NFT" : "Add NFT"}</span>
    </button>
    {open && <NftInputModal onClose={close} stayOnPacks />}
  </>;
}
