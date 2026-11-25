import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { boot } from './lib/db'
import './index.css'

const root = document.getElementById('root')
if (root) boot().then((b) => createRoot(root).render(<StrictMode><App boot={b} /></StrictMode>))
