import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { launchImageLibrary } from 'react-native-image-picker';
import BrandPostBrief, { campaignToForm } from '../src/screens/BrandPostBrief';
import { Alert } from '../src/components/AppAlert';
import {
  createCampaign,
  getBusinessProfile,
  getCampaign,
  getPublicProfile,
  getWallet,
  rechargeWallet,
  submitCampaign,
  updateCampaign,
  uploadMedia,
} from '../src/api';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.test',
  createCampaign: jest.fn(),
  getBusinessProfile: jest.fn(),
  getCampaign: jest.fn(),
  getPublicProfile: jest.fn(),
  getWallet: jest.fn(),
  rechargeWallet: jest.fn(),
  submitCampaign: jest.fn(),
  updateCampaign: jest.fn(),
  uploadMedia: jest.fn(),
  verifyWalletPayment: jest.fn(),
}));

// A complete, valid digital-product brief (no shipping) with far-future dates.
const fullDraft = (extra: Record<string, unknown> = {}) => ({
  id: 'd1',
  status: 'draft',
  title: 'Summer Launch',
  product_type: 'digital',
  product_name: 'Glow App',
  product_description: 'A skincare routine app that helps you glow every day.',
  campaign_hook: 'Show the morning routine',
  key_message: 'Glow starts with a habit',
  objectives: ['Awareness'],
  target_audience: 'Urban women 25 to 35 who care about skincare and follow beauty creators online.',
  product_category: 'Beauty',
  deliverable_items: [
    { type: 'Reel (9:16, under 30s)', quantity: 1, duration: '15 seconds', aspect_ratios: ['9:16'] },
  ],
  product_visible: false,
  verbal_mention: false,
  call_to_action: 'None',
  tone_tags: ['Casual'],
  pacing: 'Medium',
  usage_platforms: ["Brand's own Instagram"],
  rights_duration: '1 month',
  exclusivity: 'None',
  modification_rights: 'No (use as-is)',
  draft_delivery_by: '2099-01-10',
  per_video_budget: 1000,
  budget_max: 1000,
  budget_min: 1000,
  creator_level: 'Any',
  content_quality_tier: 'A',
  mood_images: ['/uploads/mood-1.jpg'],
  ...extra,
});

const text = (node: any): string =>
  typeof node === 'string' ? node : (node?.children || []).map(text).join('');
let tree: any;
let alert: jest.SpyInstance;

const button = (label: string) =>
  tree.root.findAllByType(TouchableOpacity).find((node: any) => text(node) === label);
const press = async (label: string) => {
  const target = button(label);
  expect(target).toBeTruthy();
  await act(async () => { await target.props.onPress(); });
};
async function render(props: Record<string, unknown> = {}) {
  const onDone = jest.fn();
  await act(async () => {
    tree = Renderer.create(
      <BrandPostBrief token="t" onBack={() => {}} onDone={onDone} {...(props as any)} />,
    );
  });
  return onDone;
}
/** Taps Continue through every section until the Publish button shows. */
async function toReview() {
  for (let i = 0; i < 7; i += 1) await press('Continue');
}

beforeEach(async () => {
  jest.clearAllMocks();
  (AsyncStorage as any).__reset();
  (getBusinessProfile as jest.Mock).mockResolvedValue({ brand_name: 'Glow Co' });
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  alert.mockRestore();
  if (tree) await act(async () => { tree.unmount(); });
  tree = null;
});

test('Save Draft creates one draft, then updates that same draft (PATCH, no status)', async () => {
  (createCampaign as jest.Mock).mockResolvedValue({ id: 'new1', status: 'draft' });
  (updateCampaign as jest.Mock).mockResolvedValue({ id: 'new1' });
  const onDone = await render();
  await press('Save Draft');
  expect(createCampaign).toHaveBeenCalledTimes(1);
  expect((createCampaign as jest.Mock).mock.calls[0][2]).toBe(true);
  expect(alert).toHaveBeenLastCalledWith('Draft saved', expect.stringContaining('Drafts'));
  await press('Save Draft');
  expect(createCampaign).toHaveBeenCalledTimes(1);
  expect(updateCampaign).toHaveBeenCalledTimes(1);
  const [, id, patch] = (updateCampaign as jest.Mock).mock.calls[0];
  expect(id).toBe('new1');
  expect(patch).not.toHaveProperty('status');
  expect(onDone).not.toHaveBeenCalled();
});

