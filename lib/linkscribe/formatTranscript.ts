import type { TranscriptSegment } from "./types";

export function formatTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map((segment) => {
      const start = formatTimestamp(segment.startSeconds);
      const end = formatTimestamp(segment.endSeconds);
      return `[${start} - ${end}] ${segment.text.trim()}`;
    })
    .join("\n");
}

export function formatTranscriptPlainText(segments: TranscriptSegment[]): string {
  return segments.map((segment) => segment.text.trim()).filter(Boolean).join("\n");
}

function formatTimestamp(seconds: number): string {
  const roundedSeconds = Math.round(seconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const remainingSeconds = roundedSeconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
}
