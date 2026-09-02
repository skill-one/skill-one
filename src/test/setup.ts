// Extend Vitest's `expect` with jest-dom matchers (toBeInTheDocument, etc.).
import "@testing-library/jest-dom/vitest";

// jsdom does not implement ResizeObserver, which Radix UI primitives
// (Tabs, ScrollArea) depend on. Provide a minimal no-op implementation.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// Radix also queries matchMedia for responsive behavior. Return a static
// match object with the minimal surface it reads.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom does not implement IntersectionObserver. Provide a controllable
// mock: instances are tracked so tests can fire intersection callbacks
// manually if a component needs it.
class IntersectionObserverMock {
  static instances: IntersectionObserverMock[] = [];
  private readonly elements = new Set<Element>();
  constructor(
    private readonly callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {
    IntersectionObserverMock.instances.push(this);
  }
  observe(element: Element) {
    this.elements.add(element);
  }
  unobserve(element: Element) {
    this.elements.delete(element);
  }
  disconnect() {
    this.elements.clear();
  }
  /** Test-only: simulate the observed element entering/leaving the viewport. */
  trigger(intersecting = true) {
    const entries: IntersectionObserverEntry[] = [...this.elements].map(
      () => ({ isIntersecting: intersecting }) as IntersectionObserverEntry,
    );
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}
globalThis.IntersectionObserver =
  IntersectionObserverMock as unknown as typeof IntersectionObserver;

// jsdom does not implement the idle-callback pair, which the background
// search-index build schedules its slices through. Provide a timer-based
// version so tests exercise the same path a browser does (the module's own
// fallback covers WebViews missing the API entirely).
if (typeof globalThis.requestIdleCallback !== "function") {
  globalThis.requestIdleCallback = ((callback: IdleRequestCallback) =>
    setTimeout(
      () => callback({ didTimeout: false, timeRemaining: () => 0 }),
      0,
    ) as unknown as number) as typeof globalThis.requestIdleCallback;
  globalThis.cancelIdleCallback = ((handle: number) =>
    clearTimeout(handle)) as typeof globalThis.cancelIdleCallback;
}

// jsdom lacks scrollIntoView and pointer-capture APIs used by Radix.
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  Element.prototype.hasPointerCapture =
    Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.releasePointerCapture =
    Element.prototype.releasePointerCapture ?? (() => {});
  Element.prototype.setPointerCapture =
    Element.prototype.setPointerCapture ?? (() => {});
}
