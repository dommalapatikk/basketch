type Props = {
  className?: string
  size?: number
}

// Brand mark — outline basket with CHF inside. Single colour via currentColor
// so callers control hue with Tailwind text utilities.
export function BasketchMark({ className, size = 22 }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
    >
      <path
        d="M 20 24 Q 20 8 32 8 T 44 24"
        stroke="currentColor"
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <rect
        x={8}
        y={22}
        width={48}
        height={6}
        rx={1.2}
        stroke="currentColor"
        strokeWidth={2.5}
      />
      <path
        d="M 11 28 L 53 28 L 50 50 Q 50 55 45 55 L 19 55 Q 14 55 14 50 Z"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <text
        x={32}
        y={48}
        textAnchor="middle"
        fontFamily="'Helvetica Neue', 'Inter', Arial, sans-serif"
        fontWeight={900}
        fontSize={18}
        letterSpacing={-1.6}
        fill="currentColor"
      >
        CHF
      </text>
    </svg>
  )
}
