type TranscriptionStatusProps = {
  state: "idle" | "working" | "ready" | "error";
  message: string;
  error: string;
};

const DOT: Record<TranscriptionStatusProps["state"], string> = {
  idle: "var(--text-mute)",
  working: "var(--warn)",
  ready: "var(--ok)",
  error: "var(--bad)",
};

export function TranscriptionStatus({ state, message, error }: TranscriptionStatusProps) {
  return (
    <div
      aria-live="polite"
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderRadius: 999,
        background: "var(--bg-2)", border: "1px solid var(--hairline)",
        fontSize: 12,
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: 999, flexShrink: 0,
        background: DOT[state],
        boxShadow: `0 0 8px ${DOT[state]}`,
      }} />
      <span className="dim">{message}</span>
      {error ? <strong style={{ color: "var(--bad)", fontWeight: 500 }}>{error}</strong> : null}
    </div>
  );
}
