/**
 * Compress an image file client-side (canvas resize + JPEG re-encode) and
 * upload it to a public Supabase Storage bucket, scoped under the calling
 * user's own folder (required by the bucket's RLS policies - see
 * migrations/0030_menu_image_storage.sql). Returns the public URL, ready
 * to store directly in a plain image-URL column like products.image.
 */
function compressImageToBlob(file, maxDim = 800, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height) {
          if (width > maxDim) { height *= maxDim / width; width = maxDim; }
        } else {
          if (height > maxDim) { width *= maxDim / height; height = maxDim; }
        }
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Gagal memproses gambar'))),
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('File bukan gambar yang valid'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

export async function uploadImageToBucket(supabaseClient, bucket, userId, file) {
  const blob = await compressImageToBlob(file);
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabaseClient.storage.from(bucket).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
