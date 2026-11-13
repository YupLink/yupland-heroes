import { Check, Info, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { Toaster as Sonner } from "sonner";
import "./sonner.css";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Тосты — сверху по центру. Внизу экрана игры удар, герой и кнопки окон, и
// тосты их перекрывали (жалоба игроков 27.09). Сверху тост ложится на шапку,
// окна-листы начинаются ниже него; на телефоне по бокам оставлено по 48px —
// край «Wallet», крестика окна на весь экран и мини-карты остаётся под пальцем.
// Запас на вырез (safe-area) сейчас 0: без viewport-fit=cover страница и так
// ниже выреза и шапки Telegram.
const TOP = "calc(var(--app-top,env(safe-area-inset-top,0px)) + 8px)";
const SIDE = 48;
// В свёрнутой стопке задние тосты лежат под передним почти целиком. Будь они
// кликабельны, сквозной тост (gameInfoToast) спереди отдавал бы тап не карте,
// а обычному тосту под собой. Тапы ловит только передний, пока стопка свёрнута.
const BACK_PASS_THROUGH = "data-[expanded=false]:data-[front=false]:pointer-events-none";

const gameIcons = {
  success: <Check aria-hidden="true" strokeWidth={2.5} />,
  error: <X aria-hidden="true" strokeWidth={2.5} />,
  info: <Info aria-hidden="true" strokeWidth={2.2} />,
  warning: <TriangleAlert aria-hidden="true" strokeWidth={2.2} />,
  loading: <LoaderCircle aria-hidden="true" className="animate-spin" strokeWidth={2.2} />,
};

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group yuplink-toaster"
      theme="dark"
      icons={gameIcons}
      position="top-center"
      offset={{ top: TOP }}
      mobileOffset={{ top: TOP, left: SIDE, right: SIDE }}
      duration={3500}
      closeButton
      toastOptions={{
        classNames: {
          toast: `yuplink-toast group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg ${BACK_PASS_THROUGH}`,
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
