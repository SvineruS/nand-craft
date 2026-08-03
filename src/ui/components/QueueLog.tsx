import { stateVersion } from '../editorStore.ts';
import { useEditor } from '../editorContext.ts';
import type { QueueCommandStatus } from '../../circuit-builder/levels/levelTypes.ts';

const STATUS_ICONS: Record<QueueCommandStatus, string> = {
  pending: '\u00B7',  // ·
  running: '\u25B8',  // ▸
  passed: '\u2714',   // ✔
  failed: '\u2718',   // ✘
};

const STATUS_COLORS: Record<QueueCommandStatus, string> = {
  pending: 'var(--text-dim)',
  running: 'var(--current-border)',
  passed: 'var(--pass)',
  failed: 'var(--fail)',
};

export function QueueLog() {
  stateVersion.value;
  // The queue view reads the queue engine directly — LevelTests no longer forwards it.
  const queueResults = useEditor().tests.queue.results;

  if (queueResults.length === 0) return null;

  return (
    <div class="test-panel-table-wrap">
      <div class="queue-log">
        {queueResults.map((r, i) => (
          <>
            {r.caseStart && i > 0 && <div class="queue-log-separator" />}
            <div
              key={i}
              class="queue-log-item"
              style={{
                color: STATUS_COLORS[r.status],
                background: r.status === 'running' ? 'var(--current-bg)' : undefined,
              }}
            >
              <span class="queue-log-icon">{STATUS_ICONS[r.status]}</span>
              <span class="queue-log-cmd">{r.type}</span>
              <span class="queue-log-label">{r.label}</span>
              <span class="queue-log-value">{r.expected}</span>
            </div>
          </>
        ))}
      </div>
    </div>
  );
}
