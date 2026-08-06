"use client";

import type { DiagramId } from "./diagram-ids";

/**
 * Inline SVG only. No external assets, so diagrams work offline and inherit the
 * active theme through currentColor and the CSS custom properties.
 */

const INK = "var(--fg)";
const MUTED = "var(--fg-muted)";
const LINE = "var(--line-strong)";
const FOREST = "var(--brand-forest)";
const MINT = "var(--brand-mint)";
const SIGNAL = "var(--brand-signal)";
const SURFACE = "var(--bg-raised)";
const INSET = "var(--bg-inset)";

function Frame({ children, viewBox, label }: { children: React.ReactNode; viewBox: string; label: string }) {
  return (
    <svg viewBox={viewBox} role="img" aria-label={label} className="h-auto w-full" style={{ maxWidth: "100%" }}>
      {children}
    </svg>
  );
}

const mono = { fontFamily: "var(--font-mono)", fontSize: 11, fill: MUTED } as const;
const label = { fontFamily: "var(--font-sans)", fontSize: 13, fill: INK, fontWeight: 600 } as const;
const small = { fontFamily: "var(--font-sans)", fontSize: 11.5, fill: MUTED } as const;

function NextToken() {
  const tokens = ["The", "readiness", "review", "is", "on"];
  return (
    <Frame viewBox="0 0 640 200" label="A language model predicts the next token from the text so far">
      {tokens.map((token, index) => (
        <g key={token} transform={`translate(${12 + index * 96}, 40)`}>
          <rect width="88" height="34" rx="6" fill={INSET} stroke={LINE} />
          <text x="44" y="22" textAnchor="middle" style={mono}>
            {token}
          </text>
        </g>
      ))}
      <text x="12" y="26" style={small}>
        What it has read so far
      </text>

      <path d="M500 57 H 548" stroke={LINE} strokeWidth="1.5" markerEnd="url(#arrow)" />
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill={LINE} />
        </marker>
      </defs>

      <g transform="translate(552, 40)">
        <rect width="76" height="34" rx="6" fill={FOREST} />
        <text x="38" y="22" textAnchor="middle" style={{ ...mono, fill: "#fff" }}>
          ?
        </text>
      </g>

      <text x="12" y="104" style={label}>
        It picks the most likely next word — nothing more.
      </text>

      {[
        ["track", "62%"],
        ["schedule", "17%"],
        ["hold", "11%"],
        ["Tuesday", "4%"],
      ].map(([word, pct], index) => (
        <g key={word} transform={`translate(${12 + index * 156}, 126)`}>
          <rect width="146" height="46" rx="6" fill={SURFACE} stroke={index === 0 ? FOREST : LINE} />
          <text x="12" y="20" style={{ ...mono, fill: index === 0 ? INK : MUTED }}>
            {word}
          </text>
          <rect x="12" y="28" width="122" height="6" rx="3" fill={INSET} />
          <rect x="12" y="28" width={(122 * Number(pct.replace("%", ""))) / 100} height="6" rx="3" fill={index === 0 ? SIGNAL : LINE} />
          <text x="134" y="20" textAnchor="end" style={mono}>
            {pct}
          </text>
        </g>
      ))}
    </Frame>
  );
}

function ContextWindow() {
  return (
    <Frame viewBox="0 0 640 210" label="Everything the model can see at once is the context window">
      <rect x="12" y="30" width="616" height="120" rx="10" fill={INSET} stroke={LINE} strokeDasharray="5 4" />
      <text x="24" y="22" style={small}>
        Context window — everything it can see for this one answer
      </text>

      {[
        ["System rules", 24, 150],
        ["Your prompt", 186, 150],
        ["Sources you pasted", 348, 150],
        ["The reply", 510, 106],
      ].map(([text, x, width]) => (
        <g key={String(text)} transform={`translate(${x}, 50)`}>
          <rect width={Number(width)} height="52" rx="7" fill={SURFACE} stroke={LINE} />
          <text x={Number(width) / 2} y="30" textAnchor="middle" style={{ ...small, fill: INK }}>
            {text}
          </text>
        </g>
      ))}

      <text x="24" y="126" style={mono}>
        Costs money and attention · older turns fall out of the window
      </text>

      <g transform="translate(12, 164)">
        <rect width="616" height="34" rx="7" fill="var(--risk-bg)" stroke="var(--risk-line)" />
        <text x="14" y="22" style={{ ...small, fill: "var(--risk-fg)", fontWeight: 600 }}>
          Nothing outside this box exists to the model. It cannot look anything up unless you gave it to it.
        </text>
      </g>
    </Frame>
  );
}

