import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { UIProvider } from './contexts/UIContext.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { DataProvider } from './contexts/DataContext.tsx'
import { PMSProvider } from './contexts/PMSContext.tsx'
import { ProposalsProvider } from './contexts/ProposalsContext.tsx'
import { ProjectReportsProvider } from './contexts/ProjectReportsContext.tsx'
import { ToastProvider } from './contexts/ToastContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <UIProvider>
          <ToastProvider>
            <AuthProvider>
              <DataProvider>
                <PMSProvider>
                  <ProposalsProvider>
                    <ProjectReportsProvider>
                      <App />
                    </ProjectReportsProvider>
                  </ProposalsProvider>
                </PMSProvider>
              </DataProvider>
            </AuthProvider>
          </ToastProvider>
        </UIProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
