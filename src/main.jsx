import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Pokud appka někde spadne na neošetřené chybě, React bez tohoto boundary
// smaže celou stránku (zůstane úplně bílá, beze slova). Tohle místo toho
// ukáže srozumitelnou hlášku s tlačítkem na obnovení, ať je jasné, co se
// stalo, a appka se dá znovu spustit jedním kliknutím.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('Neošetřená chyba v appce:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center',
          fontFamily: 'system-ui, sans-serif', background: '#0E3B5E', color: '#fff',
        }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Něco se pokazilo</div>
          <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 480 }}>
            Appka narazila na chybu a nemohla pokračovat. Zkuste stránku obnovit — pokud to
            nepomůže, dej vědět, co jsi přesně dělal, ať to jde opravit.
          </div>
          <div style={{ fontSize: 11, color: '#64748b', maxWidth: 480, wordBreak: 'break-word' }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#2E9BE0', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
          >
            🔄 Obnovit stránku
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Service worker jen v produkci (ve vývoji by cachování jen překáželo).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
