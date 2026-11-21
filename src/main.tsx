import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { MobileKeyboardAccessory } from './components/MobileKeyboardAccessory';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
    <MobileKeyboardAccessory />
  </React.StrictMode>
);
