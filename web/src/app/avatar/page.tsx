"use client";

import { useMemo, useState } from "react";
import { z } from "zod";

import { absUrl, createJob, getJob, uploadAsset } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import { useAppStore } from "@/stores/useAppStore";

const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().int().min(min).max(max),
  ).optional();

const bodySchema = z.object({
  heightCm: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(120).max(220)),
  weightKg: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(30).max(200)),
  shoulderWidthCm: optionalNumber(20, 80),
  chestCm: optionalNumber(50, 160),
  waistCm: optionalNumber(40, 160),
  hipCm: optionalNumber(50, 180),
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
    setStage(t("avatar.stage.validate"));

    try {
      const parsed = bodySchema.safeParse(form);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? t("common.err.invalidParams"));
      }
      if (!file) throw new Error(t("avatar.err.noPhoto"));
      if (file.size > 10 * 1024 * 1024) throw new Error(t("avatar.err.tooLarge"));

      setStage(t("avatar.stage.upload"));
      setProgress(0.1);
      const uploaded = await uploadAsset(file);

      setStage(t("avatar.stage.create"));
      setProgress(0.2);
      const job = await createJob({
        jobType: "avatar_generate",
        inputs: { imageUrl: uploaded.url, bodyParams: parsed.data },
        constraints: { identityLock: true, poseLock: true, garmentLock: true, qualityLevel: "high" },
      });

      let tries = 0;
      while (tries < 60) {
        const latest = await getJob(job.jobId);
        setStage(latest.stage ?? t("avatar.stage.processing"));
        setProgress(Math.max(latest.progress ?? 0, 0.2));

        if (latest.status === "succeeded") {
          const out = latest.artifacts?.find((a) => a.kind === "image")?.url;
          if (!out) throw new Error(t("avatar.err.noOutput"));
          setAvatar({ avatarImageUrl: absUrl(out) });
          setProgress(1);
          setStage(t("avatar.stage.done"));
          return;
        }
        if (latest.status === "failed") {
          throw new Error(latest.error?.message ?? t("avatar.err.failed"));
        }
        await new Promise((r) => setTimeout(r, 350));
        tries += 1;
      }
      throw new Error(t("avatar.err.timeout"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.err.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t("avatar.section")}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t("avatar.title")}</div>
        <div className="mt-2 text-sm text-zinc-600">
          {t("avatar.desc")}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200/70 bg-zinc-50 p-5">
            <div className="text-sm font-medium">{t("avatar.upload.title")}</div>
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
                <div className="text-xs text-zinc-500">{t("avatar.upload.empty")}</div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
            <div className="text-sm font-medium">{t("avatar.form.title")}</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label={t("avatar.field.height")} value={form.heightCm} onChange={(v) => setForm((s) => ({ ...s, heightCm: v }))} disabled={busy} />
              <Field label={t("avatar.field.weight")} value={form.weightKg} onChange={(v) => setForm((s) => ({ ...s, weightKg: v }))} disabled={busy} />
              <Field label={t("avatar.field.shoulder")} value={form.shoulderWidthCm} onChange={(v) => setForm((s) => ({ ...s, shoulderWidthCm: v }))} disabled={busy} />
              <Field label={t("avatar.field.chest")} value={form.chestCm} onChange={(v) => setForm((s) => ({ ...s, chestCm: v }))} disabled={busy} />
              <Field label={t("avatar.field.waist")} value={form.waistCm} onChange={(v) => setForm((s) => ({ ...s, waistCm: v }))} disabled={busy} />
              <Field label={t("avatar.field.hip")} value={form.hipCm} onChange={(v) => setForm((s) => ({ ...s, hipCm: v }))} disabled={busy} />
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
              <div className="text-xs text-zinc-500">{t("avatar.hint.saved")}</div>
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
            {busy ? t("avatar.btn.busy") : t("avatar.btn.idle")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">{t("avatar.current.title")}</div>
          <div className="mt-3">
            {avatar.avatarImageUrl ? (
              <img src={avatar.avatarImageUrl} alt="avatar" className="h-[420px] w-full rounded-3xl bg-zinc-100 object-cover" />
            ) : (
              <div className="flex h-[420px] w-full items-center justify-center rounded-3xl bg-zinc-50 text-xs text-zinc-500">
                {t("avatar.current.empty")}
              </div>
            )}
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">{t("avatar.tips.title")}</div>
          <div className="mt-2 text-sm leading-6 text-zinc-700">
            <ul className="list-disc space-y-2 pl-5">
              <li>{t("avatar.tips.1")}</li>
              <li>{t("avatar.tips.2")}</li>
              <li>{t("avatar.tips.3")}</li>
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
