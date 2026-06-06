import imageCompression from "browser-image-compression";

export async function compressImage(
  file: File,
  maxWidth = 800
): Promise<string> {
  const compressed = await imageCompression(file, {
    maxWidthOrHeight: maxWidth,
    maxSizeMB: 0.8,
    useWebWorker: true,
    fileType: "image/jpeg",
    initialQuality: 0.82,
  });

  return new Promise<string>(
    (resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(compressed);
    }
  );
}
