"use client";

import { useState } from "react";
import type { Block, PromptAnnotation, ToolName } from "./schema";
import { Diagram } from "./diagrams";
import { Badge, Callout, cx } from "../components/ui";

const TOOL_ACCENT: Record<ToolName, string> = {
  Copilot: "border-l-[#3b7ec4]",
  Gemini: "border-l-[#8b6fd6]",
  Claude: "border-l-[#d1743f]",
  ChatGPT: "border-l-[#3f9e83]",
};

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="max-w-[68ch]">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "para":
      return <p className="mb-4 text-[16px] leading-[1.7]">{block.text}</p>;

    case "heading":
      return <h2 className="mb-3 mt-9 text-[20px] font-bold first:mt-0">{block.text}</h2>;

    case "list":
      return block.ordered ? (
        <ol className="mb-4 list-decimal pl-6 text-[16px] leading-[1.7] marker:text-subtle">
          {block.items.map((item) => (
            <li key={item} className="mb-1.5">
              {item}
            </li>
          ))}
        </ol>
      ) : (
        <ul className="mb-4 list-disc pl-6 text-[16px] leading-[1.7] marker:text-subtle">
          {block.items.map((item) => (
            <li key={item} className="mb-1.5">
              {item}
            </li>
          ))}
        </ul>
      );

    case "callout":
      return (
        <Callout tone={block.tone} title={block.title} className="my-5 !text-[14px]">
          {block.text}
        </Callout>
      );

    case "diagram":
      return <Diagram id={block.id} caption={block.caption} />;

    case "keyTerm":
      return (
        <dl className="my-5 rounded-[10px] border border-line bg-inset px-4 py-3.5">
          <dt className="text-[15px] font-bold">{block.term}</dt>
          <dd className="m-0 mt-1 text-[14px] leading-relaxed text-muted">{block.definition}</dd>
          {block.also ? <dd className="m-0 mt-2 text-[13px] italic text-subtle">{block.also}</dd> : null}
        </dl>
      );

    case "steps":
      return (
        <ol className="my-5 grid list-none gap-2 p-0">
          {block.items.map((item, index) => (
            <li key={item.title} className="grid grid-cols-[28px_1fr] gap-3 rounded-[10px] border border-line bg-raised px-4 py-3">
              <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-primary text-[12px] font-bold text-primary-fg">
                {index + 1}
              </span>
              <span>
                <span className="block text-[15px] font-bold">{item.title}</span>
                <span className="mt-0.5 block text-[14px] leading-relaxed text-muted">{item.text}</span>
              </span>
            </li>
          ))}
        </ol>
      );

    case "table":
      return (
        <figure className="my-5 overflow-x-auto rounded-[10px] border border-line">
          <table className="w-full min-w-[420px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line bg-inset text-left">
                {block.head.map((cell) => (
                  <th key={cell} className="px-3.5 py-2.5 font-bold">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.join("|")} className="border-b border-line last:border-b-0">
                  {row.map((cell, index) => (
                    <td key={index} className={cx("px-3.5 py-2.5 align-top", index === 0 && "font-semibold")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {block.caption ? (
            <figcaption className="border-t border-line bg-inset px-3.5 py-2 text-[12.5px] text-muted">{block.caption}</figcaption>
          ) : null}
        </figure>
      );

    case "prompt":
      return <PromptBlock label={block.label} text={block.text} annotations={block.annotations} />;

    case "output":
      return (
        <figure
          className={cx(
            "my-5 overflow-hidden rounded-[10px] border",
            block.verdict === "good" ? "border-ok-line" : "border-risk-line",
          )}
        >
          <figcaption
            className={cx(
              "flex items-center justify-between gap-3 px-4 py-2.5 text-[12.5px] font-bold",
              block.verdict === "good" ? "bg-ok-bg text-ok-fg" : "bg-risk-bg text-risk-fg",
            )}
          >
            <span>{block.label}</span>
            <span>{block.verdict === "good" ? "Usable" : "Looks fine, is wrong"}</span>
          </figcaption>
          <pre className="m-0 overflow-x-auto whitespace-pre-wrap bg-raised px-4 py-3.5 font-mono text-[13px] leading-relaxed">
            {block.text}
          </pre>
          <p
            className={cx(
              "m-0 border-t px-4 py-2.5 text-[13px]",
              block.verdict === "good" ? "border-ok-line bg-ok-bg/50 text-ok-fg" : "border-risk-line bg-risk-bg/60 text-risk-fg",
            )}
          >
            {block.note}
          </p>
        </figure>
      );

    case "toolCompare":
      return (
        <div className="my-6">
          <p className="eyebrow mb-2.5">Same task, four tools</p>
          <p className="mb-3 text-[15px] font-semibold">{block.task}</p>
          <div className="grid gap-2">
            {block.entries.map((entry) => (
              <div
                key={entry.tool}
                className={cx("rounded-[10px] border border-l-[4px] border-line bg-raised px-4 py-3", TOOL_ACCENT[entry.tool])}
              >
                <p className="m-0 text-[14px] font-bold">{entry.tool}</p>
                <p className="m-0 mt-1 text-[14px] leading-relaxed text-muted">{entry.text}</p>
              </div>
            ))}
          </div>
        </div>
      );

    case "useCases":
      return (
        <div className="my-5">
          <p className="eyebrow mb-2.5">Where this shows up in a normal week</p>
          <ul className="grid list-none gap-1.5 p-0">
            {block.items.map((item) => (
              <li key={item.situation} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-[8px] bg-inset px-3.5 py-2.5">
                <span className="text-[14px]">{item.situation}</span>
                <Badge>{item.play}</Badge>
              </li>
            ))}
          </ul>
        </div>
      );

    default:
      return null;
  }
}

function PromptBlock({ label, text, annotations }: { label: string; text: string; annotations?: PromptAnnotation[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the prompt is on screen and selectable.
    }
  }

  return (
    <figure className="my-6 overflow-hidden rounded-[12px] border border-line">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line bg-inset px-4 py-2.5">
        <span className="eyebrow">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-[6px] border border-line-strong bg-raised px-2.5 py-1 text-[12.5px] font-semibold transition-colors hover:bg-inset"
        >
          {copied ? "Copied" : "Copy prompt"}
        </button>
      </figcaption>
      <pre className="m-0 overflow-x-auto whitespace-pre-wrap bg-raised px-4 py-4 font-mono text-[13px] leading-[1.65]">{text}</pre>
      {annotations?.length ? (
        <div className="border-t border-line bg-inset px-4 py-3">
          <p className="eyebrow mb-2">Why each part is there</p>
          <ul className="grid list-none gap-2 p-0">
            {annotations.map((annotation) => (
              <li key={annotation.quote} className="grid gap-1">
                <code className="w-fit rounded bg-raised px-1.5 py-0.5 font-mono text-[12px] text-accent">{annotation.quote}</code>
                <span className="text-[13px] leading-relaxed text-muted">{annotation.note}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </figure>
  );
}
