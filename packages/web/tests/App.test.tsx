import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../src/App.js";

// Mock fetch so the /token request succeeds without a real server
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: "test-token" }),
      } as Response)
    )
  );
});

vi.mock("../src/ws-client.js", () => ({
  createWsClient: () => {
    let _handler: ((m: unknown) => void) | null = null;
    return {
      send: vi.fn(),
      onMessage: (handler: (m: unknown) => void) => {
        _handler = handler;
        // Simulate vault.status: admin so the main UI is visible
        queueMicrotask(() => _handler?.({ kind: "vault.status", state: "admin" }));
        return () => undefined;
      },
      close: vi.fn(),
    };
  },
}));

describe("App", () => {
  it("renders the folder list and search bar on home", async () => {
    render(<App />);
    await waitFor(() => screen.getByText(/^folders$/i));
    expect(screen.getByText(/^folders$/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /add folder/i })).toBeTruthy();
    expect(screen.getByPlaceholderText(/ask anything/i)).toBeTruthy();
  });

  it("submitting a search clears the search input", async () => {
    render(<App />);
    await waitFor(() => screen.getByPlaceholderText(/ask anything/i));
    const input = screen.getByPlaceholderText(/ask anything/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "indemnification" } });
    fireEvent.submit(input.closest("form")!);
    expect(input.value).toBe("");
  });
});
