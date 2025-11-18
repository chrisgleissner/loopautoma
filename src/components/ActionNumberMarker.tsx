interface ActionNumberMarkerProps {
    number: number;
    x: number;
    y: number;
}

export function ActionNumberMarker({ number, x, y }: ActionNumberMarkerProps) {
    return (
        <div
            className="action-number-marker"
            style={{
                left: `${x}px`,
                top: `${y}px`,
            }}
        >
            <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                className="action-number-marker-shape"
            >
                <defs>
                    <filter id={`shadow-${number}`} x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
                        <feOffset dx="0" dy="2" result="offsetblur" />
                        <feComponentTransfer>
                            <feFuncA type="linear" slope="0.4" />
                        </feComponentTransfer>
                        <feMerge>
                            <feMergeNode />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                {/* Circle with sharp upper-left corner point */}
                <path
                    d="M 0,0 L 4,0 C 4,0 4,2 5,3 C 6,4 8,4 16,4 A 12 12 0 1 1 4,16 C 4,8 4,6 3,5 C 2,4 0,4 0,4 Z"
                    className="action-number-marker-bg"
                    filter={`url(#shadow-${number})`}
                />
            </svg>
            <span className="action-number-marker-text">{number}</span>
        </div>
    );
}
