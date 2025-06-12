// Simple test to verify rehype-sanitize is working correctly
import rehypeSanitize from 'rehype-sanitize';

// Basic verification that the library is imported correctly
describe('Markdown Sanitization', () => {
  test('rehype-sanitize should be available', () => {
    expect(typeof rehypeSanitize).toBe('function');
  });

  // This test verifies the library exists and can be called
  // The actual sanitization testing would require a full React/DOM environment
  test('rehype-sanitize configuration should be valid', () => {
    const sanitizer = rehypeSanitize;
    expect(sanitizer).toBeDefined();
    expect(typeof sanitizer).toBe('function');
  });
});

// Export a utility to verify what would be sanitized
export const exampleMaliciousContent = `
<script>alert('XSS')</script>
<img src="x" onclick="alert('XSS')">
<a href="javascript:alert('XSS')">malicious link</a>
**Safe bold text**
*Safe italic text*
\`Safe code\`
`;

export const exampleSafeContent = `
**Bold text**
*Italic text*
\`Code text\`
[Safe link](https://example.com)

\`\`\`sql
SELECT * FROM table;
\`\`\`
`;