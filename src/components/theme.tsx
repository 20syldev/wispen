"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

import { bindTheme } from "@/lib/theme";

/**
 * Exposes the next-themes accessors to non-React code (theme command and shortcut).
 *
 * @returns Always null
 */
export function ThemeBridge() {
    const { resolvedTheme, setTheme } = useTheme();
    useEffect(() => bindTheme(() => resolvedTheme, setTheme), [resolvedTheme, setTheme]);
    return null;
}