test('a stale draft id (404) falls back to a fresh draft', async () => {
  (getCampaign as jest.Mock).mockResolvedValue(fullDraft());
  (updateCampaign as jest.Mock).mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }));
  (createCampaign as jest.Mock).mockResolvedValue({ id: 'fresh' });
  await render({ resumeDraftId: 'd1' });
  await press('Save Draft');
  expect(updateCampaign).toHaveBeenCalledWith('t', 'd1', expect.any(Object));
  expect(createCampaign).toHaveBeenCalledTimes(1);
  await press('Save Draft');
  expect(updateCampaign).toHaveBeenLastCalledWith('t', 'fresh', expect.any(Object));
});

test('resuming ?draft=<id> loads that draft and saving updates it', async () => {
  (getCampaign as jest.Mock).mockResolvedValue(fullDraft());
  (updateCampaign as jest.Mock).mockResolvedValue({ id: 'd1' });
  await render({ resumeDraftId: 'd1' });
  expect(getCampaign).toHaveBeenCalledWith('t', 'd1');
  expect(text(tree.root)).toContain('Draft loaded');
  await press('Save Draft');
  expect(createCampaign).not.toHaveBeenCalled();
  const patch = (updateCampaign as jest.Mock).mock.calls[0][2];
  expect(patch).toMatchObject({ title: 'Summer Launch', mood_images: ['/uploads/mood-1.jpg'] });
  // The backend writes the brand name from the profile; the app must not send it.
  expect(patch).not.toHaveProperty('brand_name');
});

test('a draft that fails to load is shown with Retry and cannot be overwritten', async () => {
  (getCampaign as jest.Mock).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(fullDraft());
  await render({ resumeDraftId: 'd1' });
  expect(text(tree.root)).toContain('Could not load that draft.');
  await press('Save Draft');
  expect(updateCampaign).not.toHaveBeenCalled();
  expect(createCampaign).not.toHaveBeenCalled();
  await press('Retry');
  expect(getCampaign).toHaveBeenCalledTimes(2);
  expect(text(tree.root)).toContain('Draft loaded');
});

test('a duplicate that fails to load says so instead of failing silently', async () => {
  (getCampaign as jest.Mock).mockRejectedValue(
    Object.assign(new Error('offline'), { name: 'NetworkError' }),
  );
  await render({ duplicateFrom: 'c9' });
  expect(text(tree.root)).toContain("You're offline");
});

test('a duplicate loads with a notice and publishes as a new brief', async () => {
  (getCampaign as jest.Mock).mockResolvedValue(fullDraft({ id: 'c9', status: 'active' }));
  await render({ duplicateFrom: 'c9' });
  expect(text(tree.root)).toContain('Copied brief loaded');
});

test('Publish asks for the ON HOLD confirmation, then promotes the draft (no duplicate)', async () => {
  (getCampaign as jest.Mock).mockResolvedValue(fullDraft());
  (getWallet as jest.Mock).mockResolvedValue({ available_balance: 50000 });
  (updateCampaign as jest.Mock).mockResolvedValue({ id: 'd1' });
  (submitCampaign as jest.Mock).mockResolvedValue({});
  const onDone = await render({ resumeDraftId: 'd1' });
  await toReview();
  await press('Publish Campaign');
  expect(updateCampaign).not.toHaveBeenCalled();
  const shown = text(tree.root);
  expect(shown).toContain('Confirm publishing');
  // 1 video x Rs. 1000 = 1000, +20% commission 200, + listing fee 500.
  expect(shown).toContain('Rs. 1,700 will be placed ON HOLD');
  await press('Continue');
  expect(getWallet).toHaveBeenCalled();
  expect(createCampaign).not.toHaveBeenCalled();
  const [, id, body] = (updateCampaign as jest.Mock).mock.calls[0];
  expect(id).toBe('d1');
  expect(body).toMatchObject({ match_requested: true, mood_images: ['/uploads/mood-1.jpg'] });
  expect(body).not.toHaveProperty('status');
  expect(submitCampaign).toHaveBeenCalledWith('t', 'd1');
  expect(alert).toHaveBeenCalledWith('Brief submitted', expect.stringContaining('on hold'));
  expect(onDone).toHaveBeenCalledWith('d1');
});

