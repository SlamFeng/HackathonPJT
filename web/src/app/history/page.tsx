"use client";

import { useEffect, useMemo, useState } from "react";

import { absUrl } from "@/lib/api";
import {
  deleteTryon,
  listAvatars,
  listClosetItems,
  listTryons,
  type AvatarRecord,
  type ClosetItemRecord,
  type TryonRecord,
} from "@/lib/assets";
import { useI18n } from "@/lib/i18n";
import { ClosetCategory, PoseId } from "@/stores/useAppStore";

function poseLabel(key: string | null, labels: Readonly<Record<PoseId, string>>) {
  return key && key in labels ? labels[key as PoseId] : key ?? "—";
}

function categoryLabel(key: string | null | undefined, labels: Readonly<Record<ClosetCategory, string>>) {
  return key && key in labels ? labels[key as ClosetCategory] : key ?? "—";
}

export default function HistoryPage() {
  const { t, locale } = useI18n();
  const [tryons, setTryons] = useState<TryonRecord[]>([]);
  const [avatars, setAvatars] = useState<AvatarRecord[]>([]);
  const [closet, setCloset] = useState<ClosetItemRecord[]>([]);
  const [avatarFilter, setAvatarFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const [t, a, c] = await Promise.all([listTryons(), listAvatars(), listClosetItems()]);
      setTryons(t);
      setAvatars(a);
      setCloset(c);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTryons(), listAvatars(), listClosetItems()])
      .then(([nextTryons, nextAvatars, nextCloset]) => {
        if (cancelled) return;
        setTryons(nextTryons);
        setAvatars(nextAvatars);
        setCloset(nextCloset);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const closetById = useMemo(() => new Map(closet.map((c) => [c.id, c])), [closet]);
  const avatarById = useMemo(() => new Map(avatars.map((a) => [a.id, a])), [avatars]);

  const filtered = useMemo(
    () => (avatarFilter === "all" ? tryons : tryons.filter((t) => t.avatarId === avatarFilter)),
    [tryons, avatarFilter],
  );

  async function handleDelete(id: string) {
    setTryons((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteTryon(id);
    } catch {
      void reload();
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t.history.eyebrow}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t.history.title}</div>
        <div className="mt-2 text-sm text-zinc-600">{t.history.description}</div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">{t.history.filterLabel}</span>
          <button
            onClick={() => setAvatarFilter("all")}
            className={[
              "rounded-full px-3 py-1.5 text-sm transition-colors",
              avatarFilter === "all" ? "bg-zinc-950 text-zinc-50" : "border border-zinc-200 hover:bg-zinc-50",
            ].join(" ")}
          >
            {t.history.all}
          </button>
          {avatars.map((a, i) => (
            <button
              key={a.id}
              onClick={() => setAvatarFilter(a.id)}
              className={[
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                avatarFilter === a.id ? "bg-zinc-950 text-zinc-50" : "border border-zinc-200 hover:bg-zinc-50",
              ].join(" ")}
            >
              {a.name || `${t.history.avatarFallback} ${i + 1}`}
              {a.isDefault ? t.history.defaultSuffix : ""}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-10 text-center text-sm text-zinc-500">{t.common.loading}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-10 text-center text-sm text-zinc-500">
          {t.history.empty}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((record) => {
            const garment = record.closetItemId ? closetById.get(record.closetItemId) : undefined;
            const av = avatarById.get(record.avatarId);
            return (
              <div key={record.id} className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white">
                <img src={absUrl(record.imageUrl)} alt={t.studio.tryOnPreview} className="h-64 w-full bg-zinc-50 object-contain" />
                <div className="space-y-1 p-3">
                  <div className="text-xs font-medium text-zinc-800">{t.history.posePrefix}{poseLabel(record.poseKey, t.common.poses)}</div>
                  <div className="truncate text-[11px] text-zinc-500">
                    {t.history.avatarPrefix}{av?.name || record.avatarId.slice(0, 8)}
                  </div>
                  <div className="truncate text-[11px] text-zinc-500">
                    {t.history.itemPrefix}
                    {garment ? categoryLabel(garment.garmentType, t.common.categories) : record.closetItemId?.slice(0, 8) ?? "—"}
                  </div>
                  <div className="text-[11px] text-zinc-400">{new Date(record.updatedAt).toLocaleString(locale)}</div>
                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href="/studio"
                      className="rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-medium text-zinc-50 hover:bg-zinc-800"
                    >
                      {t.history.backStudio}
                    </a>
                    <button
                      onClick={() => handleDelete(record.id)}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] text-zinc-500 hover:border-red-200 hover:text-red-600"
                    >
                      {t.history.delete}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
