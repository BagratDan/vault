import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

afterEach(() => {
  // Reset the hash so each test starts on the default (ask) route.
  act(() => {
    window.location.hash = "";
  });
});

describe("App", () => {
  it("renders the sidebar and the ask/search surface on the default route", async () => {
    render(<App />);
    await waitFor(() => screen.getByPlaceholderText(/ask anything/i));
    // Sidebar nav is present across the main routes.
    expect(screen.getByRole("link", { name: "Ask" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Folders" })).toBeTruthy();
    // The ask/search surface is the default landing.
    expect(screen.getByPlaceholderText(/ask anything/i)).toBeTruthy();
  });

  it("navigating to Folders shows the folder list and add-folder button", async () => {
    render(<App />);
    await waitFor(() => screen.getByRole("link", { name: "Folders" }));
    act(() => {
      fireEvent.click(screen.getByRole("link", { name: "Folders" }));
    });
    await waitFor(() => screen.getByRole("button", { name: /add folder/i }));
    expect(screen.getByRole("heading", { name: /^folders$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /add folder/i })).toBeTruthy();
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
