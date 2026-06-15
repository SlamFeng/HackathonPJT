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
import { POSES } from "@/stores/useAppStore";

const poseLabel = (key: string | null) => POSES.find((p) => p.id === key)?.label ?? key ?? "—";

export default function HistoryPage() {
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
    void reload();
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
        <div className="text-xs text-zinc-500">出图记录</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">我的上身图</div>
        <div className="mt-2 text-sm text-zinc-600">这里的记录已保存在服务器，刷新或换设备登录都还在。</div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">按模特筛选：</span>
          <button
            onClick={() => setAvatarFilter("all")}
            className={[
              "rounded-full px-3 py-1.5 text-sm transition-colors",
              avatarFilter === "all" ? "bg-zinc-950 text-zinc-50" : "border border-zinc-200 hover:bg-zinc-50",
            ].join(" ")}
          >
            全部
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
              {a.name || `模特 ${i + 1}`}
              {a.isDefault ? " · 默认" : ""}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-10 text-center text-sm text-zinc-500">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-10 text-center text-sm text-zinc-500">
          暂无出图记录。去「批量出图」产出第一批上身图吧。
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((t) => {
            const garment = t.closetItemId ? closetById.get(t.closetItemId) : undefined;
            const av = avatarById.get(t.avatarId);
            return (
              <div key={t.id} className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white">
                <img src={absUrl(t.imageUrl)} alt="tryon" className="h-64 w-full bg-zinc-50 object-contain" />
                <div className="space-y-1 p-3">
                  <div className="text-xs font-medium text-zinc-800">姿态：{poseLabel(t.poseKey)}</div>
                  <div className="truncate text-[11px] text-zinc-500">
                    模特：{av?.name || t.avatarId.slice(0, 8)}
                  </div>
                  <div className="truncate text-[11px] text-zinc-500">
                    商品：{garment ? garment.garmentType : t.closetItemId?.slice(0, 8) ?? "—"}
                  </div>
                  <div className="text-[11px] text-zinc-400">{new Date(t.updatedAt).toLocaleString()}</div>
                  <div className="flex items-center gap-2 pt-1">
                    <a
                      href="/studio"
                      className="rounded-full bg-zinc-900 px-3 py-1 text-[11px] font-medium text-zinc-50 hover:bg-zinc-800"
                    >
                      去精修
                    </a>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] text-zinc-500 hover:border-red-200 hover:text-red-600"
                    >
                      删除
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
