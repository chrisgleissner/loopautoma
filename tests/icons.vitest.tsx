import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
    RefreshIcon,
    TrashIcon,
    InfoIcon,
    KeyboardIcon,
    MouseIcon,
    SparklesIcon,
    PlusIcon,
    ScissorsIcon,
    SettingsIcon,
} from "../src/components/Icons";

describe("Icons", () => {
    describe("RefreshIcon", () => {
        it("renders with default size", () => {
            const { container } = render(<RefreshIcon />);
            const svg = container.querySelector("svg");
            expect(svg).toBeTruthy();
            expect(svg?.getAttribute("width")).toBe("18");
            expect(svg?.getAttribute("height")).toBe("18");
        });

        it("renders with custom size", () => {
            const { container } = render(<RefreshIcon size={24} />);
            const svg = container.querySelector("svg");
            expect(svg?.getAttribute("width")).toBe("24");
            expect(svg?.getAttribute("height")).toBe("24");
        });

        it("accepts additional SVG props", () => {
            const { container } = render(<RefreshIcon className="custom-class" data-testid="refresh" />);
            const svg = container.querySelector("svg");
            expect(svg?.classList.contains("custom-class")).toBe(true);
            expect(svg?.getAttribute("data-testid")).toBe("refresh");
        });
    });

    describe("TrashIcon", () => {
        it("renders with default size", () => {
            const { container } = render(<TrashIcon />);
            const svg = container.querySelector("svg");
            expect(svg).toBeTruthy();
            expect(svg?.getAttribute("width")).toBe("18");
        });

        it("renders with custom size", () => {
            const { container } = render(<TrashIcon size={32} />);
            const svg = container.querySelector("svg");
            expect(svg?.getAttribute("width")).toBe("32");
        });
    });

    describe("InfoIcon", () => {
        it("renders correctly", () => {
            const { container } = render(<InfoIcon />);
            const svg = container.querySelector("svg");
            expect(svg).toBeTruthy();
        });

        it("has correct viewBox", () => {
            const { container } = render(<InfoIcon />);
            const svg = container.querySelector("svg");
            expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
        });
    });

    describe("KeyboardIcon", () => {
        it("renders with default size", () => {
            const { container } = render(<KeyboardIcon />);
            const svg = container.querySelector("svg");
            expect(svg).toBeTruthy();
        });

        it("accepts custom props", () => {
            const { container } = render(<KeyboardIcon style={{ color: "red" }} />);
            const svg = container.querySelector("svg");
            expect(svg?.style.color).toBe("red");
        });
    });

    describe("MouseIcon", () => {
        it("renders with correct structure", () => {
            const { container } = render(<MouseIcon />);
            const svg = container.querySelector("svg");
            expect(svg).toBeTruthy();
            expect(svg?.getAttribute("stroke")).toBe("currentColor");
            expect(svg?.getAttribute("fill")).toBe("none");
        });
    });

    describe("SparklesIcon", () => {
        it("renders correctly", () => {
            const { container } = render(<SparklesIcon />);
            const svg = container.querySelector("svg");
            expect(svg).toBeTruthy();
        });

        it("has correct stroke properties", () => {
            const { container } = render(<SparklesIcon />);
            const svg = container.querySelector("svg");
            // SVG attributes become kebab-case in DOM
            expect(svg?.getAttribute("stroke-width")).toBe("1.8");
            expect(svg?.getAttribute("stroke-linecap")).toBe("round");
            expect(svg?.getAttribute("stroke-linejoin")).toBe("round");
        });
    });

    describe("PlusIcon", () => {
        it("renders with default size", () => {
            const { container } = render(<PlusIcon />);
            const svg = container.querySelector("svg");
            expect(svg).toBeTruthy();
        });
    });

    describe("ScissorsIcon", () => {
        it("renders correctly", () => {
            const { container } = render(<ScissorsIcon />);
            const svg = container.querySelector("svg");
            expect(svg).toBeTruthy();
        });
    });

    describe("SettingsIcon", () => {
        it("renders with default size", () => {
            const { container } = render(<SettingsIcon />);
            const svg = container.querySelector("svg");
            expect(svg).toBeTruthy();
            expect(svg?.getAttribute("width")).toBe("18");
        });

        it("renders with custom size", () => {
            const { container } = render(<SettingsIcon size={48} />);
            const svg = container.querySelector("svg");
            expect(svg?.getAttribute("width")).toBe("48");
            expect(svg?.getAttribute("height")).toBe("48");
        });

        it("applies custom className", () => {
            const { container } = render(<SettingsIcon className="settings-custom" />);
            const svg = container.querySelector("svg");
            expect(svg?.classList.contains("settings-custom")).toBe(true);
        });
    });

    describe("All icons", () => {
        it("all icons have consistent base props", () => {
            const icons = [
                RefreshIcon,
                TrashIcon,
                InfoIcon,
                KeyboardIcon,
                MouseIcon,
                SparklesIcon,
                PlusIcon,
                ScissorsIcon,
                SettingsIcon,
            ];

            icons.forEach((IconComponent) => {
                const { container } = render(<IconComponent />);
                const svg = container.querySelector("svg");

                // SVG attributes become kebab-case in DOM
                expect(svg?.getAttribute("stroke")).toBe("currentColor");
                expect(svg?.getAttribute("fill")).toBe("none");
                expect(svg?.getAttribute("stroke-width")).toBe("1.8");
                expect(svg?.getAttribute("stroke-linecap")).toBe("round");
                expect(svg?.getAttribute("stroke-linejoin")).toBe("round");
                expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
            });
        });

        it("all icons accept size prop", () => {
            const icons = [
                RefreshIcon,
                TrashIcon,
                InfoIcon,
                KeyboardIcon,
                MouseIcon,
                SparklesIcon,
                PlusIcon,
                ScissorsIcon,
                SettingsIcon,
            ];

            icons.forEach((IconComponent) => {
                const { container } = render(<IconComponent size={40} />);
                const svg = container.querySelector("svg");
                expect(svg?.getAttribute("width")).toBe("40");
                expect(svg?.getAttribute("height")).toBe("40");
            });
        });
    });
});
