import { Suspense } from "react";
import { PostCard, PostCardSkeleton } from "@/components/post-card";
import { FilterBar } from "@/components/filter-bar";
import { getPosts, getCategories } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const time = (typeof params.t === "string" ? params.t : "week") as
    | "today"
    | "week"
    | "month"
    | "all";
  const sort = (typeof params.sort === "string" ? params.sort : "newest") as
    | "newest"
    | "points"
    | "comments"
    | "interesting";
  const catParam = params.cat;
  const categories = Array.isArray(catParam)
    ? catParam
    : catParam
    ? [catParam]
    : [];

  const [{ posts }, allCategories] = await Promise.all([
    getPosts({ time, sort, categories }),
    getCategories(),
  ]);

  return (
    <>
      <Suspense fallback={null}>
        <FilterBar categories={allCategories} totalCount={posts.length} />
      </Suspense>

      {posts.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <p className="text-lg font-medium">No projects found</p>
          <p className="text-sm mt-1">Try expanding the time filter or removing category filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} analysis={post.analysis} />
          ))}
        </div>
      )}
    </>
  );
}
