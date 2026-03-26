import PublicProfileDetailClient from "../../../src/components/PublicProfileDetailClient";

export default async function TeamMemberDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicProfileDetailClient mode="team" slug={slug} />;
}
