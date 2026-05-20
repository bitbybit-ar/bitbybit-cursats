"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import { LogoutIcon } from "@/components/icons";
import { useSignerContext } from "@/lib/contexts/signer-context";

interface SignOutButtonProps {
  /** Localised label, e.g. "Cerrar sesión". */
  label: string;
  /** Where to send the buyer after sign-out. Defaults to the home page. */
  redirectTo?: string;
}

export function SignOutButton({ label, redirectTo = "/" }: SignOutButtonProps) {
  const router = useRouter();
  const { signOut } = useSignerContext();
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    if (isPending) return;
    setIsPending(true);
    try {
      await signOut();
      router.push(redirectTo);
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
    >
      <LogoutIcon size={16} />
      {label}
    </Button>
  );
}

export default SignOutButton;
