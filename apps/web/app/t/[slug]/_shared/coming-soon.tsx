export function ComingSoon({
  title,
  subtitle,
  bullets,
}: {
  title: string;
  subtitle: string;
  bullets: readonly string[];
}) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </header>
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
        <p className="mb-3 text-foreground">即将上线,设计要点:</p>
        <ul className="list-inside list-disc space-y-1.5">
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
