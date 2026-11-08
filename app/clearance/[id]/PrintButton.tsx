"use client";

export function PrintButton() {
  return (
    <button className="btn" onClick={() => window.print()}>
      Download / Print PDF
    </button>
  );
}
