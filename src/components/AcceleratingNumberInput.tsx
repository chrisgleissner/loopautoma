import { useCallback, useEffect, useRef } from "react";
import type {
    CSSProperties,
    InputHTMLAttributes,
    PointerEvent as ReactPointerEvent,
    KeyboardEvent as ReactKeyboardEvent,
    ChangeEvent,
} from "react";

const HOLD_INTERVAL_MS = 160;
const STEP_STAGES: Array<{ after: number; step: number }> = [
    { after: 0, step: 1 },
    { after: 2000, step: 5 },
    { after: 4000, step: 10 },
    { after: 6000, step: 50 },
    { after: 8000, step: 100 },
];

type Direction = 1 | -1;

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
    value: number | "";
    onValueChange: (next: number | "") => void;
    containerClassName?: string;
    containerStyle?: CSSProperties;
};

const resolveStep = (elapsedMs: number) => {
    let step = 1;
    for (const stage of STEP_STAGES) {
        if (elapsedMs >= stage.after) {
            step = stage.step;
        } else {
            break;
        }
    }
    return step;
};

export function AcceleratingNumberInput({
    value,
    onValueChange,
    containerClassName,
    containerStyle,
    className,
    style,
    min,
    max,
    ...inputProps
}: Props) {
    const holdIntervalRef = useRef<number | null>(null);
    const holdStartedRef = useRef<number | null>(null);
    const holdDirectionRef = useRef<Direction | null>(null);

    const clearHold = useCallback(() => {
        if (holdIntervalRef.current) {
            clearInterval(holdIntervalRef.current);
            holdIntervalRef.current = null;
        }
        holdStartedRef.current = null;
        holdDirectionRef.current = null;
    }, []);

    useEffect(() => clearHold, [clearHold]);

    const clampValue = useCallback(
        (next: number) => {
            let result = next;
            if (typeof min === "number") {
                result = Math.max(min, result);
            }
            if (typeof max === "number") {
                result = Math.min(max, result);
            }
            return result;
        },
        [min, max],
    );

    const applyDelta = useCallback(
        (direction: Direction, useHoldStep: boolean) => {
            const current = typeof value === "number" ? value : 0;
            const elapsed = holdStartedRef.current ? Date.now() - holdStartedRef.current : 0;
            const step = useHoldStep ? resolveStep(elapsed) : 1;
            const next = clampValue(current + direction * step);
            onValueChange(next);
        },
        [clampValue, onValueChange, value],
    );

    const handlePointerDown = useCallback(
        (direction: Direction) => (evt: ReactPointerEvent<HTMLButtonElement>) => {
            evt.preventDefault();
            evt.currentTarget.setPointerCapture(evt.pointerId);
            holdDirectionRef.current = direction;
            holdStartedRef.current = Date.now();
            applyDelta(direction, false);
            if (holdIntervalRef.current) {
                clearInterval(holdIntervalRef.current);
            }
            holdIntervalRef.current = window.setInterval(() => {
                if (holdDirectionRef.current) {
                    applyDelta(holdDirectionRef.current, true);
                }
            }, HOLD_INTERVAL_MS);
        },
        [applyDelta],
    );

    const handlePointerUp = useCallback((evt: ReactPointerEvent<HTMLButtonElement>) => {
        evt.preventDefault();
        try {
            evt.currentTarget.releasePointerCapture(evt.pointerId);
        } catch {
            // ignore – releasePointerCapture can throw if not captured
        }
        clearHold();
    }, [clearHold]);

    const handleButtonKeyDown = useCallback(
        (direction: Direction) => (evt: ReactKeyboardEvent<HTMLButtonElement>) => {
            if (evt.key === " " || evt.key === "Enter") {
                evt.preventDefault();
                applyDelta(direction, false);
            }
        },
        [applyDelta],
    );

    const handleInputChange = useCallback(
        (evt: ChangeEvent<HTMLInputElement>) => {
            if (evt.target.value === "") {
                onValueChange("");
                return;
            }
            const next = Number(evt.target.value);
            if (!Number.isNaN(next)) {
                onValueChange(clampValue(next));
            }
        },
        [clampValue, onValueChange],
    );

    return (
        <div className={`accelerating-number-input ${containerClassName ?? ""}`} style={containerStyle}>
            <input
                {...inputProps}
                type="number"
                value={value}
                onChange={handleInputChange}
                className={className}
                style={{ ...style, minWidth: 0 }}
            />
            <div className="accelerating-number-input__controls">
                <button
                    type="button"
                    onPointerDown={handlePointerDown(1)}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={clearHold}
                    onPointerCancel={clearHold}
                    onKeyDown={handleButtonKeyDown(1)}
                    title="Increase value"
                    aria-label="Increase value"
                >
                    +
                </button>
                <button
                    type="button"
                    onPointerDown={handlePointerDown(-1)}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={clearHold}
                    onPointerCancel={clearHold}
                    onKeyDown={handleButtonKeyDown(-1)}
                    title="Decrease value"
                    aria-label="Decrease value"
                >
                    −
                </button>
            </div>
        </div>
    );
}
