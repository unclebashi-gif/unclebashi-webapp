import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  createMatchmakingPhotoUploadSlot, deleteMatchmakingPhoto, finalizeMatchmakingPhotoUpload,
  getMatchmakingPhotoViewUrl, getMyMatchmakingPhotos, reorderMyMatchmakingPhotos,
  uploadMatchmakingPhotoToSignedUrl,
} from '@/lib/matchmakingService';
import { normalizeMatchmakingPhoto } from '@/lib/matchmakingPhotoImage';
import type { MatchmakingOwnerPhoto } from '@/types/matchmaking';

const statusText = (photo: MatchmakingOwnerPhoto): string => {
  if (!photo.upload_completed_at) return 'Upload incomplete';
  if (photo.status === 'pending_review') return 'Pending review';
  return photo.status === 'approved' ? 'Approved' : 'Rejected';
};

export const MatchmakingPhotoManager: React.FC = () => {
  const [photos, setPhotos] = useState<MatchmakingOwnerPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPosition, setUploadPosition] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setError('');
    try {
      setPhotos(await getMyMatchmakingPhotos());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your Matchmaking photos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [refresh]);

  const incomplete = useMemo(() => photos.some(photo => !photo.upload_completed_at), [photos]);
  const approvedCount = photos.filter(photo => photo.upload_completed_at && photo.status === 'approved').length;

  const upload = async (position: number, file: File, replacePhotoId?: string) => {
    const key = replacePhotoId ?? `position-${position}`;
    setBusy(key);
    setUploadProgress(0);
    setUploadPosition(position);
    setError('');
    try {
      const image = await normalizeMatchmakingPhoto(file);
      const slot = await createMatchmakingPhotoUploadSlot(position, replacePhotoId);
      await uploadMatchmakingPhotoToSignedUrl(slot.signed_upload_url, image, setUploadProgress);
      await finalizeMatchmakingPhotoUpload(slot.photo_id);
      await refresh();
      toast.success(replacePhotoId
        ? 'Replacement uploaded and sent for photo review.'
        : 'Photo uploaded and sent for review.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The photo could not be uploaded.';
      setError(message);
      toast.error(message);
      await refresh();
    } finally {
      setBusy(null);
      setUploadProgress(0);
      setUploadPosition(null);
      setReplaceTarget(null);
    }
  };

  const preview = async (photoId: string) => {
    setBusy(`preview-${photoId}`);
    try {
      const signedUrl = await getMatchmakingPhotoViewUrl(photoId);
      setPreviews(current => ({ ...current, [photoId]: signedUrl }));
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => setPreviews({}), 4 * 60 * 1000);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Photo preview is unavailable.';
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (photo: MatchmakingOwnerPhoto) => {
    if (!window.confirm(photo.upload_completed_at ? 'Delete this Matchmaking photo?' : 'Cancel this incomplete upload?')) return;
    setBusy(`delete-${photo.id}`);
    try {
      await deleteMatchmakingPhoto(photo.id);
      setPhotos(current => current.filter(item => item.id !== photo.id));
      setPreviews(current => { const next = { ...current }; delete next[photo.id]; return next; });
      toast.success(photo.upload_completed_at ? 'Photo deleted.' : 'Incomplete upload cancelled.');
      void refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The photo could not be removed.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const move = async (photoId: string, direction: -1 | 1) => {
    const ordered = photos.filter(photo => photo.upload_completed_at && photo.display_order !== null)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const index = ordered.findIndex(photo => photo.id === photoId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length || incomplete) return;
    const ids = ordered.map(photo => photo.id);
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    setBusy('reorder');
    try {
      await reorderMyMatchmakingPhotos(ids);
      await refresh();
      toast.success('Photo order updated.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Photo order could not be updated.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const activeForPosition = (position: number) => photos.find(photo => photo.display_order === position && photo.replaces_photo_id === null);
  const replacementFor = (photoId: string) => photos.find(photo => photo.replaces_photo_id === photoId && !photo.upload_completed_at);

  return <section className="rounded-xl border border-[#e8e1d8] bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-semibold text-[#1e3a5f]">Matchmaking photos</h2><p className="mt-1 text-sm text-gray-600">These photos are separate from your Core Profile image. New photos are reviewed before members can see them.</p></div>
      <div className="text-right text-sm"><p className="font-medium">{approvedCount} of 2 approved</p><p className="text-gray-500">Maximum 3 photos</p></div>
    </div>
    {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {loading ? <p className="py-6 text-sm text-gray-500">Loading your photos…</p> : <div className="mt-5 grid gap-4 md:grid-cols-3">
      {[1, 2, 3].map(position => {
        const photo = activeForPosition(position);
        const replacement = photo ? replacementFor(photo.id) : undefined;
        const ordered = photos.filter(item => item.upload_completed_at && item.display_order !== null)
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
        const photoIndex = photo ? ordered.findIndex(item => item.id === photo.id) : -1;
        const incompleteNew = photo && !photo.upload_completed_at;
        const targetId = photo?.upload_completed_at && replaceTarget === photo.id ? photo.id : undefined;
        return <article key={position} className="rounded-lg border border-gray-200 p-3">
          <h3 className="font-semibold text-[#1e3a5f]">Photo {position}</h3>
          {!photo || incompleteNew ? <>
            <p className="my-3 min-h-6 text-sm text-gray-600">{uploadPosition === position ? 'Uploading' : incompleteNew ? statusText(photo) : 'Empty'}</p>
            {incompleteNew ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void remove(photo)}>Cancel upload</Button>
              : <label className="mt-2 inline-flex cursor-pointer items-center rounded-md bg-[#1e3a5f] px-3 py-2 text-sm font-medium text-white hover:bg-[#16304e] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2">
                Add photo<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy !== null}
                  onChange={event => { const file = event.target.files?.[0]; if (file) void upload(position, file); event.currentTarget.value = ''; }} />
              </label>}
          </> : <>
            <p className="mt-2 text-sm font-medium">{statusText(photo)}</p>
            {replacement && <div className="my-2 rounded bg-amber-50 p-2 text-xs text-amber-900">Replacement upload incomplete. The current photo remains active until it is finalized. <button className="underline" disabled={busy !== null} onClick={() => void remove(replacement)}>Cancel replacement</button></div>}
            {replacement && uploadPosition === position && <p className="text-sm text-gray-600">Replacement uploading… {uploadProgress > 0 ? `${uploadProgress}%` : ''}</p>}
            {photo.status === 'rejected' && photo.moderation_reason && <p className="mt-1 rounded bg-rose-50 p-2 text-xs text-rose-800">Reason: {photo.moderation_reason}</p>}
            {previews[photo.id] && <img className="mt-3 aspect-square w-full rounded object-cover" src={previews[photo.id]} alt={`Matchmaking photo ${position}`} />}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void preview(photo.id)}>Preview</Button>
              {!replacement && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setReplaceTarget(photo.id)}>Replace</Button>}
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void remove(photo)}>Delete</Button>
            </div>
            {targetId && <label className="mt-2 block text-sm">Choose replacement photo<input className="mt-1 block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy !== null}
              onChange={event => { const file = event.target.files?.[0]; if (file) void upload(position, file, photo.id); event.currentTarget.value = ''; }} /></label>}
            {!incomplete && !replacement && <div className="mt-3 flex gap-2"><Button size="sm" variant="ghost" disabled={busy !== null || photoIndex <= 0} onClick={() => void move(photo.id, -1)}>Move left</Button><Button size="sm" variant="ghost" disabled={busy !== null || photoIndex < 0 || photoIndex >= ordered.length - 1} onClick={() => void move(photo.id, 1)}>Move right</Button></div>}
          </>}
        </article>;
      })}
    </div>}
    <p className="mt-4 text-xs text-gray-500">Approved-photo count is informational and does not affect Matchmaking eligibility. Pending and rejected photos still use a slot.</p>
    {busy && <p className="mt-3 text-sm text-gray-500" role="status">{busy === 'reorder' ? 'Updating order…' : busy.startsWith('preview-') ? 'Loading preview…' : busy.startsWith('delete-') ? 'Removing photo…' : uploadProgress ? `Uploading photo… ${uploadProgress}%` : 'Preparing photo…'}</p>}
  </section>;
};
