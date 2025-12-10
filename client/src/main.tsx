import { Buffer } from 'buffer';

// Make Buffer available globally BEFORE any other imports
// This is required for Solana libraries that use Node.js Buffer
globalThis.Buffer = Buffer;
(window as any).Buffer = Buffer;

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
