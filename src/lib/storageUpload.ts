/** Extension from filename; logs non–mp4/webm video extensions (upload still proceeds). */
export function resolveStorageExtension(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isVideo = file.type.startsWith('video');
  if (isVideo) {
    if (ext && !['mp4', 'webm'].includes(ext)) {
      console.log('Converting or rejecting unsupported video format:', ext);
    }
    return ext || 'mp4';
  }
  if (!ext) return file.type.startsWith('image/') ? 'jpg' : 'bin';
  return ext;
}

/** Supabase Storage metadata: videos use video/mp4 so browsers/CDNs serve playable type. */
export function storageUploadContentType(file: File): string {
  const isVideo = file.type.startsWith('video');
  return isVideo ? 'video/mp4' : file.type || 'application/octet-stream';
}

/** Home + Reels uploads in `posts` bucket. */
export function feedStoragePath(userId: string, ext: string): string {
  const e = ext.replace(/^\./, '').toLowerCase();
  return `feed/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${e}`;
}

/** Story media in `posts` bucket (separate prefix from feed). */
export function storiesStoragePath(userId: string, ext: string): string {
  const e = ext.replace(/^\./, '').toLowerCase();
  return `stories/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${e}`;
}

/** Group post video uploads. */
export function groupPostVideoStoragePath(userId: string, ext: string): string {
  const e = ext.replace(/^\./, '').toLowerCase();
  return `group-posts/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${e}`;
}
