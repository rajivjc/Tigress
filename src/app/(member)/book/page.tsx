import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { ROLES } from "@/lib/constants";

export default function BookPage() {
  return (
    <PlaceholderPage
      title="Book a Table"
      route="/book"
      role={ROLES.MEMBER}
      description="Reserve a billiards table from the floorplan."
    />
  );
}
