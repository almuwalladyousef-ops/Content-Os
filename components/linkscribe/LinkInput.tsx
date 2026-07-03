import type { FormEvent } from "react";

type LinkInputProps = {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function LinkInput({ value, disabled, onChange, onSubmit }: LinkInputProps) {
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", gap: 8 }}>
      <input
        id="video-url"
        aria-label="Paste video link"
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste a TikTok, Instagram, or YouTube link…"
        disabled={disabled}
        autoComplete="off"
        style={{ flex: 1, maxWidth: 560 }}
      />
      <button type="submit" className="btn primary" disabled={disabled} style={{ opacity: disabled ? 0.6 : 1 }}>
        {disabled ? "Transcribing…" : "Transcribe"}
      </button>
    </form>
  );
}
