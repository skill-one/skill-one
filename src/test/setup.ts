import { beforeEach } from "vitest";

// Extend Vitest's `expect` with jest-dom matchers (toBeInTheDocument, etc.).
import "@testing-library/jest-dom/vitest";

import { LANGUAGE_STORAGE_KEY } from "../lib/i18n-content";
import i18n from "../i18n/index";
import { resetViewMemories } from "../lib/view-memory";
import { resetListView } from "../lib/list-view";

// jsdom does not implement ResizeObserver, which some Base UI primitives
// depend on. Provide a minimal no-op implementation.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// Base UI also queries matchMedia for responsive behavior. Return a static
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

// jsdom lacks scrollIntoView and pointer-capture APIs used by Base UI.
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
  // jsdom scrolls nothing: `scrollTop` is a plain property and the methods that
  // would move it are missing. Route `scrollTo` onto that property, so a test
  // can read back the position the app asked for — which is what a page that
  // restores a scroll position does.
  if (!("scrollTo" in proto)) {
    proto.scrollTo = function (this: Element, options: ScrollToOptions = {}) {
      if (typeof options.top === "number") this.scrollTop = options.top;
    };
  }
}

// A window that has never navigated is what each test means to start from, and
// jsdom gives a file's tests one window between them:
//
// - the `history` keeps its entries, and with them react-router's own index
//   (`history.state.idx`), so a test that navigated would leave the next one
//   with an entry behind it that it never visited — which is what
//   `useReturn` reads to decide whether there is anywhere to go back to;
// - and react-router keys its entries in that same state, with one exception:
//   the entry a window *starts* on is keyed `"default"`, the same key in every
//   window. Per window that is exactly right — there is one such entry — but
//   across tests it makes it the one key they all share, and anything keyed by
//   the entry (the view a list page remembers, `lib/view-memory`) is then read
//   by a test that never visited it, previous search text and all.
//
// The shared list view (`lib/list-view`) needs the same treatment for a
// different reason: it is not keyed by anything, so a query one test typed would
// still be in the header when the next one renders.
beforeEach(() => {
  window.history.replaceState(null, "", window.location.href);
  // Pin the UI to Chinese so existing assertions on Chinese copy pass without
  // per-test wiring. Pinning the stored preference (rather than only the
  // i18next language) keeps the provider's mount-time resolution in step: a
  // bare changeLanguage call would be undone by the provider resolving the
  // default `system` preference against jsdom's en-US navigator.
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "zh");
  void i18n.changeLanguage("zh");
  document.documentElement.lang = "zh-CN";
  resetViewMemories();
  resetListView();
});
