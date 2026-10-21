"use server";

import { revalidatePath } from "next/cache";
import { importLoanCsv, type LoanImportSummary } from "@/lib/services/loan-import";
import { importDmdcResponse, type DmdcImportSummary } from "@/lib/services/dmdc-import";

const MAX_BYTES = 10 * 1024 * 1024;

async function readUpload(formData: FormData, allowed: RegExp): Promise<{ name: string; text: string } | string> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return "Choose a file to upload.";
  if (file.size > MAX_BYTES) return "File is larger than 10 MB.";
  if (!allowed.test(file.name)) return "Unsupported file type.";
  return { name: file.name, text: await file.text() };
}

export type ActionState<T> = { result?: T; error?: string };

export async function uploadLoanCsv(
  _prev: ActionState<LoanImportSummary>,
  formData: FormData
): Promise<ActionState<LoanImportSummary>> {
  const upload = await readUpload(formData, /\.csv$/i);
  if (typeof upload === "string") return { error: upload };
  const result = await importLoanCsv(upload.name, upload.text);
  revalidatePath("/", "layout");
  return result.fatal ? { error: result.fatal } : { result };
}

export async function uploadDmdcResponse(
  _prev: ActionState<DmdcImportSummary>,
  formData: FormData
): Promise<ActionState<DmdcImportSummary>> {
  const upload = await readUpload(formData, /\.(csv|txt)$/i);
  if (typeof upload === "string") return { error: upload };
  const result = await importDmdcResponse(upload.name, upload.text);
  revalidatePath("/", "layout");
  return result.fatal ? { error: result.fatal } : { result };
}
