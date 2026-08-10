import { SchemaLoading } from '@features/schema-browser/components/schema-loading';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

describe('component migration contract', () => {
  afterEach(cleanup);

  it('[pilot:component.actual-render] renders the production component into jsdom', () => {
    render(<SchemaLoading />);

    const status = screen.getByText('Loading schema...');
    expect(status.tagName).toBe('DIV');
    expect(status.classList.contains('text-lg')).toBe(true);
  });
});
