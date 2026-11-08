import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

import { type ThemePref, useThemeStore } from "../model/theme.store";

const OPTIONS: Array<{ value: ThemePref; label: string }> = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

const isThemePref = (v: string): v is ThemePref => OPTIONS.some((o) => o.value === v);

/** Theme switcher: dark (default), light, or follow the OS. */
export function ThemeToggle() {
  const pref = useThemeStore((s) => s.pref);
  const setPref = useThemeStore((s) => s.setPref);
  const Icon = pref === "system" ? MonitorIcon : pref === "light" ? SunIcon : MoonIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Theme: ${pref}`}>
          <Icon className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="font-mono">
        <DropdownMenuLabel className="text-index">[theme]</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={pref}
          onValueChange={(v) => {
            if (isThemePref(v)) setPref(v);
          }}
        >
          {OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