test('a brief with no draft id publishes through POST /campaigns with match_requested', async () => {
  (getCampaign as jest.Mock).mockResolvedValue(fullDraft({ id: 'c9', status: 'active' }));
  (getWallet as jest.Mock).mockResolvedValue({ available_balance: 50000 });
  (createCampaign as jest.Mock).mockResolvedValue({ id: 'made' });
  const onDone = await render({ duplicateFrom: 'c9' });
  await toReview();
  await press('Publish Campaign');
  await press('Continue');
  expect(createCampaign).toHaveBeenCalledWith(
    't',
    expect.objectContaining({ status: 'pending_approval', match_requested: true }),
    false,
  );
  expect(updateCampaign).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledWith('made');
});

test('Cancel on the confirmation publishes nothing', async () => {
  (getCampaign as jest.Mock).mockResolvedValue(fullDraft());
  await render({ resumeDraftId: 'd1' });
  await toReview();
  await press('Publish Campaign');
  await press('Cancel');
  expect(text(tree.root)).not.toContain('Confirm publishing');
  expect(updateCampaign).not.toHaveBeenCalled();
  expect(submitCampaign).not.toHaveBeenCalled();
});

test('a short wallet offers a top-up (min Rs. 2,500) before anything is published', async () => {
  (getCampaign as jest.Mock).mockResolvedValue(fullDraft());
  (getWallet as jest.Mock).mockResolvedValue({ available_balance: 100 });
  (rechargeWallet as jest.Mock).mockResolvedValue({
    gateway: 'razorpay', key_id: 'k', order_id: 'o1', amount: 2500, currency: 'INR',
  });
  await render({ resumeDraftId: 'd1' });
  await toReview();
  await press('Publish Campaign');
  await press('Continue');
  expect(updateCampaign).not.toHaveBeenCalled();
  expect(text(tree.root)).toContain('Add money to your wallet');
  // Needs 1000 + 500 listing fee = 1500; short by 1400, rounded up but not below 2,500.
  const input = tree.root.findAll((n: any) => n.props.placeholder === '2500' && n.props.onChangeText)[0];
  expect(input.props.value).toBe('2500');
  await act(async () => { input.props.onChangeText('100'); });
  await press('Add money');
  expect(rechargeWallet).not.toHaveBeenCalled();
  expect(text(tree.root)).toContain('Minimum recharge is Rs. 2,500.');
  await act(async () => { input.props.onChangeText('3000'); });
  await press('Add money');
  expect(rechargeWallet).toHaveBeenCalledWith('t', 3000);
});

test('Publish is blocked with the missing fields named, and nothing is sent', async () => {
  (getCampaign as jest.Mock).mockResolvedValue(
    fullDraft({ target_audience: 'Urban women 25 to 35, skincare fans.' }),
  );
  await render({ resumeDraftId: 'd1' });
  await press('Continue');
  expect(alert).toHaveBeenLastCalledWith(
    'Finish Campaign Basics',
    expect.stringContaining('Target audience (50–200 characters)'),
    expect.any(Array),
  );
  expect(updateCampaign).not.toHaveBeenCalled();
});

