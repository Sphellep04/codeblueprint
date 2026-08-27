/** The header's brand mark: a small node-graph glyph on a rounded badge — ties the logo directly
 * to what the product actually does (map a codebase's real connections) rather than being an
 * arbitrary decoration. */
export default function Logo() {
  return (
    <span className="app-logo" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="3.2" r="1.6" fill="currentColor" />
        <circle cx="3.2" cy="12.2" r="1.6" fill="currentColor" />
        <circle cx="12.8" cy="12.2" r="1.6" fill="currentColor" />
        <path d="M6.9 4.5 L4.3 10.6 M9.1 4.5 L11.7 10.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </span>
  );
}
