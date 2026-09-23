import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.css'
import { App } from '@/app/App'

// public/compat-check.js already replaced the page with an explanation when the web engine is too old.
if (!(window as unknown as { __kairoUnsupported?: boolean }).__kairoUnsupported) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
