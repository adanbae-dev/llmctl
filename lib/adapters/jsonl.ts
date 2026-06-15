import { promises as fs } from 'node:fs'

export interface LineChunk {
  lines: string[]
  /** Byte offset positioned at the start of any trailing incomplete line. */
  nextOffset: number
}

/**
 * Read `filePath` from `byteOffset` to EOF, returning complete (newline-terminated)
 * lines. Trailing bytes without a newline are treated as a partial line: they are
 * NOT returned, and `nextOffset` points at the start of that partial line so a
 * later tail() picks it up once the writer finishes it. This makes incremental
 * reads safe against half-flushed JSON lines.
 *
 * Offsets handed back always sit just past a `\n` (a single byte), so resuming
 * never lands mid-multibyte-character.
 */
export async function readLinesFromOffset(
  filePath: string,
  byteOffset: number,
): Promise<LineChunk> {
  const handle = await fs.open(filePath, 'r')
  try {
    const { size } = await handle.stat()
    if (byteOffset >= size) return { lines: [], nextOffset: size }
    const length = size - byteOffset
    const buf = Buffer.allocUnsafe(length)
    await handle.read(buf, 0, length, byteOffset)
    const text = buf.toString('utf8')
    const lastNl = text.lastIndexOf('\n')
    if (lastNl === -1) {
      // No complete line yet — leave the offset where it was.
      return { lines: [], nextOffset: byteOffset }
    }
    const complete = text.slice(0, lastNl)
    const consumedBytes = Buffer.byteLength(complete, 'utf8') + 1 // include the '\n'
    const lines = complete.split('\n').filter((l) => l.trim().length > 0)
    return { lines, nextOffset: byteOffset + consumedBytes }
  } finally {
    await handle.close()
  }
}

/** Read up to `windowBytes` from the start; returns complete lines only. */
export async function readHeadWindow(
  filePath: string,
  windowBytes: number,
): Promise<string[]> {
  const handle = await fs.open(filePath, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, windowBytes)
    const buf = Buffer.allocUnsafe(length)
    await handle.read(buf, 0, length, 0)
    const text = buf.toString('utf8')
    const lastNl = text.lastIndexOf('\n')
    const complete = lastNl === -1 ? text : text.slice(0, lastNl)
    return complete.split('\n').filter((l) => l.trim().length > 0)
  } finally {
    await handle.close()
  }
}

/**
 * Read the last `windowBytes` of a file. The (likely partial) first line is
 * dropped so callers only see complete lines. Used to show recent messages from
 * very large session files without loading the whole thing into memory.
 */
export async function readTailWindow(
  filePath: string,
  windowBytes: number,
): Promise<{ lines: string[]; fromOffset: number }> {
  const handle = await fs.open(filePath, 'r')
  try {
    const { size } = await handle.stat()
    const start = Math.max(0, size - windowBytes)
    const length = size - start
    const buf = Buffer.allocUnsafe(length)
    await handle.read(buf, 0, length, start)
    let text = buf.toString('utf8')
    if (start > 0) {
      const nl = text.indexOf('\n')
      text = nl === -1 ? '' : text.slice(nl + 1)
    }
    const lines = text.split('\n').filter((l) => l.trim().length > 0)
    return { lines, fromOffset: start }
  } finally {
    await handle.close()
  }
}
