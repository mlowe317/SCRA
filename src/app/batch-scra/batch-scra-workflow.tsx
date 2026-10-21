"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, CheckCircle2, FileUp, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatMoney, formatRate } from "@/lib/format";
import { maskSsn } from "@/lib/ssn-mask";
import type { DmdcApplyResult, DmdcPreview, PreviewRow } from "@/lib/dmdc-parser";
import { applyDmdcFile, previewDmdcFile } from "./actions";

type Filter = "all" | "eligible" | "changes" | "issues";

const STATUS_LABELS: Record<PreviewRow["status"], string> = {
  matched: "Matched",
  unmatched: "No match",
  conflict: "ID / SSN conflict",
  duplicate: "Duplicate",
};

function filterRows(rows: PreviewRow[], filter: Filter) {
  switch (filter) {
    case "eligible":
      return rows.filter((r) => r.loans.some((l) => l.eligible));
    case "changes":
      return rows.filter((r) => r.loans.some((l) => l.flagChanges));
    case "issues":
      return rows.filter((r) => r.status !== "matched");
    default:
      return rows;
  }
}

function toFormData(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return fd;
}

export function BatchScraWorkflow() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<DmdcPreview | null>(null);
  const [applied, setApplied] = useState<DmdcApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, startTransition] = useTransition();
  const [applying, setApplying] = useState(false);

  function reset() {
    setFile(null);
    setPreview(null);
    setApplied(null);
    setError(null);
    setFilter("all");
    if (inputRef.current) inputRef.current.value = "";
  }

  function choose(next: File | undefined) {
    if (!next) return;
    reset();
    setFile(next);
    startTransition(async () => {
      const res = await previewDmdcFile(toFormData(next));
      if (res.error) setError(res.error);
      else setPreview(res.preview ?? null);
    });
  }

  function apply() {
    if (!file) return;
    setApplying(true);
    startTransition(async () => {
      const res = await applyDmdcFile(toFormData(file));
      setApplying(false);
      if (res.error) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      setApplied(res.result ?? null);
      toast.success(`Applied: ${res.result?.loansFlagUpdated ?? 0} loan flag(s) updated`);
      router.refresh();
    });
  }

  if (applied) {
    const s = applied.summary;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" />
            Results applied
          </CardTitle>
          <CardDescription>{file?.name}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p>
            Wrote {applied.checksCreated} SCRA check(s) for {s.matched} borrower(s) and updated {applied.loansFlagUpdated}{" "}
            loan flag(s). {s.eligibleLoans} loan(s) are eligible for the 6% rate cap, an estimated{" "}
            {formatMoney(s.totalAnnualSavings)} a year in savings.
          </p>
          {applied.checksCreated > applied.loansFlagUpdated && (
            <p className="text-muted-foreground">
              Some loans already had a newer check, so their flags were left as they were. Their history still records
              this result.
            </p>
          )}
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/">View dashboard</Link>
            </Button>
            <Button variant="outline" onClick={reset}>
              <RotateCcw />
              Process another file
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const rows = preview ? filterRows(preview.rows, filter) : [];

  return (
    <div className="flex flex-col gap-6">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload DMDC results file"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
          dragging ? "border-primary bg-muted" : "hover:bg-muted/50"
        )}
      >
        {pending && !applying ? (
          <Loader2 className="text-muted-foreground size-8 animate-spin" />
        ) : (
          <FileUp className="text-muted-foreground size-8" />
        )}
        <p className="font-medium">{file ? file.name : "Drop the DMDC results file here"}</p>
        <p className="text-muted-foreground text-sm">.txt or .csv, up to 10 MB. Click to browse.</p>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.csv,text/plain,text/csv"
          className="hidden"
          data-testid="dmdc-file-input"
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {preview && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Rows", preview.summary.totalRows],
              ["Matched borrowers", preview.summary.matched],
              ["On active duty", preview.summary.activeDuty],
              ["Eligible loans", `${preview.summary.eligibleLoans} (${preview.summary.newlyEligible} new)`],
              ["Est. annual savings", formatMoney(preview.summary.totalAnnualSavings)],
            ].map(([label, value]) => (
              <Card key={label} className="gap-1 py-4">
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                </CardHeader>
                <CardContent className="text-xl font-semibold">{value}</CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Review matches</CardTitle>
              <CardDescription>
                Nothing is saved until you apply. Unmatched, conflicting and duplicate rows are skipped.
                {preview.summary.noLongerEligible > 0 &&
                  ` ${preview.summary.noLongerEligible} loan(s) currently flagged will lose the flag.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <TabsList>
                  <TabsTrigger value="all">All ({preview.rows.length})</TabsTrigger>
                  <TabsTrigger value="eligible">Eligible</TabsTrigger>
                  <TabsTrigger value="changes">Flag changes</TabsTrigger>
                  <TabsTrigger value="issues">
                    Issues ({preview.rows.filter((r) => r.status !== "matched").length + preview.errors.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Borrower</TableHead>
                    <TableHead>SSN</TableHead>
                    <TableHead>Active duty</TableHead>
                    <TableHead>Begin</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Certificate</TableHead>
                    <TableHead>Loans and 6% cap result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.line} className={cn(r.status !== "matched" && "text-muted-foreground")}>
                      <TableCell>{r.line}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "matched" ? "secondary" : "destructive"}>
                          {STATUS_LABELS[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.borrowerName ?? ""}</TableCell>
                      <TableCell className="font-mono">{r.ssnLastFour ? maskSsn(r.ssnLastFour) : ""}</TableCell>
                      <TableCell>{r.activeDuty ? "Yes" : "No"}</TableCell>
                      <TableCell>{r.activeDutyStartDate ?? ""}</TableCell>
                      <TableCell>{r.activeDutyEndDate ?? ""}</TableCell>
                      <TableCell className="font-mono">{r.certificateNumber ?? ""}</TableCell>
                      <TableCell>
                        <ul className="flex flex-col gap-1">
                          {r.loans.map((l) => (
                            <li key={l.loanId} className="flex flex-wrap items-center gap-2">
                              <span className="font-mono">{l.accountNumber}</span>
                              <span className="text-muted-foreground text-xs">
                                orig {l.originationDate}, {formatRate(l.currentInterestRate)}
                              </span>
                              {l.eligible ? (
                                <Badge className="bg-emerald-600 text-white">
                                  <BadgeCheck />
                                  Eligible for 6% Rate Cap · {formatMoney(l.annualSavings)}/yr
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">{l.reason}</span>
                              )}
                              {l.flagChanges && (
                                <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                                  {l.eligible ? "New" : "Flag removed"}
                                </Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filter === "issues" &&
                    preview.errors.map((e) => (
                      <TableRow key={`err-${e.line}`} className="text-muted-foreground">
                        <TableCell>{e.line}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">Unreadable</Badge>
                        </TableCell>
                        <TableCell colSpan={7}>{e.message}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
              {!rows.length && filter !== "issues" && (
                <p className="text-muted-foreground py-4 text-center text-sm">No rows in this view.</p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={reset} disabled={pending}>
                  Cancel
                </Button>
                <Button onClick={apply} disabled={pending || preview.summary.matched === 0}>
                  {applying && <Loader2 className="animate-spin" />}
                  Apply {preview.summary.loansEvaluated} loan result(s)
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
