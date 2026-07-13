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

type CreateJobResponse = {
  jobId: string;
};

type JobResponse = TranscribeResponse & {
  status: string;
  error?: string | null;
};

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
      const created = await readApiJson<CreateJobResponse>(
        createRes,
        "Could not start transcription.",
      );
      if (!created.jobId || typeof created.jobId !== "string") {
        throw new Error("The home server did not return a transcription job ID.");
      }

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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <div>
        <h1 className="h1">LinkScribe</h1>
        <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>
          Paste a video link and get a timestamped transcript.
        </p>
      </div>

      <LinkInput
        value={url}
        disabled={!canSubmit}
        onChange={setUrl}
        onSubmit={handleSubmit}
      />

      <section
        aria-label="Transcription workspace"
        className="ls-workspace"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 380px) minmax(0, 1fr)",
          gap: "var(--gap)",
          alignItems: "start",
        }}
      >
        <VideoPreview preview={displayedPreview} />

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)", minWidth: 0 }}>
          <TranscriptPanel segments={result?.segments ?? []} transcriptText={result?.transcriptText ?? ""} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <DownloadActions result={result} />
            <TranscriptionStatus state={state} message={status} error={error} />
          </div>
        </div>
      </section>

      {/* Stack the preview above the transcript on narrow screens */}
      <style>{`@media (max-width: 900px) { .ls-workspace { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Queued",
  downloading: "Downloading video",
  transcribing: "Transcribing with Whisper",
};

async function pollJob(jobId: string, setStatus: (s: string) => void): Promise<TranscribeResponse> {
  // Poll immediately once, then use 2.5s intervals. The work remains async, but
  // fast failures/results do not incur an unnecessary initial delay.
  for (let attempt = 0; attempt < 360; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2500));
    const res = await fetch(`/api/linkscribe/jobs/${jobId}`);
    const job = await readApiJson<JobResponse>(res, "Transcription failed.");
    if (job.status === "done") return job as TranscribeResponse;
    if (job.status === "failed") throw new Error(job.error || "Transcription failed.");
    setStatus(STATUS_LABEL[job.status] ?? "Working");
  }
  throw new Error("Transcription is taking too long. Check the mini and try again.");
}

async function readApiJson<T extends object>(response: Response, fallbackError: string): Promise<T> {
  const text = await response.text();
  let payload: unknown;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    const isHtml = /^\s*(?:<!doctype\s+html|<html\b)/i.test(text)
      || response.headers.get("content-type")?.toLowerCase().includes("text/html");
    throw new Error(
      isHtml
        ? `LinkScribe received a web page instead of API data (HTTP ${response.status}). Check that the latest app and home server are running.`
        : fallbackError,
    );
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error(fallbackError);
  }

  const error = "error" in payload && typeof payload.error === "string"
    ? payload.error
    : fallbackError;
  if (!response.ok) throw new Error(error);

  return payload as T;
}
