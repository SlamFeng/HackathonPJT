"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

import { absUrl, createJob, waitForImageJob } from "@/lib/api";
import { createTryon, upsertPose } from "@/lib/assets";
import { formatMessage, useI18n } from "@/lib/i18n";
import {
  ClosetCategory,
  ClosetItem,
  OverlayTransform,
  POSES,
  PoseId,
  useAppStore,
} from "@/stores/useAppStore";

function tryOnKey(poseId: PoseId, garmentId: string) {
  return `${poseId}:${garmentId}`;
}

export default function StudioPage() {
  const { t } = useI18n();
  const avatar = useAppStore((s) => s.avatar);
  const closet = useAppStore((s) => s.closet);
  const setPoseRender = useAppStore((s) => s.setPoseRender);
  const patchPoseRender = useAppStore((s) => s.patchPoseRender);
  const setTryOnRender = useAppStore((s) => s.setTryOnRender);
  const patchTryOnRender = useAppStore((s) => s.patchTryOnRender);
  const clearTryOnRendersForPose = useAppStore((s) => s.clearTryOnRendersForPose);

  const [poseId, setPoseId] = useState<PoseId>(POSES[0]!.id);
  const [garment, setGarment] = useState<ClosetItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 刷新/进入页面后，若还没选单品：优先自动恢复一个「已有试穿结果」的 姿态+单品 组合，
  // 让之前做过的试穿图刷新后直接可见；否则退而选中第一件单品，避免预览区空白。
  useEffect(() => {
    if (garment) return;
    let nextPoseId: PoseId | null = null;
    let nextGarment: ClosetItem | null = null;
    for (const key of Object.keys(avatar.tryOnRenders)) {
      const sep = key.indexOf(":");
      if (sep < 0) continue;
      const pk = key.slice(0, sep);
      const gid = key.slice(sep + 1);
      const g = closet.find((c) => c.id === gid);
      if (g && POSES.some((p) => p.id === pk) && avatar.tryOnRenders[key]?.status === "succeeded") {
        nextPoseId = pk as PoseId;
        nextGarment = g;
        break;
      }
    }
    if (!nextGarment && closet.length > 0) {
      nextGarment = closet[0]!;
    }
    if (!nextGarment) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (nextPoseId) setPoseId(nextPoseId);
      setGarment(nextGarment);
    });
    return () => {
      cancelled = true;
    };
  }, [garment, closet, avatar.tryOnRenders]);

  const currentPose = avatar.poseRenders[poseId];
  const poseReady = currentPose?.status === "succeeded" && !!currentPose.imageUrl;
  const poseRunning = currentPose?.status === "running";
  const selectedTryOnKey = garment ? tryOnKey(poseId, garment.id) : null;
  const currentTryOn = selectedTryOnKey ? avatar.tryOnRenders[selectedTryOnKey] : undefined;
  const tryOnRunning = currentTryOn?.status === "running";

  const canTryOn = useMemo(
    () => !!poseReady && !!currentPose?.imageUrl && !!garment && !tryOnRunning,
    [poseReady, currentPose?.imageUrl, garment, tryOnRunning],
  );
  const canRegeneratePose = useMemo(
    () => !!avatar.avatarImageUrl && !poseRunning,
    [avatar.avatarImageUrl, poseRunning],
  );

  async function regeneratePose(targetPoseId: PoseId) {
    setError(null);
    if (!avatar.avatarImageUrl) {
      setError(t.studio.generateAvatarFirst);
      return;
    }

    clearTryOnRendersForPose(targetPoseId);
    setPoseRender(targetPoseId, { status: "running", progress: 0.05 });

    try {
      const job = await createJob({
        jobType: "pose_render",
        inputs: { avatarImageUrl: avatar.avatarImageUrl, poseId: targetPoseId },
        constraints: { identityLock: true, poseLock: true, qualityLevel: "high", timeoutSec: 300 },
      });

      const { image } = await waitForImageJob(job.jobId, {
        messages: t.common.job,
        onUpdate: (latest) =>
          patchPoseRender(targetPoseId, {
            status: "running",
            progress: Math.max(latest.progress ?? 0.05, 0.05),
          }),
      });

      setPoseRender(targetPoseId, {
        status: "succeeded",
        progress: 1,
        imageUrl: absUrl(image.url),
      });
      // 落库：覆盖该数字人的这个姿态
      if (avatar.avatarId) {
        try {
          await upsertPose(avatar.avatarId, targetPoseId, { imageUrl: image.url, jobId: job.jobId });
        } catch {
          /* 持久化失败不影响展示 */
        }
      }
    } catch (e) {
      setPoseRender(targetPoseId, {
        status: "failed",
        progress: 1,
        error: e instanceof Error ? e.message : t.studio.poseRegenerateFailed,
      });
      setError(e instanceof Error ? e.message : t.studio.poseRegenerateFailed);
    }
  }

  async function handleTryOn() {
    setError(null);
    if (!poseReady || !currentPose?.imageUrl) {
      setError(t.studio.poseNotReady);
      return;
    }
    if (!garment || !selectedTryOnKey) return;

    setTryOnRender(selectedTryOnKey, { status: "running", progress: 0.05 });

    try {
      const job = await createJob({
        jobType: "vton_tryon",
        inputs: {
          avatarImageUrl: currentPose.imageUrl,
          garmentImageUrl: garment.imageUrl,
          garmentCategory: garment.category,
          poseId,
        },
        constraints: { identityLock: true, poseLock: true, garmentLock: true, qualityLevel: "high", timeoutSec: 300 },
      });

      const { image } = await waitForImageJob(job.jobId, {
        messages: t.common.job,
        onUpdate: (latest) =>
          patchTryOnRender(selectedTryOnKey, {
            status: "running",
            progress: Math.max(latest.progress ?? 0.05, 0.05),
          }),
      });

      const meta = (image.meta ?? {}) as Record<string, unknown>;
      const isMock = meta.mode === "mock";
      const overlay = isMock && typeof meta.overlayGarmentImageUrl === "string" ? meta.overlayGarmentImageUrl : null;
      const transformRaw = isMock ? (meta.overlayTransform as unknown) : null;
      const transform = isMock ? normalizeOverlayTransform(transformRaw) : null;
      setTryOnRender(selectedTryOnKey, {
        status: "succeeded",
        progress: 1,
        imageUrl: absUrl(image.url),
        overlayGarmentUrl: overlay ? absUrl(overlay) : null,
        overlayTransform: transform,
      });
      // 落库：保存试穿结果（按 数字人+姿态+单品 唯一，重新试穿覆盖）
      if (avatar.avatarId && !isMock) {
        try {
          await createTryon({
            avatarId: avatar.avatarId,
            imageUrl: image.url,
            closetItemId: garment.id,
            poseKey: poseId,
            jobId: job.jobId,
          });
        } catch {
          /* 持久化失败不影响展示 */
        }
      }
    } catch (e) {
      setTryOnRender(selectedTryOnKey, {
        status: "failed",
        progress: 1,
        error: e instanceof Error ? e.message : t.studio.tryOnFailed,
      });
      setError(e instanceof Error ? e.message : t.studio.tryOnFailed);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t.studio.eyebrow}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t.studio.title}</div>
        <div className="mt-2 text-sm text-zinc-600">
          {t.studio.description}
        </div>
      </div>

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">{t.studio.poseLibrary}</div>
            <button
              className={[
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                canRegeneratePose ? "bg-zinc-950 text-zinc-50 hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500",
              ].join(" ")}
              onClick={() => regeneratePose(poseId)}
              disabled={!canRegeneratePose}
            >
              {poseRunning ? t.studio.generating : t.studio.regenerate}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {POSES.map((p) => {
              const active = poseId === p.id;
              const state = avatar.poseRenders[p.id];
              return (
                <button
                  key={p.id}
                  className={[
                    "group relative overflow-hidden rounded-2xl border px-3 py-3 text-left transition-colors",
                    active ? "border-zinc-900 bg-zinc-900 text-zinc-50" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                  ].join(" ")}
                  onClick={() => {
                    setError(null);
                    setPoseId(p.id);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium">{t.common.poses[p.id]}</div>
                    <div className={["text-[10px]", active ? "text-zinc-300" : "text-zinc-500"].join(" ")}>
                      {poseStatusLabel(state?.status, t.studio.poseStatus)}
                    </div>
                  </div>
                  <div
                    className={[
                      "mt-2 h-10 overflow-hidden rounded-xl",
                      active ? "bg-zinc-800" : "bg-zinc-100 group-hover:bg-zinc-200",
                    ].join(" ")}
                  >
                    {state?.status === "running" ? (
                      <div className="h-full bg-zinc-400 transition-all" style={{ width: `${Math.round(state.progress * 100)}%` }} />
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            <div className="text-sm font-medium">{t.studio.tryOnItems}</div>
            <div className="mt-3 space-y-2">
              {closet.length === 0 ? (
                <div className="rounded-2xl bg-zinc-50 p-4 text-xs text-zinc-500">{t.studio.closetEmpty}</div>
              ) : (
                closet.slice(0, 6).map((item) => {
                  const active = garment?.id === item.id;
                  const cachedTryOn = avatar.tryOnRenders[tryOnKey(poseId, item.id)];
                  return (
                    <button
                      key={item.id}
                      className={[
                        "flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition-colors",
                        active ? "border-zinc-900 bg-zinc-900 text-zinc-50" : "border-zinc-200 hover:bg-zinc-50",
                      ].join(" ")}
                      onClick={() => setGarment(item)}
                    >
                      <img
                        src={item.imageUrl}
                        alt={t.common.garmentAlt}
                        className="h-10 w-10 rounded-xl bg-white object-contain"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{item.id.slice(0, 8)}</div>
                        <div className={["text-[11px]", active ? "text-zinc-200" : "text-zinc-500"].join(" ")}>
                          {tryOnStatusLabel(cachedTryOn?.status, t.studio.tryOnStatus)}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <button
              className={[
                "mt-4 w-full rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                canTryOn ? "bg-zinc-950 text-zinc-50 hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500",
              ].join(" ")}
              onClick={handleTryOn}
              disabled={!canTryOn}
            >
              {tryOnRunning
                ? formatMessage(t.studio.tryOnRunning, { progress: Math.round((currentTryOn?.progress ?? 0) * 100) })
                : currentTryOn?.status === "succeeded"
                  ? t.studio.retryTryOn
                  : t.studio.oneClickTryOn}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-9">
          <PreviewCard
            title={t.studio.posePreview}
            subtitle={poseSubtitle(currentPose, t.studio.poseSubtitle)}
            imageUrl={poseReady ? currentPose?.imageUrl : null}
            loading={poseRunning}
            emptyText={avatar.avatarImageUrl ? t.studio.poseEmptyWithAvatar : t.studio.poseEmptyNoAvatar}
            imageAlt={t.common.avatarAlt}
            emptyFallback={t.studio.emptyPreview}
          />
          <PreviewCard
            title={t.studio.tryOnPreview}
            subtitle={tryOnSubtitle(currentTryOn, t.studio.tryOnSubtitle)}
            imageUrl={currentTryOn?.status === "succeeded" ? currentTryOn.imageUrl : null}
            overlayImageUrl={currentTryOn?.overlayGarmentUrl}
            overlayTransform={currentTryOn?.overlayTransform}
            overlayCategory={garment?.category ?? null}
            loading={tryOnRunning}
            emptyText={
              !poseReady
                ? t.studio.tryOnEmptyPoseNotReady
                : garment
                  ? t.studio.tryOnEmptyWithGarment
                  : t.studio.tryOnEmptyNoGarment
            }
            imageAlt={t.studio.tryOnPreview}
            overlayAlt={t.common.overlayAlt}
            emptyFallback={t.studio.emptyPreview}
          />
        </div>
      </div>
    </div>
  );
}

function poseStatusLabel(status: string | undefined, labels: { running: string; succeeded: string; failed: string; idle: string }) {
  if (status === "running") return labels.running;
  if (status === "succeeded") return labels.succeeded;
  if (status === "failed") return labels.failed;
  return labels.idle;
}

function tryOnStatusLabel(status: string | undefined, labels: { running: string; succeeded: string; failed: string; idle: string }) {
  if (status === "running") return labels.running;
  if (status === "succeeded") return labels.succeeded;
  if (status === "failed") return labels.failed;
  return labels.idle;
}

function poseSubtitle(
  state: { status: string; progress: number; error?: string } | undefined,
  labels: { running: string; succeeded: string; failed: string; idle: string },
) {
  if (state?.status === "running") return formatMessage(labels.running, { progress: Math.round(state.progress * 100) });
  if (state?.status === "succeeded") return labels.succeeded;
  if (state?.status === "failed") return state.error ?? labels.failed;
  return labels.idle;
}

function tryOnSubtitle(
  state: { status: string; progress: number; error?: string } | undefined,
  labels: { running: string; succeeded: string; failed: string; idle: string },
) {
  if (state?.status === "running") return formatMessage(labels.running, { progress: Math.round(state.progress * 100) });
  if (state?.status === "succeeded") return labels.succeeded;
  if (state?.status === "failed") return state.error ?? labels.failed;
  return labels.idle;
}

function PreviewCard({
  title,
  subtitle,
  imageUrl,
  overlayImageUrl,
  overlayTransform,
  overlayCategory,
  loading,
  emptyText,
  imageAlt,
  overlayAlt,
  emptyFallback,
}: {
  title: string;
  subtitle: string;
  imageUrl: string | null | undefined;
  overlayImageUrl?: string | null;
  overlayTransform?: OverlayTransform | null;
  overlayCategory?: ClosetCategory | null;
  loading: boolean;
  emptyText?: string;
  imageAlt: string;
  overlayAlt?: string;
  emptyFallback: string;
}) {
  const overlayStyle = overlayTransform
    ? overlayTransformToStyle(overlayTransform)
    : overlayCategory
      ? getOverlayStyle(overlayCategory)
      : null;
  return (
    <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="mt-1 text-xs text-zinc-500">{subtitle}</div>
        </div>
        {loading ? <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-200" /> : null}
      </div>
      <div className="relative mt-4 h-[520px] overflow-hidden rounded-3xl bg-zinc-50">
        {imageUrl ? (
          <>
            <img src={imageUrl} alt={imageAlt} className="h-full w-full object-contain" />
            {overlayImageUrl ? (
              <img
                src={overlayImageUrl}
                alt={overlayAlt ?? ""}
                className="pointer-events-none absolute object-contain"
                style={overlayStyle ?? { left: "50%", top: "50%", width: "70%", height: "auto", transform: "translate(-50%, -50%)" }}
              />
            ) : null}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center px-10 text-center text-xs text-zinc-500">
            {emptyText ?? emptyFallback}
          </div>
        )}
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[240px] rounded-3xl border border-zinc-200/70 bg-white/80 p-5 backdrop-blur">
              <div className="h-2 w-28 rounded-full bg-zinc-200" />
              <div className="mt-4 space-y-3">
                <SkeletonLine />
                <SkeletonLine />
                <SkeletonLine />
                <SkeletonLine />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SkeletonLine() {
  return (
    <div className="flex items-center justify-between">
      <div className="h-2 w-24 animate-pulse rounded-full bg-zinc-200" />
      <div className="h-2 w-16 animate-pulse rounded-full bg-zinc-200" />
    </div>
  );
}

function getOverlayStyle(category: ClosetCategory): CSSProperties {
  const base: CSSProperties = { left: "50%", transform: "translate(-50%, -50%)", height: "auto" };
  if (category === "top") return { ...base, top: "40%", width: "66%" };
  if (category === "outerwear") return { ...base, top: "42%", width: "74%" };
  if (category === "dress") return { ...base, top: "54%", width: "74%" };
  if (category === "suit") return { ...base, top: "52%", width: "78%" };
  if (category === "skirt") return { ...base, top: "62%", width: "70%" };
  if (category === "pants") return { ...base, top: "70%", width: "62%" };
  if (category === "underwear") return { ...base, top: "52%", width: "66%" };
  if (category === "shoes") return { ...base, top: "88%", width: "50%" };
  return { ...base, top: "40%", width: "66%" };
}

function normalizeOverlayTransform(v: unknown): OverlayTransform | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  const cx = Number(obj.cx);
  const cy = Number(obj.cy);
  const w = Number(obj.w);
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(w)) return null;
  const rotationDeg = obj.rotationDeg == null ? undefined : Number(obj.rotationDeg);
  const opacity = obj.opacity == null ? undefined : Number(obj.opacity);
  const blendMode = typeof obj.blendMode === "string" ? obj.blendMode : undefined;
  return {
    cx: Math.max(0, Math.min(1, cx)),
    cy: Math.max(0, Math.min(1, cy)),
    w: Math.max(0.15, Math.min(0.95, w)),
    rotationDeg: rotationDeg != null && Number.isFinite(rotationDeg) ? rotationDeg : undefined,
    opacity: opacity != null && Number.isFinite(opacity) ? Math.max(0.15, Math.min(1, opacity)) : undefined,
    blendMode,
  };
}

function overlayTransformToStyle(t: OverlayTransform): CSSProperties {
  const rot = t.rotationDeg ?? 0;
  const opacity = t.opacity ?? 0.8;
  const blend = t.blendMode ?? "multiply";
  return {
    left: `${t.cx * 100}%`,
    top: `${t.cy * 100}%`,
    width: `${t.w * 100}%`,
    height: "auto",
    transform: `translate(-50%, -50%) rotate(${rot}deg)`,
    opacity,
    mixBlendMode: blend as CSSProperties["mixBlendMode"],
  };
}
