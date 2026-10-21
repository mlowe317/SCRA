const MAX_BYTES = 10 * 1024 * 1024;

/** Reads the "file" field of a form upload, or returns a user-facing error. */
export async function readUpload(formData: FormData, allowed: RegExp): Promise<{ name: string; text: string } | string> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return "Choose a file to upload.";
  if (file.size > MAX_BYTES) return "File is larger than 10 MB.";
  if (!allowed.test(file.name)) return "Unsupported file type.";
  return { name: file.name, text: await file.text() };
}
