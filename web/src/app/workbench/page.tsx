"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { absUrl, createJobsBatch, exportJobsZip, waitForImageJob, type BatchJobItem } from "@/lib/api";
import { createTryon } from "@/lib/assets";
import { switchToAvatar } from "@/lib/useHydrateAssets";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { useT } from "@/i18n";
import {
  ClosetCategory,
  ClosetItem,
  POSES,
  PoseId,
  useAppStore,
} from "@/stores/useAppStore";

// 单次 vton 试穿的额度成本（与后端 credits COSTS 保持一致）
const TRYON_COST = 2;
// 后端单批上限
const BATCH_LIMIT = 50;

function comboKey(poseId: PoseId, garmentId: string) {
  return `${poseId}:${garmentId}`;
}

// worker 并发≈2，单张约 10–30s；据此给出粗略时长区间，让卖家心里有数。
const WORKER_CONCURRENCY = 2;
type TFn = (key: string, vars?: Record<string, string | number>) => string;
function fmtDuration(sec: number, t: TFn) {
  if (sec < 60) return t("dur.sec", { n: sec });
  return t("dur.min", { n: Math.max(1, Math.round(sec / 60)) });
}
function estTimeRange(n: number, t: TFn) {
  const waves = Math.ceil(n / WORKER_CONCURRENCY);
  return `${fmtDuration(waves * 10, t)}–${fmtDuration(waves * 30, t)}`;
}

type CellStatus = "running" | "succeeded" | "failed";
type Cell = {
  key: string;
  poseId: PoseId;
  garment: ClosetItem;
  status: CellStatus;
  jobId?: string;
  imageUrl?: string;
  error?: string;
};

