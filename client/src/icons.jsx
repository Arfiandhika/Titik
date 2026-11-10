import {
  Construction,
  Lightbulb,
  Trash2,
  Droplets,
  Footprints,
  Signpost,
  TreeDeciduous,
  Armchair,
  Ellipsis,
  Send,
  Search,
  Hammer,
  CircleCheck,
  CircleX,
  Flag,
  Eye,
  Users,
  Wrench,
  MessageCircle,
  Bell,
  ArrowRightLeft,
  Merge,
  ShieldAlert,
  Gift,
  Info,
} from 'lucide-react';

export const STROKE = 1.75;

// Keyed by category id from /api/meta.
export const CATEGORY_ICONS = {
  pothole: Construction,
  streetlight: Lightbulb,
  dumping: Trash2,
  drainage: Droplets,
  sidewalk: Footprints,
  signage: Signpost,
  tree: TreeDeciduous,
  facility: Armchair,
  other: Ellipsis,
};

export const STATUS_ICONS = {
  submitted: Send,
  under_review: Search,
  in_progress: Hammer,
  resolved: CircleCheck,
  rejected: CircleX,
};

export const BADGE_ICONS = {
  first_report: Flag,
  watchful: Eye,
  confirmer: Users,
  fixer: Wrench,
  voice: MessageCircle,
};

export const NOTIFICATION_ICONS = {
  status: Send,
  forward: ArrowRightLeft,
  merge: Merge,
  hoax: ShieldAlert,
  metoo: Users,
  comment: MessageCircle,
  reward: Gift,
  new: Bell,
  info: Info,
};

export function Icon({ as: Comp, size = 18, ...rest }) {
  if (!Comp) return null;
  return <Comp size={size} strokeWidth={STROKE} aria-hidden="true" {...rest} />;
}

export function CategoryIcon({ id, size = 18, ...rest }) {
  return <Icon as={CATEGORY_ICONS[id] || Ellipsis} size={size} {...rest} />;
}

export function StatusIcon({ id, size = 16, ...rest }) {
  return <Icon as={STATUS_ICONS[id] || Send} size={size} {...rest} />;
}
