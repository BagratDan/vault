import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConsentToast, type IncomingRequest } from "../src/components/ConsentToast.js";

const sample = (overrides: Partial<IncomingRequest> = {}): IncomingRequest => ({
  consentRequestId: "01J0ABCDEFGHJKMNPQRSTV0001",
  requesterDisplayName: "Marcus",
  memoryId: "01J0ABCDEFGHJKMNPQRSTV0002",
  memoryTitle: "Acme MSA 2025",
  scope: "snippet",
  expiresAt: Date.now() + 5 * 60 * 1000,
  ...overrides,
});

describe("ConsentToast", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders requester, memory title, and the three primary buttons", () => {
    render(<ConsentToast request={sample()} onRespond={() => undefined} />);
    expect(screen.getByText(/Marcus wants snippet from/)).toBeTruthy();
    expect(screen.getByText("Acme MSA 2025")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Snippet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Full file" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deny" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Metadata only" })).toBeTruthy();
  });

  it("invokes onRespond with the correct decision", () => {
    const onRespond = vi.fn();
    render(<ConsentToast request={sample()} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole("button", { name: "Snippet" }));
    expect(onRespond).toHaveBeenCalledWith("01J0ABCDEFGHJKMNPQRSTV0001", "approve-snippet");
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(onRespond).toHaveBeenCalledWith("01J0ABCDEFGHJKMNPQRSTV0001", "deny");
  });

  it("renders the yellow ratePolicy banner when ratePolicy === 'warned'", () => {
    render(<ConsentToast request={sample({ ratePolicy: "warned" })} onRespond={() => undefined} />);
    expect(screen.getByText(/approved several from Marcus/)).toBeTruthy();
  });
});
