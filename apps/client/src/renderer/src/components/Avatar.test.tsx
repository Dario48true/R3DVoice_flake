import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { Avatar } from "./Avatar.js";

afterEach(() => cleanup());

describe("Avatar", () => {
  it("renders an <img> when src is set", () => {
    const { container } = render(
      <Avatar src="https://example.com/me.png" fallbackInitials="Alice" fallbackColorSeed="user-1" size={32} />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("https://example.com/me.png");
  });

  it("falls back to initials when src is null", () => {
    const { container, getByText } = render(
      <Avatar src={null} fallbackInitials="Alice" fallbackColorSeed="user-1" size={32} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("A")).toBeTruthy();
  });

  it("falls back to initials on img error", () => {
    const { container, getByText } = render(
      <Avatar src="https://broken.example/x.png" fallbackInitials="Alice" fallbackColorSeed="user-1" size={32} />,
    );
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("A")).toBeTruthy();
  });

  it("upper-cases the initial", () => {
    const { getByText } = render(
      <Avatar src={null} fallbackInitials="alice" fallbackColorSeed="user-1" size={32} />,
    );
    expect(getByText("A")).toBeTruthy();
  });

  it("renders ? when fallbackInitials is empty", () => {
    const { getByText } = render(
      <Avatar src={null} fallbackInitials="" fallbackColorSeed="user-1" size={32} />,
    );
    expect(getByText("?")).toBeTruthy();
  });
});
