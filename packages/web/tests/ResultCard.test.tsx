import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResultCard } from "../src/components/ResultCard.js";

describe("ResultCard", () => {
  it("shows owner chip and Request access button for remote hits", () => {
    render(
      <ResultCard
        memoryId="01J0ABCDEFGHJKMNPQRSTV0001"
        score={0.91}
        snippet="indemnification ••• ••• Acme •••"
        tags={[]}
        ownerPeerId={"b".repeat(64)}
        ownerDisplayName="Sarah"
        onRequestAccess={() => undefined}
      />
    );
    expect(screen.getByText("Sarah")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Request access/ })).toBeTruthy();
  });

  it("hides Request access for local hits (no ownerPeerId)", () => {
    render(
      <ResultCard
        memoryId="01J0ABCDEFGHJKMNPQRSTV0001"
        score={0.91}
        snippet="local snippet"
        tags={[]}
        onRequestAccess={() => undefined}
      />
    );
    expect(screen.queryByRole("button", { name: /Request access/ })).toBeNull();
  });

  it("dropdown emits the picked scope", () => {
    const onRequestAccess = vi.fn();
    render(
      <ResultCard
        memoryId="01J0ABCDEFGHJKMNPQRSTV0001"
        score={0.91}
        snippet="blurred"
        tags={[]}
        ownerPeerId={"b".repeat(64)}
        ownerDisplayName="Sarah"
        onRequestAccess={onRequestAccess}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Request access/ }));
    fireEvent.click(screen.getByRole("button", { name: "Snippet" }));
    expect(onRequestAccess).toHaveBeenCalledWith("snippet");
  });

  it("renders green check when fullContentAvailable", () => {
    render(
      <ResultCard
        memoryId="01J0ABCDEFGHJKMNPQRSTV0001"
        score={0.91}
        snippet="the actual full snippet from Sarah"
        tags={[]}
        ownerPeerId={"b".repeat(64)}
        ownerDisplayName="Sarah"
        fullContentAvailable
      />
    );
    expect(screen.getByLabelText("granted")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Request access/ })).toBeNull();
  });
});