function HallucinationLoop() {
  return (
    <Frame viewBox="0 0 640 190" label="Fluency and correctness are independent">
      <line x1="320" y1="24" x2="320" y2="170" stroke={LINE} />
      <line x1="40" y1="97" x2="612" y2="97" stroke={LINE} />
      <text x="326" y="20" style={small}>
        more fluent →
      </text>
      <text x="40" y="90" style={small}>
        ↑ more correct
      </text>

      {[
        ["Useful", 430, 56, MINT, "What you want"],
        ["Dangerous", 430, 132, "var(--risk-bg)", "Confident and wrong"],
        ["Obviously bad", 150, 132, INSET, "Easy to catch"],
        ["Awkward but right", 150, 56, INSET, "Fixable"],
      ].map(([title, x, y, fill, sub]) => (
        <g key={String(title)} transform={`translate(${Number(x) - 110}, ${Number(y) - 26})`}>
          <rect width="220" height="52" rx="8" fill={String(fill)} stroke={LINE} />
          <text x="110" y="22" textAnchor="middle" style={{ ...small, fill: INK, fontWeight: 700 }}>
            {title}
          </text>
          <text x="110" y="38" textAnchor="middle" style={{ ...small, fontSize: 10.5 }}>
            {sub}
          </text>
        </g>
      ))}
      <text x="320" y="184" textAnchor="middle" style={{ ...small, fill: SIGNAL, fontWeight: 700 }}>
        The bottom-right quadrant is the whole reason verification exists.
      </text>
    </Frame>
  );
}

function HelpVsHurt() {
  const rows: Array<[string, string]> = [
    ["Restating what is already written", "Deciding what should happen"],
    ["Finding contradictions across sources", "Accepting risk on the org's behalf"],
    ["Turning mess into a consistent shape", "Inventing a number nobody supplied"],
    ["Drafting the boring 80%", "Signing off the final 20%"],
  ];
  return (
    <Frame viewBox="0 0 640 210" label="Where AI helps and where it must not be used">
      <g transform="translate(12, 12)">
        <rect width="300" height="30" rx="6" fill="var(--ok-bg)" stroke="var(--ok-line)" />
        <text x="150" y="20" textAnchor="middle" style={{ ...small, fill: "var(--ok-fg)", fontWeight: 700 }}>
          Good use of AI
        </text>
      </g>
      <g transform="translate(328, 12)">
        <rect width="300" height="30" rx="6" fill="var(--risk-bg)" stroke="var(--risk-line)" />
        <text x="150" y="20" textAnchor="middle" style={{ ...small, fill: "var(--risk-fg)", fontWeight: 700 }}>
          Never delegate
        </text>
      </g>
      {rows.map(([left, right], index) => (
        <g key={left} transform={`translate(0, ${52 + index * 38})`}>
          <rect x="12" y="0" width="300" height="30" rx="6" fill={SURFACE} stroke={LINE} />
          <text x="24" y="20" style={small}>
            {left}
          </text>
          <rect x="328" y="0" width="300" height="30" rx="6" fill={SURFACE} stroke={LINE} />
          <text x="340" y="20" style={small}>
            {right}
          </text>
        </g>
      ))}
    </Frame>
  );
}

