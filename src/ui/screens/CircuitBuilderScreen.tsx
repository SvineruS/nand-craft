import { useEffect, useRef } from 'preact/hooks';
import { getEditor } from '../../circuit-builder/editorInstance.ts';
import { Renderer } from '../../circuit-builder/editor/render/Renderer.ts';
import { InputHandler } from '../../circuit-builder/editor/InputHandler.ts';
import { Toolbar } from '../components/Toolbar.tsx';
import { Sidebar } from '../components/Sidebar.tsx';
import { TestPanel } from '../components/TestPanel.tsx';
import { LevelDialog } from '../components/LevelDialog.tsx';
import { LevelCompleteDialog } from '../components/LevelCompleteDialog.tsx';
import { useEditorCallbacks } from '../useEditorCallbacks.ts';
import { notifyStateChange } from '../editorStore.ts';
import { switchToLevelMap } from '../screenManager.ts';

export function CircuitBuilderScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cb = useEditorCallbacks();

  useEffect(() => {
    const container = containerRef.current!;
    const editor = getEditor();

    // Canvas
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
    container.appendChild(canvas);

    // Renderer + render loop
    const renderer = new Renderer(canvas);
    renderer.startLoop(
      () => editor.getState(),
      () => {
        editor.onCircuitChanged();
        notifyStateChange();
      },
      () => {
        editor.retick();
        notifyStateChange();
      },
      () => notifyStateChange(),
    );

    // Input
    const input = new InputHandler(canvas,
      () => editor.getState(),
      () => editor.getHistory(),
      renderer);
    input.attach();

    // Mark dirty so the first frame renders
    editor.getState().renderDirty = true;

    // Resize
    const onResize = () => {
      editor.getState().renderDirty = true;
    };
    window.addEventListener('resize', onResize);

    return () => {
      editor.tests.cancelRunAll();
      renderer.stopLoop();
      input.detach();
      window.removeEventListener('resize', onResize);
      container.removeChild(canvas);
    };
  }, []);

  return (
    <>
      <Toolbar
        onUndo={cb.handleUndo}
        onRedo={cb.handleRedo}
        onColorChange={cb.handleColorChange}
        onShowLevels={cb.handleShowLevels}
        onMenu={cb.handleMenu}
        onResetLevel={cb.handleResetLevel}
      />
      <div class="main-row">
        <TestPanel
          onReset={cb.handleReset}
          onStep={cb.handleStep}
          onRunAll={cb.handleRunAll}
          onExecuteCommand={cb.handleExecuteCommand}
        />
        <div id="editor-container" ref={containerRef}/>
        <Sidebar onStamp={cb.handleStamp} onDragStart={cb.handleDragStart} onDragEnd={cb.handleDragEnd}/>
      </div>
      <LevelDialog/>
      {cb.showLevelComplete && (
        <LevelCompleteDialog
          onLevelMap={() => {
            switchToLevelMap();
            cb.setShowLevelComplete(false);
          }}
          onClose={() => cb.setShowLevelComplete(false)}
        />
      )}
    </>
  );
}
