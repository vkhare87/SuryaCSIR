import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';

function Harness({ defaultValue = 'a' }: { defaultValue?: string }) {
  return (
    <Tabs defaultValue={defaultValue}>
      <TabsList>
        <TabsTrigger value="a">Alpha</TabsTrigger>
        <TabsTrigger value="b">Beta</TabsTrigger>
      </TabsList>
      <TabsContent value="a">panel-a</TabsContent>
      <TabsContent value="b">panel-b</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('shows the default panel and hides the other', () => {
    render(<Harness />);
    expect(screen.getByText('panel-a')).toBeInTheDocument();
    expect(screen.queryByText('panel-b')).not.toBeInTheDocument();
  });

  it('switches panel on trigger click', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(screen.getByText('panel-b')).toBeInTheDocument();
    expect(screen.queryByText('panel-a')).not.toBeInTheDocument();
  });

  it('marks the active tab with aria-selected', () => {
    render(<Harness />);
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Beta' }));
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');
  });
});
