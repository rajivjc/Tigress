import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { ROLES } from "@/lib/constants";

export default function RatesPage() {
  return (
    <PlaceholderPage
      title="Rates & Pricing"
      route="/rates"
      role={ROLES.OWNER}
      description="Hourly rates, peak pricing and membership discounts."
    />
  );
}
