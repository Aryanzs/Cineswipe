import React, { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

// --- Error Boundary ---
interface ErrorBoundaryState { hasError: boolean; }
class ErrorBoundary extends React.Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <h1 className="text-2xl font-display mb-3">Something went wrong</h1>
            <p className="text-zinc-400 mb-6 text-sm">An unexpected error occurred.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-white text-black rounded-full text-sm font-medium hover:bg-zinc-200 transition-colors"
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Root component: handles auth gate ---
const RootComponent = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-500" size={48} />
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  return (
    <Routes>
      <Route path="/"                    element={<App />} />
      <Route path="/tv"                  element={<App />} />
      <Route path="/:provider"           element={<App />} />
      <Route path="/:provider/tv"        element={<App />} />
      <Route path="/mylist"              element={<App />} />
      <Route path="/mylist/tv"           element={<App />} />
      <Route path="/mylist/:provider"    element={<App />} />
      <Route path="/mylist/:provider/tv" element={<App />} />
      <Route path="*"                    element={<Navigate to="/" replace />} />
    </Routes>
  );
};

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <RootComponent />
          <Toaster
            position="bottom-center"
            toastOptions={{
              style: {
                background: '#18181b',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
              error: { iconTheme: { primary: '#f43f5e', secondary: '#fff' } },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
