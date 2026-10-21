import { BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Audit = { activeDuty: boolean; rateCapEligible: boolean } | undefined;

export function ScraStatusBadge({ audit }: { audit: Audit }) {
  if (!audit) return <Badge variant="outline">Not checked</Badge>;
  if (audit.rateCapEligible) {
    return (
      <Badge className="bg-emerald-600 text-white">
        <BadgeCheck />
        Eligible for 6% Rate Cap
      </Badge>
    );
  }
  if (audit.activeDuty) return <Badge variant="secondary">Active duty, not eligible</Badge>;
  return <Badge variant="outline">Not active duty</Badge>;
}
