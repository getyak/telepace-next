"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Input, Label } from "@telepace/ui";

/**
 * Destructive, irreversible action → the one place a confirmation dialog is
 * warranted rather than trained-away noise. The slug gate makes the confirm a
 * deliberate act instead of a reflex click; the CTA stays disabled until the
 * typed slug matches exactly.
 */
export function DeleteWorkspaceDialog({
  slug,
  labels,
}: {
  slug: string;
  labels: {
    trigger: string;
    title: string;
    body: string;
    inputLabel: string;
    confirm: string;
    cancel: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === slug;

  // Reset the gate whenever the dialog closes, so reopening never starts
  // pre-armed from a previous attempt.
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        {labels.trigger}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title={labels.title}>
        <p className="text-sm text-body">{labels.body}</p>

        <div className="mt-5">
          <Label htmlFor="delete-confirm-slug">{labels.inputLabel}</Label>
          <Input
            id="delete-confirm-slug"
            value={typed}
            autoComplete="off"
            placeholder={slug}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {labels.cancel}
          </Button>
          <Button variant="danger" size="sm" disabled={!matches}>
            {labels.confirm}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
