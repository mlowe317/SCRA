import { NextResponse } from "next/server";
import { exportDmdcBatch } from "@/lib/dmdc-batch";

export const dynamic = "force-dynamic";

// POST rather than GET: generating the file decrypts SSNs and writes an audit
// row, so it shouldn't be triggered by prefetching or a pasted link.
export async function POST(request: Request) {
  const { fileName, content, borrowerCount } = await exportDmdcBatch();
  if (borrowerCount === 0) {
    return NextResponse.redirect(new URL("/loans?export=none", request.url), 303);
  }
  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=us-ascii",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
