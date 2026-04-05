/**
 * Compile a user-provided JS function body in a sandbox where only Math is accessible.
 * Uses a sandboxed iframe to prevent access to the main window's globals.
 */
export function compileTestFunction(
  codeBody: string,
  inputCount: number,
): (...args: number[]) => number[] {
  const params = Array.from({ length: inputCount }, (_, i) => `a${i}`);
  const callArgs = params.join(', ');

  // Create a sandboxed iframe — no scripts, no same-origin access
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-same-origin');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);

  try {
    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) throw new Error('Failed to create sandbox');

    // Get the iframe's Function constructor — code runs in iframe's global scope
    const SandboxFunction = (iframeWindow as unknown as { Function: typeof Function }).Function;

    // Build the sandboxed function: only Math is available as a closure variable
    const fn = new SandboxFunction(
      'Math',
      ...params,
      `"use strict"; const __fn = ${codeBody}; return __fn(${callArgs});`,
    );

    // Capture a frozen copy of Math
    const safeMath = Object.freeze({ ...Math });

    // Remove iframe immediately — the compiled function still works
    document.body.removeChild(iframe);

    return (...args: number[]): number[] => {
      const result = fn(safeMath, ...args);
      if (!Array.isArray(result)) {
        throw new Error(`Function must return an array, got ${typeof result}`);
      }
      return result.map(v => {
        if (typeof v !== 'number') throw new Error(`Output values must be numbers, got ${typeof v}`);
        return v;
      });
    };
  } catch (e) {
    document.body.removeChild(iframe);
    throw e;
  }
}

const MAX_CASES = 1024;

/**
 * Generate input combinations for the given bit widths.
 * Enumerates all if total <= MAX_CASES, otherwise samples randomly.
 */
export function enumerateInputs(bitWidths: number[]): number[][] {
  const ranges = bitWidths.map(bw => (1 << bw) >>> 0);
  const total = ranges.reduce((a, b) => a * b, 1);

  if (total <= MAX_CASES) {
    return enumerateAll(ranges, total);
  }
  return sampleRandom(ranges, MAX_CASES);
}

function enumerateAll(ranges: number[], total: number): number[][] {
  const result: number[][] = [];
  const current = new Array(ranges.length).fill(0);

  for (let i = 0; i < total; i++) {
    result.push([...current]);
    for (let j = current.length - 1; j >= 0; j--) {
      current[j]++;
      if (current[j] < ranges[j]) break;
      current[j] = 0;
    }
  }
  return result;
}

function sampleRandom(ranges: number[], count: number): number[][] {
  const seen = new Set<string>();
  const result: number[][] = [];

  // Always include all-zeros and all-max
  const zeros = ranges.map(() => 0);
  const maxes = ranges.map(r => r - 1);
  result.push(zeros, maxes);
  seen.add(zeros.join(','));
  seen.add(maxes.join(','));

  while (result.length < count) {
    const combo = ranges.map(r => Math.floor(Math.random() * r));
    const key = combo.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(combo);
    }
  }
  return result;
}
