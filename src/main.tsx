import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
// DESIGN.md typography, bundled — no font CDN (SEC-17).
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/tiro-devanagari-sanskrit/devanagari-400.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { UIProvider } from './contexts/UIContext.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { DataProvider } from './contexts/DataContext.tsx'
import { PMSProvider } from './contexts/PMSContext.tsx'
import { AWPProvider } from './contexts/AWPContext.tsx'
import { ProposalsProvider } from './contexts/ProposalsContext.tsx'
import { ProjectReportsProvider } from './contexts/ProjectReportsContext.tsx'
import { ToastProvider } from './contexts/ToastContext.tsx'
import { FeatureControlProvider } from './contexts/FeatureControlContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* Honor the OS "reduce motion" setting for every framer-motion animation. */}
      <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <UIProvider>
          <ToastProvider>
            <AuthProvider>
              <FeatureControlProvider>
                <DataProvider>
                  <PMSProvider>
                    <AWPProvider>
                      <ProposalsProvider>
                        <ProjectReportsProvider>
                          <App />
                        </ProjectReportsProvider>
                      </ProposalsProvider>
                    </AWPProvider>
                  </PMSProvider>
                </DataProvider>
              </FeatureControlProvider>
            </AuthProvider>
          </ToastProvider>
        </UIProvider>
      </ThemeProvider>
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
)
