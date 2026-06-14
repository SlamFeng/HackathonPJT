"use client";

import { useMemo, useState } from "react";
import { z } from "zod";

import { absUrl, createJob, uploadAsset, waitForImageJob } from "@/lib/api";
import { formatMessage, useI18n } from "@/lib/i18n";
import { POSES, PoseId, useAppStore } from "@/stores/useAppStore";
import AutoAspectImage from "@/components/AutoAspectImage";

type ValidationMessages = {
  number: string;
  integer: string;
  range: string;
};

type AvatarStage = "" | "validating" | "uploading" | "creating" | "processing" | "doneWithPrefetch" | "done";

const optionalIntInRange = (label: string, min: number, max: number, validation: ValidationMessages) =>
  z
    .string()
    .trim()
    .optional()
    .transform((raw, ctx) => {
      if (raw == null || raw === "") return undefined;
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: formatMessage(validation.number, { label }) });
        return z.NEVER;
      }
      if (!Number.isInteger(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: formatMessage(validation.integer, { label }) });
        return z.NEVER;
      }
      if (n < min || n > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: formatMessage(validation.range, { label, min, max }) });
        return z.NEVER;
      }
      return n;
    });

type BodyFormState = {
  heightCm: string;
  weightKg: string;
  shoulderWidthCm: string;
  chestCm: string;
  waistCm: string;
  hipCm: string;
};

