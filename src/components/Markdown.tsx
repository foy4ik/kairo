import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { filesRepo } from '@/lib/repositories'
import { attempt } from '@/lib/errors'

const SAFE_LINK = /^(https?:|mailto:)/i

interface Props {
  source: string
  /** Called when a task-list checkbox is clicked in the preview (index in document order). */
  onToggleTask?: (index: number) => void
}

/**
 * Markdown preview with controlled security: HTML is sanitized, remote images are not loaded
 * (the app stays offline-first and leaks nothing), and links open only through the system browser.
 */
function MarkdownView({ source, onToggleTask }: Props) {
  const components: Components = {
    a: ({ href, children }) => (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault()
          if (href && SAFE_LINK.test(href)) void attempt(() => filesRepo.openExternal(href))
        }}
      >
        {children}
      </a>
    ),
    img: ({ alt }) => <span className="italic text-muted">[{alt || 'image'}]</span>,
    input: ({ type, checked }) => {
      if (type !== 'checkbox') return null
      return (
        <input
          type="checkbox"
          checked={!!checked}
          readOnly={!onToggleTask}
          onChange={(e) => {
            // The n-th rendered checkbox is the n-th task marker in the source.
            const boxes = [...(e.currentTarget.closest('.md')?.querySelectorAll('input[type="checkbox"]') ?? [])]
            const index = boxes.indexOf(e.currentTarget)
            if (index >= 0) onToggleTask?.(index)
          }}
          aria-label="task"
        />
      )
    },
  }
  return (
    <div className="md selectable">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  )
}

export const Markdown = memo(MarkdownView)

/** Toggles the n-th `- [ ]` / `- [x]` marker in Markdown source. */
export function toggleTaskInSource(source: string, index: number): string {
  let i = -1
  return source.replace(/^(\s*(?:[-*+]|\d+\.)\s+)\[( |x|X)\]/gm, (m, prefix: string, mark: string) => {
    i++
    return i === index ? `${prefix}[${mark === ' ' ? 'x' : ' '}]` : m
  })
}
