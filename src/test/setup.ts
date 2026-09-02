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
// The lib.dom types declare every one of them as always present, so probing
// `Element.prototype` with `in` narrows it to `never` in the "missing" branch
// and the patch stops typechecking. Go through a widened handle instead: it
// keeps the runtime check while leaving the type alone. (`in` rather than
// reading the member — a read hands out an unbound-method reference, which the
// type-aware lint rejects, and would throw if the member were a throwing
// getter.)
if (typeof Element !== "undefined") {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  if (!("scrollIntoView" in proto)) proto.scrollIntoView = () => {};
  if (!("hasPointerCapture" in proto)) proto.hasPointerCapture = () => false;
  if (!("releasePointerCapture" in proto)) proto.releasePointerCapture = () => {};
  if (!("setPointerCapture" in proto)) proto.setPointerCapture = () => {};
}
