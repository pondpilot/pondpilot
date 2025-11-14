# AI Chat Security Implementation

## Markdown Sanitization

To prevent XSS attacks through AI-generated content, all ReactMarkdown components in the AI chat feature use `rehype-sanitize` for content sanitization.

### Implementation

All instances of `ReactMarkdown` include the sanitization plugin:

```tsx
import rehypeSanitize from 'rehype-sanitize';

<ReactMarkdown
  rehypePlugins={[rehypeSanitize]}
  // ... other props
>
  {content}
</ReactMarkdown>
```

### Protected Components

1. **ChatMessage component** (`src/features/ai-chat/components/chat-message.tsx`)
   - Sanitizes AI-generated responses
   - Sanitizes user-edited message content

2. **WhatsNewModal component** (`src/features/whats-new-modal/whats-new-modal.tsx`)
   - Sanitizes GitHub release notes content

### What Gets Sanitized

The following potentially dangerous content is automatically removed or sanitized:

- `<script>` tags and JavaScript code
- `onclick` and other event handler attributes
- `javascript:` URLs in links
- `<iframe>`, `<object>`, `<embed>` tags
- `style` attributes with potentially dangerous CSS

### What Gets Preserved

Safe markdown formatting is preserved:

- **Bold** and *italic* text
- `Code` blocks and inline code
- [Safe links](https://example.com) with http/https URLs
- Lists and other standard markdown elements
- Headers and paragraphs

### Testing

The sanitization can be verified by:

1. **Manual testing**: Send a message with malicious content and verify it's sanitized
2. **Unit tests**: Run `yarn test:unit src/utils/markdown-sanitization.test.ts`
3. **Integration tests**: The test suite includes checks for XSS prevention

### Example

**Input (potentially malicious):**
```markdown
Hello **world**! <script>alert('XSS')</script>
Visit this [malicious link](javascript:alert('XSS'))
```

**Output (sanitized):**
```markdown
Hello **world**! 
Visit this malicious link
```

The bold formatting is preserved, but the script tag and javascript URL are removed.