import React from "react";

// Simple placeholder wordmark logo. Swap this component out for an <img> tag
// pointing at a real logo file once one is available — the rest of the app
// only cares that Logo renders something and accepts a `height` prop.
export function Logo({ height = 40, style }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        height,
        lineHeight: 1,
        fontFamily: "'Noto Serif JP', serif",
        fontWeight: 700,
        letterSpacing: 2,
        fontSize: height * 0.55,
        color: "#D4AF37",
        ...style,
      }}
    >
      TTGYM
    </div>
  );
}
