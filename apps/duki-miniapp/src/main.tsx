import { createRoot } from 'react-dom/client'
import App from './App'
import { LocaleProvider } from './lib/i18n'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <LocaleProvider>
    <App />
  </LocaleProvider>
)
