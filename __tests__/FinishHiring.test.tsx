import { Alert } from '../src/components/AppAlert';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import BrandCampaignDetail from '../src/screens/BrandCampaignDetail';
import { getCampaign, getCampaignWork, finishHiring } from '../src/api';

jest.mock('../src/api', () => ({
  getCampaign: jest.fn(), getBusinessDeals: jest.fn().mockResolvedValue([]), getCampaignWork: jest.fn(), finishHiring: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (getCampaignWork as jest.Mock).mockResolvedValue([]);
  (finishHiring as jest.Mock).mockResolvedValue({});
});

const campaign = { id: 'c1', title: 'Launch', status: 'active',
  creators_wanted: 4, selected_creators: ['one', 'two'], bids: [] };
const buttons = (tree: any) => tree.root.findAllByType(TouchableOpacity)
  .filter((node: any) => node.props.accessibilityLabel === 'Finish hiring');
async function render(detail: any) {
  (getCampaign as jest.Mock).mockResolvedValue(detail);
  let tree: any;
  await act(async () => {
    tree = Renderer.create(<BrandCampaignDetail token="t" campaignId="c1"
      onBack={() => {}} onNavigate={() => {}} />);
  });
  return tree;
}

test('finish hiring confirms, calls the API and refreshes closed hiring', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const tree = await render(campaign);
  expect(buttons(tree)).toHaveLength(1);
  await act(async () => { buttons(tree)[0].props.onPress(); });
  expect(finishHiring).not.toHaveBeenCalled();
  const confirmation = alert.mock.calls[0];
  expect(confirmation[0]).toContain('2 creators');
  expect(confirmation[1]).toContain('2 unfilled slots');
  (getCampaign as jest.Mock).mockResolvedValue({ ...campaign, status: 'in_progress', creators_wanted: 2 });
  const confirm = confirmation[2]!.find(button => button.text === 'Finish hiring')!;
  await act(async () => { await confirm.onPress!(); });
  expect(finishHiring).toHaveBeenCalledWith('t', 'c1');
  expect(buttons(tree)).toHaveLength(0);
  await act(async () => { tree.unmount(); });
  alert.mockRestore();
});

test.each([
  { ...campaign, selected_creators: [] },
  { ...campaign, selected_creators: ['one', 'two', 'three', 'four'] },
  { ...campaign, status: 'in_progress' },
])('finish hiring is hidden when unavailable', async detail => {
  const tree = await render(detail);
  expect(buttons(tree)).toHaveLength(0);
  await act(async () => { tree.unmount(); });
});
