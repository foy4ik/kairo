import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorState } from '@/components/EmptyState'
import { t } from '@/i18n'

/** A UI crash never touches the database: the user can reload the view and nothing is lost. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; key?: string }> {
  state: { error: Error | null; key?: string } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(props: { resetKey?: string }, state: { error: Error | null; key?: string }) {
    // Navigating elsewhere clears the error.
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return <ErrorState title={t('error.crash')} message={this.state.error.message} onRetry={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}
