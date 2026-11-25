import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './Root'
import { boot } from './lib/db'
import './index.css'

const root = document.getElementById('root')
if (root) boot().then((b) => createRoot(root).render(<StrictMode><Root boot={b} /></StrictMode>))
