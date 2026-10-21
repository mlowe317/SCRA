"use server";

import { revalidatePath } from "next/cache";
import { importLoanCsv, type LoanImportSummary } from "@/lib/services/loan-import";
import { readUpload } from "@/lib/uploads";

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
