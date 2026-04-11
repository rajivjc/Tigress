import { PlaceholderPage } from "@/components/ui/PlaceholderPage";
import { ROLES } from "@/lib/constants";

export default function SettingsPage() {
  return (
    <PlaceholderPage
      title="Venue Settings"
      route="/settings"
      role={ROLES.OWNER}
      description="Opening hours, branding and operational configuration."
    />
  );
}
