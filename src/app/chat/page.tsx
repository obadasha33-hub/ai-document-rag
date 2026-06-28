'use client'

import React from 'react'
import { ChatProvider } from '@/components/chat/ChatContext';
import ThreadSidebar from '@/components/chat/ThreadSidebar';
import ChatWindow from '@/components/chat/ChatWindow';

export const dynamic = 'force-dynamic';

export default function ChatPage() {
  return (
    <ChatProvider>
      <div className="app with-sidebar" style={{ height: '100vh' }}>
        <ThreadSidebar />
        <ChatWindow />
      </div>
    </ChatProvider>
  );
}