import { Panel } from "./Panel";

export function Stub({ title, sigil = "📜" }: { title: string; sigil?: string }) {
  return (
    <Panel title={title}>
      <div className="stub">
        <div className="sigil">{sigil}</div>
        The royal scribes are still drafting this chamber.
        <br />
        It will open with a later task — the engine beneath it comes first.
      </div>
    </Panel>
  );
}
