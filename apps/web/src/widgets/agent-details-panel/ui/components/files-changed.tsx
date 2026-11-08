import { FileDiffIcon } from "lucide-react";

import { ReliabilityTag } from "@/entities/event";

/** Files this agent modified — derived from file.modified events, so tagged "derived". */
export function FilesChanged({ files }: { files: string[] }) {
  if (files.length === 0) {
    return <p className="font-mono text-xs text-muted-foreground">No file changes observed.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      <ReliabilityTag reliability="derived" className="self-start" />
      <ul className="flex flex-col gap-0.5 font-mono text-xs">
        {files.map((f) => (
          <li key={f} className="flex items-center gap-1.5 break-all">
            <FileDiffIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
