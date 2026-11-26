import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { UiThemeProvider } from './appearance';
import { App } from './App';
import { AuthProvider } from './auth';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <UiThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </UiThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
