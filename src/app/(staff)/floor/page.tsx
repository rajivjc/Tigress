import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { ROLES } from "@/lib/constants";

export default function FloorPage() {
  return (
    <PlaceholderPage
      title="Floorplan"
      route="/floor"
      role={ROLES.STAFF}
      description="Live view of all tables, occupancy and reservations."
    />
  );
}
