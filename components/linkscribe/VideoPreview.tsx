import type { PreviewSource } from "@/lib/linkscribe/getPreviewSource";

type VideoPreviewProps = {
  preview: PreviewSource;
};

export function VideoPreview({ preview }: VideoPreviewProps) {
  return (
    <section className="preview-panel" aria-label="Video preview">
      <div className="section-heading">
        <h2>Video preview</h2>
        <span>{preview.label}</span>
      </div>

      <div className={`preview-frame preview-${preview.kind === "unavailable" ? "landscape" : preview.aspect}`}>
        {preview.kind === "embed" ? (
          <iframe
            src={preview.src}
            title={preview.label}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : null}

        {preview.kind === "video" ? (
          <video src={preview.src} controls preload="metadata">
            <track kind="captions" />
          </video>
        ) : null}

        {preview.kind === "unavailable" ? (
          <div className="preview-empty">
            <p>Preview unavailable</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
