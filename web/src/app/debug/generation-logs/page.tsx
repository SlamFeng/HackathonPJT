"use client";

import { useEffect, useMemo, useState } from "react";

import {
  absUrl,
  GenerationLogDetail,
  GenerationLogListItem,
  GenerationRound,
  getGenerationLog,
  listGenerationLogs,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type DebugTaskLabels = {
  avatar_generate: string;
  pose_render: string;
  garment_extract: string;
  vton_tryon: string;
  outfit_render: string;
};

type DebugStatusLabels = {
  running: string;
  succeeded: string;
  failed: string;
  queued: string;
  canceled: string;
};

function formatTime(ms: number | undefined, locale: string) {
  if (!ms) return "-";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ms));
}

function formatDuration(ms?: number) {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function tokenText(round: GenerationRound, locale: string, emptyText: string) {
  const total = round.attempts.reduce((sum, attempt) => sum + (attempt.usageMetadata?.totalTokenCount ?? 0), 0);
  return total > 0 ? total.toLocaleString(locale) : emptyText;
}

function taskLabel(task: string, labels: DebugTaskLabels) {
  return task in labels ? labels[task as keyof DebugTaskLabels] : task;
}

function statusLabel(status: string, labels: DebugStatusLabels) {
  return status in labels ? labels[status as keyof DebugStatusLabels] : status;
}

export default function GenerationLogsPage() {
  const { t, locale } = useI18n();
  const [logs, setLogs] = useState<GenerationLogListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GenerationLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh(nextSelectedId?: string | null) {
    const items = await listGenerationLogs(100);
    setLogs(items);
    const targetId = nextSelectedId ?? selectedId ?? items[0]?.id ?? null;
    setSelectedId(targetId);
    if (targetId) {
      setDetail(await getGenerationLog(targetId));
    } else {
      setDetail(null);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
      .catch((e) => setError(e instanceof Error ? e.message : t.debug.loadFailed))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(() => logs.find((item) => item.id === selectedId), [logs, selectedId]);

  async function selectLog(id: string) {
    setSelectedId(id);
    setError(null);
    setLoading(true);
    try {
      setDetail(await getGenerationLog(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.debug.loadFailed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <section className="border-b border-zinc-200 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs text-zinc-500">{t.debug.eyebrow}</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t.debug.title}</h1>
          </div>
          <button
            className="w-fit rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-800"
            onClick={() => {
              setError(null);
              setLoading(true);
              refresh(selectedId)
                .catch((e) => setError(e instanceof Error ? e.message : t.debug.refreshFailed))
                .finally(() => setLoading(false));
            }}
          >
            {loading ? t.debug.refreshing : t.debug.refresh}
          </button>
        </div>
        {error ? <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      </section>

      <div className="grid min-h-[680px] grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="overflow-hidden border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3 text-sm font-medium">
            {t.debug.recentRecords} {logs.length}
          </div>
          <div className="max-h-[760px] overflow-auto">
            {logs.length === 0 ? (
              <div className="px-4 py-8 text-sm text-zinc-500">{t.debug.noLogs}</div>
            ) : (
              logs.map((item) => {
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    className={[
                      "block w-full border-b border-zinc-100 px-4 py-3 text-left transition-colors",
                      active ? "bg-zinc-950 text-zinc-50" : "bg-white text-zinc-900 hover:bg-zinc-50",
                    ].join(" ")}
                    onClick={() => selectLog(item.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-medium">{taskLabel(item.task, t.debug.taskLabels)}</div>
                      <div className={["text-xs", active ? "text-zinc-300" : "text-zinc-500"].join(" ")}>
                        {statusLabel(item.status, t.debug.statusLabels)}
                      </div>
                    </div>
                    <div className={["mt-1 truncate text-xs", active ? "text-zinc-300" : "text-zinc-500"].join(" ")}>
                      {formatTime(item.createdAtMs, locale)} · {item.summary?.roundCount ?? 0} {t.debug.rounds} ·{" "}
                      {item.summary?.remoteCallCount ?? 0} {t.debug.calls}
                    </div>
                    <div className={["mt-1 text-xs", active ? "text-zinc-300" : "text-zinc-500"].join(" ")}>
                      {t.debug.tokens}: {item.summary?.totalTokenCount?.toLocaleString(locale) ?? t.common.returnedNone}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="min-w-0">
          {!detail ? (
            <div className="flex h-full min-h-[420px] items-center justify-center border border-zinc-200 bg-white text-sm text-zinc-500">
              {loading ? t.common.loading : t.debug.selectLog}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <section className="border border-zinc-200 bg-white p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_260px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-tight">{taskLabel(detail.task, t.debug.taskLabels)}</h2>
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                        {statusLabel(detail.status, t.debug.statusLabels)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      {t.debug.jobId}: {detail.jobId ?? "-"}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                      <Metric label={t.debug.metrics.roundCount} value={String(detail.summary?.roundCount ?? 0)} />
                      <Metric label={t.debug.metrics.remoteCalls} value={String(detail.summary?.remoteCallCount ?? 0)} />
                      <Metric label={t.debug.metrics.successfulCalls} value={String(detail.summary?.successfulCallCount ?? 0)} />
                      <Metric label={t.debug.metrics.failedCalls} value={String(detail.summary?.failedCallCount ?? 0)} />
                      <Metric
                        label={t.debug.metrics.totalTokens}
                        value={detail.summary?.totalTokenCount?.toLocaleString(locale) ?? t.common.returnedNone}
                      />
                    </div>
                  </div>
                  <div>
                    {detail.finalImageUrl ? (
                      <img
                        src={absUrl(detail.finalImageUrl)}
                        alt={t.debug.noFinalImage}
                        className="h-64 w-full bg-zinc-50 object-contain"
                      />
                    ) : (
                      <div className="flex h-64 w-full items-center justify-center bg-zinc-50 text-xs text-zinc-500">
                        {t.debug.noFinalImage}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-5">
                {detail.rounds.map((round) => (
                  <RoundPanel key={`${round.roundIndex}-${round.kind}`} round={round} />
                ))}
              </section>

              <details className="border border-zinc-200 bg-white p-5">
                <summary className="cursor-pointer text-sm font-medium">{t.debug.rawSummary}</summary>
                <pre className="mt-4 overflow-auto bg-zinc-950 p-4 text-xs leading-5 text-zinc-50">
                  {JSON.stringify(
                    { inputs: detail.inputs, constraints: detail.constraints, meta: detail.meta, selected },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 px-3 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-zinc-950">{value}</div>
    </div>
  );
}

function RoundPanel({ round }: { round: GenerationRound }) {
  const { t, locale } = useI18n();
  const roundTitle = round.kind in t.debug.roundKinds
    ? t.debug.roundKinds[round.kind as keyof typeof t.debug.roundKinds]
    : round.kind;

  return (
    <article className="border border-zinc-200 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs text-zinc-500">
            {t.debug.round} {round.roundIndex}
          </div>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">
            {roundTitle}
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <Metric label={t.debug.metricCalls} value={String(round.attempts.length)} />
          <Metric label={t.debug.tokens} value={tokenText(round, locale, t.common.returnedNone)} />
          <Metric label={t.debug.inputParts} value={String(round.inputPartCount ?? "-")} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          <ImageStrip title={t.debug.inputImages} urls={round.inputImageUrls} />
          <ImageStrip title={t.debug.outputImages} urls={round.outputImageUrl ? [round.outputImageUrl] : []} />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="py-2 pr-3 font-medium">{t.debug.model}</th>
                  <th className="py-2 pr-3 font-medium">{t.debug.status}</th>
                  <th className="py-2 pr-3 font-medium">{t.debug.duration}</th>
                  <th className="py-2 pr-3 font-medium">prompt tokens</th>
                  <th className="py-2 pr-3 font-medium">output tokens</th>
                  <th className="py-2 pr-3 font-medium">total tokens</th>
                </tr>
              </thead>
              <tbody>
                {round.attempts.map((attempt, index) => (
                  <tr key={`${attempt.model}-${index}`} className="border-b border-zinc-100">
                    <td className="py-2 pr-3 font-mono text-xs">{attempt.model}</td>
                    <td className="py-2 pr-3">{statusLabel(attempt.status, t.debug.statusLabels)}</td>
                    <td className="py-2 pr-3">{formatDuration(attempt.durationMs)}</td>
                    <td className="py-2 pr-3">{attempt.usageMetadata?.promptTokenCount ?? "-"}</td>
                    <td className="py-2 pr-3">{attempt.usageMetadata?.candidatesTokenCount ?? "-"}</td>
                    <td className="py-2 pr-3">{attempt.usageMetadata?.totalTokenCount ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details open>
            <summary className="cursor-pointer text-sm font-medium">{t.debug.fullPrompt}</summary>
            <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap bg-zinc-950 p-4 text-xs leading-5 text-zinc-50">
              {round.prompt}
            </pre>
          </details>

          {round.error ? <div className="bg-red-50 px-3 py-2 text-sm text-red-700">{round.error}</div> : null}
        </div>
      </div>
    </article>
  );
}

function ImageStrip({ title, urls }: { title: string; urls: string[] }) {
  const { t } = useI18n();

  return (
    <div>
      <div className="mb-2 text-xs font-medium text-zinc-500">{title}</div>
      {urls.length === 0 ? (
        <div className="flex h-32 items-center justify-center bg-zinc-50 text-xs text-zinc-500">{t.common.noImage}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
          {urls.map((url) => (
            <a key={url} href={absUrl(url)} target="_blank" rel="noreferrer" className="block bg-zinc-50">
              <img src={absUrl(url)} alt={title} className="h-40 w-full object-contain" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
