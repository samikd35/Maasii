"use client";

import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

export function WaiterTask({ open, title, busy, closeLabel, initialFocus, onClose, children }: {
  open: boolean;
  title: string;
  busy: boolean;
  closeLabel: string;
  initialFocus?: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useLayoutEffect(() => {
    const element = dialog.current!;
    if (open && !element.open) {
      element.showModal();
      initialFocus?.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open, initialFocus]);

  return (
    <dialog ref={dialog} className="waiter-task" aria-labelledby={heading} onClose={() => {
      if (!dialog.current?.open) onClose();
    }} onCancel={(event) => { if (busy) event.preventDefault(); }}>
      {open && <>
        <header className="waiter-task-header">
          <h2 id={heading}>{title}</h2>
          <button type="button" className="workspace-button" disabled={busy} onClick={() => dialog.current?.close()}>{closeLabel}</button>
        </header>
        <div className="waiter-task-content">{children}</div>
      </>}
    </dialog>
  );
}
