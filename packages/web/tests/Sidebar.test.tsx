import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Sidebar } from "../src/components/Sidebar.js";

describe("Sidebar", () => {
  it("renders all primary destinations", () => {
    render(<Sidebar current="ask" onNavigate={() => {}} />);
    for (const label of ["Ask", "Library", "People", "Places", "Events", "Tasks", "Folders", "Team"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });
});
