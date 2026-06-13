// FORGE prototype — core brand marks, icons, and numeric keypad.
// CSS lives in the host HTML (.fg* system). Components export to window.

// ── Slash Beam wordmark (primary lockup) ──────────────────────
function SlashWordmark({ size = 40, color = '#F7F2E8', acc = '#FF5A1E' }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', lineHeight: 1, whiteSpace: 'nowrap',
      fontFamily: "'Saira Condensed',sans-serif", fontWeight: 800, textTransform: 'uppercase',
      fontSize: size, color,
    }}>
      <span>SWOLE</span>
      <span style={{ color: acc, fontSize: size * 1.18, margin: `0 ${size * 0.2}px`, transform: 'translateY(2px)' }}>/</span>
      <span style={{ color: acc }}>OS</span>
    </div>
  );
}

// ── Loaded Bar monogram (app icon) ────────────────────────────
function LoadedBarIcon({ size = 56, radius = 14 }) {
  const plate = (h, op) => (
    <div style={{ width: size * 0.075, height: size * h, background: '#FF5A1E', opacity: op, borderRadius: 1 }}></div>
  );
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: 'linear-gradient(150deg,#221C14,#0C0B0A)',
      border: '1px solid #2B2419',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.05)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: size * 0.045,
    }}>
      {plate(0.28, 0.55)}
      {plate(0.42, 1)}
      <div style={{
        fontFamily: "'Saira Condensed',sans-serif", fontWeight: 800,
        fontSize: size * 0.52, color: '#F7F2E8', margin: `0 ${size * 0.05}px`, lineHeight: 1,
      }}>S</div>
      {plate(0.42, 1)}
      {plate(0.28, 0.55)}
    </div>
  );
}

// ── Numeric keypad (bottom sheet) ─────────────────────────────
function Keypad({ onKey, onDone, label, rpe, onChip }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
  return (
    <div className="fg-keypad">
      <div className="fg-keypad-bar">
        <span className="fg-lbl">{label || 'Enter value'}</span>
        <button className="fg-keypad-done" onClick={onDone}>DONE</button>
      </div>
      {rpe && (
        <div className="fg-rpe-row">
          {['6', '7', '7.5', '8', '8.5', '9', '9.5', '10'].map(v => (
            <button key={v} className="fg-rpe-chip" onClick={() => onChip(v)}>{v}</button>
          ))}
        </div>
      )}
      <div className="fg-keypad-grid">
        {keys.map(k => (
          <button
            key={k}
            className={'fg-key' + (k === 'del' ? ' fg-key-del' : '')}
            onClick={() => onKey(k)}
          >
            {k === 'del'
              ? <svg width="24" height="18" viewBox="0 0 24 18"><path d="M7 1h14a2 2 0 012 2v12a2 2 0 01-2 2H7l-6-8 6-8z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M11 6l5 6M16 6l-5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
              : k}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Small inline icons (stroke) ───────────────────────────────
function Icon({ name, size = 24, stroke = 'currentColor', sw = 2 }) {
  const p = { fill: 'none', stroke, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    home: <path d="M3 11l9-7 9 7M5 10v10h14V10" {...p} />,
    plus: <path d="M12 5v14M5 12h14" {...p} />,
    history: <g {...p}><path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.5M3 4v4h4" /><path d="M12 8v4l3 2" /></g>,
    user: <g {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></g>,
    flame: <path d="M12 3c1 4 5 5 5 9a5 5 0 11-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5-1-8z" {...p} />,
    bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" {...p} />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" {...p} />,
    check: <path d="M4 12l5 5L20 6" {...p} />,
    x: <path d="M6 6l12 12M18 6L6 18" {...p} />,
    chevL: <path d="M15 5l-7 7 7 7" {...p} />,
    search: <g {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></g>,
    target: <g {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.5" /></g>,
    trophy: <g {...p}><path d="M7 4h10v5a5 5 0 01-10 0V4z" /><path d="M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M9 18h6M12 14v4M9 21h6" /></g>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24">{paths[name]}</svg>;
}

Object.assign(window, { SlashWordmark, LoadedBarIcon, Keypad, Icon });
