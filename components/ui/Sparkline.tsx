// Dependency-free mini bar sparkline. Each value is one bar; height scales to
// the window max. Uses currentColor so the caller sets the hue via text-*.
// Lightweight on purpose — it re-renders on every live tick.
export function Sparkline({
  values,
  width = 120,
  height = 28,
  className = '',
}: {
  values: number[]
  width?: number
  height?: number
  className?: string
}) {
  const max = Math.max(1, ...values)
  const n = values.length
  if (n === 0)
    return (
      <svg width={width} height={height} className={className} aria-hidden="true">
        <line
          x1={0}
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
      </svg>
    )
  const bw = width / n
  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      {values.map((v, i) => {
        const h = Math.max(1, (v / max) * (height - 2))
        return (
          <rect
            key={i}
            x={i * bw}
            y={height - h}
            width={Math.max(1, bw - 1)}
            height={h}
            rx={0.5}
            fill="currentColor"
          />
        )
      })}
    </svg>
  )
}
