import { Avatar } from "@/components/ui/Avatar";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatMonthYear } from "@/lib/format";
import type { Member, MembershipTier } from "@/lib/types";

interface MembershipCardProps {
  member: Member;
  tier: MembershipTier | null;
}

export function MembershipCard({ member, tier }: MembershipCardProps) {
  const joinedLabel = formatMonthYear(member.join_date);

  return (
    <section className="rounded-2xl border border-white/10 bg-surface/60 p-5 shadow-xl backdrop-blur">
      <div className="flex items-start gap-4">
        <Avatar
          name={member.full_name}
          src={member.avatar_url}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-white">
            {member.full_name}
          </h2>
          <p className="mt-1 text-xs text-white/50">
            Member since {joinedLabel}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
              {tier?.name ?? "No tier"}
            </span>
            <StatusDot status={member.subscription_status} />
          </div>
        </div>
      </div>
    </section>
  );
}
