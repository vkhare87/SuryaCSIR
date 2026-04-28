import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { UIProvider } from './contexts/UIContext.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { DataProvider } from './contexts/DataContext.tsx'
import { PMSProvider } from './contexts/PMSContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <UIProvider>
        <AuthProvider>
          <DataProvider>
            <PMSProvider>
              <App />
            </PMSProvider>
          </DataProvider>
        </AuthProvider>
      </UIProvider>
    </ThemeProvider>
  </StrictMode>,
)
