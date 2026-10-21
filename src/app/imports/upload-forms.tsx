"use client";

import { useActionState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadLoanCsv, type ActionState } from "./actions";

type RowError = { line: number; message: string };

function ErrorList({ errors }: { errors: RowError[] }) {
  if (!errors.length) return null;
  return (
    <details className="text-sm">
      <summary className="text-destructive cursor-pointer">{errors.length} row(s) skipped</summary>
      <ul className="text-muted-foreground mt-2 max-h-48 list-disc overflow-y-auto pl-5">
        {errors.map((e) => (
          <li key={`${e.line}-${e.message}`}>
            Line {e.line}: {e.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

function FileField({ id, accept, pending }: { id: string; accept: string; pending: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>File</Label>
      <div className="flex gap-2">
        <Input id={id} name="file" type="file" accept={accept} required disabled={pending} />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Upload />}
          Upload
        </Button>
      </div>
    </div>
  );
}

export function LoanUploadForm() {
  const [state, action, pending] = useActionState(uploadLoanCsv, {} as ActionState<never>);
  return (
    <form action={action} className="flex flex-col gap-4">
      <FileField id="loan-file" accept=".csv,text/csv" pending={pending} />
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      {state.result && (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Processed {state.result.rowCount} row(s): {state.result.created} created, {state.result.updated} updated.
          </p>
          <ErrorList errors={state.result.errors} />
        </div>
      )}
    </form>
  );
}
