import { useState } from "react";

import { type ApiToken } from "@/entities/api-token";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";

import { useRevokeApiToken } from "../model/use-revoke-api-token";

/** Revoke a token after an explicit confirmation; clients using it lose access immediately. */
export function RevokeTokenButton({ token }: { token: Pick<ApiToken, "id" | "name"> }) {
  const [open, setOpen] = useState(false);
  const revoke = useRevokeApiToken();

  const confirm = async () => {
    try {
      await revoke.mutateAsync(token.id);
      setOpen(false);
    } catch {
      // the error stays visible in the dialog
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) revoke.reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className="rounded-sm"
          aria-label={`Revoke token ${token.name}`}
        >
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-display">Revoke {token.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            MCP clients using this token are refused from now on. This cannot be undone — create a
            new token to restore access.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {revoke.isError ? (
          <p role="alert" className="font-mono text-xs text-destructive">
            Revoke failed: {revoke.error.message}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost" size="sm" className="rounded-sm">
              Cancel
            </Button>
          </AlertDialogCancel>
          {/* not AlertDialogAction: it would close before the request finishes */}
          <Button
            variant="destructive"
            size="sm"
            className="rounded-sm"
            disabled={revoke.isPending}
            onClick={() => void confirm()}
          >
            {revoke.isPending ? "Revoking…" : "Revoke token"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
