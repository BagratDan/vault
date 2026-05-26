import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FolderList, type FolderRow } from "../src/components/FolderList.js";

const SELF = "a".repeat(64);
const OTHER = "b".repeat(64);
const own: FolderRow = { folderId: "01J0OWN0000000000000000000", displayName: "Acme MSA", visibility: "public", ownerPeerId: SELF, fileCount: 7, createdAt: "2026-05-26T10:00:00.000Z" };
const shared: FolderRow = { folderId: "01J0SHR0000000000000000000", displayName: "Marcus shared", visibility: "public", ownerPeerId: OTHER, fileCount: 3, createdAt: "2026-05-26T10:00:00.000Z" };

describe("FolderList", () => {
  it("renders empty-state guidance when no folders", () => {
    render(<FolderList folders={[]} selfPeerId={SELF} onOpen={() => undefined} onAddClick={() => undefined} />);
    expect(screen.getByText(/No folders yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add folder/ })).toBeTruthy();
  });
  it("separates own folders from shared", () => {
    render(<FolderList folders={[own, shared]} selfPeerId={SELF} onOpen={() => undefined} onAddClick={() => undefined} />);
    expect(screen.getByText("Acme MSA")).toBeTruthy();
    expect(screen.getByText("Marcus shared")).toBeTruthy();
    expect(screen.getByText(/Shared with you/i)).toBeTruthy();
  });
  it("onOpen fires with the folderId when row clicked", () => {
    const onOpen = vi.fn();
    render(<FolderList folders={[own]} selfPeerId={SELF} onOpen={onOpen} onAddClick={() => undefined} />);
    fireEvent.click(screen.getByText("Acme MSA"));
    expect(onOpen).toHaveBeenCalledWith("01J0OWN0000000000000000000");
  });
});
