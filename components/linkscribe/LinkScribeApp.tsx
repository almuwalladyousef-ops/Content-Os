"use client";

import { FormEvent, useMemo, useState } from "react";
import { DownloadActions } from "./DownloadActions";
import { LinkInput } from "./LinkInput";
import { TranscriptPanel } from "./TranscriptPanel";
import { TranscriptionStatus } from "./TranscriptionStatus";
import { VideoPreview } from "./VideoPreview";
import { getPreviewSource } from "@/lib/linkscribe/getPreviewSource";
import type { TranscriptSegment } from "@/lib/linkscribe/types";
import { validateVideoUrl } from "@/lib/linkscribe/videoUrl";

type TranscribeResponse = {
  jobId: string;
  title: string;
  segments: TranscriptSegment[];
  transcriptText: string;
  downloads: {
    transcript: string;
    media: string;
  };
};

type RequestState = "idle" | "working" | "ready" | "error";

export function LinkScribeApp() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<RequestState>("idle");
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [result, setResult] = useState<TranscribeResponse | null>(null);

  const preview = useMemo(() => getPreviewSource(url), [url]);
  const displayedPreview = result
    ? ({
        kind: "video" as const,
        src: `${result.downloads.media}?inline=1`,
        label: "Downloaded video preview",
        aspect: preview.kind === "unavailable" ? "landscape" : preview.aspect,
      })
    : preview;
  const canSubmit = state !== "working";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validateVideoUrl(url);
    if (!validation.ok) {
      setState("error");
      setStatus("Check the link");
      setError(validation.error);
      return;
    }

    setState("working");
    setStatus("Queued");
    setError("");
    setResult(null);

    try {
      // Jobs run on the always-on Mac mini (local Whisper), so the request is
      // async: create the job, then poll until it's done. This avoids serverless
      // timeouts on long transcriptions.
      const createRes = await fetch("/api/linkscribe/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: validation.url }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error || "Could not start transcription.");

      const body = await pollJob(created.jobId, setStatus);
      setResult(body);
      setState("ready");
      setStatus("Ready");
    } catch (caughtError) {
      setState("error");
      setStatus("Could not transcribe");
      setError(caughtError instanceof Error ? caughtError.message : "Transcription failed.");
    }
  }

  return (
    <section className="app-shell">
      <header className="topbar">
        <div>
          <h1>LinkScribe</h1>
          <p>Paste a video link and get a timestamped transcript.</p>
        </div>
      </header>

      <LinkInput
        value={url}
        disabled={!canSubmit}
        onChange={setUrl}
        onSubmit={handleSubmit}
      />

      <section className="workspace" aria-label="Transcription workspace">
        <VideoPreview preview={displayedPreview} />

        <div className="transcript-column">
          <TranscriptPanel segments={result?.segments ?? []} transcriptText={result?.transcriptText ?? ""} />
          <DownloadActions result={result} />
          <TranscriptionStatus state={state} message={status} error={error} />
        </div>
      </section>
    </section>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Queued",
  downloading: "Downloading video",
  transcribing: "Transcribing with Whisper",
};

async function pollJob(jobId: string, setStatus: (s: string) => void): Promise<TranscribeResponse> {
  // ~15 min ceiling at 2.5s intervals — long enough for big videos on the mini.
  for (let attempt = 0; attempt < 360; attempt++) {
    await new Promise((r) => setTimeout(r, 2500));
    const res = await fetch(`/api/linkscribe/jobs/${jobId}`);
    const job = await res.json();
    if (!res.ok) throw new Error(job.error || "Transcription failed.");
    if (job.status === "done") return job as TranscribeResponse;
    if (job.status === "failed") throw new Error(job.error || "Transcription failed.");
    setStatus(STATUS_LABEL[job.status] ?? "Working");
  }
  throw new Error("Transcription is taking too long. Check the mini and try again.");
}
