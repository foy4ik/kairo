export type Format = 'bold' | 'italic' | 'heading' | 'list' | 'checkbox' | 'link' | 'code' | 'quote'
export interface Edit { value: string; start: number; end: number }

/** Applies a Markdown formatting action to a text selection and returns the new text + selection. */
export function applyFormat(value: string, start: number, end: number, kind: Format): Edit {
  const sel = value.slice(start, end)
  const wrap = (mark: string, placeholder: string): Edit => {
    const inner = sel || placeholder
    const out = value.slice(0, start) + mark + inner + mark + value.slice(end)
    return { value: out, start: start + mark.length, end: start + mark.length + inner.length }
  }
  const linePrefix = (prefix: string): Edit => {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    let lineEnd = value.indexOf('\n', end)
    if (lineEnd === -1) lineEnd = value.length
    const block = value.slice(lineStart, lineEnd)
    const lines = block.split('\n')
    const has = lines.every((l) => l.startsWith(prefix))
    const next = lines.map((l) => (has ? l.slice(prefix.length) : prefix + l)).join('\n')
    return { value: value.slice(0, lineStart) + next + value.slice(lineEnd), start: lineStart, end: lineStart + next.length }
  }
  switch (kind) {
    case 'bold': return wrap('**', 'bold')
    case 'italic': return wrap('*', 'italic')
    case 'code': return wrap('`', 'code')
    case 'heading': return linePrefix('## ')
    case 'list': return linePrefix('- ')
    case 'quote': return linePrefix('> ')
    case 'checkbox': return linePrefix('- [ ] ')
    case 'link': {
      const text = sel || 'link'
      const out = value.slice(0, start) + `[${text}](https://)` + value.slice(end)
      const urlStart = start + text.length + 3
      return { value: out, start: urlStart, end: urlStart + 8 }
    }
  }
}

/** First meaningful line of a note as plain text, for list previews. */
export function snippet(markdown: string, max = 110): string {
  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/^\s*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s+)?|>\s+|\d+\.\s+)/, '').replace(/[*_`~]|\[([^\]]*)\]\([^)]*\)/g, '$1').trim()
    if (line) return line.length > max ? `${line.slice(0, max - 1)}…` : line
  }
  return ''
}
