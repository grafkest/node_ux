import '@testing-library/jest-dom/vitest';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!('ResizeObserver' in globalThis)) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error Type is provided only for test environment
  globalThis.ResizeObserver = MockResizeObserver;
}
