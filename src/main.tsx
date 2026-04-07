import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Global Welcome Message
console.log(
  '%c Estrella Developer %c by Kimi %c\n🚀 Billetera digital y entregas activas',
  'background: #f97316; color: white; font-size: 1.2em; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;',
  'background: #334155; color: white; font-size: 1.2em; font-weight: bold; padding: 4px 8px; border-radius: 0 4px 4px 0;',
  'color: #f97316; font-size: 1em; font-weight: 500; margin-top: 8px;'
);

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
