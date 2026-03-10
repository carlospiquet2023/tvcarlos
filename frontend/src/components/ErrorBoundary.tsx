import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('ErrorBoundary caught:', error, info.componentStack);
    }

    handleReload = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', minHeight: '100vh', padding: '2rem',
                    fontFamily: 'system-ui, sans-serif', textAlign: 'center',
                    background: '#f8f9fa', color: '#333'
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '12px', padding: '3rem',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', maxWidth: '480px', width: '100%'
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Algo deu errado</h1>
                        <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                            Ocorreu um erro inesperado. Tente recarregar a página.
                        </p>
                        {this.state.error && (
                            <pre style={{
                                background: '#f1f3f5', padding: '0.75rem', borderRadius: '8px',
                                fontSize: '0.8rem', textAlign: 'left', overflow: 'auto',
                                maxHeight: '120px', marginBottom: '1.5rem', color: '#e03131'
                            }}>
                                {this.state.error.message}
                            </pre>
                        )}
                        <button
                            onClick={this.handleReload}
                            style={{
                                background: '#228be6', color: '#fff', border: 'none',
                                borderRadius: '8px', padding: '0.75rem 2rem', fontSize: '1rem',
                                cursor: 'pointer', fontWeight: 600
                            }}
                        >
                            Recarregar Página
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
