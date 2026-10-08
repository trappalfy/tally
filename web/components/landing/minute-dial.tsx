/** Engraved clock dial: lime arc shows how many minutes one NCU lasts on a card. */
export function MinuteDial({ minutes, size = 132 }: { minutes: number; size?: number }) {
  const C = 60;
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  const f = (n: number) => Math.round(n * 100) / 100;
  const pt = (m: number, r: number) => {
    const a = (m / 60) * Math.PI * 2 - Math.PI / 2;
    return [f(C + r * Math.cos(a)), f(C + r * Math.sin(a))] as const;
  };
  const arc = (from: number, to: number, r: number) => {
    const span = Math.min(to - from, 59.999);
    const [x1, y1] = pt(from, r);
    const [x2, y2] = pt(from + span, r);
    const large = span > 30 ? 1 : 0;
    return `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const first = Math.min(minutes, 60);
  const extra = Math.max(0, minutes - 60);

  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" className="shrink-0">
      <circle cx={C} cy={C} r="58" fill="none" stroke="var(--ink)" strokeOpacity="0.7" />
      <circle cx={C} cy={C} r="55" fill="none" stroke="var(--ink)" strokeOpacity="0.3" strokeWidth="0.5" />
      {Array.from({ length: 12 }, (_, i) => (
        <circle key={i} cx={C} cy={C} r={8 + i * 3.4} fill="none" stroke="var(--ink)" strokeOpacity="0.1" strokeWidth="0.5" />
      ))}
      {ticks.map((m) => {
        const [x1, y1] = pt(m, 52);
        const [x2, y2] = pt(m, m % 5 === 0 ? 45 : 48.5);
        return (
          <line
            key={m}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="var(--ink)"
            strokeOpacity={m % 5 === 0 ? 0.85 : 0.4}
            strokeWidth={m % 5 === 0 ? 1.2 : 0.6}
          />
        );
      })}
      {first >= 60 ? (
        <circle cx={C} cy={C} r="40" fill="none" stroke="var(--lime)" strokeWidth="5" />
      ) : (
        <path d={arc(0, first, 40)} fill="none" stroke="var(--lime)" strokeWidth="5" />
      )}
      {extra > 0 && <path d={arc(0, extra, 33)} fill="none" stroke="var(--lime)" strokeWidth="3" />}
      {(() => {
        const [hx, hy] = pt(minutes % 60, 38);
        return <line x1={C} y1={C} x2={hx} y2={hy} stroke="var(--ink)" strokeWidth="1.6" />;
      })()}
      <circle cx={C} cy={C} r="3.5" fill="var(--paper)" stroke="var(--ink)" />
    </svg>
  );
}
