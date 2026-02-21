import { sqlite } from "./index";
import type { Post, AiAnalysis } from "./schema";

type PostWithAnalysis = Post & { analysis: AiAnalysis | null };

interface DivergenceStats {
  totalAnalyzed: number;
  hiddenGems: number;
  overhyped: number;
  agreementPct: number;
}

interface DivergenceData {
  gems: PostWithAnalysis[];
  overhyped: PostWithAnalysis[];
  stats: DivergenceStats;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): PostWithAnalysis {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    author: r.author,
    points: r.points,
    comments: r.comments,
    createdAt: r.created_at,
    storyText: r.story_text,
    hasScreenshot: r.has_screenshot,
    pageContent: r.page_content,
    readmeContent: r.readme_content,
    githubStars: r.github_stars,
    githubLanguage: r.github_language,
    githubDescription: r.github_description,
    githubUpdatedAt: r.github_updated_at,
    status: r.status,
    fetchedAt: r.fetched_at,
    updatedAt: r.updated_at,
    analysis: r.a_post_id
      ? {
          postId: r.a_post_id,
          summary: r.a_summary,
          category: r.a_category,
          techStack: r.a_tech_stack,
          targetAudience: r.a_target_audience,
          tags: r.a_tags,
          pickReason: r.a_pick_reason,
          pickScore: r.a_pick_score,
          tier: r.a_tier,
          vibeTags: r.a_vibe_tags,
          strengths: r.a_strengths,
          weaknesses: r.a_weaknesses,
          similarTo: r.a_similar_to,
          analyzedAt: r.a_analyzed_at,
          model: r.a_model,
        }
      : null,
  };
}

const GEMS_SQL = `
  SELECT p.*, a.post_id as a_post_id, a.summary as a_summary, a.category as a_category,
         a.tech_stack as a_tech_stack, a.target_audience as a_target_audience,
         a.tags as a_tags, a.pick_reason as a_pick_reason,
         a.pick_score as a_pick_score,
         a.tier as a_tier, a.vibe_tags as a_vibe_tags,
         a.strengths as a_strengths, a.weaknesses as a_weaknesses,
         a.similar_to as a_similar_to,
         a.analyzed_at as a_analyzed_at, a.model as a_model
  FROM posts p
  JOIN ai_analysis a ON p.id = a.post_id
  WHERE p.status = 'active'
    AND a.tier IN ('gem', 'banger')
    AND p.points <= 10
  ORDER BY a.pick_score DESC, p.created_at DESC
  LIMIT 12
`;

const OVERHYPED_SQL = `
  SELECT p.*, a.post_id as a_post_id, a.summary as a_summary, a.category as a_category,
         a.tech_stack as a_tech_stack, a.target_audience as a_target_audience,
         a.tags as a_tags, a.pick_reason as a_pick_reason,
         a.pick_score as a_pick_score,
         a.tier as a_tier, a.vibe_tags as a_vibe_tags,
         a.strengths as a_strengths, a.weaknesses as a_weaknesses,
         a.similar_to as a_similar_to,
         a.analyzed_at as a_analyzed_at, a.model as a_model
  FROM posts p
  JOIN ai_analysis a ON p.id = a.post_id
  WHERE p.status = 'active'
    AND a.tier IN ('mid', 'pass')
    AND p.points >= 25
  ORDER BY p.points DESC, a.pick_score ASC
  LIMIT 15
`;

const STATS_SQL = `
  SELECT
    COUNT(*) as total_analyzed,
    SUM(CASE WHEN a.tier IN ('gem', 'banger') AND p.points <= 10 THEN 1 ELSE 0 END) as hidden_gems,
    SUM(CASE WHEN a.tier IN ('mid', 'pass') AND p.points >= 25 THEN 1 ELSE 0 END) as overhyped,
    SUM(CASE WHEN a.tier IN ('gem', 'banger', 'solid') AND p.points >= 10 THEN 1 ELSE 0 END) as both_good,
    SUM(CASE WHEN a.tier IN ('mid', 'pass') AND p.points < 10 THEN 1 ELSE 0 END) as both_meh
  FROM posts p
  JOIN ai_analysis a ON p.id = a.post_id
  WHERE p.status = 'active'
    AND a.tier IS NOT NULL
`;

export function getDivergenceData(): DivergenceData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gems = (sqlite.prepare(GEMS_SQL).all() as any[]).map(mapRow);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overhyped = (sqlite.prepare(OVERHYPED_SQL).all() as any[]).map(mapRow);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statsRow = sqlite.prepare(STATS_SQL).get() as any;

  const totalAnalyzed = statsRow?.total_analyzed ?? 0;
  const bothGood = statsRow?.both_good ?? 0;
  const bothMeh = statsRow?.both_meh ?? 0;
  const agreementPct = totalAnalyzed > 0
    ? Math.round(((bothGood + bothMeh) / totalAnalyzed) * 100)
    : 0;

  return {
    gems,
    overhyped,
    stats: {
      totalAnalyzed,
      hiddenGems: statsRow?.hidden_gems ?? 0,
      overhyped: statsRow?.overhyped ?? 0,
      agreementPct,
    },
  };
}
