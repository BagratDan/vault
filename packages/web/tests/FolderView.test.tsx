import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FolderView } from "../src/components/FolderView.js";

const meta = { folderId: "01J0OWN0000000000000000000", displayName: "Acme MSA", visibility: "public" as const, ownerPeerId: "a".repeat(64), fileCount: 3 };

describe("FolderView", () => {
  it("renders header + admin actions when isOwner", () => {
    render(<FolderView folder={meta} isOwner files={[]} ingestProgress={null} onBack={() => undefined} onRescan={() => undefined} onToggleVisibility={() => undefined} onDelete={() => undefined}><div data-testid="children">x</div></FolderView>);
    expect(screen.getByText("Acme MSA")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Re-scan/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Make private/ })).toBeTruthy();
    expect(screen.getByTestId("children")).toBeTruthy();
  });
  it("hides admin actions when not owner", () => {
    render(<FolderView folder={meta} isOwner={false} files={[]} ingestProgress={null} onBack={() => undefined} onRescan={() => undefined} onToggleVisibility={() => undefined} onDelete={() => undefined}><div /></FolderView>);
    expect(screen.queryByRole("button", { name: /Re-scan/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  });
  it("ingest progress banner appears mid-ingest", () => {
    render(<FolderView folder={meta} isOwner files={[]} ingestProgress={{ current: 2, total: 5, phase: "extracting", currentFile: "MSA.pdf" }} onBack={() => undefined} onRescan={() => undefined} onToggleVisibility={() => undefined} onDelete={() => undefined}><div /></FolderView>);
    expect(screen.getByText(/Indexing 2 of 5/)).toBeTruthy();
    expect(screen.getByText(/MSA\.pdf/)).toBeTruthy();
  });
  it("Re-scan / Make private / Delete fire callbacks", () => {
    const onRescan = vi.fn(); const onToggle = vi.fn(); const onDelete = vi.fn();
    render(<FolderView folder={meta} isOwner files={[]} ingestProgress={null} onBack={() => undefined} onRescan={onRescan} onToggleVisibility={onToggle} onDelete={onDelete}><div /></FolderView>);
    fireEvent.click(screen.getByRole("button", { name: /Re-scan/ }));
    fireEvent.click(screen.getByRole("button", { name: /Make private/ }));
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    expect(onRescan).toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledWith("private");
    expect(onDelete).toHaveBeenCalled();
  });
});
