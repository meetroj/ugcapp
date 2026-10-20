import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import BrowseCampaigns from '../src/screens/BrowseCampaigns';
import { getCampaigns, getMe, placeBid } from '../src/api';

jest.mock('../src/api', () => ({
  BACKEND_URL: 'https://api.example.com', getCampaigns: jest.fn(), getMe: jest.fn(), placeBid: jest.fn(),
  getSavedBriefs: jest.fn().mockResolvedValue([]), getUnreadCount: jest.fn().mockResolvedValue({ count: 0 }),
  addSavedBrief: jest.fn(), removeSavedBrief: jest.fn(),
}));
let tree: any;
const text = (node: any): string => typeof node === 'string' ? node : (node?.children || []).map(text).join('');
const button = (label: string) => tree.root.findAllByType(TouchableOpacity).find((node: any) => text(node) === label);
beforeEach(() => {
  jest.clearAllMocks();
  (getCampaigns as jest.Mock).mockResolvedValue([{ id: 'brief', title: 'Launch', brand_name: 'Brand',
    deliverable_items: [{ quantity: 2, raw_required: true, edited_required: true, edited_by: 'creator' }] }]);
  (getMe as jest.Mock).mockResolvedValue({ profile_completed: true, kyc: { status: 'verified' } });
  (placeBid as jest.Mock).mockResolvedValue({});
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; });
async function openBid(onNavigate = jest.fn()) {
  await act(async () => { tree = Renderer.create(<BrowseCampaigns token="token" session={{ user_id: 'creator', role: 'creator', token: 'token', profile_completed: true }} onNavigate={onNavigate} />); });
  const card = tree.root.findAllByType(TouchableOpacity).find((node: any) => node.props.accessibilityLabel === 'Brand: Launch');
  await act(async () => { card.props.onPress(); });
  await act(async () => { await button('Submit Your Bid').props.onPress(); });
  // The platform-fee sheet comes before the form, as on the website.
  if (button('Continue to bid')) await act(async () => { button('Continue to bid').props.onPress(); });
}
test('one combined amount includes both files and is sent without split fields', async () => {
  await openBid();
  expect(text(tree.toJSON())).toContain('One bid includes both the raw video and the edited video.');
  const input = (placeholder: string) => tree.root.findAll((node: any) => node.props.placeholder === placeholder && typeof node.props.onChangeText === 'function')[0];
  await act(async () => {
    input('Enter your bid amount').props.onChangeText('1500');
    input('How many days to complete?').props.onChangeText('3');
    input("Describe your approach, experience, and why you're the right fit...").props.onChangeText('I will deliver both files');
  });
  await act(async () => { await button('Submit Bid').props.onPress(); });
  const body = (placeBid as jest.Mock).mock.calls[0][2];
  expect(body.amount).toBe(1500);
  expect(body.raw_amount).toBeUndefined(); expect(body.edited_amount).toBeUndefined();
});
test('verified KYC with an incomplete profile opens profile settings', async () => {
  (getMe as jest.Mock).mockResolvedValue({ profile_completed: false, kyc: { status: 'verified' } });
  const navigate = jest.fn();
  await openBid(navigate);
  // The missing-profile sheet offers the way out instead of redirecting silently.
  await act(async () => { button('Complete profile').props.onPress(); });
  expect(navigate).toHaveBeenCalledWith('/settings?tab=profile');
  expect(navigate).not.toHaveBeenCalledWith('/kyc');
});
