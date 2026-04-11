"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { AccessDenied } from "@/components/ui/AccessDenied";
import type { UserRole } from "@/lib/types";

interface RouteGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
}

/**
 * Client-side role guard. Use inside a layout to protect all routes under it.
 *
 * While auth is resolving: shows a loading skeleton.
 * Unauthenticated: redirects to /login.
 * Wrong role: renders an AccessDenied card (no redirect so users can see why).
 * Authorized: renders children.
 */
export function RouteGuard({ allowedRoles, children }: RouteGuardProps) {
  const router = useRouter();
  const { role, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && role === null) {
      router.replace("/login");
    }
  }, [isLoading, role, router]);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (role === null) {
    // Render the skeleton while the redirect lands.
    return <LoadingSkeleton />;
  }

  if (!allowedRoles.includes(role)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}
