import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AcceleratingNumberInput } from "../src/components/AcceleratingNumberInput";

describe("AcceleratingNumberInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders with initial value", () => {
    const onValueChange = vi.fn();
    render(<AcceleratingNumberInput value={10} onValueChange={onValueChange} />);
    
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(input.value).toBe("10");
  });

  it("calls onValueChange when input is typed", () => {
    const onValueChange = vi.fn();
    render(<AcceleratingNumberInput value={10} onValueChange={onValueChange} />);
    
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "25" } });
    
    expect(onValueChange).toHaveBeenCalledWith(25);
  });

  it("handles empty input", () => {
    const onValueChange = vi.fn();
    render(<AcceleratingNumberInput value={10} onValueChange={onValueChange} />);
    
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "" } });
    
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  it("increments value when up arrow is clicked", () => {
    const onValueChange = vi.fn();
    render(<AcceleratingNumberInput value={10} onValueChange={onValueChange} />);
    
    const upButton = screen.getByLabelText("Increase value");
    fireEvent.pointerDown(upButton);
    fireEvent.pointerUp(upButton);
    
    expect(onValueChange).toHaveBeenCalledWith(11);
  });

  it("decrements value when down arrow is clicked", () => {
    const onValueChange = vi.fn();
    render(<AcceleratingNumberInput value={10} onValueChange={onValueChange} />);
    
    const downButton = screen.getByLabelText("Decrease value");
    fireEvent.pointerDown(downButton);
    fireEvent.pointerUp(downButton);
    
    expect(onValueChange).toHaveBeenCalledWith(9);
  });

  it("respects min value", () => {
    const onValueChange = vi.fn();
    render(<AcceleratingNumberInput value={5} onValueChange={onValueChange} min={5} />);
    
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "3" } });
    
    expect(onValueChange).toHaveBeenCalledWith(5);
  });

  it("respects max value", () => {
    const onValueChange = vi.fn();
    render(<AcceleratingNumberInput value={95} onValueChange={onValueChange} max={100} />);
    
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "105" } });
    
    expect(onValueChange).toHaveBeenCalledWith(100);
  });

  it("accelerates increment on hold", () => {
    const onValueChange = vi.fn();
    render(<AcceleratingNumberInput value={10} onValueChange={onValueChange} />);
    
    const upButton = screen.getByLabelText("Increase value");
    fireEvent.pointerDown(upButton);
    
    // Initial click
    expect(onValueChange).toHaveBeenCalledWith(11);
    
    // After 120ms, should trigger again
    vi.advanceTimersByTime(120);
    expect(onValueChange).toHaveBeenCalledTimes(2);
    
    // After 900ms total (past first acceleration threshold), should increment by 5
    vi.advanceTimersByTime(780);
    expect(onValueChange.mock.calls.length).toBeGreaterThan(3);
    
    fireEvent.pointerUp(upButton);
  });

  it("stops acceleration on pointer up", async () => {
    const onValueChange = vi.fn();
    render(<AcceleratingNumberInput value={10} onValueChange={onValueChange} />);
    
    const upButton = screen.getByLabelText("Increase value");
    fireEvent.pointerDown(upButton);
    
    expect(onValueChange).toHaveBeenCalledWith(11);
    
    fireEvent.pointerUp(upButton);
    vi.clearAllMocks();
    
    // Advance time - should not trigger more changes
    vi.advanceTimersByTime(500);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("handles keyboard Enter on increase button", () => {
    const onValueChange = vi.fn();
    render(<AcceleratingNumberInput value={10} onValueChange={onValueChange} />);
    
    const upButton = screen.getByLabelText("Increase value");
    fireEvent.keyDown(upButton, { key: "Enter" });
    
    expect(onValueChange).toHaveBeenCalledWith(11);
  });

  it("handles keyboard Space on decrease button", () => {
    const onValueChange = vi.fn();
    render(<AcceleratingNumberInput value={10} onValueChange={onValueChange} />);
    
    const downButton = screen.getByLabelText("Decrease value");
    fireEvent.keyDown(downButton, { key: " " });
    
    expect(onValueChange).toHaveBeenCalledWith(9);
  });

  it("applies custom className to container", () => {
    const { container } = render(
      <AcceleratingNumberInput value={10} onValueChange={vi.fn()} containerClassName="custom-class" />
    );
    
    expect(container.querySelector(".custom-class")).toBeTruthy();
  });

  it("applies custom style to container", () => {
    const { container } = render(
      <AcceleratingNumberInput 
        value={10} 
        onValueChange={vi.fn()} 
        containerStyle={{ backgroundColor: "red" }} 
      />
    );
    
    const containerDiv = container.firstChild as HTMLElement;
    expect(containerDiv.style.backgroundColor).toBe("red");
  });
});