export default function AvatarPage() {
  const { t } = useI18n();
  const setAvatar = useAppStore((s) => s.setAvatar);
  const setPoseRender = useAppStore((s) => s.setPoseRender);
  const patchPoseRender = useAppStore((s) => s.patchPoseRender);
  const avatar = useAppStore((s) => s.avatar);

  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<BodyFormState>({
    heightCm: "170",
    weightKg: "65",
    shoulderWidthCm: "42",
    chestCm: "92",
    waistCm: "78",
    hipCm: "96",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [stage, setStage] = useState<AvatarStage>("");

  const canSubmit = useMemo(() => !!file && !busy, [file, busy]);
  const bodySchema = useMemo(
    () =>
      z.object({
        heightCm: optionalIntInRange(t.avatar.validationLabels.heightCm, 120, 220, t.avatar.validation),
        weightKg: optionalIntInRange(t.avatar.validationLabels.weightKg, 30, 200, t.avatar.validation),
        shoulderWidthCm: optionalIntInRange(t.avatar.validationLabels.shoulderWidthCm, 20, 80, t.avatar.validation),
        chestCm: optionalIntInRange(t.avatar.validationLabels.chestCm, 50, 160, t.avatar.validation),
        waistCm: optionalIntInRange(t.avatar.validationLabels.waistCm, 40, 160, t.avatar.validation),
        hipCm: optionalIntInRange(t.avatar.validationLabels.hipCm, 50, 180, t.avatar.validation),
      }),
    [t],
  );

  async function generatePoseInBackground(avatarImageUrl: string, nextPoseId: PoseId) {
    setPoseRender(nextPoseId, { status: "running", progress: 0.05 });
    try {
      const job = await createJob({
        jobType: "pose_render",
        inputs: { avatarImageUrl, poseId: nextPoseId },
        constraints: { identityLock: true, poseLock: true, qualityLevel: "high", timeoutSec: 300 },
      });
      const { image } = await waitForImageJob(job.jobId, {
        minProgress: 0.05,
        messages: t.common.job,
        onUpdate: (latest) =>
          patchPoseRender(nextPoseId, {
            status: "running",
            progress: Math.max(latest.progress ?? 0.05, 0.05),
          }),
      });
      setPoseRender(nextPoseId, {
        status: "succeeded",
        progress: 1,
        imageUrl: absUrl(image.url),
      });
    } catch (e) {
      setPoseRender(nextPoseId, {
        status: "failed",
        progress: 1,
        error: e instanceof Error ? e.message : t.avatar.posePrefetchFailed,
      });
    }
  }

  function startPosePrefetch(avatarImageUrl: string) {
    void Promise.all(POSES.map((pose) => generatePoseInBackground(avatarImageUrl, pose.id)));
  }

  async function handleGenerate() {
    setError(null);
    setBusy(true);
    setProgress(0);
    setStage("validating");

    try {
      const parsed = bodySchema.safeParse(form);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? t.avatar.validation.invalidParams);
      }
      if (!file) throw new Error(t.avatar.validation.uploadFirst);
      if (file.size > 10 * 1024 * 1024) throw new Error(t.avatar.validation.fileTooLarge);

      setStage("uploading");
      setProgress(0.1);
      const uploaded = await uploadAsset(file);

      setStage("creating");
      setProgress(0.2);
      const job = await createJob({
        jobType: "avatar_generate",
        inputs: { imageUrl: uploaded.url, bodyParams: parsed.data },
        // 图像生成耗时可能较长（尤其是首次调用/高质量），这里显式放宽后端超时
        constraints: { identityLock: true, poseLock: true, garmentLock: true, qualityLevel: "high", timeoutSec: 300 },
      });

      // 移除过短的前端超时限制：改为“最多等待 5 分钟”，用于你先完成接口联调验证
      const { job: latest, image } = await waitForImageJob(job.jobId, {
        minProgress: 0.2,
        messages: t.common.job,
        onUpdate: (current) => {
          setStage(current.stage === "done" ? "done" : "processing");
          setProgress(Math.max(current.progress ?? 0, 0.2));
        },
      });
      const avatarImageUrl = absUrl(image.url);
      // 后端通常返回 /static/xxx.png（相对 API 服务），这里转成绝对 URL，避免前端去请求 localhost:3000/static 导致看不到结果
      setAvatar({ avatarImageUrl });
      setProgress(1);
      setStage(latest.status === "succeeded" ? "doneWithPrefetch" : "done");
      startPosePrefetch(avatarImageUrl);
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : t.avatar.fallbackError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t.avatar.eyebrow}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t.avatar.title}</div>
        <div className="mt-2 text-sm text-zinc-600">
          {t.avatar.description}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200/70 bg-zinc-50 p-5">
            <div className="text-sm font-medium">{t.avatar.uploadPhoto}</div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-4 block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-50 hover:file:bg-zinc-800"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
            <div className="mt-4">
              {file ? (
                <div className="text-xs text-zinc-600">
                  {file.name} · {(file.size / 1024 / 1024).toFixed(2)}MB
                </div>
              ) : (
                <div className="text-xs text-zinc-500">{t.avatar.chooseImage}</div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
            <div className="text-sm font-medium">{t.avatar.bodyParams}</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label={t.avatar.fields.heightCm} value={form.heightCm} onChange={(v) => setForm((s) => ({ ...s, heightCm: v }))} disabled={busy} />
              <Field label={t.avatar.fields.weightKg} value={form.weightKg} onChange={(v) => setForm((s) => ({ ...s, weightKg: v }))} disabled={busy} />
              <Field label={t.avatar.fields.shoulderWidthCm} value={form.shoulderWidthCm} onChange={(v) => setForm((s) => ({ ...s, shoulderWidthCm: v }))} disabled={busy} />
              <Field label={t.avatar.fields.chestCm} value={form.chestCm} onChange={(v) => setForm((s) => ({ ...s, chestCm: v }))} disabled={busy} />
              <Field label={t.avatar.fields.waistCm} value={form.waistCm} onChange={(v) => setForm((s) => ({ ...s, waistCm: v }))} disabled={busy} />
              <Field label={t.avatar.fields.hipCm} value={form.hipCm} onChange={(v) => setForm((s) => ({ ...s, hipCm: v }))} disabled={busy} />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            {busy ? (
              <div className="flex items-center gap-3">
                <div className="h-2 w-48 overflow-hidden rounded-full bg-zinc-200">
                  <div className="h-full bg-zinc-900 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <div className="text-xs text-zinc-600">
                  {stage ? t.avatar.stages[stage] : ""} · {Math.round(progress * 100)}%
                </div>
              </div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : (
              <div className="text-xs text-zinc-500">{t.avatar.saveHint}</div>
            )}
          </div>
          <button
            className={[
              "rounded-full px-5 py-2.5 text-sm font-medium transition-colors",
              canSubmit ? "bg-zinc-950 text-zinc-50 hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500",
            ].join(" ")}
            onClick={handleGenerate}
            disabled={!canSubmit}
          >
            {busy ? t.avatar.generating : t.avatar.start}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">{t.avatar.currentAvatar}</div>
          <div className="mt-3">
            {avatar.avatarImageUrl ? (
              <AutoAspectImage
                src={avatar.avatarImageUrl}
                alt={t.common.avatarAlt}
                className="w-full overflow-hidden rounded-3xl bg-zinc-100"
                initialAspectRatio={3 / 4}
              />
            ) : (
              <div className="flex h-[420px] w-full items-center justify-center rounded-3xl bg-zinc-50 text-xs text-zinc-500">
                {t.avatar.emptyAvatar}
              </div>
            )}
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">{t.avatar.tipsTitle}</div>
          <div className="mt-2 text-sm leading-6 text-zinc-700">
            <ul className="list-disc space-y-2 pl-5">
              {t.avatar.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="text-xs text-zinc-500">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        inputMode="numeric"
        className="h-10 rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none ring-zinc-900/10 focus:ring-4 disabled:bg-zinc-100"
      />
    </label>
  );
}
