import { Component, type ReactNode } from "react";
import { isStaleChunkError, reloadForStaleChunk } from "@/lib/staleReload";

// Сбой окна лечится молча, пока это возможно (владелец, 28.10.2026: «не просилось
// перезагружаться — игрока не выбивать из ритма»): не подгрузился кусок кода — тихая
// перезагрузка страницы; другое — один тихий повтор. Кнопка — только если не помогло.
type Props = {
  children: ReactNode;
  retry: string;
  loading?: ReactNode;
  reasonLabel?: string;
  recovery?: { label: string; onClick: () => void };
};
type State = { failed: boolean; quiet: boolean; reason: string | null };

export class WindowError extends Component<Props, State> {
  state: State = { failed: false, quiet: false, reason: null };
  private retried = false;
  private timer: number | undefined;
  static getDerivedStateFromError(error: unknown) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    // Сначала «загрузка»: что показать игроку, решит componentDidCatch.
    return { failed: true, quiet: true, reason: reason.slice(0, 180) };
  }
  componentDidCatch(error: unknown) {
    if (isStaleChunkError(error) && reloadForStaleChunk()) return;
    if (this.retried) return this.setState({ quiet: false });
    this.retried = true;
    this.timer = window.setTimeout(() => this.setState({ failed: false, quiet: false }), 800);
  }
  componentWillUnmount() {
    window.clearTimeout(this.timer);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.state.quiet) return <p role="status">{this.props.loading ?? "…"}</p>;
    return (
      <div role="alert">
        <button
          data-game-button="secondary"
          className="rounded border p-3"
          onClick={() => this.setState({ failed: false })}
        >
          {this.props.retry}
        </button>
        {this.props.recovery && <button type="button" data-game-button="text" className="ml-2 min-h-11 px-2" onClick={this.props.recovery.onClick}>{this.props.recovery.label}</button>}
        {this.props.reasonLabel && this.state.reason && <details className="mt-3 max-w-full text-xs text-muted-foreground">
          <summary>{this.props.reasonLabel}</summary>
          <code className="mt-2 block break-all">{this.state.reason}</code>
        </details>}
      </div>
    );
  }
}
