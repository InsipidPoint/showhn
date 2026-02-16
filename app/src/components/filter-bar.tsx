"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TIME_TABS = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "All Time", value: "all" },
] as const;

const SORT_OPTIONS = [
  { label: "Newest", value: "newest" },
  { label: "Most Upvoted", value: "points" },
  { label: "Most Discussed", value: "comments" },
  { label: "AI Picks", value: "interesting" },
] as const;

export function FilterBar({ categories, totalCount }: { categories: string[]; totalCount?: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentTime = searchParams.get("t") || "week";
  const currentSort = searchParams.get("sort") || "newest";
  const currentCategories = searchParams.getAll("cat");

  function updateParams(updates: Record<string, string | string[] | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      params.delete(key);
      if (value !== null) {
        if (Array.isArray(value)) {
          for (const v of value) params.append(key, v);
        } else {
          params.set(key, value);
        }
      }
    }
    router.push(`/?${params.toString()}`);
  }

  function toggleCategory(cat: string) {
    const updated = currentCategories.includes(cat)
      ? currentCategories.filter((c) => c !== cat)
      : [...currentCategories, cat];
    updateParams({ cat: updated.length > 0 ? updated : null });
  }

  return (
    <div className="space-y-3 mb-6">
      {/* Time tabs + sort row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {TIME_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => updateParams({ t: tab.value })}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap",
                currentTime === tab.value
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5">
          <span className="text-xs text-muted-foreground mr-1 hidden sm:inline">Sort:</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateParams({ sort: opt.value })}
              className={cn(
                "px-2 py-1 text-xs rounded transition-colors whitespace-nowrap",
                currentSort === opt.value
                  ? "bg-secondary text-secondary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {currentCategories.length > 0 && (
            <button
              onClick={() => updateParams({ cat: null })}
              className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 shrink-0"
            >
              Clear
            </button>
          )}
          {categories.map((cat) => (
            <Badge
              key={cat}
              variant={currentCategories.includes(cat) ? "default" : "outline"}
              className="cursor-pointer whitespace-nowrap select-none"
              onClick={() => toggleCategory(cat)}
            >
              {cat}
            </Badge>
          ))}
        </div>
      )}

      {/* Result count */}
      {totalCount !== undefined && (
        <p className="text-xs text-muted-foreground">
          {totalCount} project{totalCount !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
