import { exportDmdcRequest } from "@/lib/services/dmdc-export";

export const dynamic = "force-dynamic";

// POST rather than GET: generating the file decrypts SSNs and writes an audit
// row, so it shouldn't be triggered by prefetching or a pasted link.
export async function POST() {
  const { fileName, content } = await exportDmdcRequest();
  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=us-ascii",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
