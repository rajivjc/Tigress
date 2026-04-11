"use client";

import { useAuth } from "@/hooks/useAuth";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ROLES } from "@/lib/constants";

export default function ProfilePage() {
  const { profile, role } = useAuth();

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface/60 p-6 shadow-xl backdrop-blur">
        <div className="mb-4 inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-accent">
          {role === "member" ? ROLES.MEMBER : role ?? ROLES.MEMBER}
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-white">Profile</h1>
        <p className="mb-4 font-mono text-xs text-white/50">/profile</p>

        {profile ? (
          <dl className="mb-6 space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-white/40">
                Name
              </dt>
              <dd className="text-white">{profile.full_name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-white/40">
                Email
              </dt>
              <dd className="text-white">{profile.email}</dd>
            </div>
            {profile.phone && (
              <div>
                <dt className="text-xs uppercase tracking-wider text-white/40">
                  Phone
                </dt>
                <dd className="text-white">{profile.phone}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="mb-6 text-sm text-white/60">
            Personal details, membership tier and preferences.
          </p>
        )}

        <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-4 text-center text-sm text-white/60">
          More profile settings coming soon
        </div>

        <div className="mt-6">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
