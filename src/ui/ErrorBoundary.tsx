import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from './icons'
import { Button } from './Button'
import { Logo } from './Logo'

/**
 * If a screen crashes, show a way back instead of a blank page. Nothing personal is logged: only the error's own
 * message, for the browser console.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen error:', error.message, info.componentStack?.split('\n')[1]?.trim())
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="gutter grid min-h-dvh place-items-center py-10" role="alert">
        <div className="card grid w-full max-w-[440px] justify-items-center gap-3 rounded-2xl p-7 text-center">
          <Logo className="h-10" />
          <h1 className="mt-2 text-h2">Something went wrong</h1>
          <p className="text-body text-ink-2">This screen couldn't open. Anything already saved is safe; reload to carry on.</p>
          <Button className="mt-3 w-full" icon={<RotateCcw />} onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </main>
    )
  }
}
