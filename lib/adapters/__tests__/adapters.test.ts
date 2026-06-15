import { describe, it, expect } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { readLinesFromOffset } from '../jsonl'
import { adapters, discoverAll } from '../index'
import { decodeId } from '../../paths'

describe('readLinesFromOffset — partial-line seam (the v2 watch foundation)', () => {
  it('returns only complete lines and resumes at the partial line', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'llmv-'))
    const fp = path.join(dir, 't.jsonl')
    // third line is half-flushed (no trailing newline)
    await fs.writeFile(fp, '{"a":1}\n{"a":2}\n{"a":3')
    const first = await readLinesFromOffset(fp, 0)
    expect(first.lines).toEqual(['{"a":1}', '{"a":2}'])

    // writer finishes line 3 and appends a new line
    await fs.appendFile(fp, '}\n{"a":4}\n')
    const second = await readLinesFromOffset(fp, first.nextOffset)
    expect(second.lines).toEqual(['{"a":3}', '{"a":4}'])

    await fs.rm(dir, { recursive: true, force: true })
  })

  it('handles multibyte content without corrupting offsets', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'llmv-'))
    const fp = path.join(dir, 'm.jsonl')
    await fs.writeFile(fp, '{"t":"안녕하세요"}\n{"t":"こんにちは"}\n')
    const r = await readLinesFromOffset(fp, 0)
    expect(r.lines.length).toBe(2)
    expect(JSON.parse(r.lines[0]).t).toBe('안녕하세요')
    await fs.rm(dir, { recursive: true, force: true })
  })
})

describe('adapters smoke test (uses real session files on this machine)', () => {
  for (const a of adapters) {
    it(`${a.id}.discover() resolves to an array`, async () => {
      const list = await a.discover()
      expect(Array.isArray(list)).toBe(true)
    })

    it(`${a.id}.parse() returns a normalized session for the first entry, if any`, async () => {
      const list = await a.discover()
      if (list.length === 0) return // provider not used on this machine — skip
      const session = await a.parse(decodeId(list[0].id))
      expect(session.provider).toBe(a.id)
      expect(Array.isArray(session.messages)).toBe(true)
      for (const m of session.messages) {
        expect(['user', 'assistant', 'system', 'tool']).toContain(m.role)
        expect(Array.isArray(m.blocks)).toBe(true)
      }
    })
  }
})

describe('discoverAll', () => {
  it('merges every provider into one array', async () => {
    const all = await discoverAll()
    expect(Array.isArray(all)).toBe(true)
  })
})
