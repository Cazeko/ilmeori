import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ExportBlock } from "@/lib/approval-export";

/**
 * 근거 꼬리표가 붙은 결재 문서 본문 — 화면용.
 *
 * 인계 화면과 **같은 색 언어**를 쓴다. accent(주황)는 이 제품에서
 * 「기계가 뽑은 것·근거 꼬리표」의 색이고, 사람이 쓴 문장에는 쓰지 않는다.
 *
 * 인계서와 다른 점이 하나 있다 — 여기서는 꼬리표가 **항목이 아니라 줄마다**
 * 붙는다. 결재 문서는 문장 하나가 곧 하나의 주장이고, 심사에서 나오는 물음도
 * 「그 한 문장은 어디서 나왔느냐」이기 때문이다.
 */
export function ExportBlocks({ blocks }: { blocks: readonly ExportBlock[] }) {
  return (
    <div className="flex flex-col gap-6">
      {blocks.map((block) => (
        <section key={block.key} aria-labelledby={`export-${block.key}`}>
          <h3
            id={`export-${block.key}`}
            className="mb-2 text-h3 font-bold text-gray-90"
          >
            {block.heading}
          </h3>

          <div className="flex flex-col gap-3">
            {block.lines.map((line, i) => (
              <div key={i}>
                <p
                  className={cn(
                    "text-body leading-relaxed break-keep whitespace-pre-line",
                    line.quote
                      ? "border-l-2 border-rule-hair pl-3 text-gray-70 italic"
                      : block.empty
                        ? "text-gray-60"
                        : "text-gray-80",
                  )}
                >
                  {line.quote ? `“${line.text}”` : line.text}
                </p>
                {line.source ? (
                  <p className="mt-1 flex items-start gap-2 text-body-xs leading-relaxed break-keep text-gray-60">
                    <Sparkles
                      aria-hidden
                      className="mt-1 size-3 shrink-0 text-accent-text"
                    />
                    <span>
                      <span className="font-bold">근거:</span> {line.source}
                    </span>
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
