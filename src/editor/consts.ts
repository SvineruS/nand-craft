export const WIRE_COLORS = [
  '#4a4a7a', // default (no override)
  '#fb923c', // orange
  '#facc15', // yellow
  '#60a5fa', // blue
  '#c084fc', // purple
  '#f472b6', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#ffffff', // white
]; // --- Colors (dark theme) ---

export const COLORS = {
  background: '#181825',
  gridDot: '#313150',
  gateFill: '#2d2d4d',
  gateStroke: '#5a5a8a',
  gateText: '#e8e8f0',
  wireDefault: '#555580',
  wireActive: '#4ade80',
  wireZero: '#f87171',
  wireHighZ: '#45456a',
  pinActive: '#5eebb0',
  pinZero: '#f87171',
  pinHighZ: '#7a7a90',
  selection: '#6cb4ff',
  error: '#ef4444',
  selectionRectFill: 'rgba(108, 180, 255, 0.15)',
  selectionRectStroke: '#6cb4ff',
  wireNodeFill: '#3e3e60',
  wireNodeStroke: '#8888bb',
} as const;

export const GRID_SIZE = 20;
export const GRID_DOT_RADIUS = 1;
export const WIRE_DASH_SIZE = 3;
export const WIRE_LABEL_SPACING = 80;
export const WIRE_LABEL_MIN_LENGTH = 30;
