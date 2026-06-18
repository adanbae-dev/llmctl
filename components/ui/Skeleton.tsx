/** Loading placeholder — preserves layout so content does not jump in. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-white/5 ${className}`} />
}
