/** Shared glass-card section with the suite's heading treatment. */
export function SectionCard({ title, meta, action, ariaLabel, children }: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={ariaLabel ?? title}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "var(--pad-sm)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 className="h3">{title}</h2>
        {meta ? <span className="mono mute" style={{ fontSize: 10.5 }}>{meta}</span> : null}
        {action ? <span style={{ marginLeft: "auto" }}>{action}</span> : null}
      </div>
      {children}
    </section>
  );
}
