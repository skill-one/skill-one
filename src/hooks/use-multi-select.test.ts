import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useMultiSelect } from "./use-multi-select";

describe("useMultiSelect", () => {
  it("initializes with empty selection and selectionMode=false", () => {
    const { result } = renderHook(() => useMultiSelect());
    expect(result.current.isSelectionMode).toBe(false);
    expect(result.current.count).toBe(0);
    expect(result.current.selectedList).toEqual([]);
    expect(result.current.isSelected("a")).toBe(false);
  });

  it("toggles item selection and updates isSelectionMode", () => {
    const { result } = renderHook(() => useMultiSelect());

    act(() => {
      result.current.toggle("item-1");
    });
    expect(result.current.isSelectionMode).toBe(true);
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected("item-1")).toBe(true);

    act(() => {
      result.current.toggle("item-2");
    });
    expect(result.current.count).toBe(2);
    expect(result.current.isSelected("item-2")).toBe(true);

    act(() => {
      result.current.toggle("item-1");
    });
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected("item-1")).toBe(false);

    act(() => {
      result.current.toggle("item-2");
    });
    expect(result.current.isSelectionMode).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("supports select, unselect, selectAll and clear", () => {
    const { result } = renderHook(() => useMultiSelect());

    act(() => {
      result.current.select("item-1");
      result.current.select("item-1"); // duplicate should be no-op
    });
    expect(result.current.count).toBe(1);

    act(() => {
      result.current.selectAll(["a", "b", "c"]);
    });
    expect(result.current.count).toBe(3);
    expect(result.current.isSelected("a")).toBe(true);
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.isSelected("c")).toBe(true);

    act(() => {
      result.current.unselect("b");
    });
    expect(result.current.count).toBe(2);
    expect(result.current.isSelected("b")).toBe(false);

    act(() => {
      result.current.clear();
    });
    expect(result.current.count).toBe(0);
    expect(result.current.isSelectionMode).toBe(false);
  });

  it("supports selectBatch and unselectBatch", () => {
    const { result } = renderHook(() => useMultiSelect());

    act(() => {
      result.current.selectBatch(["x", "y", "z"]);
    });
    expect(result.current.count).toBe(3);
    expect(result.current.isSelected("x")).toBe(true);
    expect(result.current.isSelected("y")).toBe(true);
    expect(result.current.isSelected("z")).toBe(true);

    act(() => {
      result.current.unselectBatch(["y", "z"]);
    });
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected("x")).toBe(true);
    expect(result.current.isSelected("y")).toBe(false);
    expect(result.current.isSelected("z")).toBe(false);
  });

  it("clears on Escape key if escapeToClear is true", () => {
    const { result } = renderHook(() => useMultiSelect({ escapeToClear: true }));

    act(() => {
      result.current.select("item-1");
    });
    expect(result.current.isSelectionMode).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(result.current.isSelectionMode).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("does not change reference when clear is called on empty selection", () => {
    const { result } = renderHook(() => useMultiSelect());
    const initial = result.current;

    act(() => {
      result.current.clear();
    });

    expect(result.current).toBe(initial);
  });
});
