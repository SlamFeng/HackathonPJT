"use client";

import { useEffect, useState } from "react";

import { useT } from "@/i18n";

export type JobPhase = "queued" | "running" | "done" | "failed";

const PHASE_KEYS: Array<{ key: JobPhase; tk: string }> = [
  { key: "queued", tk: "jp.queued" },
  { key: "running", tk: "jp.running" },
  { key: "done", tk: "jp.done" },
];

function phaseIndex(phase: JobPhase) {
  if (phase === "queued") return 0;
  if (phase === "running") return 1;
  return 2; // done / failed 都落在末段
}

type Props = {
  phase: JobPhase;
  /** 更细的当前阶段文字（如「上传图片」「质检中」），可选 */
  label?: string;
  /** 开始时间（ms），用于显示已用时；不传则不显示计时 */
  startedAtMs?: number | null;
  expectedText?: string;
  error?: string | null;
  onRetry?: () => void;
};

/**
 * 取代「假百分比进度条」：用阶段步进 + 已用时 + 预期 + 不确定态动画，
 * 诚实表达「在跑、但时长不定」，避免数字卡住制造焦虑。
 */
export function JobProgress({
  phase,
  label,
  startedAtMs,
  expectedText,
  error,
  onRetry,
}: Props) {
  const t = useT();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (phase === "done" || phase === "failed" || !startedAtMs) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, startedAtMs]);

  if (phase === "failed") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <div className="text-sm font-medium text-red-700">{t("jp.failed")}</div>
        {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
        {onRetry ? (
          <button
            onClick={onRetry}
            className="mt-3 rounded-full bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            {t("common.retry")}
          </button>
        ) : null}
      </div>
    );
  }

  const active = phaseIndex(phase);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      {/* 阶段步进 */}
      <div className="flex items-center gap-2">
        {PHASE_KEYS.map((p, i) => {
          const state = i < active ? "past" : i === active ? "current" : "future";
          return (
            <div key={p.key} className="flex flex-1 items-center gap-2">
              <span
                className={[
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
                  state === "past"
                    ? "bg-zinc-900 text-zinc-50"
                    : state === "current"
                      ? "bg-zinc-900 text-zinc-50"
                      : "bg-zinc-200 text-zinc-500",
                ].join(" ")}
              >
                {state === "past" ? "✓" : i + 1}
              </span>
              <span className={["text-xs", state === "future" ? "text-zinc-400" : "text-zinc-700"].join(" ")}>
                {t(p.tk)}
              </span>
              {i < PHASE_KEYS.length - 1 ? <span className="h-px flex-1 bg-zinc-200" /> : null}
            </div>
          );
        })}
      </div>

      {/* 不确定态动画条（明确「在跑，时长不定」） */}
      {phase !== "done" ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-zinc-900" />
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
        <span>{phase === "done" ? t("jp.doneText") : label ?? t(PHASE_KEYS[active]?.tk ?? "jp.running")}</span>
        <span>
          {phase !== "done" && startedAtMs ? t("jp.elapsed", { n: elapsed }) : ""}
          {phase !== "done" ? expectedText ?? "" : ""}
        </span>
      </div>

      {/* 关键帧（Tailwind 没有内置，这里内联） */}
      <style jsx>{`
        @keyframes indeterminate {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(420%);
          }
        }
      `}</style>
    </div>
  );
}
