import { SchemaLoading } from '@features/schema-browser/components/schema-loading';
import { afterEach, describe, expect, it } from '@jest/globals';
import { cleanup, render, screen } from '@testing-library/react';

describe('SchemaLoading', () => {
  afterEach(cleanup);

  it('renders the production loading state in the DOM', () => {
    const { container } = render(<SchemaLoading />);

    expect(screen.getByText('Loading schema...')).toBeTruthy();
    expect(container.querySelector('.items-center.justify-center')).not.toBeNull();
  });
});
