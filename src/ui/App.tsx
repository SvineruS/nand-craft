import { MainMenuScreen } from './screens/MainMenuScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { FactoryScreen } from './screens/FactoryScreen.tsx';
import { CircuitBuilderScreen } from './screens/CircuitBuilderScreen.tsx';
import { LevelSelectScreen } from './screens/LevelSelectScreen.tsx';
import { LevelMapEditorScreen } from './screens/LevelMapEditorScreen.tsx';
import { ComponentEditorScreen } from './screens/ComponentEditorScreen.tsx';
import { viewMode } from './editorStore.ts';
import './style.css';

export function App() {
  const mode = viewMode.value;
  return (
    <>
      {mode === 'mainMenu' && <MainMenuScreen />}
      {mode === 'editor' && <CircuitBuilderScreen />}
      {mode === 'levelSelect' && <LevelSelectScreen />}
      {mode === 'levelMapEditor' && <LevelMapEditorScreen />}
      {mode === 'componentEditor' && <ComponentEditorScreen />}
      {mode === 'factory' && <FactoryScreen />}
      {mode === 'settings' && <SettingsScreen />}
    </>
  );
}
