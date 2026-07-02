"use client";

import type { TranscriptSegment } from "@/lib/linkscribe/types";
import { formatTranscriptPlainText } from "@/lib/linkscribe/formatTranscript";

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
    <section className="transcript-panel" aria-label="Transcript">
      <div className="section-heading">
        <h2>Transcript</h2>
        <button type="button" onClick={copyTranscript} disabled={!transcriptText}>
          Copy transcript
        </button>
      </div>

      <div className="transcript-output">
        {segments.length > 0 ? (
          segments.map((segment, index) => (
            <p key={`${segment.startSeconds}-${index}`}>
              <time>{formatRange(segment.startSeconds, segment.endSeconds)}</time>
              <span>{segment.text}</span>
            </p>
          ))
        ) : (
          <p className="transcript-empty">Transcript will appear here after processing.</p>
        )}
      </div>
    </section>
  );
}

function formatRange(startSeconds: number, endSeconds: number): string {
  return `${formatTimestamp(startSeconds)} - ${formatTimestamp(endSeconds)}`;
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
