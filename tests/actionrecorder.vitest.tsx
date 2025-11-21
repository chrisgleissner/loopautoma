/**
 * ActionRecorder Component Tests
 * Tests for the Action Recorder window that captures clicks and text input
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActionRecorder, RecordedAction } from '../src/components/ActionRecorder';
import * as tauriBridge from '../src/tauriBridge';

vi.mock('../src/tauriBridge', () => ({
    actionRecorderClose: vi.fn(),
}));

describe('ActionRecorder', () => {
    const mockScreenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const mockOnComplete = vi.fn();
    const mockOnCancel = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders with initial state', () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        expect(screen.getByText('Action Recorder')).toBeInTheDocument();
        expect(screen.getByText(/Click on the screenshot/)).toBeInTheDocument();
        expect(screen.getByText('▶ Start Recording')).toBeInTheDocument();
        expect(screen.getByText('Recorded Actions (0)')).toBeInTheDocument();
    });

    it('toggles recording state when Start/Stop button clicked', async () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        const toggleButton = screen.getByText('▶ Start Recording');

        // Start recording
        fireEvent.click(toggleButton);
        await waitFor(() => {
            expect(screen.getByText('⏸ Stop Recording')).toBeInTheDocument();
            expect(screen.getByText('🔴 Recording')).toBeInTheDocument();
        });

        // Stop recording
        fireEvent.click(screen.getByText('⏸ Stop Recording'));
        await waitFor(() => {
            expect(screen.getByText('▶ Start Recording')).toBeInTheDocument();
            expect(screen.queryByText('🔴 Recording')).not.toBeInTheDocument();
        });
    });

    it('records click actions on screenshot', async () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        // Start recording
        fireEvent.click(screen.getByText('▶ Start Recording'));

        // Click on screenshot
        const screenshot = document.querySelector('.action-recorder-screenshot');
        expect(screenshot).toBeInTheDocument();

        if (screenshot) {
            fireEvent.click(screenshot, { clientX: 100, clientY: 200, button: 0 });
        }

        await waitFor(() => {
            expect(screen.getByText('Recorded Actions (1)')).toBeInTheDocument();
            expect(screen.getByText(/Left click at/)).toBeInTheDocument();
        });
    });

    it('records multiple click actions', async () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('▶ Start Recording'));
        const screenshot = document.querySelector('.action-recorder-screenshot');

        if (screenshot) {
            fireEvent.click(screenshot, { clientX: 100, clientY: 100, button: 0 });
            await waitFor(() => {
                expect(screen.getByText(/Left click at/)).toBeInTheDocument();
            });

            fireEvent.click(screenshot, { clientX: 300, clientY: 300, button: 1 }); // Middle click
            await waitFor(() => {
                expect(screen.getByText(/Middle click at/)).toBeInTheDocument();
            });
        }

        await waitFor(() => {
            expect(screen.getByText('Recorded Actions (2)')).toBeInTheDocument();
        });
    });

    it('records text input', async () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('▶ Start Recording'));

        // Simulate typing
        fireEvent.keyDown(window, { key: 'h' });
        fireEvent.keyDown(window, { key: 'e' });
        fireEvent.keyDown(window, { key: 'l' });
        fireEvent.keyDown(window, { key: 'l' });
        fireEvent.keyDown(window, { key: 'o' });

        // Stop recording to flush buffer
        fireEvent.click(screen.getByText('⏸ Stop Recording'));

        await waitFor(() => {
            expect(screen.getByText(/Type: "hello"/)).toBeInTheDocument();
            expect(screen.getByText('Recorded Actions (1)')).toBeInTheDocument();
        });
    });

    it('buffers text input into single action', async () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('▶ Start Recording'));

        // Type multiple characters
        'hello world'.split('').forEach(char => {
            fireEvent.keyDown(window, { key: char });
        });

        // Stop recording to flush
        fireEvent.click(screen.getByText('⏸ Stop Recording'));

        await waitFor(() => {
            expect(screen.getByText(/Type: "hello world"/)).toBeInTheDocument();
            expect(screen.getByText('Recorded Actions (1)')).toBeInTheDocument();
        });
    });

    it('flushes text buffer before recording click', async () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('▶ Start Recording'));

        // Type some text
        'test'.split('').forEach(char => {
            fireEvent.keyDown(window, { key: char });
        });

        // Click on screenshot - should flush text first
        const screenshot = document.querySelector('.action-recorder-screenshot');
        if (screenshot) {
            fireEvent.click(screenshot, { clientX: 100, clientY: 100, button: 0 });
        }

        await waitFor(() => {
            expect(screen.getByText('Recorded Actions (2)')).toBeInTheDocument();
            expect(screen.getByText(/Type: "test"/)).toBeInTheDocument();
            expect(screen.getByText(/Left click at/)).toBeInTheDocument();
        });
    });

    it('handles special keys', async () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('▶ Start Recording'));

        // Simulate Enter key
        fireEvent.keyDown(window, { key: 'Enter' });

        await waitFor(() => {
            expect(screen.getByText(/Type: "\[Enter\]"/)).toBeInTheDocument();
        });
    });

    it('handles modifier key combinations', async () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('▶ Start Recording'));

        // Simulate Ctrl+C
        fireEvent.keyDown(window, { key: 'c', ctrlKey: true });

        await waitFor(() => {
            expect(screen.getByText(/Type: "\[Ctrl\+c\]"/)).toBeInTheDocument();
        });
    });

    it('ignores modifier keys alone', async () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('▶ Start Recording'));

        // Press modifier keys alone
        fireEvent.keyDown(window, { key: 'Shift' });
        fireEvent.keyDown(window, { key: 'Control' });
        fireEvent.keyDown(window, { key: 'Alt' });
        fireEvent.keyDown(window, { key: 'Meta' });

        // Should have no actions
        expect(screen.getByText('Recorded Actions (0)')).toBeInTheDocument();
    });

    it('handles Cancel button', async () => {
        (tauriBridge.actionRecorderClose as any).mockResolvedValue(undefined);

        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('Cancel'));

        await waitFor(() => {
            expect(tauriBridge.actionRecorderClose).toHaveBeenCalled();
            expect(mockOnCancel).toHaveBeenCalled();
        });
    });

    it('handles Done button when actions exist', async () => {
        (tauriBridge.actionRecorderClose as any).mockResolvedValue(undefined);

        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        // Start recording and add actions
        fireEvent.click(screen.getByText('▶ Start Recording'));
        const screenshot = document.querySelector('.action-recorder-screenshot');
        if (screenshot) {
            fireEvent.click(screenshot, { clientX: 100, clientY: 100, button: 0 });
        }

        await waitFor(() => {
            expect(screen.getByText('Recorded Actions (1)')).toBeInTheDocument();
        });

        // Click Done
        const doneButton = screen.getByText(/Done \(1 actions\)/);
        fireEvent.click(doneButton);

        await waitFor(() => {
            expect(tauriBridge.actionRecorderClose).toHaveBeenCalled();
            expect(mockOnComplete).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        type: 'click',
                        button: 'Left',
                    }),
                ])
            );
        });
    });

    it('disables Done button when no actions', () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        const doneButton = screen.getByText(/Done \(0 actions\)/);
        expect(doneButton).toBeDisabled();
    });

    it('handles Refresh button', async () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        // Record some actions
        fireEvent.click(screen.getByText('▶ Start Recording'));
        const screenshot = document.querySelector('.action-recorder-screenshot');
        if (screenshot) {
            fireEvent.click(screenshot, { clientX: 100, clientY: 100, button: 0 });
        }

        await waitFor(() => {
            expect(screen.getByText('Recorded Actions (1)')).toBeInTheDocument();
        });

        // Click refresh
        fireEvent.click(screen.getByText('🔄 Refresh'));

        await waitFor(() => {
            expect(screen.getByText('Recorded Actions (0)')).toBeInTheDocument();
            expect(screen.getByText('▶ Start Recording')).toBeInTheDocument();
        });
    });

    it('handles Escape key to cancel', async () => {
        (tauriBridge.actionRecorderClose as any).mockResolvedValue(undefined);

        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('▶ Start Recording'));

        // Press Escape
        fireEvent.keyDown(window, { key: 'Escape' });

        await waitFor(() => {
            expect(tauriBridge.actionRecorderClose).toHaveBeenCalled();
            expect(mockOnCancel).toHaveBeenCalled();
        });
    });

    it('prevents context menu on screenshot', () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        const screenshot = document.querySelector('.action-recorder-screenshot');
        expect(screenshot).toBeInTheDocument();

        if (screenshot) {
            const event = new Event('contextmenu', { bubbles: true, cancelable: true });
            const preventDefault = vi.spyOn(event, 'preventDefault');
            screenshot.dispatchEvent(event);
            expect(preventDefault).toHaveBeenCalled();
        }
    });

    it('clears actions when starting new recording', async () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        // Record some actions
        fireEvent.click(screen.getByText('▶ Start Recording'));
        const screenshot = document.querySelector('.action-recorder-screenshot');
        if (screenshot) {
            fireEvent.click(screenshot, { clientX: 100, clientY: 100, button: 0 });
        }

        await waitFor(() => {
            expect(screen.getByText('Recorded Actions (1)')).toBeInTheDocument();
        });

        // Stop and start again
        fireEvent.click(screen.getByText('⏸ Stop Recording'));
        await waitFor(() => {
            expect(screen.getByText('▶ Start Recording')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('▶ Start Recording'));

        await waitFor(() => {
            expect(screen.getByText('Recorded Actions (0)')).toBeInTheDocument();
        });
    });

    it('renders action number markers for each action', async () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('▶ Start Recording'));
        const screenshot = document.querySelector('.action-recorder-screenshot');

        if (screenshot) {
            // Add 3 click actions
            fireEvent.click(screenshot, { clientX: 100, clientY: 100, button: 0 });
            fireEvent.click(screenshot, { clientX: 200, clientY: 200, button: 0 });
            fireEvent.click(screenshot, { clientX: 300, clientY: 300, button: 0 });
        }

        await waitFor(() => {
            const markers = document.querySelectorAll('.action-number-marker');
            expect(markers.length).toBe(3);
        });
    });

    it('converts coordinates correctly with 80% scaling', async () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.click(screen.getByText('▶ Start Recording'));
        const screenshot = document.querySelector('.action-recorder-screenshot');

        if (screenshot) {
            // Mock getBoundingClientRect
            vi.spyOn(screenshot, 'getBoundingClientRect').mockReturnValue({
                left: 0,
                top: 0,
                width: 800,
                height: 600,
                right: 800,
                bottom: 600,
                x: 0,
                y: 0,
                toJSON: () => ({})
            });

            fireEvent.click(screenshot, { clientX: 80, clientY: 80, button: 0 });
        }

        await waitFor(() => {
            expect(screen.getByText('Recorded Actions (1)')).toBeInTheDocument();
            // With 80% scaling: 80 / 0.8 = 100
            expect(screen.getByText(/Left click at \(100, 100\)/)).toBeInTheDocument();
        });
    });

    it('does not record clicks when not recording', () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        const screenshot = document.querySelector('.action-recorder-screenshot');
        if (screenshot) {
            fireEvent.click(screenshot, { clientX: 100, clientY: 100, button: 0 });
        }

        expect(screen.getByText('Recorded Actions (0)')).toBeInTheDocument();
    });

    it('does not record keyboard input when not recording', () => {
        render(
            <ActionRecorder
                screenshot={mockScreenshot}
                onComplete={mockOnComplete}
                onCancel={mockOnCancel}
            />
        );

        fireEvent.keyDown(window, { key: 'a' });
        fireEvent.keyDown(window, { key: 'b' });
        fireEvent.keyDown(window, { key: 'c' });

        expect(screen.getByText('Recorded Actions (0)')).toBeInTheDocument();
    });
});
