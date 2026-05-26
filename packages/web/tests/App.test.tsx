import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { App } from "../src/App.js";

vi.mock("../src/ws-client.js", () => ({
  createWsClient: () => ({
    send: vi.fn(),
    onMessage: () => () => undefined,
    close: vi.fn(),
  }),
}));

describe("App", () => {
  it("renders the capture pane and search bar", () => {
    render(<App />);
    expect(screen.getByPlaceholderText(/capture a memory/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/ask anything/i)).toBeTruthy();
  });

  it("submitting a search clears the search input", () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/ask anything/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "indemnification" } });
    fireEvent.submit(input.closest("form")!);
    expect(input.value).toBe("");
  });
});