export default function WorkbenchPage() {
  const avatar = useAppStore((s) => s.avatar);
  const avatars = useAppStore((s) => s.avatars);
  const closet = useAppStore((s) => s.closet);
  const setTryOnRender = useAppStore((s) => s.setTryOnRender);
  const t = useT();

  const [selectedGarments, setSelectedGarments] = useState<Set<string>>(new Set());
  const [selectedPoses, setSelectedPoses] = useState<Set<PoseId>>(new Set());
  const [skipExisting, setSkipExisting] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  // 本次批量运行的逐格状态（key = pose:garment）
  const [cells, setCells] = useState<Record<string, Cell>>({});

  // 姿态准备进度（模特创建后姿态在后台预生成，这里把它显性化）
  const poseRunningCount = POSES.filter((p) => avatar.poseRenders[p.id]?.status === "running").length;

  // 当前模特已就绪（已生成姿态图）的姿态集合
  const readyPoses = useMemo(
    () => POSES.filter((p) => avatar.poseRenders[p.id]?.status === "succeeded" && avatar.poseRenders[p.id]?.imageUrl),
    [avatar.poseRenders],
  );
  const readyPoseIds = useMemo(() => new Set(readyPoses.map((p) => p.id)), [readyPoses]);

  // 选中的「单品 × 姿态」组合；按是否已有成功试穿缓存拆分
  const combos = useMemo(() => {
    const out: Array<{ key: string; poseId: PoseId; garment: ClosetItem; cached: boolean }> = [];
    for (const gid of selectedGarments) {
      const garment = closet.find((c) => c.id === gid);
      if (!garment) continue;
      for (const pid of selectedPoses) {
        if (!readyPoseIds.has(pid)) continue;
        const key = comboKey(pid, gid);
        const cached = avatar.tryOnRenders[key]?.status === "succeeded";
        out.push({ key, poseId: pid, garment, cached });
      }
    }
    return out;
  }, [selectedGarments, selectedPoses, closet, readyPoseIds, avatar.tryOnRenders]);

  const toGenerate = useMemo(
    () => (skipExisting ? combos.filter((c) => !c.cached) : combos),
    [combos, skipExisting],
  );
  const estCost = toGenerate.length * TRYON_COST;
  const overLimit = toGenerate.length > BATCH_LIMIT;

  const succeededCells = useMemo(
    () => Object.values(cells).filter((c) => c.status === "succeeded" && c.jobId),
    [cells],
  );

  function toggleGarment(id: string) {
    setSelectedGarments((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function togglePose(id: PoseId) {
    setSelectedPoses((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function selectAllGarments() {
    setSelectedGarments(new Set(closet.map((c) => c.id)));
  }
  function clearGarments() {
    setSelectedGarments(new Set());
  }
  function selectAllReadyPoses() {
    setSelectedPoses(new Set(readyPoses.map((p) => p.id)));
  }

  async function handleSwitchModel(id: string, imageUrlAbs: string) {
    if (running) return;
    try {
      await switchToAvatar(id, imageUrlAbs);
      setSelectedPoses(new Set());
      setCells({});
    } catch (e) {
      setError(e instanceof Error ? e.message : t("wb.err.switch"));
    }
  }

  // 校验后弹出确认（透明展示张数/时长/额度），由用户确认再真正生成
  function handleRunClick() {
    setError(null);
    if (!avatar.avatarId || !avatar.avatarImageUrl) {
      setError(t("wb.err.noModel"));
      return;
    }
    if (toGenerate.length === 0) {
      setError(t("wb.err.noCombo"));
      return;
    }
    if (overLimit) {
      setError(t("wb.overLimit", { n: BATCH_LIMIT }));
      return;
    }
    setConfirming(true);
  }

  async function handleConfirmRun() {
    setConfirming(false);
    setCells({}); // 新的一次完整运行：清空旧网格
    await runCombos(toGenerate.map((c) => ({ key: c.key, poseId: c.poseId, garment: c.garment })));
  }

  type RunCombo = { key: string; poseId: PoseId; garment: ClosetItem };

  // 真正执行：把给定组合入队并轮询；合并进 cells（用于完整运行与失败重试两种场景）
  async function runCombos(combosToRun: RunCombo[]) {
    if (combosToRun.length === 0) return;
    setError(null);
    setRunning(true);
    // 先把这些格置为 running（合并，不影响其它格）
    setCells((prev) => {
      const next = { ...prev };
      for (const c of combosToRun) {
        next[c.key] = { key: c.key, poseId: c.poseId, garment: c.garment, status: "running" };
      }
      return next;
    });

    const items: BatchJobItem[] = combosToRun.map((c) => {
      const poseUrl = avatar.poseRenders[c.poseId]!.imageUrl!;
      return {
        jobType: "vton_tryon",
        inputs: {
          avatarImageUrl: poseUrl,
          garmentImageUrl: c.garment.imageUrl,
          garmentCategory: c.garment.category,
          poseId: c.poseId,
        },
        constraints: { identityLock: true, poseLock: true, garmentLock: true, qualityLevel: "high", timeoutSec: 300 },
      };
    });

    try {
      const batch = await createJobsBatch(items);
      setCells((prev) => {
        const next = { ...prev };
        combosToRun.forEach((c, i) => {
          const jobId = batch.jobs[i]?.jobId;
          if (jobId && next[c.key]) next[c.key] = { ...next[c.key]!, jobId };
        });
        return next;
      });

      await Promise.all(
        combosToRun.map(async (c, i) => {
          const jobId = batch.jobs[i]?.jobId;
          if (!jobId) {
            setCells((p) => ({ ...p, [c.key]: { ...p[c.key]!, status: "failed", error: "未创建任务" } }));
            return;
          }
          try {
            const { image } = await waitForImageJob(jobId);
            const meta = (image.meta ?? {}) as Record<string, unknown>;
            const isMock = meta.mode === "mock";
            const abs = absUrl(image.url);
            setCells((p) => ({ ...p, [c.key]: { ...p[c.key]!, status: "succeeded", imageUrl: abs, error: undefined } }));
            setTryOnRender(c.key, { status: "succeeded", progress: 1, imageUrl: abs });
            if (avatar.avatarId && !isMock) {
              try {
                await createTryon({
                  avatarId: avatar.avatarId,
                  imageUrl: image.url,
                  closetItemId: c.garment.id,
                  poseKey: c.poseId,
                  jobId,
                });
              } catch {
                /* 持久化失败不影响展示 */
              }
            }
          } catch (e) {
            setCells((p) => ({
              ...p,
              [c.key]: { ...p[c.key]!, status: "failed", error: e instanceof Error ? e.message : "生成失败" },
            }));
          }
        }),
      );
    } catch (e) {
      // 整批被拒（如额度不足 402，未创建任何任务）：撤回本次置为 running 的格子
      setCells((prev) => {
        const next = { ...prev };
        for (const c of combosToRun) {
          if (next[c.key]?.status === "running" && !next[c.key]?.jobId) delete next[c.key];
        }
        return next;
      });
      setError(e instanceof Error ? e.message : t("wb.err.run"));
    } finally {
      setRunning(false);
    }
  }

  // 重试单格
  function retryCell(c: Cell) {
    void runCombos([{ key: c.key, poseId: c.poseId, garment: c.garment }]);
  }
  // 重试全部失败项
  function retryAllFailed() {
    const failed = Object.values(cells)
      .filter((c) => c.status === "failed")
      .map((c) => ({ key: c.key, poseId: c.poseId, garment: c.garment }));
    void runCombos(failed);
  }

  async function handleDownloadZip() {
    setError(null);
    setZipBusy(true);
    try {
      await exportJobsZip(succeededCells.map((c) => c.jobId!));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("wb.err.zip"));
    } finally {
      setZipBusy(false);
    }
  }

  const cellList = Object.values(cells);
  const doneCount = cellList.filter((c) => c.status === "succeeded").length;
  const failCount = cellList.filter((c) => c.status === "failed").length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <OnboardingChecklist />
      <section className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t("wb.kicker")}</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">{t("wb.title")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">{t("wb.desc", { n: TRYON_COST })}</p>
      </section>

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      {/* 前置条件守卫 */}
      {!avatar.avatarImageUrl ? (
        <Guard text={t("wb.guard.noModel")} href="/avatar" cta={t("wb.guard.noModelCta")} />
      ) : closet.length === 0 ? (
        <Guard text={t("wb.guard.noProduct")} href="/closet" cta={t("wb.guard.noProductCta")} />
      ) : (
        <>
          {/* 姿态准备进度：模特创建后姿态在后台预生成，这里显性化，避免「未就绪」让人困惑 */}
          {poseRunningCount > 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              {t("wb.posePrep", { ready: readyPoses.length, total: POSES.length, running: poseRunningCount })}
            </div>
          ) : null}

          {/* Step 1：选模特 */}
          <Card step="1" title={t("wb.step1")} hint={t("wb.step1.hint", { state: avatar.avatarId ? t("wb.selected") : t("wb.unselected") })}>
            <div className="flex flex-wrap gap-3">
              {avatars.map((a) => {
                const active = a.id === avatar.avatarId;
                return (
                  <button
                    key={a.id}
                    onClick={() => handleSwitchModel(a.id, a.imageUrl)}
                    disabled={running}
                    className={[
                      "block h-28 w-20 overflow-hidden rounded-2xl border-2 transition-colors disabled:opacity-50",
                      active ? "border-zinc-900" : "border-transparent hover:border-zinc-300",
                    ].join(" ")}
                    title={active ? t("wb.modelTitleActive") : t("wb.modelTitleSwitch")}
                  >
                    <img src={a.imageUrl} alt="model" className="h-full w-full bg-zinc-100 object-cover" />
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Step 2：选姿态 */}
          <Card
            step="2"
            title={t("wb.step2")}
            hint={t("wb.poseReady", { ready: readyPoses.length, total: POSES.length })}
            action={
              readyPoses.length > 0 ? (
                <button onClick={selectAllReadyPoses} disabled={running} className="text-xs text-zinc-600 underline">
                  {t("wb.selectAllReadyPoses")}
                </button>
              ) : null
            }
          >
            {readyPoses.length === 0 ? (
              <div className="rounded-2xl bg-amber-50 p-4 text-xs text-amber-800">
                {t("wb.noReadyPose1")}
                <Link href="/studio" className="mx-1 font-medium underline">
                  {t("nav.studio")}
                </Link>
                {t("wb.noReadyPose2")}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {POSES.map((p) => {
                  const ready = readyPoseIds.has(p.id);
                  const active = selectedPoses.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => ready && togglePose(p.id)}
                      disabled={!ready || running}
                      className={[
                        "rounded-full px-3 py-1.5 text-sm transition-colors",
                        !ready
                          ? "cursor-not-allowed border border-dashed border-zinc-200 text-zinc-300"
                          : active
                            ? "bg-zinc-950 text-zinc-50"
                            : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                      ].join(" ")}
                      title={ready ? "" : t("wb.poseNotReadyTitle")}
                    >
                      {t(`pose.${p.id}`)}
                      {!ready ? t("wb.notReady") : ""}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Step 3：选单品 */}
          <Card
            step="3"
            title={t("wb.step3")}
            hint={t("wb.step3.hint", { n: selectedGarments.size, total: closet.length })}
            action={
              <div className="flex gap-3 text-xs text-zinc-600">
                <button onClick={selectAllGarments} disabled={running} className="underline">
                  {t("act.selectAll")}
                </button>
                <button onClick={clearGarments} disabled={running} className="underline">
                  {t("act.clear")}
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {closet.map((item) => {
                const active = selectedGarments.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleGarment(item.id)}
                    disabled={running}
                    className={[
                      "group relative overflow-hidden rounded-2xl border-2 p-1 text-left transition-colors",
                      active ? "border-zinc-900" : "border-transparent hover:border-zinc-300",
                    ].join(" ")}
                  >
                    <img src={item.imageUrl} alt="garment" className="h-24 w-full rounded-xl bg-zinc-50 object-contain" />
                    <div className="mt-1 truncate px-1 text-[11px] text-zinc-500">
                      {t(`cat.${item.category}`)}
                    </div>
                    <span
                      className={[
                        "absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                        active ? "bg-zinc-900 text-zinc-50" : "bg-white/80 text-transparent ring-1 ring-zinc-200",
                      ].join(" ")}
                    >
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Step 4：开始 */}
          <Card step="4" title={t("wb.step4")}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-zinc-600">
                <div>
                  {t("wb.summary.combos", { n: combos.length })}
                  {skipExisting && combos.length !== toGenerate.length
                    ? t("wb.summary.skipped", { n: combos.length - toGenerate.length })
                    : null}
                  {t("wb.summary.rest", {
                    n: toGenerate.length,
                    time: estTimeRange(toGenerate.length, t),
                    cost: estCost,
                  })}
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={skipExisting}
                    onChange={(e) => setSkipExisting(e.target.checked)}
                    disabled={running}
                  />
                  {t("wb.skipExisting")}
                </label>
                {overLimit ? (
                  <div className="mt-1 text-xs text-red-600">{t("wb.overLimit", { n: BATCH_LIMIT })}</div>
                ) : null}
              </div>
              <button
                onClick={handleRunClick}
                disabled={running || confirming || toGenerate.length === 0 || overLimit}
                className={[
                  "shrink-0 rounded-full px-6 py-3 text-sm font-medium transition-colors",
                  running || confirming || toGenerate.length === 0 || overLimit
                    ? "bg-zinc-200 text-zinc-500"
                    : "bg-zinc-950 text-zinc-50 hover:bg-zinc-800",
                ].join(" ")}
              >
                {running
                  ? t("wb.running", { done: doneCount + failCount, total: cellList.length })
                  : t("wb.runBtn", { n: toGenerate.length })}
              </button>
            </div>

            {/* 确认条：透明展示张数/时长/额度，避免误触大额生成 */}
            {confirming ? (
              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-zinc-900 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-zinc-700">
                  {t("wb.confirm", { n: toGenerate.length, time: estTimeRange(toGenerate.length, t), cost: estCost })}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => setConfirming(false)}
                    className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    onClick={handleConfirmRun}
                    className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-medium text-zinc-50 hover:bg-zinc-800"
                  >
                    {t("wb.confirmRun")}
                  </button>
                </div>
              </div>
            ) : null}
          </Card>

          {/* 结果网格 */}
          {cellList.length > 0 ? (
            <Card
              step="✓"
              title={t("wb.result")}
              hint={t("wb.result.hint", { ok: doneCount, fail: failCount, total: cellList.length })}
              action={
                <div className="flex items-center gap-2">
                  {failCount > 0 ? (
                    <button
                      onClick={retryAllFailed}
                      disabled={running}
                      className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                    >
                      {t("wb.retryFailed", { n: failCount })}
                    </button>
                  ) : null}
                  {succeededCells.length > 0 ? (
                    <button
                      onClick={handleDownloadZip}
                      disabled={zipBusy}
                      className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {zipBusy ? t("wb.packing") : t("wb.downloadN", { n: succeededCells.length })}
                    </button>
                  ) : null}
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {cellList.map((c) => (
                  <div key={c.key} className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white">
                    <div className="relative aspect-[3/4] bg-zinc-50">
                      {c.imageUrl ? (
                        <img src={c.imageUrl} alt="result" className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3">
                          {c.status === "running" ? (
                            <div className="h-2 w-16 animate-pulse rounded-full bg-zinc-300" />
                          ) : (
                            <>
                              <div className="text-center text-[11px] text-red-500">{c.error ?? t("wb.cell.failed")}</div>
                              <button
                                onClick={() => retryCell(c)}
                                disabled={running}
                                className="rounded-full border border-zinc-300 px-3 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                              >
                                {t("common.retry")}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      <span
                        className={[
                          "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px]",
                          c.status === "succeeded"
                            ? "bg-green-100 text-green-700"
                            : c.status === "failed"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700",
                        ].join(" ")}
                      >
                        {c.status === "succeeded" ? t("wb.cell.done") : c.status === "failed" ? t("wb.cell.failed") : t("wb.cell.running")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <img src={c.garment.imageUrl} alt="g" className="h-6 w-6 rounded bg-zinc-50 object-contain" />
                      <div className="truncate text-[11px] text-zinc-500">{t(`pose.${c.poseId}`)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function Card({
  step,
  title,
  hint,
  action,
  children,
}: {
  step: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-zinc-200/70 bg-white p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-zinc-50">
            {step}
          </span>
          <div className="text-sm font-medium">{title}</div>
          {hint ? <div className="text-xs text-zinc-500">{hint}</div> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Guard({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 text-center">
      <div className="text-sm text-zinc-600">{text}</div>
      <Link
        href={href}
        className="mt-4 inline-flex rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800"
      >
        {cta}
      </Link>
    </div>
  );
}
