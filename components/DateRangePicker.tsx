'use client'

import { useEffect, useRef, useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import 'react-day-picker/style.css'

function parse(s?: string): Date | undefined {
  if (!s) return undefined
  // noon to avoid tz off-by-one when round-tripping YYYY-MM-DD
  const d = new Date(`${s}T12:00:00`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

function fmt(d?: Date): string {
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function DateRangePicker({
  from,
  to,
  min,
  max,
  onChange,
}: {
  from: string
  to: string
  min?: string
  max?: string
  onChange: (from: string, to: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const minD = parse(min)
  const maxD = parse(max)
  const selected: DateRange | undefined = from || to ? { from: parse(from), to: parse(to) } : undefined
  const disabled: Array<{ before: Date } | { after: Date }> = []
  if (minD) disabled.push({ before: minD })
  if (maxD) disabled.push({ after: maxD })

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 font-mono hover:border-neutral-600"
      >
        📅 {from || '시작'} ~ {to || '끝'}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 rounded-lg border border-neutral-700 bg-neutral-900 p-2 shadow-xl">
          <DayPicker
            mode="range"
            selected={selected}
            defaultMonth={parse(to) ?? parse(from) ?? maxD}
            startMonth={minD}
            endMonth={maxD}
            disabled={disabled}
            onSelect={(range) => {
              if (range?.from) onChange(fmt(range.from), fmt(range.to ?? range.from))
            }}
          />
        </div>
      )}
    </div>
  )
}
