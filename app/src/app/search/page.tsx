import { PostCard } from "@/components/post-card";
import { searchPosts } from "@/lib/db/queries";
import Link from "next/link";
import { SearchInput } from "./search-input";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const query = params.q || "";
  const results = query ? await searchPosts(query) : [];

  return (
    <>
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          Back to browse
        </Link>

        <h1 className="text-xl font-bold mb-3">
          {query ? (
            <>
              Results for &ldquo;{query}&rdquo;
              <span className="text-muted-foreground font-normal text-base ml-2">
                ({results.length} found)
              </span>
            </>
          ) : (
            "Search"
          )}
        </h1>

        <SearchInput defaultValue={query} />
      </div>

      {query && results.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <p className="text-lg font-medium">No results found</p>
          <p className="text-sm mt-1">Try different keywords or broader terms.</p>
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {results.map((post) => (
            <PostCard key={post.id} post={post} analysis={post.analysis} />
          ))}
        </div>
      ) : !query ? (
        <div className="text-center py-20 text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 opacity-40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <p className="text-lg font-medium">Search Show HN projects</p>
          <p className="text-sm mt-1">Search by project name, description, or technology.</p>
        </div>
      ) : null}
    </>
  );
}
