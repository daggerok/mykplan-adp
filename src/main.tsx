/// <reference lib="esnext" />
import { createRoot } from 'react-dom/client';
import { startData } from './app/data';
import { loadFonts } from './app/fonts';
import { autoConnectGoogle } from './app/google';
import { App } from './ui/react/App';

loadFonts();
startData();
autoConnectGoogle();
createRoot(document.getElementById('root')!).render(<App />);
