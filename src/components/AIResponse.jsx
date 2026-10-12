import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const label = value => String(value).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
const scalar = value => value == null ? 'Not supplied' : value === '' ? '""' : String(value);
const cell = value => scalar(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

// Older local runs and models that return structured data still get a readable report.
export function readableResponse(content) {
  const text = typeof content === 'string' ? content.trim() : JSON.stringify(content) ?? '';
  const candidate = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!/^[\[{"0-9tfn-]/.test(candidate)) return text;
  try {
    const value = JSON.parse(candidate);
    const sections = (object, depth = 2) => {
      if (Array.isArray(object)) {
        if (object.length && object.every(item => item && typeof item === 'object' && !Array.isArray(item) && Object.values(item).every(value => value === null || typeof value !== 'object'))) {
          const keys = [...new Set(object.flatMap(item => Object.keys(item)))];
          if (keys.length && keys.length <= 8) return [`| ${keys.map(label).join(' | ')} |`, `| ${keys.map(() => '---').join(' | ')} |`, ...object.map(item => `| ${keys.map(key => cell(item[key])).join(' | ')} |`)].join('\n');
        }
        return object.length ? object.map((item, index) => item && typeof item === 'object' ? `${'#'.repeat(Math.min(depth, 4))} Item ${index + 1}\n\n${sections(item, depth + 1)}` : `- ${cell(item)}`).join('\n\n') : 'No items';
      }
      if (!object || typeof object !== 'object') return cell(object);
      if (!Object.keys(object).length) return 'No fields';
      return Object.entries(object).map(([key, item]) => item && typeof item === 'object'
        ? `${'#'.repeat(Math.min(depth, 4))} ${label(key)}\n\n${sections(item, depth + 1)}`
        : `**${label(key)}:** ${cell(item)}`).join('\n\n');
    };
    return sections(value);
  } catch { return text; }
}

export default function AIResponse({ content }) {
  return <div className="ai-prose"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
    h1: ({ children }) => <h2>{children}</h2>,
    a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    img: ({ alt }) => <span className="ai-image-label">{alt || 'Image reference'}</span>,
    table: ({ children }) => <div className="ai-report-table"><table>{children}</table></div>,
  }}>{readableResponse(content)}</ReactMarkdown></div>;
}
