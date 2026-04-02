import { MainMenuScreen } from './screens/MainMenuScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { FactoryScreen } from './screens/FactoryScreen.tsx';
import { CircuitBuilderScreen } from './screens/CircuitBuilderScreen.tsx';
import { LevelSelectScreen } from './screens/LevelSelectScreen.tsx';
import { viewMode } from './editorStore.ts';
import './style.css';

export function App() {
  const mode = viewMode.value;
  return (
    <>
      {mode === 'mainMenu' && <MainMenuScreen />}
      {mode === 'editor' && <CircuitBuilderScreen />}
      {mode === 'levelSelect' && <LevelSelectScreen />}
      {mode === 'factory' && <FactoryScreen />}
      {mode === 'settings' && <SettingsScreen />}
    </>
  );
}
