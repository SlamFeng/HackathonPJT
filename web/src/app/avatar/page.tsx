"use client";

import { useMemo, useState } from "react";
import { z } from "zod";

import { absUrl, createJob, getJob, uploadAsset } from "@/lib/api";
import { useAppStore } from "@/stores/useAppStore";
import AutoAspectImage from "@/components/AutoAspectImage";

const optionalIntInRange = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((raw, ctx) => {
      if (raw == null || raw === "") return undefined;
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}请输入数字` });
        return z.NEVER;
      }
      if (!Number.isInteger(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}必须是整数` });
        return z.NEVER;
      }
      if (n < min || n > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}范围应为 ${min}~${max}` });
        return z.NEVER;
      }
      return n;
    });

const bodySchema = z.object({
  heightCm: optionalIntInRange("身高", 120, 220),
  weightKg: optionalIntInRange("体重", 30, 200),
  shoulderWidthCm: optionalIntInRange("肩宽", 20, 80),
  chestCm: optionalIntInRange("胸围", 50, 160),
  waistCm: optionalIntInRange("腰围", 40, 160),
  hipCm: optionalIntInRange("臀围", 50, 180),
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
  const setAvatar = useAppStore((s) => s.setAvatar);
  const avatar = useAppStore((s) => s.avatar);

  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<BodyFormState>({
    heightCm: "165",
    weightKg: "55",
    shoulderWidthCm: "",
    chestCm: "",
    waistCm: "",
    hipCm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [stage, setStage] = useState<string>("");

  const canSubmit = useMemo(() => !!file && !busy, [file, busy]);

  async function handleGenerate() {
    setError(null);
    setBusy(true);
    setProgress(0);
    setStage("校验输入");

    try {
      const parsed = bodySchema.safeParse(form);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "参数不合法");
      }
      if (!file) throw new Error("请先上传照片");
      if (file.size > 10 * 1024 * 1024) throw new Error("图片需 ≤10MB");

      setStage("上传图片");
      setProgress(0.1);
      const uploaded = await uploadAsset(file);

      setStage("创建生成任务");
      setProgress(0.2);
      const job = await createJob({
        jobType: "avatar_generate",
        inputs: { imageUrl: uploaded.url, bodyParams: parsed.data },
        // 图像生成耗时可能较长（尤其是首次调用/高质量），这里显式放宽后端超时
        constraints: { identityLock: true, poseLock: true, garmentLock: true, qualityLevel: "high", timeoutSec: 300 },
      });

      // 移除过短的前端超时限制：改为“最多等待 5 分钟”，用于你先完成接口联调验证
      const start = Date.now();
      const MAX_WAIT_MS = 5 * 60 * 1000;
      while (Date.now() - start < MAX_WAIT_MS) {
        const latest = await getJob(job.jobId);
        setStage(latest.stage ?? "处理中");
        setProgress(Math.max(latest.progress ?? 0, 0.2));

        if (latest.status === "succeeded") {
          const out = latest.artifacts?.find((a) => a.kind === "image")?.url;
          if (!out) throw new Error("未返回图片");
          // 后端通常返回 /static/xxx.png（相对 API 服务），这里转成绝对 URL，避免前端去请求 localhost:3000/static 导致看不到结果
          setAvatar({ avatarImageUrl: absUrl(out) });
          setProgress(1);
          setStage("完成");
          return;
        }
        if (latest.status === "failed") {
          throw new Error(latest.error?.message ?? "生成失败");
        }
        await new Promise((r) => setTimeout(r, 350));
      }
      throw new Error("任务超时（等待超过 5 分钟）");
    } catch (e) {
      setError(e instanceof Error ? e.message : "发生错误");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">数字人生成</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">上传全身照并输入体型参数</div>
        <div className="mt-2 text-sm text-zinc-600">
          仅支持清晰正面免冠全身照（≥1080×1920，≤10MB）。生成结果为写实，身份保持优先。
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200/70 bg-zinc-50 p-5">
            <div className="text-sm font-medium">上传照片</div>
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
                <div className="text-xs text-zinc-500">选择一张图片开始</div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
            <div className="text-sm font-medium">体型参数</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="身高(cm)" value={form.heightCm} onChange={(v) => setForm((s) => ({ ...s, heightCm: v }))} disabled={busy} />
              <Field label="体重(kg)" value={form.weightKg} onChange={(v) => setForm((s) => ({ ...s, weightKg: v }))} disabled={busy} />
              <Field label="肩宽(cm)" value={form.shoulderWidthCm} onChange={(v) => setForm((s) => ({ ...s, shoulderWidthCm: v }))} disabled={busy} />
              <Field label="胸围(cm)" value={form.chestCm} onChange={(v) => setForm((s) => ({ ...s, chestCm: v }))} disabled={busy} />
              <Field label="腰围(cm)" value={form.waistCm} onChange={(v) => setForm((s) => ({ ...s, waistCm: v }))} disabled={busy} />
              <Field label="臀围(cm)" value={form.hipCm} onChange={(v) => setForm((s) => ({ ...s, hipCm: v }))} disabled={busy} />
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
                  {stage} · {Math.round(progress * 100)}%
                </div>
              </div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : (
              <div className="text-xs text-zinc-500">生成后会自动保存为“当前数字人”</div>
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
            {busy ? "生成中…" : "开始生成"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">当前数字人</div>
          <div className="mt-3">
            {avatar.avatarImageUrl ? (
              <AutoAspectImage
                src={avatar.avatarImageUrl}
                alt="avatar"
                className="w-full overflow-hidden rounded-3xl bg-zinc-100"
                initialAspectRatio={3 / 4}
              />
            ) : (
              <div className="flex h-[420px] w-full items-center justify-center rounded-3xl bg-zinc-50 text-xs text-zinc-500">
                尚未生成
              </div>
            )}
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">提示</div>
          <div className="mt-2 text-sm leading-6 text-zinc-700">
            <ul className="list-disc space-y-2 pl-5">
              <li>若照片遮挡/侧脸/模糊，身份一致性会明显下降。</li>
              <li>生成质量由质检门控决定，失败会自动重试或降级返回可用结果。</li>
              <li>下一步：进入「工作室」切换姿态并试穿衣橱单品。</li>
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
