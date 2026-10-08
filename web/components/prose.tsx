import type { ReactNode } from "react";

/** Long-form text helpers for Docs, Risks and Terms. */

export function DocSection({ id, index, title, children }: { id: string; index?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-ink-3 py-12 first:border-t-0 first:pt-0">
      <div className="stamp mb-4 text-[12px] text-lime">{index ?? "·"}</div>
      <h2 className="font-serif text-[34px] italic leading-tight text-ink md:text-[42px]">{title}</h2>
      <div className="mt-6 space-y-5 text-[16px] leading-relaxed text-ink-2 [&_strong]:font-medium [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="stamp pt-4 text-[13px] text-ink">{children}</h3>;
}

/** Formula plate: mono, lime, on an engraved frame. */
export function Formula({ children, caption }: { children: ReactNode; caption?: ReactNode }) {
  return (
    <figure className="border border-ink-3 p-[3px]">
      <div className="overflow-x-auto border border-ink-3 px-4 py-4">
        <code className="stamp block whitespace-pre text-[13px] normal-case leading-relaxed text-lime md:text-[14px]">
          {children}
        </code>
      </div>
      {caption && <figcaption className="px-4 py-2 text-[13px] text-ink-2">{caption}</figcaption>}
    </figure>
  );
}

/** Worked example with mono lines. */
export function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-l-2 border-lime bg-[#0b0b0b] px-5 py-4">
      <div className="stamp mb-3 text-[11px] text-lime">{title}</div>
      <div className="space-y-2 text-[15px] leading-relaxed text-ink">{children}</div>
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto border border-ink-3">
      <table className="w-full min-w-[480px] border-collapse text-left">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="stamp border-b border-ink-3 px-4 py-3 text-[11px] font-normal text-ink-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-ink-3 last:border-b-0">
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-3 text-[14px] ${j === 0 ? "text-ink" : "stamp text-ink-2"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Toc({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav aria-label="On this page" className="border border-ink-3 p-[3px]">
      <div className="border border-ink-3 p-4">
        <div className="stamp mb-3 text-[11px] text-ink-2">ON THIS PAGE</div>
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li key={it.id}>
              <a href={`#${it.id}`} className="flex gap-3 text-[14px] text-ink-2 hover:text-lime">
                <span className="stamp text-[11px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                {it.label}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
