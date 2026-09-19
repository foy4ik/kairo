import { useNavigate, useParams } from 'react-router-dom'
import { PageLoading } from '@/components/EmptyState'
import { useData } from '@/store/data'
import { NotesWorkspace } from './NotesWorkspace'

export function NotesPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const loaded = useData((s) => s.loaded)
  if (!loaded) return <PageLoading />
  return <NotesWorkspace selectedId={id ? Number(id) : null} onSelect={(n) => nav(n ? `/notes/${n}` : '/notes')} />
}
