/** Original, generic trophy glyph (not the FIFA emblem) for champion/leader spots. */
export function TrophyIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4.2v1.8A3.2 3.2 0 0 0 7.4 10" />
      <path d="M17 5h2.8v1.8A3.2 3.2 0 0 1 16.6 10" />
      <path d="M12 14.2v2.6" />
      <path d="M9.4 16.8h5.2l-.6 3H10l-.6-3Z" />
      <path d="M8.5 20.4h7" />
    </svg>
  );
}
