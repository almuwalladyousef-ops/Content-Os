type TranscriptionStatusProps = {
  state: "idle" | "working" | "ready" | "error";
  message: string;
  error: string;
};

export function TranscriptionStatus({ state, message, error }: TranscriptionStatusProps) {
  return (
    <section className={`status-line status-${state}`} aria-live="polite">
      <span>{message}</span>
      {error ? <strong>{error}</strong> : null}
    </section>
  );
}
