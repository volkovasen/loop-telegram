export type LoopType = 'reply' | 'todo' | 'waiting' | 'event' | 'saved';
export type LoopStatus = 'suggested' | 'open' | 'snoozed' | 'done' | 'dismissed';
export type LoopSpace = string;
export type LoopKind = 'plan' | 'request' | 'promise' | 'recommendation' | 'note';
export type AgreementStatus = 'proposed' | 'confirmed' | 'unknown' | 'not_applicable';
export type NextAction = 'coordinate' | 'reply' | 'do' | 'wait' | 'none';

export interface SpaceDefinition {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  examples?: { text: string; authorName?: string }[];
}

export interface OpenLoop {
  id: string;
  ownerId?: string;
  type: LoopType;
  status: LoopStatus;
  title: string;
  kind?: LoopKind;
  agreementStatus?: AgreementStatus;
  nextAction?: NextAction;
  nextActionText?: string | null;
  whenText?: string | null;
  person?: { telegramUserId?: number; name: string; username?: string; nameSource?: 'contact' | 'telegram' };
  dueAt?: string;
  space?: LoopSpace | null;
  spaceConfidence?: number;
  memoryCategory?: string;
  confidence: number;
  source: {
    messageId: number;
    chatId?: number;
    text?: string;
    receivedAt: string;
    authorName?: string;
    mediaKind?: 'voice' | 'video_note' | 'audio';
    transcript?: string;
  };
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  remindedAt?: string;
}
