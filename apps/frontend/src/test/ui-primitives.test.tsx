import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@workspace/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu';
import { ScrollArea } from '@workspace/ui/components/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

describe('shared UI primitives', () => {
  it('moves focus and selection between tabs with the keyboard', async () => {
    const user = userEvent.setup();

    render(
      <Tabs defaultValue="first">
        <TabsList>
          <TabsTrigger value="first">First</TabsTrigger>
          <TabsTrigger value="second">Second</TabsTrigger>
        </TabsList>
        <TabsContent value="first">First panel</TabsContent>
        <TabsContent value="second">Second panel</TabsContent>
      </Tabs>
    );

    const firstTab = screen.getByRole('tab', { name: 'First' });
    await user.click(firstTab);
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Second panel')).toBeVisible();
  });

  it('closes a dialog with Escape and restores focus to its trigger', async () => {
    const user = userEvent.setup();

    render(
      <Dialog>
        <DialogTrigger>Open dialog</DialogTrigger>
        <DialogContent>
          <DialogTitle>Confirmation</DialogTitle>
          <DialogDescription>Review the action.</DialogDescription>
        </DialogContent>
      </Dialog>
    );

    const dialogTrigger = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(dialogTrigger);
    expect(screen.getByRole('dialog', { name: 'Confirmation' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(dialogTrigger).toHaveFocus();
  });

  it('moves focus between dropdown items with the keyboard', async () => {
    const user = userEvent.setup();

    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
          <DropdownMenuItem>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const trigger = screen.getByRole('button', { name: 'Open menu' });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
  });

  it('labels the select and supports keyboard selection with focus restoration', async () => {
    const user = userEvent.setup();

    render(
      <Select defaultValue="Alpha">
        <SelectLabel>Deployment</SelectLabel>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Alpha">Alpha</SelectItem>
          <SelectItem value="Beta">Beta</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox', { name: 'Deployment' });
    expect(trigger).toHaveTextContent('Alpha');

    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(await screen.findByRole('listbox')).toBeVisible();
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Beta');
    expect(trigger).toHaveFocus();
  });

  it('keeps a disabled select unavailable to keyboard and pointer interaction', async () => {
    const user = userEvent.setup();

    render(
      <Select defaultValue="Alpha" disabled>
        <SelectLabel>Disabled deployment</SelectLabel>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Alpha">Alpha</SelectItem>
          <SelectItem value="Beta">Beta</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox', { name: 'Disabled deployment' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent('Alpha');

    await user.tab();
    expect(trigger).not.toHaveFocus();
    await user.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Alpha');
  });

  it('renders scroll, loading and alert states', () => {
    render(
      <>
        <ScrollArea>Scrollable content</ScrollArea>
        <Skeleton aria-label="Loading content" />
        <Alert>
          <AlertTitle>Unavailable</AlertTitle>
          <AlertDescription>Try again.</AlertDescription>
        </Alert>
      </>
    );

    expect(screen.getByText('Scrollable content')).toBeVisible();
    expect(screen.getByLabelText('Loading content')).toBeVisible();
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Unavailable')).toBeVisible();
    expect(within(alert).getByText('Try again.')).toBeVisible();
  });
});
