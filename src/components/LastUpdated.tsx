/** "Last updated October 8, 2026" under a legal page title. */
export default function LastUpdated({ date }: { date: string }) {
  const d = new Date(`${date}T12:00:00`);
  return (
    <p className="text-xs text-stone-400 mt-1">
      Last updated {d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
    </p>
  );
}
