/** Earlier versions from the viewer-scoped deal payload (brand URLs stay watermarked). */
export function submissionHistory(deals: Array<Record<string, any>>, campaignId?: string) {
  return deals.flatMap(deal => {
    const campaign = deal.campaign || {};
    if (campaignId && String(campaign.id || deal.campaign_id) !== campaignId) return [];
    const versions = deal.content_submission?.versions;
    if (!Array.isArray(versions)) return [];
    return versions.slice(0, -1).filter(version => version.video_url).map(version => ({
      ...version,
      id: `history-${version.id || `${deal.deal_id}-${version.version}-${version.stage || ''}`}`,
      historical: true,
      creator_name: deal.creator?.name || deal.creator?.nickname || 'Creator',
      creator: deal.creator?.name || deal.creator?.nickname || 'Creator',
      title: campaign.title || 'Submission',
      status: version.status || 'submitted',
      submittedAt: version.submitted_at,
      preview_url: version.video_url,
      work_files: [version.video_url],
      files: [version.video_url],
      watermark_protected: true,
    }));
  });
}
