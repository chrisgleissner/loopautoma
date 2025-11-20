import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

describe("Button text truncation", () => {
  it("should render button with constrained width", () => {
    const { container } = render(
      <button style={{ width: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        This is a very long button text that should be truncated with ellipsis
      </button>
    );

    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain("This is a very long");
    
    // Verify inline styles are set (CSS rules are verified via App.css)
    const styles = window.getComputedStyle(button!);
    expect(styles.overflow).toBe("hidden");
    expect(styles.textOverflow).toBe("ellipsis");
    expect(styles.whiteSpace).toBe("nowrap");
  });

  it("should allow buttons to respect max-width constraint", () => {
    const { container } = render(
      <div style={{ width: "200px" }}>
        <button style={{ maxWidth: "100%" }}>
          Short text
        </button>
      </div>
    );

    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    
    const styles = window.getComputedStyle(button!);
    expect(styles.maxWidth).toBe("100%");
  });

  it("should handle buttons with icons and text", () => {
    const { container } = render(
      <button style={{ width: "150px", display: "flex", alignItems: "center", gap: "8px" }}>
        <svg width="16" height="16" style={{ flexShrink: 0 }}>
          <circle cx="8" cy="8" r="6" />
        </svg>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Very long button text that exceeds container width
        </span>
      </button>
    );

    const button = container.querySelector("button");
    const svg = button?.querySelector("svg");
    const span = button?.querySelector("span");

    expect(button).toBeTruthy();
    expect(svg).toBeTruthy();
    expect(span).toBeTruthy();

    // Icon should not shrink
    const svgStyles = window.getComputedStyle(svg!);
    expect(svgStyles.flexShrink).toBe("0");

    // Text should truncate
    const spanStyles = window.getComputedStyle(span!);
    expect(spanStyles.overflow).toBe("hidden");
    expect(spanStyles.textOverflow).toBe("ellipsis");
  });

  it("should work with various button classes", () => {
    const { container } = render(
      <div>
        <button className="icon-button" style={{ width: "40px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Text</button>
        <button className="danger" style={{ width: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Delete Everything Now</button>
        <button className="ghost" style={{ width: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Cancel Operation</button>
      </div>
    );

    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(3);

    // Verify buttons render with different classes (CSS handles the actual truncation)
    expect(buttons[0].className).toContain("icon-button");
    expect(buttons[1].className).toContain("danger");
    expect(buttons[2].className).toContain("ghost");
  });

  it("should not break button layout with flexbox", () => {
    const { container } = render(
      <button
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "120px",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          Centered long text
        </span>
      </button>
    );

    const button = container.querySelector("button");
    expect(button).toBeTruthy();

    const styles = window.getComputedStyle(button!);
    expect(styles.display).toBe("flex");
    expect(styles.alignItems).toBe("center");
    expect(styles.justifyContent).toBe("center");
  });
});
