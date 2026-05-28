import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VaultSetup } from "../src/components/VaultSetup.js";

describe("VaultSetup", () => {
  it("renders the choose screen with two buttons", () => {
    render(<VaultSetup onCreate={() => undefined} onJoin={() => undefined} />);
    expect(screen.getByRole("button", { name: /create new vault/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /join existing vault/i })).toBeTruthy();
  });

  it("create flow calls onCreate with displayName", () => {
    const onCreate = vi.fn();
    render(<VaultSetup onCreate={onCreate} onJoin={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /create new vault/i }));
    const input = screen.getByPlaceholderText(/Vault name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Acme Legal" } });
    fireEvent.submit(input.closest("form")!);
    expect(onCreate).toHaveBeenCalledWith("Acme Legal");
  });

  it("create flow does not call onCreate with whitespace-only input", () => {
    const onCreate = vi.fn();
    render(<VaultSetup onCreate={onCreate} onJoin={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /create new vault/i }));
    const input = screen.getByPlaceholderText(/Vault name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input.closest("form")!);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("join flow calls onJoin with token + displayName", () => {
    const onJoin = vi.fn();
    render(<VaultSetup onCreate={() => undefined} onJoin={onJoin} />);
    fireEvent.click(screen.getByRole("button", { name: /join existing vault/i }));
    const nameInput = screen.getByPlaceholderText(/Your name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Marcus" } });
    const tokenInput = screen.getByPlaceholderText(/Paste invite token/i) as HTMLTextAreaElement;
    fireEvent.change(tokenInput, { target: { value: "abc123" } });
    fireEvent.submit(nameInput.closest("form")!);
    expect(onJoin).toHaveBeenCalledWith("abc123", "Marcus");
  });

  it("back button returns to the choose screen", () => {
    render(<VaultSetup onCreate={() => undefined} onJoin={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /create new vault/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByRole("button", { name: /create new vault/i })).toBeTruthy();
  });
});
