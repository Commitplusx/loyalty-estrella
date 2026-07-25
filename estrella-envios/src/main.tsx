import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { Toaster } from 'react-hot-toast'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <Toaster 
      position="top-center" 
      maxToasts={1}
      toastOptions={{
        className: 'font-sans font-medium text-sm',
        style: {
          borderRadius: '16px',
          background: '#111827',
          color: '#fff',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          padding: '12px 20px',
        },
        duration: 2500,
      }}
    />
  </>,
)
