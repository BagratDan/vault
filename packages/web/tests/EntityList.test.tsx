import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EntityList } from "../src/components/EntityList.js";

describe("EntityList", () => {
  it("renders items and fires onOpen with the record id", () => {
    const onOpen = vi.fn();
    render(<EntityList kind="person" items={[{ id: "P1", label: "Jane Doe" }]} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("Jane Doe"));
    expect(onOpen).toHaveBeenCalledWith("P1");
  });
});
