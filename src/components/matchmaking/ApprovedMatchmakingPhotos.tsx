import React, { useEffect, useState } from 'react';
import { getMatchmakingPhotoViewUrl, getMatchmakingProfilePhotoIds } from '@/lib/matchmakingService';

interface ApprovedPhoto {
  photoId: string;
  displayOrder: number;
  signedUrl: string;
}

export const ApprovedMatchmakingPhotos: React.FC<{ profileIdentifier: string; compact?: boolean }> = ({ profileIdentifier, compact = false }) => {
  const [photos, setPhotos] = useState<ApprovedPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      setLoading(true);
      try {
        const ids = await getMatchmakingProfilePhotoIds(profileIdentifier);
        const selected = compact ? ids.slice(0, 1) : ids.slice(0, 3);
        const results = await Promise.all(selected.map(async item => {
          try {
            return { photoId: item.photo_id, displayOrder: item.display_order, signedUrl: await getMatchmakingPhotoViewUrl(item.photo_id) };
          } catch {
            return null;
          }
        }));
        if (active) setPhotos(results.filter((item): item is ApprovedPhoto => item !== null));
      } catch {
        if (active) setPhotos([]);
      } finally {
        if (active) {
          setLoading(false);
          // Broker URLs last five minutes; refresh before they expire and never persist them.
          timer = setTimeout(() => void load(), 4 * 60 * 1000);
        }
      }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [profileIdentifier, compact]);

  if (compact) {
    const photo = photos[0];
    return photo
      ? <img src={photo.signedUrl} alt="Approved Matchmaking photo" className="h-48 w-full object-cover" />
      : <div className="flex h-48 items-center justify-center bg-[#e9e2d8] text-sm text-gray-600">{loading ? 'Loading photo…' : 'Photo not available'}</div>;
  }

  return photos.length
    ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{photos.map(photo => <img key={photo.photoId} src={photo.signedUrl} alt={`Matchmaking photo ${photo.displayOrder}`} className="aspect-square w-full rounded-lg object-cover" />)}</div>
    : <div className="flex min-h-40 items-center justify-center rounded-lg bg-[#e9e2d8] text-sm text-gray-600">{loading ? 'Loading approved photos…' : 'No approved photos are available.'}</div>;
};
