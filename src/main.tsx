import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './global.css'
import { App } from './App'
import { StoreProvider } from './store'
import { DataProvider } from './data/DataProvider'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <StoreProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </StoreProvider>
    </ErrorBoundary>
  </StrictMode>,
)