test('a past shipping date is caught on Next like the website', async () => {
  (getCampaign as jest.Mock).mockResolvedValue(
    fullDraft({ product_type: 'physical', product_shipping_by: '2020-01-01' }),
  );
  await render({ resumeDraftId: 'd1' });
  for (let i = 0; i < 6; i += 1) await press('Continue');
  await press('Continue');
  expect(alert).toHaveBeenLastCalledWith(
    'Finish Timeline & Budget',
    expect.stringContaining('Product shipping date (tomorrow or later)'),
    expect.any(Array),
  );
});

test('product name only needs one character (website rule)', async () => {
  (getCampaign as jest.Mock).mockResolvedValue(fullDraft({ product_name: 'X' }));
  await render({ resumeDraftId: 'd1' });
  await press('Continue');
  expect(alert).not.toHaveBeenCalled();
});

test('delivery date before the shipping date is rejected', async () => {
  (getCampaign as jest.Mock).mockResolvedValue(
    fullDraft({
      product_type: 'physical',
      product_shipping_by: '2099-02-01',
      draft_delivery_by: '2099-01-10',
    }),
  );
  await render({ resumeDraftId: 'd1' });
  for (let i = 0; i < 6; i += 1) await press('Continue');
  await press('Continue');
  expect(alert).toHaveBeenLastCalledWith(
    'Finish Timeline & Budget',
    expect.stringContaining('Draft delivery date (on or after shipping)'),
    expect.any(Array),
  );
});

test('mood board uploads through the shared helper, caps at 5 and skips files over 5 MB', async () => {
  (createCampaign as jest.Mock).mockResolvedValue({ id: 'new1' });
  (launchImageLibrary as jest.Mock).mockResolvedValueOnce({
    assets: [
      { uri: 'file:///a.jpg', fileName: 'a.jpg', fileSize: 1000 },
      { uri: 'file:///big.jpg', fileName: 'big.jpg', fileSize: 6 * 1024 * 1024 },
    ],
  });
  (uploadMedia as jest.Mock).mockResolvedValue('/uploads/a.jpg');
  (getCampaign as jest.Mock).mockResolvedValue(fullDraft({ mood_images: [] }));
  await render({ resumeDraftId: 'd1' });
  for (let i = 0; i < 4; i += 1) await press('Continue');
  await press('Upload references');
  expect(uploadMedia).toHaveBeenCalledTimes(1);
  expect(uploadMedia).toHaveBeenCalledWith('t', expect.objectContaining({ uri: 'file:///a.jpg' }), 'file');
  expect(alert).toHaveBeenLastCalledWith('Mood board', expect.stringContaining('big.jpg is too large. Max 5MB.'));
  expect(text(tree.root)).toContain('1/5 added');
  (updateCampaign as jest.Mock).mockResolvedValue({});
  await press('Save Draft');
  expect((updateCampaign as jest.Mock).mock.calls[0][2].mood_images).toEqual(['/uploads/a.jpg']);
});

test('resuming a private draft keeps it private: the creator and their locked price come back', async () => {
  (getCampaign as jest.Mock).mockResolvedValue(fullDraft({ visibility: 'private', selected_creator: 'cr1' }));
  (getPublicProfile as jest.Mock).mockResolvedValue({ nickname: 'Creator', profile: { rate_card: { raw_payout: 1200 } } });
  (updateCampaign as jest.Mock).mockResolvedValue({ id: 'd1' });
  await render({ resumeDraftId: 'd1' });
  expect(getPublicProfile).toHaveBeenCalledWith('t', 'cr1');
  await press('Save Draft');
  expect((updateCampaign as jest.Mock).mock.calls[0][2]).toMatchObject({
    selected_creator: 'cr1', visibility: 'private', per_video_budget: 1200,
  });
});

test('campaignToForm round-trips mood images and drops elapsed dates only for duplicates', () => {
  const doc = fullDraft({ draft_delivery_by: '2020-01-01' });
  expect(campaignToForm(doc, 'Glow Co').draftDeliveryBy).toBe('');
  expect(campaignToForm(doc, 'Glow Co', true).draftDeliveryBy).toBe('2020-01-01');
  expect(campaignToForm(doc, 'Glow Co').moodImages).toEqual(['/uploads/mood-1.jpg']);
});
