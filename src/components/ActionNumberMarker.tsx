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
        height="40"
        viewBox="0 0 32 40"
        className="action-number-marker-shape"
      >
        {/* Teardrop shape with sharp top-left corner pointing to exact pixel */}
        <path
          d="M 0,0 L 8,0 C 20,0 32,8 32,20 C 32,32 20,40 16,40 C 12,40 0,32 0,20 Z"
          className="action-number-marker-bg"
        />
      </svg>
      <span className="action-number-marker-text">{number}</span>
    </div>
  );
}
