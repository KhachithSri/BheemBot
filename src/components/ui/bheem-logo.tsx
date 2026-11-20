interface BheemLogoProps {
  size?: number;
  className?: string;
}

export function BheemLogo({ size = 32, className }: BheemLogoProps) {
  return (
    <img
      src="/images/bheem-icon.png"
      width={size}
      height={size}
      className={className}
      alt="Bheem"
      draggable={false}
    />
  );
}
