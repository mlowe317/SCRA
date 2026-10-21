import { BatchScraWorkflow } from "./batch-scra-workflow";

export const dynamic = "force-dynamic";

export default function BatchScraPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Batch SCRA</h1>
        <p className="text-muted-foreground text-sm">
          Drop the DMDC results file, review the matches and 6% cap evaluations, then apply them.
        </p>
      </div>
      <BatchScraWorkflow />
    </div>
  );
}
