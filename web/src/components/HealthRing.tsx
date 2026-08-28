interface HealthRingProps {
  /** 0-100. Pass an already-animating (e.g. useCountUp) value so the ring fills in sync with the
   * number counting up, rather than snapping to its final state instantly. */
  score: number;
  color: string;
  size?: number;
}

const STROKE_WIDTH = 7;

export default function HealthRing({ score, color, size = 108 }: HealthRingProps) {
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="health-ring" aria-hidden="true">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--cb-border)" strokeWidth={STROKE_WIDTH} />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
        className="health-ring-progress"
        style={{ stroke: color }}
      />
    </svg>
  );
}
