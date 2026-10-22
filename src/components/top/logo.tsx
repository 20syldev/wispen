"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export interface LogoProps {
    className?: string;
    showWordmark?: boolean;
    wordmarkClassName?: string;
}

/**
 * Brand lockup: a small hand-drawn w whose last stroke sweeps around it in a signature flourish
 * that stops short of a vermilion full stop, followed by the "wispen" wordmark set with its
 * wordmark tokens. The mark is decorative; the wordmark carries the name, and the wrapper title
 * keeps it discoverable when the wordmark is hidden.
 *
 * @param className - Extra classes for the wrapper, e.g. to size the lockup
 * @param showWordmark - Whether the wordmark follows the mark, true by default
 * @param wordmarkClassName - Extra classes for the wordmark, e.g. to resize its text
 * @returns The mark, followed by the wordmark unless it is turned off
 */
export function Logo({ className, showWordmark = true, wordmarkClassName }: LogoProps) {
    const t = useTranslations("common");
    const name = t("appName");

    return (
        <span
            className={cn(
                "inline-flex min-w-0 items-center gap-[7px] text-foreground select-none",
                className,
            )}
        >
            <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="size-6 shrink-0 overflow-visible"
            >
                <path
                    className="fill-none stroke-current"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 8.4C6.6 11.6 7.4 15.6 9.2 15.6 10.8 15.6 10.9 10.8 12 10.8 13.1 10.8 13.2 15.6 14.8 15.6 16.6 15.6 17.4 11.8 17.8 8.6 18.1 5.6 22 6.4 22 11.6 22 17.6 17.4 21.8 11.8 21.8 6.6 21.8 2.8 18.6 2.3 14.8"
                />
                <circle className="fill-mark" cx="1.9" cy="10.9" r="1.5" />
            </svg>
            {showWordmark && (
                <span
                    className={cn(
                        "pb-px font-wordmark text-[27px] leading-none whitespace-nowrap",
                        wordmarkClassName,
                    )}
                >
                    {name}
                </span>
            )}
        </span>
    );
}
