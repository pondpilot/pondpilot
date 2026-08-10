import { SchemaLoading } from '@features/schema-browser/components/schema-loading';
import { afterEach, describe, expect, it } from '@jest/globals';
import { cleanup, render, screen } from '@testing-library/react';

describe('component migration contract', () => {
  afterEach(cleanup);

  it('[pilot:component.actual-render] renders the production component into jsdom', () => {
    render(<SchemaLoading />);

    const status = screen.getByText('Loading schema...');
    expect(status.tagName).toBe('DIV');
    expect(status.classList.contains('text-lg')).toBe(true);
  });
});
