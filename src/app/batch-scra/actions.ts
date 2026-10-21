"use server";

import { revalidatePath } from "next/cache";
import { applyDmdcResults, previewDmdcResults, type DmdcApplyResult, type DmdcPreview } from "@/lib/dmdc-parser";
import { readUpload } from "@/lib/uploads";

const DMDC_FILE = /\.(csv|txt)$/i;

export async function previewDmdcFile(formData: FormData): Promise<{ preview?: DmdcPreview; error?: string }> {
  const upload = await readUpload(formData, DMDC_FILE);
  if (typeof upload === "string") return { error: upload };
  const { preview, fatal } = await previewDmdcResults(upload.text);
  return fatal ? { error: fatal } : { preview };
}

// The client re-sends the file rather than the preview, so what gets written
// is always derived server-side from the file itself.
export async function applyDmdcFile(formData: FormData): Promise<{ result?: DmdcApplyResult; error?: string }> {
  const upload = await readUpload(formData, DMDC_FILE);
  if (typeof upload === "string") return { error: upload };
  const { result, fatal } = await applyDmdcResults(upload.name, upload.text);
  revalidatePath("/", "layout");
  return fatal ? { error: fatal } : { result };
}
