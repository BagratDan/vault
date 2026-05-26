import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InviteTokenDisplay } from "../src/components/InviteTokenDisplay.js";

describe("InviteTokenDisplay", () => {
  it("renders the token text and an expiry hint", () => {
    const token = "invite-token-abc123-xyz789";
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    render(<InviteTokenDisplay token={token} expiresAt={expiresAt} onDismiss={() => undefined} />);
    const textarea = screen.getByDisplayValue(token) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.readOnly).toBe(true);
    expect(screen.getByText(/share this token out-of-band/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy to clipboard/i })).toBeTruthy();
  });
});
