import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RelatedLinks } from "../src/components/RelatedLinks.js";

describe("RelatedLinks", () => {
  it("groups edges by type and navigates on click", () => {
    const onOpen = vi.fn();
    render(<RelatedLinks edges={[
      { relId: "R1", otherId: "P1", otherLabel: "Jane", type: "mentions" },
      { relId: "R2", otherId: "PL1", otherLabel: "Acme HQ", type: "located-at" },
    ]} onOpen={onOpen} />);
    expect(screen.getByText(/Mentions/i)).toBeInTheDocument();
    expect(screen.getByText(/Located at/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Jane"));
    expect(onOpen).toHaveBeenCalledWith("P1");
  });
});
