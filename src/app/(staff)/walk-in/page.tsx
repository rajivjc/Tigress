import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { ROLES } from "@/lib/constants";

export default function WalkInPage() {
  return (
    <PlaceholderPage
      title="Walk-in"
      route="/walk-in"
      role={ROLES.STAFF}
      description="Seat a walk-in guest and start a session on a free table."
    />
  );
}
