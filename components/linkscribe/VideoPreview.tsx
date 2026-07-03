import type { PreviewSource } from "@/lib/linkscribe/getPreviewSource";
import { SectionCard } from "./SectionCard";

type VideoPreviewProps = {
  preview: PreviewSource;
};

export function VideoPreview({ preview }: VideoPreviewProps) {
  const aspect = preview.kind === "unavailable" ? "landscape" : preview.aspect;
  const media: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    border: "none",
    background: "oklch(0.10 0.01 255)",
  };

  return (
    <SectionCard title="Video preview" meta={preview.label} ariaLabel="Video preview">
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: aspect === "portrait" ? "9 / 16" : "16 / 9",
          maxHeight: aspect === "portrait" ? 520 : undefined,
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
          border: "1px solid var(--hairline)",
          background: "var(--bg-2)",
        }}
      >
        {preview.kind === "embed" ? (
          <iframe
            src={preview.src}
            title={preview.label}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={media}
          />
        ) : null}

        {preview.kind === "video" ? (
          <video src={preview.src} controls preload="metadata" style={{ ...media, objectFit: "contain" }}>
            <track kind="captions" />
          </video>
        ) : null}

        {preview.kind === "unavailable" ? (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <p className="mute" style={{ fontSize: 12.5 }}>Preview unavailable</p>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
