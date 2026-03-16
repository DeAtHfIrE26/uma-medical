import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMessage: '',
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'Unexpected application error',
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application crashed during render', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh bg-surface-900 text-white flex items-center justify-center px-6">
          <div className="glass-card max-w-lg w-full p-6 space-y-3">
            <p className="text-danger-400 text-sm font-semibold uppercase tracking-wider">
              Application error
            </p>
            <h1 className="font-display font-bold text-2xl">Uma Medical could not start</h1>
            <p className="text-surface-300 text-sm leading-relaxed">
              A runtime error stopped the app before it could render safely.
              Reload the page after checking the browser console and deployment environment.
            </p>
            <div className="bg-surface-900 rounded-2xl px-4 py-3">
              <p className="text-surface-400 text-xs uppercase tracking-wider mb-1">Error</p>
              <p className="text-white text-sm break-words">{this.state.errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-primary w-full py-3"
            >
              Reload app
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
