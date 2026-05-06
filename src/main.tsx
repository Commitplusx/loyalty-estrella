import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Global Welcome Message
console.log(
  '%c Estrella Developer %c\n🚀 Billetera digital y entregas activas',
  'background: #f97316; color: white; font-size: 1.2em; font-weight: bold; padding: 4px 8px; border-radius: 4px;',
  'color: #f97316; font-size: 1em; font-weight: 500; margin-top: 8px;'
);

// Verificamos que el elemento root exista antes de intentar renderizar la aplicación.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('[Estrella Delivery] Root element #root not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
