import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Bug #22 fix: guard against missing root element instead of using non-null assertion
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('[Estrella Delivery] Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
