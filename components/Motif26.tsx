/**
 * Decorative concentric "26" echo — the FWC Amplify motif, restrained. Drop it
 * into an `overflow-hidden` container; the rings clip into rounded colour bands.
 */
export function Motif26({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden>
      <div className="echo26 flex h-20 w-16 items-center justify-center rounded-3xl bg-bg">
        <span className="display text-3xl text-fg">26</span>
      </div>
    </div>
  );
}
