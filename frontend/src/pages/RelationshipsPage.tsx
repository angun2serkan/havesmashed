import { useEffect, useState, useCallback } from "react";
import { Plus, Loader2, Pencil, Trash2, Heart, Cake, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PartnerForm } from "@/components/Relationships/PartnerForm";
import { AgeChart } from "@/components/Relationships/AgeChart";
import { RelationshipHeatmap } from "@/components/Relationships/RelationshipHeatmap";
import { SummaryCards } from "@/components/Relationships/SummaryCards";
import { CategoryBreakdown } from "@/components/Relationships/CategoryBreakdown";
import { api } from "@/services/api";
import { useAuthStore } from "@/stores/authStore";
import type { Partner, PartnerInput } from "@/types";
import { Link } from "react-router-dom";

export function RelationshipsPage() {
  const user = useAuthStore((s) => s.user);
  const setBirthdayInStore = useAuthStore((s) => s.setBirthday);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Hydrate user birthday from /me on first load if not present
  useEffect(() => {
    if (user && user.birthday === undefined) {
      api
        .getMe()
        .then((me) => setBirthdayInStore(me.birthday))
        .catch(() => {});
    }
  }, [user, setBirthdayInStore]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getPartners();
      setPartners(list);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async (input: PartnerInput) => {
    const created = await api.createPartner(input);
    setPartners((prev) => [created, ...prev].sort(sortByStartDesc));
    setCreating(false);
  };

  const handleUpdate = async (input: PartnerInput) => {
    if (!editing) return;
    const updated = await api.updatePartner(editing.id, input);
    setPartners((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p)).sort(sortByStartDesc),
    );
    setEditing(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu partneri silmek istediğine emin misin?")) return;
    setDeletingId(id);
    try {
      await api.deletePartner(id);
      setPartners((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Silme başarısız");
    } finally {
      setDeletingId(null);
    }
  };

  const userBirthday = user?.birthday ?? null;

  return (
    <div className="min-h-screen p-4 md:p-8 pb-20 md:pb-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Heart className="text-pink-500" size={24} />
          İlişkiler
        </h1>
        <Button onClick={() => setCreating(true)}>
          <Plus size={14} className="mr-1" />
          Partner ekle
        </Button>
      </div>

      {!userBirthday && (
        <Card className="mb-4 border-yellow-500/40 bg-yellow-500/5">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-white font-medium mb-1">
                Doğum gününü ayarla
              </p>
              <p className="text-xs text-dark-300 mb-2">
                Yaş grafiğinde kendi yaş çizgini görmek için ayarlardan doğum
                gününü ekle.
              </p>
              <Link
                to="/settings"
                className="text-xs text-yellow-400 hover:text-yellow-300 underline"
              >
                Ayarlara git →
              </Link>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="text-pink-500 animate-spin" />
        </div>
      ) : (
        <>
          <SummaryCards partners={partners} userBirthday={userBirthday} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card>
              <h2 className="text-sm font-semibold text-white mb-2">
                Yıla göre yaşlar
              </h2>
              <p className="text-xs text-dark-400 mb-3">
                Her partnerin ilişki süresince yaşı, kendi yaşınla karşılaştırmalı
              </p>
              <AgeChart partners={partners} userBirthday={userBirthday} />
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-white mb-2">
                İlişki / single dönemleri
              </h2>
              <p className="text-xs text-dark-400 mb-3">
                Her hücre bir ay — pembe = ilişkide, koyu = single
              </p>
              <RelationshipHeatmap partners={partners} />
            </Card>
          </div>

          {partners.length > 0 && (
            <div className="mt-4">
              <CategoryBreakdown partners={partners} />
            </div>
          )}

          <Card className="mt-4">
            <h2 className="text-sm font-semibold text-white mb-3">
              Partnerler ({partners.length})
            </h2>
            {partners.length === 0 ? (
              <div className="text-center py-8">
                <Heart size={36} className="mx-auto text-dark-500 mb-3" />
                <p className="text-sm text-dark-400">Henüz partner eklenmemiş</p>
                <p className="text-xs text-dark-500 mt-1">
                  Üstten "Partner ekle"ye tıkla
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {partners.map((p) => (
                  <PartnerRow
                    key={p.id}
                    partner={p}
                    onEdit={() => setEditing(p)}
                    onDelete={() => handleDelete(p.id)}
                    deleting={deletingId === p.id}
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {creating && (
        <PartnerForm
          onCancel={() => setCreating(false)}
          onSubmit={handleCreate}
        />
      )}
      {editing && (
        <PartnerForm
          partner={editing}
          onCancel={() => setEditing(null)}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  );
}

function PartnerRow({
  partner,
  onEdit,
  onDelete,
  deleting,
}: {
  partner: Partner;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const ongoing = !partner.relationshipEnd;
  const start = new Date(partner.relationshipStart);
  const end = partner.relationshipEnd ? new Date(partner.relationshipEnd) : new Date();
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());

  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-dark-900/50 border border-dark-700 hover:border-dark-500 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-white truncate">{partner.name}</p>
          {ongoing && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-400 border border-pink-500/30">
              Devam
            </span>
          )}
          {partner.satisfactionScore != null && (
            <span className="text-[10px] text-yellow-400">
              ★ {partner.satisfactionScore}/10
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-dark-400">
          <span className="flex items-center gap-1">
            <Cake size={10} /> {partner.birthday}
          </span>
          <span>
            {partner.relationshipStart} →{" "}
            {partner.relationshipEnd ?? "bugün"}
          </span>
          <span className="text-dark-500">
            {months < 12 ? `${months} ay` : `${Math.floor(months / 12)}y ${months % 12}a`}
          </span>
        </div>
        {partner.notes && (
          <p className="text-xs text-dark-300 mt-1 line-clamp-2">{partner.notes}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-dark-400 hover:text-neon-400 hover:bg-dark-800 transition-colors cursor-pointer"
          title="Düzenle"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
          title="Sil"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  );
}

function sortByStartDesc(a: Partner, b: Partner): number {
  return b.relationshipStart.localeCompare(a.relationshipStart);
}
