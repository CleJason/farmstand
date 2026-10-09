/** Shown wherever we tell someone an email is on its way: new senders often land in spam at first. */
export default function SpamHint({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-stone-500 ${className}`}>
      Don&apos;t see it in a few minutes? Check your spam or promotions folder, and mark it &quot;Not spam&quot; so
      the next one lands in your inbox.
    </p>
  );
}
