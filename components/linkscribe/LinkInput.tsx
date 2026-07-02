import type { FormEvent } from "react";

type LinkInputProps = {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function LinkInput({ value, disabled, onChange, onSubmit }: LinkInputProps) {
  return (
    <form className="link-form" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="video-url">
        Paste video link
      </label>
      <input
        id="video-url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste video link"
        disabled={disabled}
        autoComplete="off"
      />
      <button type="submit" disabled={disabled}>
        {disabled ? "Transcribing" : "Transcribe"}
      </button>
    </form>
  );
}
