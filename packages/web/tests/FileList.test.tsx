import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileList } from "../src/components/FileList.js";

describe("FileList", () => {
  it("renders empty state", () => {
    render(<FileList files={[]} />);
    expect(screen.getByText(/No files indexed yet/)).toBeTruthy();
  });
  it("renders summaries + memoryId prefix + tags", () => {
    render(<FileList files={[{ memoryId: "01J0ABCDEFGHJKMNPQRSTV0001", summary: "Acme MSA indemnification clause", createdAt: "2026-05-26T10:00:00.000Z", tags: ["commitment", "migration"] }]} />);
    expect(screen.getByText(/Acme MSA indemnification/)).toBeTruthy();
    expect(screen.getByText("01J0ABCD")).toBeTruthy();
    expect(screen.getByText("commitment")).toBeTruthy();
  });
});
