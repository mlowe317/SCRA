import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 p-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" />
            SCRA Compliance Tracker
          </CardTitle>
          <CardDescription>
            Loan portfolio tracking and DMDC SCRA status checks.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Scaffold in place. Loan upload, DMDC export, and DMDC import screens come next.
        </CardContent>
      </Card>
    </main>
  );
}
