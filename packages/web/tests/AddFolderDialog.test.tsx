import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddFolderDialog } from "../src/components/AddFolderDialog.js";

describe("AddFolderDialog", () => {
  it("submits path + displayName + visibility", () => {
    const onSubmit = vi.fn();
    render(<AddFolderDialog onSubmit={onSubmit} onCancel={() => undefined} />);
    const pathInput = screen.getByPlaceholderText(/Users\/sarah/);
    fireEvent.change(pathInput, { target: { value: "/Users/x/Acme" } });
    const nameInput = screen.getByPlaceholderText("Acme MSA");
    fireEvent.change(nameInput, { target: { value: "Acme" } });
    fireEvent.click(screen.getByLabelText(/Public/));
    fireEvent.submit(pathInput.closest("form")!);
    expect(onSubmit).toHaveBeenCalledWith("/Users/x/Acme", "Acme", "public");
  });
  it("Cancel button fires onCancel", () => {
    const onCancel = vi.fn();
    render(<AddFolderDialog onSubmit={() => undefined} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(onCancel).toHaveBeenCalled();
  });
  it("auto-suggests displayName from path basename", () => {
    render(<AddFolderDialog onSubmit={() => undefined} onCancel={() => undefined} />);
    const pathInput = screen.getByPlaceholderText(/Users\/sarah/) as HTMLInputElement;
    fireEvent.change(pathInput, { target: { value: "/Users/x/Acme" } });
    const nameInput = screen.getByPlaceholderText("Acme MSA") as HTMLInputElement;
    expect(nameInput.value).toBe("Acme");
  });
});
