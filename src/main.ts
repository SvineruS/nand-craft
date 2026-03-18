import { Editor } from './editor/Editor.ts';
import { Toolbar } from './ui/Toolbar.ts';
import { Sidebar } from './ui/Sidebar.ts';
import { TestPanel } from './ui/TestPanel.ts';
import { LevelDialog } from './ui/LevelDialog.ts';
import { LEVELS } from './levels/registry.ts';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '';

// Layout: toolbar top, then [sidebar | canvas] row
Object.assign(app.style, {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  width: '100vw',
  overflow: 'hidden',
});

const editorContainer = document.createElement('div');
editorContainer.id = 'editor-container';
Object.assign(editorContainer.style, {
  flex: '1',
  position: 'relative',
  overflow: 'hidden',
});

const editor = new Editor(editorContainer);
const sidebar = new Sidebar();
const testPanel = new TestPanel();
const levelDialog = new LevelDialog();

let currentLevelIndex = 0;

function loadLevel(index: number): void {
  currentLevelIndex = index;
  const level = LEVELS[index];
  editor.loadLevel(level);
  toolbar.setLevelName(level.name);
  levelDialog.showIntro(level, () => levelDialog.hide());
}

const toolbar = new Toolbar({
  onUndo: () => editor.undo(),
  onRedo: () => editor.redo(),
  onTest: () => {
    const level = LEVELS[currentLevelIndex];
    const results = editor.runTests(level);
    testPanel.show(results, level);

    const allPassed = results.every((r) => r.passed);
    if (allPassed) {
      levelDialog.showResults(
        results,
        level,
        () => { levelDialog.hide(); },
        currentLevelIndex < LEVELS.length - 1
          ? () => { levelDialog.hide(); loadLevel(currentLevelIndex + 1); }
          : undefined,
      );
    } else {
      levelDialog.showResults(results, level, () => levelDialog.hide());
    }
  },
  onStepTick: () => editor.stepTick(),
  onToggleSimulation: () => editor.toggleSimulation(),
  onColorChange: (color) => { editor.getState().wireColor = color; },
});

// Horizontal row: sidebar + canvas
const mainRow = document.createElement('div');
Object.assign(mainRow.style, {
  display: 'flex',
  flex: '1',
  overflow: 'hidden',
});
mainRow.appendChild(sidebar.element);
mainRow.appendChild(editorContainer);

app.appendChild(toolbar.element);
app.appendChild(mainRow);
app.appendChild(testPanel.element);
app.appendChild(levelDialog.element);

// Update toolbar each frame
function updateUI(): void {
  toolbar.update(editor.getState());
  requestAnimationFrame(updateUI);
}
requestAnimationFrame(updateUI);

loadLevel(0);
