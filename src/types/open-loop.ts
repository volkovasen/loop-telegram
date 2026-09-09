export type LoopType = 'reply' | 'todo' | 'waiting' | 'event' | 'saved';
export type LoopStatus = 'suggested' | 'open' | 'snoozed' | 'done' | 'dismissed';

export interface OpenLoop {
  id: string;
  type: LoopType;
  status: LoopStatus;
  title: string;
  person?: { telegramUserId?: number; name: string; username?: string };
  dueAt?: string;
  confidence: number;
  source: {
    messageId: number;
    chatId?: number;
    text?: string;
    receivedAt: string;
    authorName?: string;
  };
  createdAt: string;
  completedAt?: string;
}
