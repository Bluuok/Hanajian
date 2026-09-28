import React from 'react'
import { ConversationSidebar, ConversationSidebarProps } from './conversation/ConversationSidebar'

export const Sidebar: React.FC<ConversationSidebarProps> = (props) => (
  <ConversationSidebar {...props} />
)
