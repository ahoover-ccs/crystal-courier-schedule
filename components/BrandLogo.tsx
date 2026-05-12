"use client";

import { useState } from "react";

const PNG = "/logo.png";
const SVG = "/brand-logo.svg";

/**
 * Uses your logo from `public/logo.png` when present.
 * Add your file there (PNG or replace `public/brand-logo.svg`).
 */
export function BrandLogo() {
  const [src, setSrc] = useState(PNG);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- intentional fallback chain
    <img
      src={src}
      alt="Crystal Courier Service"
      width={200}
      height={56}
      className="h-12 w-auto max-w-[200px] object-contain object-left"
      onError={() => {
        if (src === PNG) setSrc(SVG);
      }}
    />
  );
}
