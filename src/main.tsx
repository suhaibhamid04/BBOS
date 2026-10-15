import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {CustomerShareView} from './components/customer/CustomerShareView.tsx';
import './index.css';

const customerShareMatch = window.location.pathname.match(/^\/quote\/share\/([A-Za-z0-9_-]+)\/?$/);

createRoot(document.getElementById('root')!).render(
  customerShareMatch
    ? <CustomerShareView token={customerShareMatch[1]} />
    : <StrictMode><App /></StrictMode>,
);
