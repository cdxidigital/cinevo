import { cn } from "@/lib/utils";

/** Official mark. Facet colours stay fixed. */
const FACETS = [
  { points: "96,45 96,112 130,112", fill: "#FF4DA5" },
  { points: "96,45 150,78 130,112", fill: "#8B2FFF" },
  { points: "150,78 205,110 130,112", fill: "#55CFFF" },
  { points: "205,110 150,146 130,112", fill: "#3F8CFF" },
  { points: "150,146 96,180 130,112", fill: "#FF9F1C" },
  { points: "96,112 96,180 130,112", fill: "#A63DE8" },
];

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="86 35 129 155" className={cn("brand__gem", className)} aria-hidden="true">
      {FACETS.map((facet) => (
        <polygon key={facet.fill} points={facet.points} fill={facet.fill} />
      ))}
    </svg>
  );
}

export function Logo({
  size = "md",
  className,
  tagline = true,
  layout,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  tagline?: boolean;
  layout?: "horizontal" | "stacked";
}) {
  const lockup = layout ?? (size === "lg" || size === "xl" ? "stacked" : "horizontal");
  const showTag = tagline && size !== "sm";
  return (
    <span className={cn("brand", className)} data-size={size} data-layout={lockup}>
      <Mark />
      <span>
        <b>CINEVO</b>
        {showTag ? <small>Your media. Your moment.</small> : null}
      </span>
    </span>
  );
}

export function BrandKicker({ children = "CINEVO" }: { children?: React.ReactNode }) {
  return (
    <p className="brand-kicker">
      <Mark />
      <span>{children}</span>
    </p>
  );
}

export function BrandWatermark({ className }: { className?: string }) {
  return (
    <span className={cn("brand-watermark", className)} aria-hidden="true">
      <Mark />
      <b>CINEVO</b>
    </span>
  );
}
