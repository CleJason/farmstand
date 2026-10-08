/** Renders the simple plain-text format used for the legal pages ("## " headings, "- " bullets). */
export default function LegalText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  return (
    <div className="space-y-4 text-sm text-stone-700 leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length === 0) return null;
        const out: React.ReactNode[] = [];
        let bullets: string[] = [];
        const flush = (key: string) => {
          if (bullets.length) {
            out.push(
              <ul key={key} className="list-disc pl-5 space-y-1">
                {bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            );
            bullets = [];
          }
        };
        lines.forEach((line, j) => {
          const t = line.trim();
          if (t.startsWith("#")) {
            flush(`ul-${j}`);
            out.push(
              <h2 key={j} className="text-base font-bold text-stone-900 pt-2">
                {t.replace(/^#+\s*/, "")}
              </h2>
            );
          } else if (t.startsWith("- ")) {
            bullets.push(t.slice(2));
          } else {
            flush(`ul-${j}`);
            out.push(<p key={j}>{t}</p>);
          }
        });
        flush("ul-end");
        return <div key={i} className="space-y-2">{out}</div>;
      })}
    </div>
  );
}
