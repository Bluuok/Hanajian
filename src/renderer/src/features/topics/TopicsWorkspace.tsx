import React from 'react'
import type { Contact } from '../../../../shared/types'
import type { TopicSourceLocator } from '../../../../shared/topic-package'
import { TopicsHomePage } from './TopicsHomePage'

export interface TopicsWorkspaceProps {
  contacts: Contact[]
  onCancelSource?: () => void
  active: boolean
  onOpenChat: (contact: Contact) => Promise<void>
  onOpenSource?: (locator: TopicSourceLocator) => Promise<void> | void
}

export function TopicsWorkspace(props: TopicsWorkspaceProps): React.ReactElement {
  return <TopicsHomePage {...props} />
}
