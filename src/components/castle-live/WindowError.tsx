import { Component, type ReactNode } from "react";
export class WindowError extends Component<
  { children: ReactNode; retry: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert">
        <button
          data-game-button="secondary"
          className="rounded border p-3"
          onClick={() => this.setState({ failed: false })}
        >
          {this.props.retry}
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
