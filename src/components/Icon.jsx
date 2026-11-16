import { Icon as LucideIcon } from 'lucide-react';
import { hasIcon, iconNode, pageIconName } from '../lib/icons';

// lucide-react wants a React key on every part of the shape; add them once per icon.
const keyedNodes = new Map();
function keyedNode(name) {
  if (!keyedNodes.has(name)) {
    keyedNodes.set(name, iconNode(name).map(([tag, attrs], index) => [tag, { ...attrs, key: `${name}-${index}` }]));
  }
  return keyedNodes.get(name);
}

/**
 * A Lucide icon, 1em square so it follows the surrounding font size.
 * Decorative by default (aria-hidden); pass aria-label to make it meaningful.
 */
export default function Icon({ name, className = '', size = '1em', ...rest }) {
  const known = hasIcon(name) ? name : 'circle';
  const labelled = Boolean(rest['aria-label'] || rest['aria-labelledby']);
  return (
    <LucideIcon
      iconNode={keyedNode(known)}
      size={size}
      className={`icon icon-${known}${className ? ` ${className}` : ''}`}
      aria-hidden={labelled ? undefined : 'true'}
      role={labelled ? 'img' : undefined}
      focusable="false"
      {...rest}
    />
  );
}

/** The icon of a page or project. Old emoji icons are shown as the closest Lucide icon. */
export function PageIcon({ value, fallback = 'file-text', className = '', ...rest }) {
  return <Icon name={pageIconName(value, fallback)} className={`page-icon${className ? ` ${className}` : ''}`} {...rest} />;
}
