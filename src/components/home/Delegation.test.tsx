import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DelegationDial, HeadPowers } from './Delegation';
import { issueOrder, loadOrderInForce, PRESETS } from '../../lib/home/delegation';

vi.mock('../../lib/home/delegation', async (orig) => ({
  ...(await orig<typeof import('../../lib/home/delegation')>()),
  loadOrderInForce: vi.fn(), issueOrder: vi.fn(async () => {}),
}));
vi.mock('../../contexts/RulesContext', () => ({
  useRules: () => ({ rules: [{ id: '1', ruleKey: 'delegation.floor.MOU_SIGNING', value: true, unit: null, effectiveFrom: '2025-04-25', effectiveTo: null, sourceRef: 'x', verified: false, note: 'MoU or agreement signing' }] }),
}));

beforeEach(() => { vi.clearAllMocks(); });

describe('DelegationDial', () => {
  it('says nothing is delegated yet, shows the locked floor, and issues only after a confirm', async () => {
    vi.mocked(loadOrderInForce).mockResolvedValue(null);
    render(<DelegationDial />);
    expect(await screen.findByText(/No delegation order yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set it' }));
    expect(screen.getByText(/Stay with you by rule: MoU or agreement signing\./)).toBeTruthy();
    expect(screen.getByText(/None is connected yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hands-on' }));
    fireEvent.click(screen.getByRole('button', { name: 'Issue as an order' }));
    expect(issueOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Issue the order' }));
    await waitFor(() => expect(issueOrder).toHaveBeenCalledWith('HANDS_ON', PRESETS.HANDS_ON));
  });

  it('marks a changed line as custom', async () => {
    vi.mocked(loadOrderInForce).mockResolvedValue(null);
    render(<DelegationDial />);
    fireEvent.click(await screen.findByRole('button', { name: 'Set it' }));
    fireEvent.change(screen.getByLabelText('New proposals'), { target: { value: 'HEAD_TELL' } });
    expect(screen.getByText('custom')).toBeTruthy();
  });
});

describe('HeadPowers', () => {
  it('lists what the head decides with the limit', async () => {
    vi.mocked(loadOrderInForce).mockResolvedValue({
      id: 'o', orderNo: 'DO/2026/01', preset: 'BALANCED', effectiveFrom: '2026-11-14',
      lines: [{ kind: 'INDENT', mode: 'HEAD_TELL', limit: 500000, division: '*' }, { kind: 'PROPOSAL', mode: 'SELF', limit: null, division: '*' }],
    });
    render(<HeadPowers division="D1" />);
    expect(await screen.findByText(/You decide these under order/)).toBeTruthy();
    expect(screen.getByText(/Purchase indents/).textContent).toMatch(/5,00,000/);
    expect(screen.queryByText(/New proposals/)).toBeNull();
  });
});
