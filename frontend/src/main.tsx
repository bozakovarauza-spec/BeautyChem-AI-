import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { registerServiceWorker } from './lib/pwa';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

// Splash screen-ді жасыру
const splash = document.getElementById('splash');
if (splash) {
  setTimeout(() => {
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 450);
  }, 700);
}

registerServiceWorker();
