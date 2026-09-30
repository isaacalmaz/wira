import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { translateStatic } from '../../i18n';
import { Button, Card, IconTile } from '../ui';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Auto-reload once if the error is a missing chunk (common on Vercel after new deploys)
    const isChunkLoadError = error?.name === 'ChunkLoadError' || 
      (error?.message && error.message.includes('Failed to fetch dynamically imported module'));
      
    if (isChunkLoadError) {
      if (!sessionStorage.getItem('chunk_reloaded')) {
        sessionStorage.setItem('chunk_reloaded', 'true');
        window.location.reload();
        return;
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-ground px-4 py-10 text-ink">
          <Card padding="lg" className="flex w-full max-w-md flex-col items-center gap-4 text-center">
            <IconTile tone="danger" size="lg">
              <AlertTriangle size={24} aria-hidden="true" />
            </IconTile>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-balance">{translateStatic('error_boundary.title')}</h1>
              <p className="text-sm leading-relaxed text-ink-muted">
                {translateStatic('error_boundary.desc')}
              </p>
            </div>
            {this.state.error && (
              <pre className="max-h-32 w-full overflow-auto whitespace-pre-wrap break-words rounded-control border border-danger-line bg-danger-soft p-3 text-left font-mono text-xs text-danger-ink">
                {this.state.error.toString()}
              </pre>
            )}
            <Button
              block
              size="lg"
              className="mt-1"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
            >
              {translateStatic('error_boundary.reload')}
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
