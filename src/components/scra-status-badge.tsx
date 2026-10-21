import { BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Props = {
  checked: boolean;
  eligible: boolean;
  activeDuty: boolean | undefined;
};

export function ScraStatusBadge({ checked, eligible, activeDuty }: Props) {
  if (!checked) return <Badge variant="outline">Not checked</Badge>;
  if (eligible) {
    return (
      <Badge className="bg-emerald-600 text-white">
        <BadgeCheck />
        Eligible for 6% Rate Cap
      </Badge>
    );
  }
  if (activeDuty) return <Badge variant="secondary">Active duty, not eligible</Badge>;
  return <Badge variant="outline">Not active duty</Badge>;
}