function DataClasses() {
  const classes: Array<[string, string, string, string]> = [
    ["Public", "Already outside the company", "var(--ok-bg)", "var(--ok-fg)"],
    ["Internal", "Fine for an approved tool", "var(--ok-bg)", "var(--ok-fg)"],
    ["Confidential", "Redact before it goes near AI", "var(--warn-bg)", "var(--warn-fg)"],
    ["Regulated", "Never, without a signed path", "var(--risk-bg)", "var(--risk-fg)"],
  ];
  return (
    <Frame viewBox="0 0 640 190" label="Four data classes and what each permits">
      {classes.map(([name, rule, bg, fg], index) => (
        <g key={name} transform={`translate(12, ${12 + index * 44})`}>
          <rect width="616" height="36" rx="7" fill={String(bg)} stroke={LINE} />
          <text x="16" y="23" style={{ ...small, fill: String(fg), fontWeight: 700 }}>
            {name}
          </text>
          <text x="140" y="23" style={{ ...small, fill: String(fg) }}>
            {rule}
          </text>
          <text x="600" y="23" textAnchor="end" style={{ ...mono, fill: String(fg) }}>
            {index < 2 ? "allowed" : index === 2 ? "redact" : "blocked"}
          </text>
        </g>
      ))}
    </Frame>
  );
}

function VerificationLoop() {
  const steps = ["Supply sources", "Ask", "Read the claim", "Trace to source", "Keep or cut"];
  return (
    <Frame viewBox="0 0 640 130" label="The verification loop">
      {steps.map((step, index) => (
        <g key={step} transform={`translate(${10 + index * 126}, 34)`}>
          <rect width="112" height="48" rx="8" fill={index === 3 ? FOREST : SURFACE} stroke={index === 3 ? FOREST : LINE} />
          <text
            x="56"
            y="28"
            textAnchor="middle"
            style={{ ...small, fill: index === 3 ? "#fff" : INK, fontWeight: index === 3 ? 700 : 500 }}
          >
            {step}
          </text>
          {index < steps.length - 1 ? <path d={`M114 24 H 124`} stroke={LINE} strokeWidth="1.5" markerEnd="url(#arrow2)" /> : null}
        </g>
      ))}
      <defs>
        <marker id="arrow2" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill={LINE} />
        </marker>
      </defs>
      <text x="320" y="106" textAnchor="middle" style={{ ...small, fill: SIGNAL, fontWeight: 600 }}>
        Step four is the one people skip. It is the one that makes the output usable.
      </text>
    </Frame>
  );
}

