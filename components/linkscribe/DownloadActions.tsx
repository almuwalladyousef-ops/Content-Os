type DownloadActionsProps = {
  result: {
    downloads: {
      transcript: string;
      media: string;
    };
  } | null;
};

export function DownloadActions({ result }: DownloadActionsProps) {
  const disabled: React.CSSProperties = result ? {} : { opacity: 0.45, pointerEvents: "none" };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <a className="btn" aria-disabled={!result} href={result?.downloads.transcript ?? "#"} style={{ textDecoration: "none", ...disabled }}>
        Download transcript
      </a>
      <a className="btn" aria-disabled={!result} href={result?.downloads.media ?? "#"} style={{ textDecoration: "none", ...disabled }}>
        Download video
      </a>
    </div>
  );
}
