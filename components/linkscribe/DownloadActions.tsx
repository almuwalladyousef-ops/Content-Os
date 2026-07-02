type DownloadActionsProps = {
  result: {
    downloads: {
      transcript: string;
      media: string;
    };
  } | null;
};

export function DownloadActions({ result }: DownloadActionsProps) {
  return (
    <div className="download-actions">
      <a aria-disabled={!result} href={result?.downloads.transcript ?? "#"}>
        Download transcript
      </a>
      <a aria-disabled={!result} href={result?.downloads.media ?? "#"}>
        Download video
      </a>
    </div>
  );
}
