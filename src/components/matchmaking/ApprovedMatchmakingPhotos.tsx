import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { getMatchmakingPhotoViewUrl, getMatchmakingProfilePhotoIds, reportMatchmakingProfile } from '@/lib/matchmakingService';

interface ApprovedPhoto {
  photoId: string;
  displayOrder: number;
  signedUrl: string;
}

interface ApprovedMatchmakingPhotosProps {
  profileIdentifier: string;
  compact?: boolean;
  compactSize?: 'card' | 'thumbnail';
}

export const ApprovedMatchmakingPhotos: React.FC<ApprovedMatchmakingPhotosProps> = ({ profileIdentifier, compact = false, compactSize = 'card' }) => {
  const [photos, setPhotos] = useState<ApprovedPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const galleryOpenRef = useRef(false);
  const mounted = useRef(false);
  const requestVersion = useRef(0);

  const load = useCallback(async (includeGalleryPhotos = false) => {
    const requestId = ++requestVersion.current;
    setLoading(true);
    setLoadError(false);
    try {
      const ids = await getMatchmakingProfilePhotoIds(profileIdentifier);
      // Keep card rendering bounded to the primary signed URL. Fetch the full
      // gallery only when a compact card is opened; the card still renders
      // Photo 1 only.
      const selected = compact && !includeGalleryPhotos
        ? ids.filter(item => item.display_order === 1)
        : ids.slice(0, 3);
      const results = await Promise.all(selected.map(async item => {
        try {
          return { photoId: item.photo_id, displayOrder: item.display_order, signedUrl: await getMatchmakingPhotoViewUrl(item.photo_id) };
        } catch {
          return null;
        }
      }));
      const usable = results.filter((item): item is ApprovedPhoto => item !== null);
      if (!mounted.current || requestId !== requestVersion.current) return;
      setPhotos(usable);
      setActivePhotoId(current => current && usable.some(photo => photo.photoId === current)
        ? current
        : usable.find(photo => photo.displayOrder === 1)?.photoId ?? null);
    } catch {
      if (!mounted.current || requestId !== requestVersion.current) return;
      setPhotos([]);
      setLoadError(true);
      setActivePhotoId(null);
    } finally {
      if (mounted.current && requestId === requestVersion.current) {
        setLoading(false);
        if (timer.current) clearTimeout(timer.current);
        // URLs expire after five minutes. Refresh before expiry and never persist them.
        timer.current = setTimeout(() => void load(galleryOpenRef.current), 4 * 60 * 1000);
      }
    }
  }, [compact, profileIdentifier]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  useEffect(() => { galleryOpenRef.current = galleryOpen; }, [galleryOpen]);

  const activePhoto = photos.find(photo => photo.photoId === activePhotoId) ?? null;
  const primaryPhoto = photos.find(photo => photo.displayOrder === 1) ?? null;
  const index = activePhoto ? photos.findIndex(photo => photo.photoId === activePhoto.photoId) : -1;
  const openAt = (photoId: string | null) => {
    setActivePhotoId(photoId);
    setImageFailed(false);
    setGalleryOpen(true);
    if (compact) void load(true);
  };

  const move = useCallback((direction: -1 | 1) => {
    if (!photos.length) return;
    const current = photos.findIndex(photo => photo.photoId === activePhotoId);
    const next = current < 0
      ? (direction > 0 ? 0 : photos.length - 1)
      : (current + direction + photos.length) % photos.length;
    setActivePhotoId(photos[next].photoId);
    setImageFailed(false);
  }, [activePhotoId, photos]);

  useEffect(() => {
    if (!galleryOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [galleryOpen, move]);

  const reportPhoto = async () => {
    if (!activePhoto) return;
    try {
      await reportMatchmakingProfile(profileIdentifier, 'inappropriate_photo',
        `Reported Matchmaking photo ${activePhoto.photoId} (Photo ${activePhoto.displayOrder}) from the photo gallery.`);
      toast.success('Photo report sent privately to the team.');
      setGalleryOpen(false);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The photo report could not be sent.');
    }
  };

  const photoImage = (photo: ApprovedPhoto | null, className: string) => photo && !imageFailed
    ? <img src={photo.signedUrl} alt={`Matchmaking Photo ${photo.displayOrder}`} className={className} onError={() => setImageFailed(true)} />
    : <div className={`flex items-center justify-center bg-[#e9e2d8] text-sm text-gray-600 ${className}`}>
      <span className="flex items-center gap-2"><ImageOff aria-hidden="true" className="h-4 w-4" />{loading ? 'Loading photo…' : loadError ? 'Photo unavailable' : 'Primary photo not available'}</span>
    </div>;

  const placeholder = <div className="flex h-48 items-center justify-center bg-[#e9e2d8] text-sm text-gray-600">
    <span className="flex items-center gap-2"><ImageOff aria-hidden="true" className="h-4 w-4" />{loading ? 'Loading primary photo…' : loadError ? 'Photo unavailable' : 'Primary photo not available'}</span>
  </div>;

  return <>
    {compact
      ? primaryPhoto
        ? <button type="button" onClick={() => openAt(primaryPhoto.photoId)} aria-label="Open primary Matchmaking photo gallery" className="block w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e3a5f]">
          {photoImage(primaryPhoto, `${compactSize === 'thumbnail' ? 'h-24' : 'h-48'} w-full object-cover`)}
        </button>
        : placeholder
      : <div className="space-y-3">
        {activePhoto
          ? <button type="button" onClick={() => openAt(activePhoto.photoId)} aria-label={`Enlarge Matchmaking Photo ${activePhoto.displayOrder}`} className="block w-full overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e3a5f]">
            {photoImage(activePhoto, 'aspect-[4/3] max-h-[30rem] w-full bg-[#e9e2d8] object-contain')}
          </button>
          : <button type="button" onClick={() => openAt(null)} aria-label="Open Matchmaking photo gallery" className="block w-full rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e3a5f]">
            <div className="aspect-[4/3] max-h-[30rem]">{placeholder}</div>
          </button>}
        <p className="text-xs text-gray-500">Photo 1 is the primary Matchmaking photo.</p>
        {photos.length > 0 && <div className="grid grid-cols-3 gap-2" aria-label="Matchmaking photo thumbnails">
          {photos.map(photo => <button key={photo.photoId} type="button" onClick={() => { setActivePhotoId(photo.photoId); setImageFailed(false); }}
            aria-label={`View Photo ${photo.displayOrder}${photo.displayOrder === 1 ? ', primary photo' : ''}`}
            aria-pressed={activePhotoId === photo.photoId}
            className={`overflow-hidden rounded-md border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e3a5f] ${activePhotoId === photo.photoId ? 'border-[#1e3a5f]' : 'border-transparent'}`}>
            <img src={photo.signedUrl} alt="" className="aspect-square w-full object-cover" onError={event => { event.currentTarget.classList.add('hidden'); }} />
            <span className="sr-only">Photo {photo.displayOrder}</span>
          </button>)}
        </div>}
        {loadError && <p role="status" className="text-sm text-gray-600">Photos are temporarily unavailable.</p>}
      </div>}

    <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
      <DialogContent className="max-h-[95vh] w-[calc(100%-1rem)] max-w-5xl overflow-y-auto p-4 sm:p-6">
        <DialogTitle>Matchmaking photos</DialogTitle>
        <DialogDescription>Photo 1 is the primary Matchmaking photo. Use the arrows or keyboard arrow keys to browse.</DialogDescription>
        <div className="relative flex min-h-[45vh] items-center justify-center rounded-lg bg-black/90"
          onTouchStart={event => setTouchStart(event.changedTouches[0]?.clientX ?? null)}
          onTouchEnd={event => {
            if (touchStart === null) return;
            const delta = (event.changedTouches[0]?.clientX ?? touchStart) - touchStart;
            if (Math.abs(delta) > 45) move(delta > 0 ? -1 : 1);
            setTouchStart(null);
          }}>
          {activePhoto && !imageFailed
            ? <img src={activePhoto.signedUrl} alt={`Matchmaking Photo ${activePhoto.displayOrder}`} className="max-h-[68vh] max-w-full object-contain" onError={() => setImageFailed(true)} />
            : <div className="p-8 text-center text-sm text-white">{loading ? 'Loading photo…' : 'This photo is unavailable. Photo 1 remains the primary profile image.'}</div>}
          {photos.length > 1 && <>
            <Button type="button" variant="secondary" size="icon" aria-label="Previous photo" onClick={() => move(-1)} className="absolute left-3 top-1/2 -translate-y-1/2"><ChevronLeft /></Button>
            <Button type="button" variant="secondary" size="icon" aria-label="Next photo" onClick={() => move(1)} className="absolute right-3 top-1/2 -translate-y-1/2"><ChevronRight /></Button>
          </>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-sm text-gray-600">{activePhoto ? `Photo ${activePhoto.displayOrder} · ${index + 1} of ${photos.length}` : 'Primary photo not available'}</p>
          {activePhoto && <Button type="button" variant="outline" onClick={() => void reportPhoto()}>Report photo</Button>}
        </div>
        {photos.length > 1 && <div className="flex gap-2 overflow-x-auto" aria-label="Photo gallery thumbnails">
          {photos.map(photo => <button key={photo.photoId} type="button" onClick={() => { setActivePhotoId(photo.photoId); setImageFailed(false); }}
            aria-label={`Show Photo ${photo.displayOrder}`} aria-pressed={photo.photoId === activePhotoId}
            className={`w-20 shrink-0 overflow-hidden rounded border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${photo.photoId === activePhotoId ? 'border-[#1e3a5f]' : 'border-transparent'}`}>
            <img src={photo.signedUrl} alt="" className="aspect-square w-full object-cover" />
          </button>)}
        </div>}
      </DialogContent>
    </Dialog>
  </>;
};
