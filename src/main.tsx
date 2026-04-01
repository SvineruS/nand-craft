import { render } from 'preact';
import { App } from './ui/App.tsx';
import './ui/style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
render(<App />, app);
