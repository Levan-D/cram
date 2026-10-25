// The inline SVG icons from lib/icons.ts. <Icon> is the usual wrapper (<span class="icon">);
// <Svg> is the bare markup for places that size the span themselves.
import { icons, type IconName } from '../lib/icons';

export function Icon({ name, className = 'icon' }: { name: IconName; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: icons[name] }} />;
}

export function Svg({ name }: { name: IconName }) {
  return <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: icons[name] }} />;
}
