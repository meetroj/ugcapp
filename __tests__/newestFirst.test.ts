import { itemTime, newestFirst } from '../src/newestFirst';

test('sorts newest first, undated rows last in original order', () => {
  const rows = [
    { id: 'none1' },
    { id: 'old', created_at: '2026-01-01T00:00:00Z' },
    { id: 'new', submittedAt: '2026-10-01T00:00:00Z' },
    { id: 'none2' },
    { id: 'viaCampaign', campaign: { updated_at: '2026-05-01T00:00:00Z' } },
  ];
  const out = newestFirst(rows, r => itemTime(r, 'campaign')).map(r => r.id);
  expect(out).toEqual(['new', 'viaCampaign', 'old', 'none1', 'none2']);
});
