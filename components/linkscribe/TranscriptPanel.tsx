"use client";

import type { TranscriptSegment } from "@/lib/linkscribe/types";
import { formatTranscriptPlainText } from "@/lib/linkscribe/formatTranscript";
import { SectionCard } from "./SectionCard";

type TranscriptPanelProps = {
  segments: TranscriptSegment[];
  transcriptText: string;
};

export function TranscriptPanel({ segments, transcriptText }: TranscriptPanelProps) {
  async function copyTranscript() {
    if (!transcriptText) {
      return;
    }

    await navigator.clipboard.writeText(formatTranscriptPlainText(segments));
  }

  return (
    <SectionCard
      title="Transcript"
      ariaLabel="Transcript"
      action={
        <button type="button" className="btn tiny" onClick={copyTranscript} disabled={!transcriptText}
          style={{ opacity: transcriptText ? 1 : 0.5 }}>
          Copy transcript
        </button>
      }
    >
      <div className="scroll" style={{ maxHeight: 460, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {segments.length > 0 ? (
          segments.map((segment, index) => (
            <p key={`${segment.startSeconds}-${index}`} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <time className="mono" style={{ fontSize: 10.5, color: "var(--accent)", whiteSpace: "nowrap", flexShrink: 0 }}>
                {formatRange(segment.startSeconds, segment.endSeconds)}
              </time>
              <span style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text-2)" }}>{segment.text}</span>
            </p>
          ))
        ) : (
          <p className="mute" style={{ fontSize: 12.5, padding: "28px 0", textAlign: "center" }}>
            Transcript will appear here after processing.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

function formatRange(startSeconds: number, endSeconds: number): string {
  return `${formatTimestamp(startSeconds)} – ${formatTimestamp(endSeconds)}`;
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
