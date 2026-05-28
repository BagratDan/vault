import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PeerList, type Peer } from "../src/components/PeerList.js";

const adminPeer: Peer = {
  peerId: "aaaaaaaa11112222",
  displayName: "Alice",
  role: "admin",
};
const memberPeer: Peer = {
  peerId: "bbbbbbbb33334444",
  displayName: "Bob",
  role: "member",
};

describe("PeerList", () => {
  it("renders singular peer count", () => {
    render(<PeerList peers={[adminPeer]} selfPeerId={adminPeer.peerId} />);
    expect(screen.getByRole("button", { name: /1 peer$/i })).toBeTruthy();
  });

  it("renders plural peer count", () => {
    render(<PeerList peers={[adminPeer, memberPeer]} selfPeerId={adminPeer.peerId} />);
    expect(screen.getByRole("button", { name: /2 peers/i })).toBeTruthy();
  });

  it("clicking the chip toggles the drawer open and closed", () => {
    render(<PeerList peers={[adminPeer]} selfPeerId={adminPeer.peerId} />);
    const chip = screen.getByRole("button", { name: /1 peer/i });
    expect(screen.queryByText(/roster/i)).toBeNull();
    fireEvent.click(chip);
    expect(screen.getByText(/roster/i)).toBeTruthy();
    fireEvent.click(chip);
    expect(screen.queryByText(/roster/i)).toBeNull();
  });

  it("drawer shows displayName, short peerId (8 chars), and role badge", () => {
    render(<PeerList peers={[adminPeer, memberPeer]} selfPeerId={adminPeer.peerId} />);
    fireEvent.click(screen.getByRole("button", { name: /2 peers/i }));
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();
    // Short peerId — first 8 chars only, no trailing chars beyond the "(you)" suffix
    expect(screen.getByText(/^aaaaaaaa \(you\)$/)).toBeTruthy();
    expect(screen.getByText(/^bbbbbbbb$/)).toBeTruthy();
    expect(screen.getByText("admin")).toBeTruthy();
    expect(screen.getByText("member")).toBeTruthy();
  });

  it('"(you)" suffix appears next to the self peer', () => {
    render(<PeerList peers={[adminPeer, memberPeer]} selfPeerId={memberPeer.peerId} />);
    fireEvent.click(screen.getByRole("button", { name: /2 peers/i }));
    expect(screen.getByText(/bbbbbbbb \(you\)/)).toBeTruthy();
    // Alice should not have the "(you)" suffix
    expect(screen.queryByText(/aaaaaaaa \(you\)/)).toBeNull();
  });

  it("Create invite button appears only when self peer is admin and onCreateInvite is provided", () => {
    // Self is admin + handler provided => visible
    const onCreateInvite = vi.fn();
    const { unmount } = render(
      <PeerList
        peers={[adminPeer, memberPeer]}
        selfPeerId={adminPeer.peerId}
        onCreateInvite={onCreateInvite}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /2 peers/i }));
    expect(screen.getByRole("button", { name: /create invite/i })).toBeTruthy();
    unmount();

    // Self is member => hidden, even with handler
    const { unmount: unmount2 } = render(
      <PeerList
        peers={[adminPeer, memberPeer]}
        selfPeerId={memberPeer.peerId}
        onCreateInvite={onCreateInvite}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /2 peers/i }));
    expect(screen.queryByRole("button", { name: /create invite/i })).toBeNull();
    unmount2();

    // Self is admin but no handler => hidden
    render(<PeerList peers={[adminPeer, memberPeer]} selfPeerId={adminPeer.peerId} />);
    fireEvent.click(screen.getByRole("button", { name: /2 peers/i }));
    expect(screen.queryByRole("button", { name: /create invite/i })).toBeNull();
  });

  it("clicking Create invite calls onCreateInvite", () => {
    const onCreateInvite = vi.fn();
    render(
      <PeerList
        peers={[adminPeer]}
        selfPeerId={adminPeer.peerId}
        onCreateInvite={onCreateInvite}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /1 peer/i }));
    fireEvent.click(screen.getByRole("button", { name: /create invite/i }));
    expect(onCreateInvite).toHaveBeenCalledTimes(1);
  });
});
