import type { Priority } from '@/lib/types'

export interface QuickAdd {
  title: string
  tags: string[]
  priority: Priority | null
}

const PRIORITY_TOKENS: Record<string, Priority> = { '!high': 'high', '!h': 'high', '!med': 'medium', '!m': 'medium', '!low': 'low', '!l': 'low' }

/** Things-style quick entry: `Write docs #docs #v1 !high` -> title, tags and priority. */
export function parseQuickAdd(input: string): QuickAdd {
  const tags: string[] = []
  let priority: Priority | null = null
  const words: string[] = []
  for (const word of input.trim().split(/\s+/)) {
    if (!word) continue
    const lower = word.toLowerCase()
    if (word.length > 1 && word.startsWith('#')) tags.push(word.slice(1))
    else if (lower in PRIORITY_TOKENS) priority = PRIORITY_TOKENS[lower]
    else words.push(word)
  }
  return { title: words.join(' '), tags, priority }
}