function PlayMap() {
  const plays: Array<[string, string]> = [
    ["EXTRACT-STRUCTURE", "mess → validated record"],
    ["DRAFT-FROM-EVIDENCE", "sources → cited draft"],
    ["SYNTHESIZE-MANY", "many inputs → themes"],
    ["DECISION-SUPPORT", "options → comparison"],
    ["ADVERSARIAL-REVIEW", "your work → attacked"],
    ["BUILD-THE-JIG", "repeat task → reusable tool"],
  ];
  return (
    <Frame viewBox="0 0 640 230" label="Six reusable AI plays">
      {plays.map(([name, shape], index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        return (
          <g key={name} transform={`translate(${12 + column * 312}, ${12 + row * 72})`}>
            <rect width="300" height="60" rx="8" fill={SURFACE} stroke={LINE} />
            <rect width="4" height="60" rx="2" fill={SIGNAL} />
            <text x="18" y="26" style={{ ...mono, fill: INK, fontWeight: 700 }}>
              {name}
            </text>
            <text x="18" y="44" style={small}>
              {shape}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

function JigLifecycle() {
  const stages: Array<[string, string]> = [
    ["Do it once", "by hand, badly"],
    ["Write it down", "prompt + rules"],
    ["Test 20 cases", "find the failures"],
    ["Fix and re-test", "until it holds"],
    ["Hand it over", "with a named owner"],
  ];
  return (
    <Frame viewBox="0 0 640 150" label="How a repeated task becomes a reusable jig">
      {stages.map(([title, sub], index) => (
        <g key={title} transform={`translate(${8 + index * 126}, 26)`}>
          <rect width="114" height="60" rx="8" fill={index === 2 ? MINT : SURFACE} stroke={LINE} />
          <text x="57" y="26" textAnchor="middle" style={{ ...small, fill: INK, fontWeight: 700 }}>
            {title}
          </text>
          <text x="57" y="44" textAnchor="middle" style={{ ...small, fontSize: 10.5 }}>
            {sub}
          </text>
          {index < stages.length - 1 ? <path d="M116 30 H 126" stroke={LINE} strokeWidth="1.5" /> : null}
        </g>
      ))}
      <text x="320" y="120" textAnchor="middle" style={{ ...small, fill: MUTED }}>
        A prompt that worked once is a draft. A prompt that survives twenty cases is a tool.
      </text>
    </Frame>
  );
}

function EvidenceChain() {
  return (
    <Frame viewBox="0 0 640 170" label="Every claim traces back to a source ID">
      <g transform="translate(12, 20)">
        <rect width="180" height="112" rx="8" fill={INSET} stroke={LINE} />
        <text x="14" y="24" style={{ ...small, fill: INK, fontWeight: 700 }}>
          Sources
        </text>
        {["NW-PLAN-08", "NW-UPDATE-A", "NW-METRICS-05"].map((id, index) => (
          <text key={id} x="14" y={48 + index * 22} style={mono}>
            {id}
          </text>
        ))}
      </g>

      <path d="M196 76 H 246" stroke={LINE} strokeWidth="1.5" markerEnd="url(#arrow3)" />
      <defs>
        <marker id="arrow3" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 z" fill={LINE} />
        </marker>
      </defs>

      <g transform="translate(250, 20)">
        <rect width="200" height="112" rx="8" fill={SURFACE} stroke={LINE} />
        <text x="14" y="24" style={{ ...small, fill: INK, fontWeight: 700 }}>
          Your claim
        </text>
        <text x="14" y="48" style={small}>
          &ldquo;Rehearsal slips
        </text>
        <text x="14" y="66" style={small}>
          to August 9&rdquo;
        </text>
        <text x="14" y="94" style={{ ...mono, fill: SIGNAL }}>
          [NW-UPDATE-B]
        </text>
      </g>

      <path d="M454 76 H 504" stroke={LINE} strokeWidth="1.5" markerEnd="url(#arrow3)" />

      <g transform="translate(508, 20)">
        <rect width="120" height="112" rx="8" fill={FOREST} />
        <text x="60" y="52" textAnchor="middle" style={{ ...small, fill: "#fff", fontWeight: 700 }}>
          Defensible
        </text>
        <text x="60" y="72" textAnchor="middle" style={{ ...small, fill: MINT, fontSize: 10.5 }}>
          in a steering
        </text>
        <text x="60" y="88" textAnchor="middle" style={{ ...small, fill: MINT, fontSize: 10.5 }}>
          meeting
        </text>
      </g>
      <text x="320" y="156" textAnchor="middle" style={{ ...small, fill: MUTED }}>
        No source ID means the claim is yours to defend, not the model&rsquo;s.
      </text>
    </Frame>
  );
}

const DIAGRAMS: Record<DiagramId, () => React.JSX.Element> = {
  "next-token": NextToken,
  "context-window": ContextWindow,
  "hallucination-loop": HallucinationLoop,
  "help-vs-hurt": HelpVsHurt,
  "data-classes": DataClasses,
  "verification-loop": VerificationLoop,
  "play-map": PlayMap,
  "jig-lifecycle": JigLifecycle,
  "evidence-chain": EvidenceChain,
};

export function Diagram({ id, caption }: { id: DiagramId; caption?: string }) {
  const Component = DIAGRAMS[id];
  if (!Component) return null;
  return (
    <figure className="my-6 rounded-[12px] border border-line bg-raised p-4">
      <Component />
      {caption ? <figcaption className="mt-3 text-center text-[13px] text-muted">{caption}</figcaption> : null}
    </figure>
  );
}
