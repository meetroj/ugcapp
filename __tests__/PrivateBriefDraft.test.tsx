import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import BrandPostBrief from '../src/screens/BrandPostBrief';
import { Alert } from '../src/components/AppAlert';
import { createCampaign, getPublicProfile, getBusinessProfile } from '../src/api';

jest.mock('../src/api', () => ({
  createCampaign: jest.fn(), getPublicProfile: jest.fn(), getBusinessProfile: jest.fn(),
}));

test('private draft carries the creator raw and editing rates separately', async () => {
  jest.clearAllMocks();
  (getPublicProfile as jest.Mock).mockResolvedValue({ nickname: 'Creator', profile: {
    rate_card: { raw_payout: 1000, expected_payout: 2000, editing_payout: 700 },
  } });
  (getBusinessProfile as jest.Mock).mockResolvedValue({});
  (createCampaign as jest.Mock).mockResolvedValue({ id: 'priced-draft', status: 'draft' });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let tree: any;
  await act(async () => {
    tree = Renderer.create(<BrandPostBrief token="t" creatorId="creator-priced" onBack={() => {}} onDone={() => {}} />);
  });
  const text = (node: any): string => typeof node === 'string' ? node : (node?.children || []).map(text).join('');
  const save = tree.root.findAllByType(TouchableOpacity).find((node: any) => text(node) === 'Save Draft');
  await act(async () => { await save.props.onPress(); });
  expect(createCampaign).toHaveBeenCalledWith('t', expect.objectContaining({
    selected_creator: 'creator-priced', per_video_budget: 1000, editing_fee_per_video: 700,
    total_budget: 1000, visibility: 'private', status: 'draft',
  }), true);
  await act(async () => { tree.unmount(); });
  alert.mockRestore();
});

test('partial private brief can be saved with its creator before a price is set', async () => {
  (getPublicProfile as jest.Mock).mockResolvedValue({ nickname: 'Creator' });
  (getBusinessProfile as jest.Mock).mockResolvedValue({});
  (createCampaign as jest.Mock).mockResolvedValue({ id: 'draft-1', status: 'draft' });
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const onDone = jest.fn();
  let tree: any;
  await act(async () => {
    tree = Renderer.create(<BrandPostBrief token="t" creatorId="creator-7"
      onBack={() => {}} onDone={onDone} />);
  });
  const text = (node: any): string => typeof node === 'string' ? node : (node?.children || []).map(text).join('');
  const save = tree.root.findAllByType(TouchableOpacity).find((node: any) => text(node) === 'Save Draft');
  expect(save).toBeTruthy();
  await act(async () => { await save.props.onPress(); });
  expect(createCampaign).toHaveBeenCalledWith('t', expect.objectContaining({
    status: 'draft', selected_creator: 'creator-7', visibility: 'private',
  }), true);
  expect(alert).toHaveBeenCalledWith('Draft saved', expect.stringContaining('not been notified'), expect.any(Array));
  const done = alert.mock.calls[0][2]![0];
  await act(async () => { done.onPress!(); });
  expect(onDone).toHaveBeenCalledWith('draft-1');
  await act(async () => { tree.unmount(); });
  alert.mockRestore();
});
