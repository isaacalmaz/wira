/**
 * Order chat images (messages.text = "[IMAGE]" + a JPEG data URL).
 * The longest side is capped at 800px and small photos are never enlarged,
 * so a chat image stays around 50-100 KB in the messages table.
 */
export const CHAT_IMAGE_PREFIX = '[IMAGE]';

export const isChatImage = (text) => typeof text === 'string' && text.startsWith(CHAT_IMAGE_PREFIX);

export const chatImageSrc = (text) => text.slice(CHAT_IMAGE_PREFIX.length);

export function compressChatImage(file, maxDim = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) {
      reject(new Error('not-an-image'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('not-an-image'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(CHAT_IMAGE_PREFIX + canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
