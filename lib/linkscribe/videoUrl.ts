export type VideoUrlValidation =
  | {
      ok: true;
      url: string;
    }
  | {
      ok: false;
      error: string;
    };

export function validateVideoUrl(value: string): VideoUrlValidation {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, error: "Paste a video link first." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "Paste a valid video URL." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Use an http or https video link." };
  }

  return { ok: true, url: parsed.toString() };
}
