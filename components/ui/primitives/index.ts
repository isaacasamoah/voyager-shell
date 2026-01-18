// Voyager UI Primitives - Tier 1
// Composable building blocks for conversational UI
//
// These primitives follow the TUI design system:
// - Obsidian backgrounds (#050505)
// - Phosphor glows
// - Box-drawing characters
// - Monospace typography

// Typography
export { Text } from './Text'
export type { TextProps, TextVariant } from './Text'

// Status indicators
export { Badge } from './Badge'
export type { BadgeProps, BadgeVariant, BadgeSize } from './Badge'

// Actions
export { Button } from './Button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button'

// Separators
export { Divider } from './Divider'
export type { DividerProps, DividerVariant, DividerOrientation } from './Divider'

// Containers
export { Card, CardHeader, CardContent, CardActions } from './Card'
export type { CardProps, CardVariant } from './Card'

// Collections
export { List } from './List'
export type { ListProps, ListItem, ListVariant } from './List'

// ═══════════════════════════════════════════════════════════
// TIER 2: Data Display
// ═══════════════════════════════════════════════════════════

// User/entity representation
export { Avatar } from './Avatar'
export type { AvatarProps, AvatarVariant, AvatarSize, AvatarStatus } from './Avatar'

// Progress indicators
export { Progress } from './Progress'
export type { ProgressProps, ProgressVariant } from './Progress'

// Temporal sequences
export { Timeline } from './Timeline'
export type { TimelineProps, TimelineEvent, TimelineEventStatus } from './Timeline'

// Metrics display
export { Stat } from './Stat'
export type { StatProps } from './Stat'

// Notices
export { Alert } from './Alert'
export type { AlertProps, AlertVariant } from './Alert'

// Content previews
export { Preview } from './Preview'
export type { PreviewProps, PreviewVariant } from './Preview'

// ═══════════════════════════════════════════════════════════
// TIER 3: Layout Helpers
// ═══════════════════════════════════════════════════════════

// Vertical arrangement
export { Stack } from './Stack'
export type { StackProps, StackGap, StackAlign, StackJustify } from './Stack'

// Horizontal arrangement
export { Inline } from './Inline'
export type { InlineProps, InlineGap, InlineAlign, InlineJustify } from './Inline'

// Grid layouts
export { Grid } from './Grid'
export type { GridProps, GridCols, GridGap } from './Grid'
