// Ожидание ответа окна сундука — один вид на все панели.
import { Loader2 } from "lucide-react";

export function ChestSpinner() {
  return (
    <div className="flex justify-center py-4">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}
