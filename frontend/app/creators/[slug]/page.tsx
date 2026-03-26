import PublicProfileDetailClient from "../../../src/components/PublicProfileDetailClient";

export default async function CreatorDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicProfileDetailClient mode="creators" slug={slug} />;
}
